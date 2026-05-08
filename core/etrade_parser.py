import io
import csv
import uuid
import logging
from datetime import datetime
import openpyxl

logger = logging.getLogger(__name__)


def parse_date(date_val) -> str:
    """Parse common CSV/Excel date formats into YYYY-MM-DD."""
    if isinstance(date_val, datetime):
        return date_val.strftime("%Y-%m-%d")
    if not date_val:
        return None
    date_str = str(date_val).strip().split(" ")[0]
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%d-%b-%Y", "%d-%b-%y"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
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


def process_etrade_file(file_bytes: bytes, filename: str, portfolio: dict) -> dict:
    """
    Parses an Etrade CSV or XLSX and adds/updates stocks, lots, and sells.
    Applies FIFO logic for sells.

    Skips any transaction whose date is after the portfolio's calendar_year
    (i.e., date > YYYY-12-31) and returns skipped_count alongside the portfolio.

    Returns:
        {"portfolio": dict, "skipped_count": int}
    """
    calendar_year = int(portfolio.get("calendar_year", 9999))
    cutoff = f"{calendar_year}-12-31"

    rows = []

    if filename.endswith('.csv'):
        content = file_bytes.decode('utf-8-sig')
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
    elif filename.endswith('.xlsx'):
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        ws = wb.active
        for r in ws.iter_rows(values_only=True):
            rows.append(list(r))
    else:
        raise ValueError("Unsupported file format")

    if not rows:
        raise ValueError("Empty file.")

    headers = rows[0]

    date_idx  = find_col_index(headers, ["vest date", "date acquired", "date", "transaction date"])
    type_idx  = find_col_index(headers, ["transaction type", "action", "type", "record type"])
    symbol_idx = find_col_index(headers, ["symbol", "ticker"])
    qty_idx   = find_col_index(headers, ["sellable qty.", "quantity", "qty", "purchased qty."])
    price_idx = find_col_index(headers, ["purchase date fmv", "price", "execution price", "purchase price"])

    if date_idx == -1 or symbol_idx == -1 or qty_idx == -1 or price_idx == -1:
        raise ValueError(f"Missing required columns. Found headers: {headers}")

    transactions = []
    skipped_count = 0

    for row in rows[1:]:
        if len(row) <= max(date_idx, symbol_idx, qty_idx, price_idx):
            continue

        sym = str(row[symbol_idx] or "").strip()

        t_type = "buy"
        if type_idx != -1:
            t_type = str(row[type_idx] or "").strip().lower()

        d_val = row[date_idx]
        q_val = row[qty_idx]
        p_val = row[price_idx]

        if not sym or not d_val or q_val is None or p_val is None:
            continue

        date_val = parse_date(d_val)
        if not date_val:
            continue

        # Skip transactions beyond the calendar year
        if date_val > cutoff:
            skipped_count += 1
            logger.debug(f"Skipping {sym} on {date_val} (beyond CY{calendar_year})")
            continue

        try:
            qty = float(str(q_val).replace(",", ""))
            if qty <= 0:
                continue
            price = float(str(p_val).replace("$", "").replace(",", ""))
        except ValueError:
            continue

        is_sell = "sell" in t_type or "sold" in t_type or t_type == "s"

        if is_sell:
            transactions.append({"type": "SELL", "date": date_val, "symbol": sym, "qty": qty, "price": price})
        else:
            transactions.append({"type": "BUY",  "date": date_val, "symbol": sym, "qty": qty, "price": price})

    # Sort chronologically so FIFO works correctly
    transactions.sort(key=lambda x: x["date"])

    stocks_dict = {s["ticker"]: s for s in portfolio.get("stocks", [])}

    for tx in transactions:
        sym = tx["symbol"]
        if sym not in stocks_dict:
            stocks_dict[sym] = {
                "id": str(uuid.uuid4()),
                "ticker": sym,
                "yahoo_ticker": sym,
                "currency": "USD",
                "skip_dividends": False,
                "company_info": {},
                "lots": []
            }

        stock = stocks_dict[sym]

        if tx["type"] == "BUY":
            stock["lots"].append({
                "id": str(uuid.uuid4()),
                "buy_date": tx["date"],
                "quantity": tx["qty"],
                "buy_price": tx["price"],
                "sells": []
            })
            stock["lots"].sort(key=lambda l: l["buy_date"])

        elif tx["type"] == "SELL":
            sell_qty = tx["qty"]
            for lot in stock["lots"]:
                if sell_qty <= 0:
                    break
                available_qty = float(lot["quantity"])
                for s in lot.get("sells", []):
                    available_qty -= float(s["quantity"])
                if available_qty > 0:
                    qty_to_deduct = min(sell_qty, available_qty)
                    sell_qty -= qty_to_deduct
                    if "sells" not in lot:
                        lot["sells"] = []
                    lot["sells"].append({
                        "id": str(uuid.uuid4()),
                        "sell_date": tx["date"],
                        "quantity": qty_to_deduct,
                        "sell_price": tx["price"]
                    })

    portfolio["stocks"] = list(stocks_dict.values())
    logger.info(
        f"Etrade import: {len(transactions)} tx imported, "
        f"{skipped_count} skipped (beyond CY{calendar_year})"
    )
    return {"portfolio": portfolio, "skipped_count": skipped_count}
