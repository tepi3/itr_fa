import io
import csv
import logging
from datetime import datetime
from core.utils import tax_round, parse_sort_date

logger = logging.getLogger(__name__)

def parse_date(date_val) -> str:
    """Parse common CSV/Excel date formats into dd/mm/yyyy."""
    if isinstance(date_val, datetime):
        return date_val.strftime("%d/%m/%Y")
    if not date_val:
        return None
    # Strip any trailing commas or parts that contain time if present
    date_str = str(date_val).strip().split(",")[0].strip().split(" ")[0]
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d-%b-%Y", "%d-%b-%y", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%d/%m/%Y")
        except ValueError:
            pass
    return None

def find_col_index(headers: list, possible_names: list) -> int:
    """Find the first matching header index from a list of possible names."""
    lower_headers = [str(h).strip().lower() if h else "" for h in headers]
    for name in possible_names:
        if name in lower_headers:
            return lower_headers.index(name)
    return -1


def _extract_trades_from_file(file_bytes: bytes, filename: str) -> list:
    """
    Extracts raw trade rows from a single IBKR Activity Statement CSV.
    Returns a list of dicts with raw trade data.
    """
    if not filename.endswith('.csv'):
        raise ValueError("Unsupported file format. Please upload IBKR CSV.")

    content = file_bytes.decode('utf-8-sig')
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)

    if not rows:
        raise ValueError(f"Empty file: {filename}")

    # Detect the "Trades" header row
    header_idx = -1
    for i, row in enumerate(rows):
        if len(row) > 1 and row[0] == "Trades" and row[1] == "Header":
            header_idx = i
            break

    if header_idx == -1:
        raise ValueError(f"Could not find 'Trades' section in IBKR Activity Statement: {filename}")

    headers = rows[header_idx]

    date_idx     = find_col_index(headers, ["date/time", "date"])
    symbol_idx   = find_col_index(headers, ["symbol", "ticker"])
    qty_idx      = find_col_index(headers, ["quantity", "qty"])
    price_idx    = find_col_index(headers, ["t. price", "price", "execution price"])
    basis_idx    = find_col_index(headers, ["basis"])
    proceeds_idx = find_col_index(headers, ["proceeds"])
    comm_idx     = find_col_index(headers, ["comm/fee", "commission"])
    asset_cat_idx = find_col_index(headers, ["asset category"])
    code_idx     = find_col_index(headers, ["code"])

    if date_idx == -1 or symbol_idx == -1 or qty_idx == -1 or price_idx == -1:
        raise ValueError(f"Missing required columns in IBKR Trades CSV section: {filename}")

    trades = []
    for row in rows[header_idx + 1:]:
        min_needed = max(date_idx, symbol_idx, qty_idx, price_idx)
        if proceeds_idx != -1:
            min_needed = max(min_needed, proceeds_idx)
        if comm_idx != -1:
            min_needed = max(min_needed, comm_idx)
        if basis_idx != -1:
            min_needed = max(min_needed, basis_idx)

        if len(row) <= min_needed:
            continue

        if row[0] != "Trades" or row[1] != "Data":
            continue

        # Filter to stocks only
        if asset_cat_idx != -1:
            asset_cat = str(row[asset_cat_idx] or "").strip().lower()
            if asset_cat != "stocks":
                continue

        sym = str(row[symbol_idx] or "").strip()
        if not sym or sym == '-':
            continue

        date_val = parse_date(row[date_idx])
        if not date_val:
            continue

        # Preserve the full datetime string for sorting
        datetime_str = str(row[date_idx] or "").strip()

        try:
            qty_raw = float(str(row[qty_idx]).replace(",", ""))
            if qty_raw == 0:
                continue
        except (ValueError, TypeError):
            continue

        # Extract numeric fields
        proceeds_raw = None
        comm_raw = None
        basis_raw = None

        if proceeds_idx != -1:
            try:
                proceeds_raw = float(str(row[proceeds_idx]).replace(",", ""))
            except (ValueError, TypeError):
                pass
        if comm_idx != -1:
            try:
                comm_raw = float(str(row[comm_idx]).replace(",", ""))
            except (ValueError, TypeError):
                pass
        if basis_idx != -1:
            try:
                basis_raw = float(str(row[basis_idx]).replace(",", ""))
            except (ValueError, TypeError):
                pass

        t_price = None
        try:
            t_price = float(str(row[price_idx]).replace("$", "").replace(",", ""))
        except (ValueError, TypeError):
            pass

        code = ""
        if code_idx != -1 and code_idx < len(row):
            code = str(row[code_idx] or "").strip()

        trades.append({
            "symbol": sym,
            "date": date_val,
            "datetime_str": datetime_str,
            "qty_raw": qty_raw,
            "proceeds": proceeds_raw,
            "commission": comm_raw,
            "basis": basis_raw,
            "t_price": t_price,
            "code": code,
        })

    return trades


def _compute_price_from_proceeds(proceeds_raw, comm_raw, qty_raw):
    """Compute net price per share: |Proceeds + Commission| / |Quantity|."""
    if proceeds_raw is not None and comm_raw is not None:
        return tax_round(abs(proceeds_raw + comm_raw) / abs(qty_raw), 2)
    return None


def _compute_price_from_basis(basis_raw, qty_raw):
    """Compute price per share from Basis column: |Basis| / |Quantity|."""
    if basis_raw is not None and qty_raw != 0:
        return tax_round(abs(basis_raw) / abs(qty_raw), 2)
    return None


def _compute_price_fallback(t_price):
    """Fallback: use the raw trade execution price."""
    if t_price is not None:
        return tax_round(t_price, 2)
    return None


# Tolerance for matching sell's inferred buy price to a lot's actual buy price.
# Observed IBKR discrepancy is ~$0.01/share; $0.10 provides comfortable margin.
LOT_MATCH_TOLERANCE = 0.10


def process_ibkr_files(file_list: list, calendar_year: int) -> dict:
    """
    Parses multiple IBKR Activity Statement CSVs (non-overlapping periods)
    and builds lot-matched transactions for a given calendar year.

    Args:
        file_list: List of (file_bytes, filename) tuples.
        calendar_year: The target calendar year for the portfolio.

    Returns:
        dict with keys:
            - transactions: List of linked BUY/SELL transactions for the CY.
            - unmatched_sells: List of sells that couldn't be matched to any lot.
            - skipped_count: Number of trades skipped (e.g., after CY).
    """
    # ── Phase 1: Extract all trades from all files ──────────────────────
    all_trades = []
    for file_bytes, filename in file_list:
        file_trades = _extract_trades_from_file(file_bytes, filename)
        all_trades.extend(file_trades)

    # Sort chronologically by datetime string (IBKR format: "YYYY-MM-DD, HH:MM:SS")
    all_trades.sort(key=lambda t: t["datetime_str"])

    # ── Phase 2: Build lots from BUYs ───────────────────────────────────
    # lots_by_symbol: { symbol: [ { buy_date, buy_price, quantity, sells: [...] }, ... ] }
    lots_by_symbol = {}
    skipped_count = 0

    for trade in all_trades:
        qty_raw = trade["qty_raw"]
        if qty_raw <= 0:
            continue  # Skip sells in this phase

        sym = trade["symbol"]
        date_val = trade["date"]

        # Check year
        try:
            d_obj = parse_sort_date(date_val)
            if d_obj.year > calendar_year:
                skipped_count += 1
                continue
        except Exception:
            continue

        # Compute buy price (commission-inclusive)
        buy_price = _compute_price_from_proceeds(trade["proceeds"], trade["commission"], qty_raw)
        if buy_price is None:
            buy_price = _compute_price_from_basis(trade["basis"], qty_raw)
        if buy_price is None:
            buy_price = _compute_price_fallback(trade["t_price"])
        if buy_price is None:
            continue

        qty = tax_round(abs(qty_raw), 6)

        if sym not in lots_by_symbol:
            lots_by_symbol[sym] = []

        # Try to aggregate into existing lot with same date and price
        matched = False
        for lot in lots_by_symbol[sym]:
            if lot["buy_date"] == date_val and abs(lot["buy_price"] - buy_price) < 0.05:
                lot["quantity"] += qty
                matched = True
                break

        if not matched:
            lots_by_symbol[sym].append({
                "buy_date": date_val,
                "buy_price": buy_price,
                "quantity": qty,
                "sells": [],
            })

    # ── Phase 3: Match SELLs to lots ────────────────────────────────────
    unmatched_sells = []

    for trade in all_trades:
        qty_raw = trade["qty_raw"]
        if qty_raw >= 0:
            continue  # Skip buys

        sym = trade["symbol"]
        date_val = trade["date"]

        # Check year — skip sells after CY
        try:
            d_obj = parse_sort_date(date_val)
            if d_obj.year > calendar_year:
                skipped_count += 1
                continue
        except Exception:
            continue

        qty = tax_round(abs(qty_raw), 6)

        # Compute sell price (commission-net)
        sell_price = _compute_price_from_proceeds(trade["proceeds"], trade["commission"], qty_raw)
        if sell_price is None:
            sell_price = _compute_price_fallback(trade["t_price"])
        if sell_price is None:
            continue

        # Compute inferred buy price from the Basis column for lot matching
        inferred_buy_price = _compute_price_from_basis(trade["basis"], qty_raw)

        # Find matching lot
        symbol_lots = lots_by_symbol.get(sym, [])
        matched_lot = None

        if inferred_buy_price is not None:
            # Strategy: match by inferred buy price within tolerance
            best_match = None
            best_available = -1

            for lot in symbol_lots:
                if abs(lot["buy_price"] - inferred_buy_price) < LOT_MATCH_TOLERANCE:
                    # Calculate available shares in this lot
                    sold_qty = sum(s["quantity"] for s in lot["sells"])
                    available = lot["quantity"] - sold_qty
                    if available > 0 and available > best_available:
                        best_match = lot
                        best_available = available

            matched_lot = best_match

        if matched_lot is None:
            unmatched_sells.append({
                "symbol": sym,
                "date": date_val,
                "qty": qty,
                "sell_price": sell_price,
                "inferred_buy_price": inferred_buy_price,
                "code": trade["code"],
            })
            logger.warning(
                f"IBKR lot match failed for {sym} sell on {date_val}: "
                f"qty={qty}, inferred_buy_price={inferred_buy_price}, "
                f"code={trade['code']}"
            )
            continue

        # Record the sell against the matched lot
        matched_lot["sells"].append({
            "sell_date": date_val,
            "quantity": qty,
            "sell_price": sell_price,
        })

    # ── Phase 4: Emit linked transactions for the calendar year ─────────
    transactions = []

    for sym, lots in lots_by_symbol.items():
        for lot in lots:
            buy_date = lot["buy_date"]
            buy_price = lot["buy_price"]
            original_qty = lot["quantity"]

            # Calculate pre-CY sold quantity (sells from before the calendar year)
            pre_cy_sold = 0.0
            cy_sells = []
            for sell in lot["sells"]:
                try:
                    sell_d = parse_sort_date(sell["sell_date"])
                    if sell_d.year < calendar_year:
                        pre_cy_sold += sell["quantity"]
                    elif sell_d.year == calendar_year:
                        cy_sells.append(sell)
                except Exception:
                    cy_sells.append(sell)

            # Remaining quantity carried into this CY
            carried_qty = tax_round(original_qty - pre_cy_sold, 6)
            if carried_qty <= 0:
                continue  # Lot fully sold before this CY

            # Emit BUY transaction (with carried-forward quantity)
            transactions.append({
                "type": "BUY",
                "date": buy_date,
                "symbol": sym,
                "qty": carried_qty,
                "price": buy_price,
            })

            # Emit linked SELL transactions for CY sells
            for sell in cy_sells:
                transactions.append({
                    "type": "SELL",
                    "date": sell["sell_date"],
                    "symbol": sym,
                    "qty": sell["quantity"],
                    "price": sell["sell_price"],
                    "buy_date": buy_date,
                    "buy_price": buy_price,
                })

    # Sort transactions chronologically
    transactions.sort(key=lambda t: parse_sort_date(t["date"]))

    logger.info(
        f"IBKR extraction: {len(transactions)} transactions, "
        f"{len(unmatched_sells)} unmatched sells, "
        f"{skipped_count} skipped (after CY)"
    )

    return {
        "transactions": transactions,
        "unmatched_sells": unmatched_sells,
        "skipped_count": skipped_count,
    }


def process_ibkr_file(file_bytes: bytes, filename: str, portfolio: dict) -> dict:
    """
    Backward-compatible wrapper for single-file IBKR parsing.
    Delegates to process_ibkr_files().
    """
    calendar_year = int(portfolio.get("calendar_year", 9999))
    result = process_ibkr_files([(file_bytes, filename)], calendar_year)
    return result
