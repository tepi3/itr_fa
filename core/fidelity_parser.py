import csv
import io
import logging
import re
from datetime import datetime
from core.utils import tax_round, parse_sort_date
from core.stock_data import get_price_on_date

logger = logging.getLogger(__name__)

MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
}

def _strip_html(text: str) -> str:
    """Strip HTML tags from header fields (handles the Fidelity header bug)."""
    if not text:
        return ""
    return re.sub(r'<[^>]*>', '', text).strip()

def _parse_fidelity_date(date_str) -> str:
    """Parse Fidelity date strings (like Jun-01-2026 or Jun-1-2026) to dd/mm/yyyy."""
    if not date_str or str(date_str).strip() in ("-", "--", "NA", "N/A", ""):
        return None
    
    date_str = str(date_str).strip()
    
    # Try common formats first
    for fmt in ("%b-%d-%Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%d/%m/%Y")
        except ValueError:
            pass
            
    # Try custom parsing fallback for dates like Jun-1-2026
    try:
        parts = date_str.split("-")
        if len(parts) == 3:
            m_str = parts[0].lower()[:3]
            d_val = int(parts[1])
            y_val = int(parts[2])
            if m_str in MONTH_MAP:
                return f"{d_val:02d}/{MONTH_MAP[m_str]:02d}/{y_val}"
    except Exception:
        pass
        
    return None

def _clean_float(val) -> float:
    """Clean currency/float values from CSV cells."""
    if not val or str(val).strip() in ("-", "--", "NA", "N/A", ""):
        return 0.0
    try:
        clean_str = str(val).replace("$", "").replace(",", "").strip()
        return float(clean_str)
    except ValueError:
        return 0.0

def _parse_open_lots(csv_content: str, ticker: str, target_year: int) -> tuple:
    """Parse the open lots CSV into BUY transactions."""
    transactions = []
    skipped = 0
    
    if not csv_content:
        return transactions, skipped
        
    csv_content = re.sub(r'<[^>]*>', '', csv_content)
    lines = csv_content.splitlines()
    reader = csv.reader(lines)
    
    header_row = None
    header_idx = -1
    rows = list(reader)
    
    for idx, row in enumerate(rows):
        if not row:
            continue
        row_cleaned = [_strip_html(col).lower() for col in row]
        if "date acquired" in row_cleaned and "cost basis" in row_cleaned:
            header_row = row_cleaned
            header_idx = idx
            break
            
    if header_idx == -1:
        logger.warning("Fidelity open lots: Could not find header row.")
        return transactions, skipped
        
    col_map = {name: header_row.index(name) for name in header_row if name}
    
    date_idx = col_map.get("date acquired")
    qty_idx = col_map.get("quantity")
    cost_basis_idx = col_map.get("cost basis")
    cost_share_idx = col_map.get("cost basis/share")
    grant_idx = col_map.get("grant date")
    source_idx = col_map.get("share source")
    
    for row in rows[header_idx + 1:]:
        if not row or all(not cell.strip() for cell in row):
            continue
        if row[0].strip().lower().startswith("the values are displayed in"):
            continue
            
        date_val = _parse_fidelity_date(row[date_idx]) if date_idx is not None else None
        if not date_val:
            continue
            
        try:
            buy_year = int(date_val.split("/")[-1])
            if buy_year > target_year:
                skipped += 1
                continue
        except Exception:
            continue
            
        qty = _clean_float(row[qty_idx]) if qty_idx is not None else 0.0
        total_cost = _clean_float(row[cost_basis_idx]) if cost_basis_idx is not None else 0.0
        cost_share = _clean_float(row[cost_share_idx]) if cost_share_idx is not None else 0.0
        
        if cost_share == 0.0 and qty > 0:
            cost_share = tax_round(total_cost / qty, 4)
            
        if qty <= 0:
            continue
            
        share_source = str(row[source_idx]).strip().upper() if source_idx is not None else ""
        is_espp = (share_source == "SP")
        
        lot_type = "espp" if is_espp else "rsu"
        espp_source = "open_lot" if is_espp else ""
        
        transactions.append({
            "type": "BUY",
            "date": date_val,
            "symbol": ticker,
            "qty": tax_round(qty, 6),
            "price": tax_round(cost_share, 4),
            "original_price": tax_round(cost_share, 4),
            "lot_type": lot_type,
            "espp_source": espp_source,
            "grant_date": _parse_fidelity_date(row[grant_idx]) if (grant_idx is not None and row[grant_idx].strip() != "-") else None
        })
        
    return transactions, skipped

def _parse_closed_lots(csv_content: str, ticker: str, target_year: int) -> tuple:
    """Parse closed lots CSV into linked BUY/SELL transaction pairs."""
    pairs = []
    skipped = 0
    
    if not csv_content:
        return pairs, skipped
        
    csv_content = re.sub(r'<[^>]*>', '', csv_content)
    lines = csv_content.splitlines()
    reader = csv.reader(lines)
    
    header_row = None
    header_idx = -1
    rows = list(reader)
    
    for idx, row in enumerate(rows):
        if not row:
            continue
        row_cleaned = [_strip_html(col).lower() for col in row]
        if "date acquired" in row_cleaned and "quantity" in row_cleaned and any("sold" in col for col in row_cleaned):
            header_row = row_cleaned
            header_idx = idx
            break
            
    if header_idx == -1:
        logger.warning("Fidelity closed lots: Could not find header row.")
        return pairs, skipped
        
    col_map = {name: header_row.index(name) for name in header_row if name}
    
    date_sold_key = None
    for key in col_map:
        if "sold" in key or "transferred" in key:
            date_sold_key = key
            break
            
    date_acq_idx = col_map.get("date acquired")
    qty_idx = col_map.get("quantity")
    date_sold_idx = col_map.get(date_sold_key) if date_sold_key else None
    proceeds_idx = col_map.get("proceeds")
    cost_basis_idx = col_map.get("cost basis")
    
    if date_sold_idx is None or date_acq_idx is None or qty_idx is None or proceeds_idx is None or cost_basis_idx is None:
        logger.warning("Fidelity closed lots: Missing required columns.")
        return pairs, skipped
        
    for row in rows[header_idx + 1:]:
        if not row or all(not cell.strip() for cell in row):
            continue
        if row[0].strip().lower().startswith("the values are displayed in"):
            continue
            
        buy_date_val = _parse_fidelity_date(row[date_acq_idx])
        sell_date_val = _parse_fidelity_date(row[date_sold_idx])
        if not buy_date_val or not sell_date_val:
            continue
            
        try:
            buy_year = int(buy_date_val.split("/")[-1])
            sell_year = int(sell_date_val.split("/")[-1])
            # Ignore acquired after target_year OR sold before target_year
            if buy_year > target_year or sell_year < target_year:
                skipped += 1
                continue
        except Exception:
            continue
            
        qty = _clean_float(row[qty_idx])
        proceeds = _clean_float(row[proceeds_idx])
        cost_basis = _clean_float(row[cost_basis_idx])
        
        if qty <= 0:
            continue
            
        buy_price = tax_round(cost_basis / qty, 4)
        sell_price = tax_round(proceeds / qty, 4)
        
        buy_tx = {
            "type": "BUY",
            "date": buy_date_val,
            "symbol": ticker,
            "qty": tax_round(qty, 6),
            "price": buy_price,
            "original_price": buy_price,
            "lot_type": "unknown",
            "espp_source": "",
            "closed_lot": True
        }
        
        sell_tx = None
        if sell_year == target_year:
            sell_tx = {
                "type": "SELL",
                "date": sell_date_val,
                "symbol": ticker,
                "qty": tax_round(qty, 6),
                "price": sell_price,
                "buy_date": buy_date_val,
                "buy_price": buy_price,
                "original_buy_price": buy_price,
                "lot_type": "unknown",
                "espp_source": "",
                "closed_lot": True
            }
        
        pairs.append((buy_tx, sell_tx))
        
    return pairs, skipped

def _detect_espp_lots(open_buys: list, closed_pairs: list, ticker: str):
    """Detect and correct ESPP transactions using cross-reference and historical FMV heuristics."""
    # Initialize defaults
    for tx in open_buys:
        tx["fmv_price"] = tx["price"]
        
    for buy_tx, sell_tx in closed_pairs:
        buy_tx["fmv_price"] = buy_tx["price"]
        if sell_tx:
            sell_tx["fmv_buy_price"] = sell_tx["buy_price"]

    # 1. Update open ESPP lots with real FMV prices
    for tx in open_buys:
        if tx["lot_type"] == "espp":
            fmv = get_price_on_date(ticker, tx["date"])
            if fmv:
                tx["price"] = tax_round(fmv, 2)
                tx["fmv_price"] = tax_round(fmv, 2)
                
    # 2. Update closed lots
    for buy_tx, sell_tx in closed_pairs:
        # Step A: Check if this sold lot has a matching entry in open lots (partial sale)
        matched_open = None
        for ob in open_buys:
            if ob["date"] == buy_tx["date"] and abs(ob["original_price"] - buy_tx["original_price"]) < 0.05:
                matched_open = ob
                break
                
        if matched_open:
            if matched_open["lot_type"] == "espp":
                buy_tx["lot_type"] = "espp"
                buy_tx["espp_source"] = "cross_ref"
                if sell_tx:
                    sell_tx["lot_type"] = "espp"
                    sell_tx["espp_source"] = "cross_ref"
                
                fmv = get_price_on_date(ticker, buy_tx["date"])
                if fmv:
                    buy_tx["price"] = tax_round(fmv, 2)
                    buy_tx["fmv_price"] = tax_round(fmv, 2)
                    if sell_tx:
                        sell_tx["buy_price"] = tax_round(fmv, 2)
                        sell_tx["fmv_buy_price"] = tax_round(fmv, 2)
            else:
                buy_tx["lot_type"] = "rsu"
                if sell_tx:
                    sell_tx["lot_type"] = "rsu"
        else:
            # Step B: Heuristic detection based on historical closing price
            fmv = get_price_on_date(ticker, buy_tx["date"])
            if fmv:
                discount = (fmv - buy_tx["original_price"]) / fmv
                # Standard ESPP discount is 15%, so check if it is within 8% to 18%
                if 0.08 <= discount <= 0.18:
                    buy_tx["lot_type"] = "espp"
                    buy_tx["espp_source"] = "heuristic"
                    buy_tx["price"] = tax_round(fmv, 2)
                    buy_tx["fmv_price"] = tax_round(fmv, 2)
                    
                    if sell_tx:
                        sell_tx["lot_type"] = "espp"
                        sell_tx["espp_source"] = "heuristic"
                        sell_tx["buy_price"] = tax_round(fmv, 2)
                        sell_tx["fmv_buy_price"] = tax_round(fmv, 2)
                else:
                    buy_tx["lot_type"] = "rsu"
                    if sell_tx:
                        sell_tx["lot_type"] = "rsu"
            else:
                buy_tx["lot_type"] = "unknown"
                if sell_tx:
                    sell_tx["lot_type"] = "unknown"

def process_fidelity_files(open_lots_bytes: bytes, open_lots_filename: str,
                           closed_lots_bytes: bytes, closed_lots_filename: str,
                           ticker: str, target_year: int) -> dict:
    """
    Main entry point for Fidelity NetBenefits CSV files parsing.
    
    Processes both files, runs the ESPP detection and FMV lookups,
    and returns a list of sorted transactions for the review.
    """
    ticker = ticker.strip().upper()
    
    # Read Open Lots
    open_lots_str = ""
    if open_lots_bytes:
        try:
            open_lots_str = open_lots_bytes.decode('utf-8-sig')
        except UnicodeDecodeError:
            open_lots_str = open_lots_bytes.decode('latin-1')
            
    open_buys, open_skipped = _parse_open_lots(open_lots_str, ticker, target_year)
    
    # Read Closed Lots
    closed_lots_str = ""
    if closed_lots_bytes:
        try:
            closed_lots_str = closed_lots_bytes.decode('utf-8-sig')
        except UnicodeDecodeError:
            closed_lots_str = closed_lots_bytes.decode('latin-1')
            
    closed_pairs, closed_skipped = _parse_closed_lots(closed_lots_str, ticker, target_year)
    
    # Perform ESPP heuristics & FMV adjustments
    _detect_espp_lots(open_buys, closed_pairs, ticker)
    
    # Assign client-side lot_id for tracking and interactive updates
    for i, tx in enumerate(open_buys):
        tx["lot_id"] = f"open_{i}"
        
    for i, (buy_tx, sell_tx) in enumerate(closed_pairs):
        lid = f"closed_{i}"
        buy_tx["lot_id"] = lid
        if sell_tx:
            sell_tx["lot_id"] = lid
        
    # Flatten all transactions
    all_transactions = []
    all_transactions.extend(open_buys)
    for buy_tx, sell_tx in closed_pairs:
        all_transactions.append(buy_tx)
        if sell_tx:
            all_transactions.append(sell_tx)
        
    # Sort chronologically by date
    all_transactions.sort(key=lambda tx: parse_sort_date(tx["date"]))
    
    return {
        "transactions": all_transactions,
        "skipped_count": open_skipped + closed_skipped
    }
