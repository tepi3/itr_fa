"""
Parser for E-Trade G&L Expanded (Gains & Losses) reports.

Populates both Acquisition Lots and Sell Transactions from sell records.

Column Mapping:
  Acquisition Lots:
    Quantity         -> Quantity
    Date Acquired    -> Buy Date
    Ordinary Income Recognized Per Share -> Buy Price ($)

  Sell Transactions:
    Date Acquired    -> Lot (Buy Date)
    Date Sold        -> Sell Date
    Quantity         -> Quantity
    Proceeds Per Share -> Sell Price ($)
"""

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


def process_sell_details_file(file_bytes: bytes, filename: str, portfolio: dict) -> dict:
    """
    Parses a G&L Expanded CSV or XLSX and populates acquisition lots and sell transactions.

    Skips rows where Date Sold is after the portfolio's calendar_year cutoff
    and returns skipped_count alongside the portfolio.

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

    # Find required column indices
    record_type_idx = find_col_index(headers, ["record type", "type", "transaction type"])
    symbol_idx = find_col_index(headers, ["symbol", "ticker"])
    qty_idx = find_col_index(headers, ["quantity", "qty"])
    date_acquired_idx = find_col_index(headers, ["date acquired"])
    date_sold_idx = find_col_index(headers, ["date sold"])
    ordinary_income_per_share_idx = find_col_index(headers, [
        "ordinary income recognized per share",
        "ordinary income per share",
    ])
    proceeds_per_share_idx = find_col_index(headers, [
        "proceeds per share",
    ])

    if symbol_idx == -1:
        raise ValueError(f"Missing 'Symbol' column. Found headers: {headers}")
    if qty_idx == -1:
        raise ValueError(f"Missing 'Quantity' column. Found headers: {headers}")
    if date_acquired_idx == -1:
        raise ValueError(f"Missing 'Date Acquired' column. Found headers: {headers}")
    if date_sold_idx == -1:
        raise ValueError(f"Missing 'Date Sold' column. Found headers: {headers}")
    if ordinary_income_per_share_idx == -1:
        raise ValueError(f"Missing 'Ordinary Income Recognized Per Share' column. Found headers: {headers}")
    if proceeds_per_share_idx == -1:
        raise ValueError(f"Missing 'Proceeds Per Share' column. Found headers: {headers}")

    # Build stocks dictionary from existing portfolio
    stocks_dict = {s["ticker"]: s for s in portfolio.get("stocks", [])}

    sell_count = 0
    skipped_count = 0
    for row in rows[1:]:
        max_idx = max(symbol_idx, qty_idx, date_acquired_idx, date_sold_idx,
                      ordinary_income_per_share_idx, proceeds_per_share_idx)
        if len(row) <= max_idx:
            continue

        # Filter to only "Sell" rows (skip Summary, etc.)
        if record_type_idx != -1:
            record_type = str(row[record_type_idx] or "").strip().lower()
            if record_type != "sell":
                continue

        sym = str(row[symbol_idx] or "").strip()
        if not sym:
            continue

        # Parse values
        date_acquired = parse_date(row[date_acquired_idx])
        date_sold = parse_date(row[date_sold_idx])
        if not date_acquired or not date_sold:
            continue

        # Skip sells beyond the calendar year cutoff
        if date_sold > cutoff:
            skipped_count += 1
            logger.debug(f"Skipping {sym} sell on {date_sold} (beyond CY{calendar_year})")
            continue

        try:
            qty = float(str(row[qty_idx]).replace(",", ""))
            if qty <= 0:
                continue
            buy_price = float(str(row[ordinary_income_per_share_idx]).replace("$", "").replace(",", ""))
            sell_price = float(str(row[proceeds_per_share_idx]).replace("$", "").replace(",", ""))
        except (ValueError, TypeError):
            continue

        # Create stock entry if it doesn't exist
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

        # Find or create the acquisition lot matching this buy_date and buy_price
        matching_lot = None
        for lot in stock["lots"]:
            if lot["buy_date"] == date_acquired and abs(float(lot["buy_price"]) - buy_price) < 0.01:
                matching_lot = lot
                break

        if matching_lot is None:
            # Create new acquisition lot
            matching_lot = {
                "id": str(uuid.uuid4()),
                "buy_date": date_acquired,
                "quantity": qty,
                "buy_price": buy_price,
                "sells": []
            }
            stock["lots"].append(matching_lot)
        else:
            # Lot already exists — add quantity (multiple sells from same lot)
            matching_lot["quantity"] = float(matching_lot["quantity"]) + qty

        # Add sell transaction to this lot
        if "sells" not in matching_lot:
            matching_lot["sells"] = []

        matching_lot["sells"].append({
            "id": str(uuid.uuid4()),
            "sell_date": date_sold,
            "quantity": qty,
            "sell_price": sell_price
        })

        sell_count += 1

    # Sort lots by buy_date for each stock
    for stock in stocks_dict.values():
        stock["lots"].sort(key=lambda l: l["buy_date"])

    portfolio["stocks"] = list(stocks_dict.values())
    logger.info(
        f"G&L import: {sell_count} sell record(s) imported, "
        f"{skipped_count} skipped (beyond CY{calendar_year})"
    )
    return {"portfolio": portfolio, "skipped_count": skipped_count}
