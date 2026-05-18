import io
import csv
import logging
from datetime import datetime
from core.utils import tax_round

logger = logging.getLogger(__name__)

def parse_date(date_val) -> str:
    """Parse common CSV/Excel date formats into dd/mm/yyyy."""
    if isinstance(date_val, datetime):
        return date_val.strftime("%d/%m/%Y")
    if not date_val:
        return None
    date_str = str(date_val).strip().split(" ")[0]
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
    Parses an IBKR CSV and extracts transactions.
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

    # Find the header row for 'Transaction History'
    header_idx = -1
    for i, row in enumerate(rows):
        if len(row) > 1 and row[0] == "Transaction History" and row[1] == "Header":
            header_idx = i
            break
            
    if header_idx == -1:
        raise ValueError("Could not find 'Transaction History' section in IBKR file.")

    headers = rows[header_idx]
    date_idx  = find_col_index(headers, ["date", "transaction date"])
    type_idx  = find_col_index(headers, ["transaction type", "type"])
    symbol_idx = find_col_index(headers, ["symbol", "ticker"])
    qty_idx   = find_col_index(headers, ["quantity", "qty"])
    price_idx = find_col_index(headers, ["price", "execution price"])

    if date_idx == -1 or symbol_idx == -1 or qty_idx == -1 or price_idx == -1 or type_idx == -1:
        raise ValueError(f"Missing required columns in IBKR Transaction History.")

    transactions = []
    skipped_count = 0

    for row in rows[header_idx+1:]:
        if len(row) <= max(date_idx, symbol_idx, qty_idx, price_idx, type_idx):
            continue
            
        if row[0] != "Transaction History" or row[1] != "Data":
            continue

        sym = str(row[symbol_idx] or "").strip()
        t_type = str(row[type_idx] or "").strip().lower()

        if not sym or sym == '-':
            continue

        date_val = parse_date(row[date_idx])
        if not date_val:
            continue

        # Convert back to date object to check year
        try:
            if "/" in date_val:
                d_obj = datetime.strptime(date_val, "%d/%m/%Y").date()
            else:
                d_obj = datetime.fromisoformat(date_val).date()
            
            if d_obj.year > calendar_year:
                skipped_count += 1
                continue
        except:
            continue

        try:
            # Use higher precision for quantity (fractional shares)
            qty = tax_round(float(str(row[qty_idx]).replace(",", "")), 6)
            if qty <= 0:
                continue
            price = tax_round(float(str(row[price_idx]).replace("$", "").replace(",", "")), 2)
        except (ValueError, TypeError):
            continue

        is_sell = "sell" in t_type or "sold" in t_type
        transactions.append({
            "type": "SELL" if is_sell else "BUY",
            "date": date_val,
            "symbol": sym,
            "qty": qty,
            "price": price
        })

    logger.info(f"IBKR extraction: {len(transactions)} found, {skipped_count} skipped")
    return {"transactions": transactions, "skipped_count": skipped_count}
