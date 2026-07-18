import csv
import io
import json
import logging
import re
import uuid
from datetime import datetime
from core.utils import tax_round, parse_sort_date

# openpyxl is lazy-loaded to speed up app startup
openpyxl = None
pypdf = None

def _get_openpyxl():
    global openpyxl
    if openpyxl is None:
        import openpyxl as oxl
        openpyxl = oxl
    return openpyxl

def _get_pypdf():
    global pypdf
    if pypdf is None:
        import pypdf as pdf_lib
        pypdf = pdf_lib
    return pypdf

logger = logging.getLogger(__name__)

def parse_date(date_val) -> str:
    """Parse common E-Trade CSV date formats into dd/mm/yyyy."""
    if not date_val or date_val in ("--", "NA", "N/A"):
        return None
    if isinstance(date_val, datetime):
        return date_val.strftime("%d/%m/%Y")
    
    date_str = str(date_val).strip().split(" ")[0]
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%d-%b-%Y", "%d-%b-%y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%d/%m/%Y")
        except ValueError:
            pass
    return None

def clean_float(val) -> float:
    """Clean E-Trade currency and number strings."""
    if not val or val in ("--", "NA", "N/A"):
        return 0.0
    try:
        clean_str = str(val).replace("$", "").replace(",", "").replace("(", "-").replace(")", "").strip()
        return tax_round(float(clean_str), 2)
    except ValueError:
        return 0.0

def _is_pdf(file_bytes: bytes, filename: str) -> bool:
    return (filename or "").lower().endswith(".pdf") or (file_bytes or b"").startswith(b"%PDF")

def _extract_pdf_pages(file_bytes: bytes) -> list:
    reader = _get_pypdf().PdfReader(io.BytesIO(file_bytes))
    return [page.extract_text() or "" for page in reader.pages]

def _infer_pdf_year(text: str, target_year: int) -> int:
    patterns = (
        r"(\d{4})\s+Recap of Cash Management Activity",
        r"For the Period\b.*?(\d{4})",
        r"Statement Period\s*:\s*.*?(\d{4})",
        r"TOTAL UNVESTED EMPLOYEE STOCK PLAN VALUE \(ON \d{1,2}/\d{1,2}/(\d{4})\)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            return int(match.group(1))
    return target_year

def _parse_pdf_date(date_val: str, default_year: int) -> str:
    if not date_val:
        return None
    value = date_val.strip()
    parts = value.split("/")
    if len(parts) == 2:
        value = f"{parts[0]}/{parts[1]}/{default_year}"
    return parse_date(value)

def _date_year(date_str: str) -> int:
    try:
        return parse_sort_date(date_str).year
    except Exception:
        return 0

def _clean_pdf_number(value: str) -> float:
    if not value:
        return 0.0
    try:
        clean_str = str(value).replace("$", "").replace(",", "").replace("(", "-").replace(")", "").strip()
        return float(clean_str)
    except (TypeError, ValueError):
        return 0.0

def _make_symbol_map(text: str) -> dict:
    symbol_map = {}
    for company, symbol in re.findall(r"([A-Z][A-Z0-9&.,' \-]+?)\s+\(([A-Z]{1,8})\)", text):
        symbol_map[re.sub(r"\s+", " ", company).strip()] = symbol
    for company, symbol in re.findall(r"([A-Z][A-Z0-9&.,' \-]+?)\s+([A-Z]{1,8})\s+(?:Cash|StkPln)\s+", text):
        name = re.sub(r"\s+", " ", company).strip()
        if len(name) > 2:
            symbol_map.setdefault(name, symbol)
    symbol_map.setdefault("QUALCOMM INC", "QCOM")
    return symbol_map

def _symbol_for_security(security: str, symbol_map: dict) -> str:
    security_norm = re.sub(r"\s+", " ", security or "").strip().upper()
    if not security_norm:
        return ""
    if re.fullmatch(r"[A-Z]{1,8}", security_norm):
        return security_norm
    if security_norm in symbol_map:
        return symbol_map[security_norm]
    for company, symbol in sorted(symbol_map.items(), key=lambda item: len(item[0]), reverse=True):
        if security_norm.startswith(company) or company.startswith(security_norm):
            return symbol
    return security_norm.split()[0][:8]

def _extract_page_price_hints(lines: list) -> dict:
    hints = {}
    for line in lines:
        # Legacy E*TRADE unvested row:
        # 10/28/2020 RU518715 RSU QCOM StkPln 69 $0.00 $109.94 $7,585.86
        match = re.search(r"\b([A-Z]{1,8})\s+StkPln\s+[\d,]+(?:\.\d+)?\s+\$?0(?:\.00)?\s+\$?([\d,]+\.\d+)", line)
        if match:
            hints[match.group(1)] = _clean_pdf_number(match.group(2))
            continue

        # Legacy E*TRADE holdings row:
        # QUALCOMM INC QCOM StkPln 310 109.9400 34,081.40
        match = re.search(r"\b([A-Z]{1,8})\s+(?:Cash|StkPln)\s+[\d,]+(?:\.\d+)?\s+\$?([\d,]+\.\d+)", line)
        if match:
            hints.setdefault(match.group(1), _clean_pdf_number(match.group(2)))
            continue

        # New Morgan Stanley stock plan detail row:
        # 11/30/23 RU667330 RSU QCOM 65.368 $0.00 $128.78 $8,418.03
        match = re.search(r"\bRSU\s+([A-Z]{1,8})\s+[\d,]+(?:\.\d+)?\s+\$?0(?:\.00)?\s+\$?([\d,]+\.\d+)", line)
        if match:
            hints[match.group(1)] = _clean_pdf_number(match.group(2))
    return hints

def _append_raw_tx(raw: list, tx_type: str, date: str, symbol: str, qty: float, price: float, order_date: str = None):
    if not date or not symbol or qty <= 0:
        return
    tx = {
        "type": tx_type,
        "date": date,
        "symbol": symbol,
        "qty": tax_round(qty, 6),
        "price": tax_round(price, 4),
    }
    if order_date and order_date != date:
        tx["_order_date"] = order_date
    raw.append(tx)

def _parse_etrade_pdf_text(pages: list, target_year: int) -> list:
    """Parse legacy E*TRADE and newer Morgan Stanley/E*TRADE statement PDFs."""
    all_text = "\n".join(pages)
    symbol_map = _make_symbol_map(all_text)
    recap_years = {
        int(match.group(1))
        for match in re.finditer(r"(\d{4})\s+Recap of Cash Management Activity", all_text, re.IGNORECASE)
    }
    parsed_recap_transfer_years = set()
    raw = []

    for page_text in pages:
        default_year = _infer_pdf_year(page_text, target_year)
        is_annual_recap = bool(re.search(r"\d{4}\s+Recap of Cash Management Activity", page_text, re.IGNORECASE))
        skip_recap_transfers = (
            is_annual_recap
            and "SECURITY TRANSFERS" in page_text
            and default_year in parsed_recap_transfer_years
        )
        lines = [line.strip() for line in page_text.splitlines() if line.strip()]
        price_hints = _extract_page_price_hints(lines)
        pending_date = None
        pending_security = ""
        pending_reinvest_price = 0.0

        for idx, line in enumerate(lines):
            # New format annual recap / activity section:
            # 2/21 Transfer into Account QUALCOMM INC 14.000 2,316.02
            match = re.match(
                r"^(\d{1,2}/\d{1,2}(?:/\d{2,4})?)\s+Transfer into Account\s+(.+?)\s+"
                r"([\d,]+(?:\.\d+)?)\s+\$?([\d,]+(?:\.\d+)?)$",
                line,
            )
            if match:
                # When an annual recap exists, it already contains the full year's transfers.
                # Skip the same monthly transfer sections to avoid double-counting.
                if not skip_recap_transfers and (is_annual_recap or default_year not in recap_years):
                    date = _parse_pdf_date(match.group(1), default_year)
                    symbol = _symbol_for_security(match.group(2), symbol_map)
                    qty = _clean_pdf_number(match.group(3))
                    amount = _clean_pdf_number(match.group(4))
                    price = tax_round(amount / qty, 4) if qty else 0.0
                    _append_raw_tx(raw, "BUY", date, symbol, qty, price)
                    if is_annual_recap:
                        parsed_recap_transfer_years.add(default_year)
                continue

            # New format cash-flow activity:
            # 2/18 2/19 Sold QUALCOMM INC ACTED AS AGENT
            # 33.000 172.9805 5,703.25
            match = re.match(
                r"^(\d{1,2}/\d{1,2}(?:/\d{2,4})?)(?:\s+\d{1,2}/\d{1,2}(?:/\d{2,4})?)?\s+"
                r"(Sold|Dividend Reinvestment)\s+(.+?)(?:\s+ACTED AS AGENT.*)?$",
                line,
            )
            if match:
                tx_type = "SELL" if match.group(2) == "Sold" else "BUY"
                date = _parse_pdf_date(match.group(1), default_year)
                symbol = _symbol_for_security(match.group(3), symbol_map)
                for lookahead in lines[idx + 1: idx + 8]:
                    detail = re.match(
                        r"^(-?[\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+\(?\$?([\d,]+(?:\.\d+)?)\)?$",
                        lookahead,
                    )
                    if detail:
                        qty = abs(_clean_pdf_number(detail.group(1)))
                        price = _clean_pdf_number(detail.group(2))
                        _append_raw_tx(raw, tx_type, date, symbol, qty, price)
                        break
                continue

            # Track standalone legacy activity dates like "05/23/22" before a split sale row.
            if re.match(r"^\d{1,2}/\d{1,2}/\d{2,4}$", line):
                pending_date = _parse_pdf_date(line, default_year)
                continue

            # Legacy sale row:
            # 05/25/22 QUALCOMM INC QCOM Sold -4 129.9500 519.15
            match = re.match(
                r"^(?:(\d{1,2}/\d{1,2}/\d{2,4})\s+)?(.+?)\s+([A-Z]{1,8})\s+Sold\s+"
                r"(-?[\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$",
                line,
            )
            if match:
                date = pending_date or _parse_pdf_date(match.group(1), default_year)
                order_date = _parse_pdf_date(match.group(1), default_year)
                symbol = match.group(3)
                qty = abs(_clean_pdf_number(match.group(4)))
                price = _clean_pdf_number(match.group(5))
                _append_raw_tx(raw, "SELL", date, symbol, qty, price, order_date=order_date)
                continue

            # Legacy receive / reinvest rows are split across several lines.
            match = re.match(r"^(\d{1,2}/\d{1,2}/\d{2,4})\s+([A-Z][A-Z0-9&.,' \-]+)$", line)
            if match:
                pending_date = _parse_pdf_date(match.group(1), default_year)
                pending_security = match.group(2).strip()
                pending_reinvest_price = 0.0
                continue

            match = re.search(r"\bREIN\s+@\s+([\d,]+(?:\.\d+)?)", line)
            if match:
                pending_reinvest_price = _clean_pdf_number(match.group(1))
                continue

            match = re.match(r"^([A-Z]{1,8})\s+Receive\s+([\d,]+(?:\.\d+)?)$", line)
            if match:
                symbol = match.group(1)
                qty = _clean_pdf_number(match.group(2))
                price = price_hints.get(symbol, 0.0)
                _append_raw_tx(raw, "BUY", pending_date, symbol, qty, price)
                continue

            match = re.match(r"^([A-Z]{1,8})\s+Div Reinvest\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$", line)
            if match:
                symbol = match.group(1)
                qty = _clean_pdf_number(match.group(2))
                amount = _clean_pdf_number(match.group(3))
                price = pending_reinvest_price or (tax_round(amount / qty, 4) if qty else 0.0)
                _append_raw_tx(raw, "BUY", pending_date, symbol, qty, price)
                continue

    return raw

def _pdf_transactions_to_target_year(raw_transactions: list, target_year: int) -> tuple:
    """Use FIFO to convert raw PDF activity into carried lots plus target-year sells."""
    lots_by_symbol = {}
    skipped = 0

    for tx in sorted(raw_transactions, key=lambda item: parse_sort_date(item.get("_order_date", item["date"]))):
        year = _date_year(tx["date"])
        if not year or year > target_year:
            skipped += 1
            continue

        symbol = tx["symbol"]
        lots_by_symbol.setdefault(symbol, [])

        if tx["type"] == "BUY":
            lots_by_symbol[symbol].append({
                "buy_date": tx["date"],
                "buy_price": tx["price"],
                "quantity": tx["qty"],
                "sells": [],
            })
            continue

        sell_qty_left = tx["qty"]
        for lot in lots_by_symbol[symbol]:
            if sell_qty_left <= 0:
                break
            sold_so_far = sum(sell["quantity"] for sell in lot["sells"])
            available = tax_round(lot["quantity"] - sold_so_far, 6)
            if available <= 0:
                continue
            take = min(available, sell_qty_left)
            lot["sells"].append({
                "sell_date": tx["date"],
                "quantity": tax_round(take, 6),
                "sell_price": tx["price"],
            })
            sell_qty_left = tax_round(sell_qty_left - take, 6)
        if sell_qty_left > 0:
            skipped += 1
            logger.warning("E*TRADE PDF FIFO sell shortfall for %s on %s: %s", symbol, tx["date"], sell_qty_left)

    transactions = []
    for symbol, lots in lots_by_symbol.items():
        for lot in lots:
            pre_target_sold = 0.0
            target_sells = []
            for sell in lot["sells"]:
                sell_year = _date_year(sell["sell_date"])
                if sell_year < target_year:
                    pre_target_sold += sell["quantity"]
                elif sell_year == target_year:
                    target_sells.append(sell)

            carried_qty = tax_round(lot["quantity"] - pre_target_sold, 6)
            if carried_qty <= 0:
                continue

            transactions.append({
                "type": "BUY",
                "date": lot["buy_date"],
                "symbol": symbol,
                "qty": carried_qty,
                "price": lot["buy_price"],
            })
            for sell in target_sells:
                transactions.append({
                    "type": "SELL",
                    "date": sell["sell_date"],
                    "symbol": symbol,
                    "qty": sell["quantity"],
                    "price": sell["sell_price"],
                    "buy_date": lot["buy_date"],
                    "buy_price": lot["buy_price"],
                })

    transactions.sort(key=lambda tx: parse_sort_date(tx["date"]))
    return transactions, skipped

def _process_etrade_pdf_files(pdf_files: list, target_year: int) -> dict:
    pages = []
    for file_bytes, _filename in pdf_files:
        pages.extend(_extract_pdf_pages(file_bytes))
    raw_transactions = _parse_etrade_pdf_text(pages, target_year)
    transactions, skipped = _pdf_transactions_to_target_year(raw_transactions, target_year)
    logger.info(
        "E*TRADE PDF extraction: %s raw transactions, %s target-year transactions, %s skipped",
        len(raw_transactions), len(transactions), skipped,
    )
    return {"transactions": transactions, "skipped_count": skipped}

class ETradeRollbackBuilder:
    def __init__(self, target_year=2025, company_info_map=None):
        self.target_year = target_year
        self.company_info_map = company_info_map or {}
        # Dictionary to aggregate lots. Key: (symbol, buy_date)
        self.lots = {} 
        self.skipped_count = 0

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
            # Skip summary rows or empty rows
            rt = row.get("Record Type", "").strip().lower()
            if rt == "summary": continue

            symbol = row.get("Symbol", "").strip() or row.get("Ticker", "").strip()
            if not symbol: continue
            
            buy_date = parse_date(row.get("Date Acquired", ""))
            if not buy_date: continue
            
            # CRITICAL: Ignore shares acquired AFTER the target year.
            try:
                if "/" in buy_date:
                    year_part = buy_date.split("/")[-1]
                    buy_year = int(year_part)
                    if buy_year < 100: buy_year += 2000 # Handle 2-digit year if it slips through
                else:
                    buy_year = int(buy_date.split("-")[0])
                    
                if buy_year > self.target_year: continue
            except:
                continue

            buy_price = clean_float(row.get("Purchase Date FMV"))
            sellable_qty = clean_float(row.get("Sellable Qty.", 0))
            
            lot = self._get_or_create_lot(symbol, buy_date)
            lot["unsold_qty"] += sellable_qty
            if buy_price > 0: lot["buy_price"] = buy_price

    def parse_gain_and_loss(self, csv_content: str):
        if not csv_content: return
        reader = csv.DictReader(io.StringIO(csv_content.strip()))
        for row in reader:
            # Skip summary rows
            if row.get("Record Type", "").strip().lower() == "summary": continue

            raw_sell_date = row.get("Date Sold", "")
            if not raw_sell_date or str(raw_sell_date).strip() in ("--", "NA", "N/A", ""): 
                continue

            symbol = row.get("Symbol", "").strip() or row.get("Ticker", "").strip()
            if not symbol: continue

            buy_date = parse_date(row.get("Date Acquired", ""))
            sell_date = parse_date(raw_sell_date)
            
            if not buy_date or not sell_date: continue

            try:
                if "/" in buy_date:
                    by = int(buy_date.split("/")[-1])
                    if by < 100: by += 2000
                    buy_year = by
                else:
                    buy_year = int(buy_date.split("-")[0])

                if "/" in sell_date:
                    sy = int(sell_date.split("/")[-1])
                    if sy < 100: sy += 2000
                    sell_year = sy
                else:
                    sell_year = int(sell_date.split("-")[0])

                # CRITICAL: Ignore shares acquired AFTER the target year
                # CRITICAL: Ignore shares sold BEFORE the target year
                if buy_year > self.target_year or sell_year < self.target_year: continue
            except:
                continue

            qty = clean_float(row.get("Quantity", 0))
            sell_price = clean_float(row.get("Proceeds Per Share", 0))
            
            # Use ONLY Purchase Date Fair Mkt. Value for ESPP, otherwise use Adjusted Cost Basis Per Share
            plan_type = str(row.get("Plan Type") or "").strip().upper()
            grant_type = str(row.get("Type") or "").strip().upper()
            is_espp = (plan_type == "ESPP") or ("ESPP" in plan_type) or ("EMPLOYEE STOCK PURCHASE" in grant_type) or ("ESPP" in grant_type)

            if is_espp:
                espp_fmv = 0.0
                for k, v in row.items():
                    if k and k.strip().lower() in ("purchase date fair mkt. value", "purchase date fair market value"):
                        espp_fmv = clean_float(v)
                        break
                buy_price = espp_fmv
            else:
                buy_price = clean_float(row.get("Adjusted Cost Basis Per Share", 0))

            if buy_price == 0:
                self.skipped_count += 1
                continue

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

        for stock in stocks_map.values():
            stock["lots"].sort(key=lambda x: parse_sort_date(x["buy_date"]))
            for lot in stock["lots"]:
                if "sells" in lot:
                    lot["sells"].sort(key=lambda s: parse_sort_date(s["sell_date"]))
        return {"calendar_year": self.target_year, "overrides": {}, "sbi_rate_overrides": {}, "stocks": list(stocks_map.values())}

def _to_csv_str(file_bytes: bytes, filename: str) -> str:
    """Convert bytes (CSV or XLSX) to a CSV string."""
    if not file_bytes:
        return ""
    if _is_pdf(file_bytes, filename):
        raise ValueError("PDF files are parsed by the E*TRADE PDF importer, not CSV conversion.")
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
    input_files = []
    if sellable_bytes:
        input_files.append((sellable_bytes, sellable_filename))
    input_files.extend((file_bytes, filename) for file_bytes, filename in gnl_files if file_bytes)

    pdf_files = [(file_bytes, filename) for file_bytes, filename in input_files if _is_pdf(file_bytes, filename)]
    non_pdf_files = [(file_bytes, filename) for file_bytes, filename in input_files if not _is_pdf(file_bytes, filename)]
    if pdf_files and non_pdf_files:
        raise ValueError("Please upload either E*TRADE PDF statements or CSV/XLSX reports, not both in one import.")
    if pdf_files:
        return _process_etrade_pdf_files(pdf_files, target_year)

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
    
    return {"transactions": transactions, "skipped_count": builder.skipped_count}
