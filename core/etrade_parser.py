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
    """Find the first matching header index from a list of possible names, prioritized by the order of possible_names."""
    lower_headers = [str(h).strip().lower() if h else "" for h in headers]
    for name in possible_names:
        if name in lower_headers:
            return lower_headers.index(name)
    return -1

def process_etrade_file(file_bytes: bytes, filename: str, portfolio: dict) -> dict:
    """
    Parses an Etrade CSV or XLSX and adds/updates stocks, lots, and sells in the portfolio.
    Applies FIFO logic for sells.
    """
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
    
    # Specific mappings requested by user:
    # "Vest Date" -> Date
    # "Sellable Qty." -> Qty
    # "Purchase Date FMV" -> Price
    
    date_idx = find_col_index(headers, ["vest date", "date acquired", "date", "transaction date"])
    type_idx = find_col_index(headers, ["transaction type", "action", "type", "record type"])
    symbol_idx = find_col_index(headers, ["symbol", "ticker"])
    qty_idx = find_col_index(headers, ["sellable qty.", "quantity", "qty", "purchased qty."])
    price_idx = find_col_index(headers, ["purchase date fmv", "price", "execution price", "purchase price"])

    if date_idx == -1 or symbol_idx == -1 or qty_idx == -1 or price_idx == -1:
        raise ValueError(f"Missing required columns. Found headers: {headers}")

    transactions = []
    for row in rows[1:]:
        if len(row) <= max(date_idx, symbol_idx, qty_idx, price_idx):
            continue
            
        sym = str(row[symbol_idx] or "").strip()
        
        t_type = "buy" # Default to buy for standard RSUs / ESPPs
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

        try:
            qty = float(str(q_val).replace(",", ""))
            if qty <= 0: continue # ignore 0 qty
            price = float(str(p_val).replace("$", "").replace(",", ""))
        except ValueError:
            continue

        # In ESPP / RSU "ByStatus" spreadsheets, everything is an acquisition lot if "Sellable Qty." > 0.
        is_sell = "sell" in t_type or "sold" in t_type or t_type == "s"
        is_buy = not is_sell
        
        if is_buy:
            transactions.append({"type": "BUY", "date": date_val, "symbol": sym, "qty": qty, "price": price})
        elif is_sell:
            transactions.append({"type": "SELL", "date": date_val, "symbol": sym, "qty": qty, "price": price})

    # Sort transactions chronologically
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
                
                # Calculate available qty in this lot
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
    return portfolio
