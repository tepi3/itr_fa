import csv
import io
import json
import logging
import uuid
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
    """Parse common E-Trade CSV date formats into YYYY-MM-DD."""
    if not date_val or date_val in ("--", "NA", "N/A"):
        return None
    if isinstance(date_val, datetime):
        return date_val.strftime("%Y-%m-%d")
    
    date_str = str(date_val).strip().split(" ")[0]
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%d-%b-%Y", "%d-%b-%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None

def clean_float(val) -> float:
    """Clean E-Trade currency and number strings."""
    if not val or val in ("--", "NA", "N/A"):
        return 0.0
    try:
        clean_str = str(val).replace("$", "").replace(",", "").strip()
        return float(clean_str)
    except ValueError:
        return 0.0

class ETradeRollbackBuilder:
    def __init__(self, target_year=2025, company_info_map=None):
        self.target_year = target_year
        self.company_info_map = company_info_map or {}
        # Dictionary to aggregate lots. Key: (symbol, buy_date)
        self.lots = {} 

    def _get_or_create_lot(self, symbol, buy_date):
        key = (symbol, buy_date)
        if key not in self.lots:
            self.lots[key] = {
                "id": str(uuid.uuid4()), "buy_date": buy_date, "buy_price": 0.0,
                "unsold_qty": 0.0, "sold_qty": 0.0, "sells": []
            }
        return self.lots[key]

    def parse_bystatus_sellable(self, csv_content: str):
        if not csv_content: return
        reader = csv.DictReader(io.StringIO(csv_content.strip()))
        for row in reader:
            rt = row.get("Record Type", "").strip().lower()
            if rt == "summary" or not rt: continue

            symbol = row.get("Symbol", "").strip()
            buy_date = parse_date(row.get("Date Acquired", ""))
            
            if not symbol or not buy_date: continue
            
            # CRITICAL: Ignore shares acquired AFTER the target year.
            try:
                buy_year = int(buy_date.split("-")[0])
                if buy_year > self.target_year: continue
            except:
                continue

            buy_price = clean_float(row.get("Est. Cost Basis (per share):")) or clean_float(row.get("Grant Date FMV")) or clean_float(row.get("Purchase Price"))
            sellable_qty = clean_float(row.get("Sellable Qty.", 0))
            
            lot = self._get_or_create_lot(symbol, buy_date)
            lot["unsold_qty"] += sellable_qty
            if buy_price > 0: lot["buy_price"] = buy_price

    def parse_gain_and_loss(self, csv_content: str):
        if not csv_content: return
        reader = csv.DictReader(io.StringIO(csv_content.strip()))
        for row in reader:
            # FIX: Do not rely on 'Record Type'. 
            # If there is a Date Sold, it is a sale transaction.
            raw_sell_date = row.get("Date Sold", "")
            if not raw_sell_date or str(raw_sell_date).strip() in ("--", "NA", "N/A", ""): 
                continue

            symbol = row.get("Symbol", "").strip()
            buy_date = parse_date(row.get("Date Acquired", ""))
            sell_date = parse_date(raw_sell_date)
            
            if not symbol or not buy_date or not sell_date: continue

            try:
                buy_year = int(buy_date.split("-")[0])
                sell_year = int(sell_date.split("-")[0])

                # CRITICAL: Ignore shares acquired AFTER the target year
                # CRITICAL: Ignore shares sold BEFORE the target year
                if buy_year > self.target_year or sell_year < self.target_year: continue
            except:
                continue

            qty = clean_float(row.get("Quantity", 0))
            sell_price = clean_float(row.get("Proceeds Per Share", 0))
            
            # Priority: Ordinary Income (FMV) > Adjusted Cost Basis
            buy_price = clean_float(row.get("Ordinary Income Recognized Per Share", 0))
            if buy_price == 0:
                buy_price = clean_float(row.get("Adjusted Cost Basis Per Share", 0))

            lot = self._get_or_create_lot(symbol, buy_date)
            if lot["buy_price"] == 0.0 and buy_price > 0: lot["buy_price"] = buy_price

            if sell_year == self.target_year:
                # Scenario A: Sold IN the target year. Log as an actual sell.
                lot["sold_qty"] += qty
                lot["sells"].append({
                    "id": str(uuid.uuid4()), "quantity": qty, 
                    "sell_date": sell_date, "sell_price": sell_price
                })
            elif sell_year > self.target_year:
                # Scenario B: Sold AFTER the target year (e.g. 2026). 
                # This means it survived 2025, so we roll it back into the unsold baseline!
                lot["unsold_qty"] += qty

    def generate_portfolio_json(self) -> dict:
        stocks_map = {}
        for (symbol, buy_date), lot_data in self.lots.items():
            total_qty = lot_data["unsold_qty"] + lot_data["sold_qty"]
            if total_qty <= 0: continue

            if symbol not in stocks_map:
                info = self.company_info_map.get(symbol, {})
                stocks_map[symbol] = {
                    "id": str(uuid.uuid4()), 
                    "ticker": symbol,
                    "yahoo_ticker": symbol,
                    "currency": "USD",
                    "company_info": {
                        "name": info.get("name", f"{symbol} Corporation"),
                        "display_name": info.get("display_name", f"{symbol} ({symbol})"),
                        "country_code": info.get("country_code", "2-UNITED STATES OF AMERICA"),
                        "nature": info.get("nature", "Company"),
                        "address": info.get("address", "Parsed from E-Trade"), "zip": info.get("zip", "")
                    },
                    "lots": []
                }
            
            stocks_map[symbol]["lots"].append({
                "id": lot_data["id"], "buy_date": lot_data["buy_date"],
                "buy_price": lot_data["buy_price"], "quantity": total_qty, "sells": lot_data["sells"]
            })

        for stock in stocks_map.values(): stock["lots"].sort(key=lambda x: x["buy_date"])
        return {"calendar_year": self.target_year, "overrides": {}, "sbi_rate_overrides": {}, "stocks": list(stocks_map.values())}

def _to_csv_str(file_bytes: bytes, filename: str) -> str:
    """Convert bytes (CSV or XLSX) to a CSV string."""
    if not file_bytes:
        return ""
    if filename.lower().endswith('.xlsx'):
        wb = _get_openpyxl().load_workbook(io.BytesIO(file_bytes), data_only=True)
        ws = wb.active
        output = io.StringIO()
        writer = csv.writer(output)
        for row in ws.iter_rows(values_only=True):
            writer.writerow(row)
        return output.getvalue()
    else:
        # Assume CSV
        try:
            return file_bytes.decode('utf-8-sig')
        except UnicodeDecodeError:
            return file_bytes.decode('latin-1')

# --- Entry Point ---
def process_etrade_files(sellable_bytes: bytes, sellable_filename: str, 
                        gnl_files: list, # List of (bytes, filename)
                        target_year: int = 2025, company_info_map: dict = None) -> dict:
    """
    Main orchestrator function for the Roll-Back strategy.
    """
    sellable_csv_str = _to_csv_str(sellable_bytes, sellable_filename) if sellable_bytes else ""
    
    builder = ETradeRollbackBuilder(target_year=target_year, company_info_map=company_info_map)
    
    # 1. Load Current Holdings
    builder.parse_bystatus_sellable(sellable_csv_str)
    
    # 2. Parse all provided G&L files
    for gnl_bytes, gnl_filename in gnl_files:
        gnl_csv_str = _to_csv_str(gnl_bytes, gnl_filename)
        builder.parse_gain_and_loss(gnl_csv_str)
        
    portfolio = builder.generate_portfolio_json()
    
    # Convert back to flat transactions for the review UI
    transactions = []
    for stock in portfolio["stocks"]:
        for lot in stock["lots"]:
            # BUY part
            transactions.append({
                "type": "BUY",
                "date": lot["buy_date"],
                "symbol": stock["ticker"],
                "qty": lot["quantity"],
                "price": lot["buy_price"]
            })
            # SELL parts
            for sell in lot["sells"]:
                transactions.append({
                    "type": "SELL",
                    "date": sell["sell_date"],
                    "symbol": stock["ticker"],
                    "qty": sell["quantity"],
                    "price": sell["sell_price"],
                    "buy_date": lot["buy_date"],
                    "buy_price": lot["buy_price"]
                })
    
    return {"transactions": transactions, "skipped_count": 0}
