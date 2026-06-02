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

def process_ibkr_file(file_bytes: bytes, filename: str, portfolio: dict) -> dict:
    """
    Parses an IBKR CSV and extracts transactions. Supports only the modern "Trades" (Activity Statement) section.
    """
    calendar_year = int(portfolio.get("calendar_year", 9999))

    rows = []
    if filename.endswith('.csv'):
        content = file_bytes.decode('utf-8-sig')
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
    else:
        raise ValueError("Unsupported file format. Please upload IBKR CSV.")

    if not rows:
        raise ValueError("Empty file.")

    # Detect the "Trades" header row for the Activity Statement
    header_idx = -1
    for i, row in enumerate(rows):
        if len(row) > 1 and row[0] == "Trades" and row[1] == "Header":
            header_idx = i
            break

    if header_idx == -1:
        raise ValueError("Could not find 'Trades' section in IBKR Activity Statement.")

    headers = rows[header_idx]
    
    date_idx   = find_col_index(headers, ["date/time", "date"])
    symbol_idx = find_col_index(headers, ["symbol", "ticker"])
    qty_idx    = find_col_index(headers, ["quantity", "qty"])
    price_idx  = find_col_index(headers, ["t. price", "price", "execution price"])
    basis_idx  = find_col_index(headers, ["basis"])
    proceeds_idx = find_col_index(headers, ["proceeds"])
    comm_idx   = find_col_index(headers, ["comm/fee", "commission"])

    if date_idx == -1 or symbol_idx == -1 or qty_idx == -1 or price_idx == -1:
        raise ValueError("Missing required columns in IBKR Trades CSV section.")

    transactions = []
    skipped_count = 0

    for row in rows[header_idx+1:]:
        if len(row) <= max(date_idx, symbol_idx, qty_idx, price_idx, proceeds_idx, comm_idx):
            continue
            
        if row[0] != "Trades" or row[1] != "Data":
            continue

        # Filter to only stocks asset class
        asset_cat_idx = find_col_index(headers, ["asset category"])
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

        # Convert back to date object to check year
        try:
            d_obj = parse_sort_date(date_val)
            
            if d_obj.year > calendar_year:
                skipped_count += 1
                continue
        except:
            continue

        try:
            qty_raw = float(str(row[qty_idx]).replace(",", ""))
            if qty_raw == 0:
                continue
            
            qty = tax_round(abs(qty_raw), 6)
            t_type = "BUY" if qty_raw > 0 else "SELL"

            # Use Net Proceeds (Proceeds + Commission) to get the net price per share
            if proceeds_idx != -1 and comm_idx != -1:
                proceeds_raw = float(str(row[proceeds_idx]).replace(",", ""))
                comm_raw = float(str(row[comm_idx]).replace(",", ""))
                # Net price = |Total Proceeds + Total Commission| / Quantity
                price = tax_round(abs(proceeds_raw + comm_raw) / abs(qty_raw), 2)
            elif basis_idx != -1 and t_type == "BUY":
                # Fallback for BUYS only: Basis is total cost
                basis_raw = float(str(row[basis_idx]).replace(",", ""))
                price = tax_round(abs(basis_raw) / abs(qty_raw), 2)
            else:
                # Absolute fallback to execution price
                price = tax_round(float(str(row[price_idx]).replace("$", "").replace(",", "")), 2)
        except (ValueError, TypeError, ZeroDivisionError):
            continue

        transactions.append({
            "type": t_type,
            "date": date_val,
            "symbol": sym,
            "qty": qty,
            "price": price
        })

    logger.info(f"IBKR extraction: {len(transactions)} found, {skipped_count} skipped")
    return {"transactions": transactions, "skipped_count": skipped_count}
