import logging
from core.utils import parse_sort_date

logger = logging.getLogger(__name__)

def _sort_key(tx):
    return parse_sort_date(tx["date"])

def group_and_deduplicate_transactions(transactions: list, portfolio: dict) -> list:
    """
    Groups flat transactions by (Symbol, Type, Date, Price) and deduplicates against the portfolio.
    Returns a list of dicts with an added 'import_status' ('NEW', 'UPDATE', 'DUPLICATE').
    """
    if not transactions:
        return []

    # 1. Group transactions
    grouped = {}
    for tx in transactions:
        t_type = tx["type"].upper()
        sym = tx["symbol"]
        date = tx["date"]
        price = float(tx["price"])
        qty = float(tx["qty"])
        
        # We also need to group by buy_date and buy_price if it's a linked sell
        buy_date = tx.get("buy_date")
        buy_price = float(tx.get("buy_price", 0)) if buy_date else None

        key = (sym, t_type, date, round(price, 2), buy_date, round(buy_price, 2) if buy_price else None)
        
        if key not in grouped:
            grouped[key] = {
                "type": t_type,
                "symbol": sym,
                "date": date,
                "price": price,
                "qty": 0.0,
            }
            if buy_date:
                grouped[key]["buy_date"] = buy_date
                grouped[key]["buy_price"] = buy_price
                
        grouped[key]["qty"] += qty

    # 2. Check against portfolio
    stocks_dict = {s.get("ticker", s.get("yahoo_ticker", "")): s for s in portfolio.get("stocks", [])}
    
    result = []
    for tx in grouped.values():
        sym = tx["symbol"]
        t_type = tx["type"]
        date = tx["date"]
        price = tx["price"]
        doc_qty = tx["qty"]
        
        stock = stocks_dict.get(sym)
        if not stock:
            tx["import_status"] = "NEW"
            result.append(tx)
            continue
            
        portfolio_qty = 0.0
        
        if t_type == "BUY":
            # Find matching lot
            for lot in stock.get("lots", []):
                if lot.get("buy_date") == date and abs(float(lot.get("buy_price", 0)) - price) < 0.05:
                    portfolio_qty += float(lot.get("quantity", 0))
        elif t_type == "SELL":
            buy_date = tx.get("buy_date")
            buy_price = tx.get("buy_price")
            
            # Find matching sells
            for lot in stock.get("lots", []):
                # If linked sell, verify it matches the specific lot
                if buy_date:
                    if lot.get("buy_date") != buy_date or abs(float(lot.get("buy_price", 0)) - buy_price) >= 0.05:
                        continue
                        
                for sell in lot.get("sells", []):
                    if sell.get("sell_date") == date and abs(float(sell.get("sell_price", 0)) - price) < 0.05:
                        portfolio_qty += float(sell.get("quantity", 0))
        
        # Determine status
        # Allow slight floating point tolerance
        if abs(portfolio_qty - doc_qty) < 0.001:
            tx["import_status"] = "DUPLICATE"
            result.append(tx)
        elif doc_qty > portfolio_qty:
            tx["import_status"] = "UPDATE"
            tx["original_qty"] = doc_qty # Keep for UI
            tx["qty"] = round(doc_qty - portfolio_qty, 6) # Delta to import
            result.append(tx)
        else:
             # Document has LESS than portfolio (rare, maybe partial upload). Flag as duplicate to be safe.
             tx["import_status"] = "DUPLICATE"
             result.append(tx)

    # Sort chronologically
    result.sort(key=_sort_key)
    return result
