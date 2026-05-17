import io
import csv
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


def process_sell_details_file(file_bytes: bytes, filename: str, portfolio: dict) -> dict:
    """
    Parses a G&L Expanded CSV or XLSX and extracts linked transactions.
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
    record_type_idx = find_col_index(headers, ["record type", "type", "transaction type"])
    symbol_idx = find_col_index(headers, ["symbol", "ticker"])
    qty_idx = find_col_index(headers, ["quantity", "qty"])
    date_acquired_idx = find_col_index(headers, ["date acquired"])
    date_sold_idx = find_col_index(headers, ["date sold"])
    plan_type_idx = find_col_index(headers, ["plan type"])
    
    # RSU FMV
    ordinary_income_per_share_idx = find_col_index(headers, [
        "ordinary income recognized per share",
        "ordinary income per share",
        "adjusted cost basis per share",
    ])
    # ESPP FMV (Purchase Date FMV)
    espp_fmv_idx = find_col_index(headers, ["purchase date fair mkt. value", "purchase date fmv"])
    
    proceeds_per_share_idx = find_col_index(headers, ["proceeds per share"])

    if symbol_idx == -1 or qty_idx == -1 or date_acquired_idx == -1 or date_sold_idx == -1 or proceeds_per_share_idx == -1:
        raise ValueError(f"Missing required columns in Gain/Loss file. Found headers: {headers}")

    transactions = []
    skipped_count = 0

    for row in rows[1:]:
        if len(row) <= max(symbol_idx, qty_idx, date_acquired_idx, date_sold_idx, proceeds_per_share_idx):
            continue

        if record_type_idx != -1:
            record_type = str(row[record_type_idx] or "").strip().lower()
            if record_type != "sell":
                continue

        sym = str(row[symbol_idx] or "").strip()
        if not sym:
            continue

        date_acquired = parse_date(row[date_acquired_idx])
        date_sold = parse_date(row[date_sold_idx])
        if not date_acquired or not date_sold:
            continue

        if date_sold > cutoff:
            skipped_count += 1
            continue

        plan_type = ""
        if plan_type_idx != -1:
            plan_type = str(row[plan_type_idx] or "").strip().lower()

        try:
            qty = float(str(row[qty_idx]).replace(",", ""))
            if qty <= 0:
                continue
            
            # Logic for ESPP vs RSU (RS)
            if "espp" in plan_type and espp_fmv_idx != -1:
                buy_price = float(str(row[espp_fmv_idx]).replace("$", "").replace(",", ""))
            elif ordinary_income_per_share_idx != -1:
                buy_price = float(str(row[ordinary_income_per_share_idx]).replace("$", "").replace(",", ""))
            else:
                continue

            sell_price = float(str(row[proceeds_per_share_idx]).replace("$", "").replace(",", ""))
        except (ValueError, TypeError):
            continue
        
        transactions.append({
            "type": "SELL",
            "date": date_sold,
            "symbol": sym,
            "qty": qty,
            "price": sell_price,
            "buy_date": date_acquired,
            "buy_price": buy_price
        })

    logger.info(f"G&L extraction: {len(transactions)} found, {skipped_count} skipped")
    return {"transactions": transactions, "skipped_count": skipped_count}
