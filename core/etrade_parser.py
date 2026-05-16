import io
import csv
import logging
from datetime import datetime

# openpyxl is lazy-loaded to speed up app startup
openpyxl = None

def _get_openpyxl():
    global openpyxl
    if openpyxl is None:
        import openpyxl as oxl
        openpyxl = oxl
    return openpyxl

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
    Parses an Etrade CSV or XLSX and extracts transactions.
    """
    calendar_year = int(portfolio.get("calendar_year", 9999))
    cutoff = f"{calendar_year}-12-31"

    rows = []
    if filename.endswith('.csv'):
        content = file_bytes.decode('utf-8-sig')
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
    elif filename.endswith('.xlsx'):
        wb = _get_openpyxl().load_workbook(io.BytesIO(file_bytes), data_only=True)
        ws = wb.active
        for r in ws.iter_rows(values_only=True):
            rows.append(list(r))
    else:
        raise ValueError("Unsupported file format")

    if not rows:
        raise ValueError("Empty file.")

    headers = rows[0]
    date_idx = find_col_index(headers, ["vest date", "date acquired", "date", "transaction date"])
    type_idx = find_col_index(headers, ["transaction type", "action", "type", "record type"])
    symbol_idx = find_col_index(headers, ["symbol", "ticker"])
    qty_idx = find_col_index(headers, ["sellable qty.", "quantity", "qty", "purchased qty."])
    price_idx = find_col_index(headers, ["purchase date fmv", "price", "execution price", "purchase price", "est. cost basis (per share):"])

    if symbol_idx == -1 or date_idx == -1 or qty_idx == -1 or price_idx == -1:
        raise ValueError(f"Missing required columns in E-Trade file. Found headers: {headers}")

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

        if date_val > cutoff:
            skipped_count += 1
            continue

        try:
            qty = float(str(q_val).replace(",", ""))
            if qty <= 0:
                continue
            price = float(str(p_val).replace("$", "").replace(",", ""))
        except (ValueError, TypeError):
            continue

        is_sell = "sell" in t_type or "sold" in t_type or t_type == "s"
        transactions.append({
            "type": "SELL" if is_sell else "BUY",
            "date": date_val,
            "symbol": sym,
            "qty": qty,
            "price": price
        })

    logger.info(f"Etrade extraction: {len(transactions)} found, {skipped_count} skipped")
    return {"transactions": transactions, "skipped_count": skipped_count}
