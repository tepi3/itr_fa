import uuid
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

def _sort_key(tx):
    d_str = tx["date"]
    try:
        if "/" in d_str:
            return datetime.strptime(d_str, "%d/%m/%Y")
        return datetime.fromisoformat(d_str)
    except Exception:
        return datetime.min

def apply_transactions(portfolio: dict, transactions: list) -> dict:
    """
    Applies a list of transactions to an existing portfolio.
    This simplified version trusts the input list (deduplication is handled by the user in UI).
    
    It correctly aggregates quantities:
    - BUY + existing lot = Increment lot total quantity.
    - Linked SELL + existing lot = Increment lot total quantity AND add the sell.
    """
    stocks_dict = {s["ticker"]: s for s in portfolio.get("stocks", [])}
    
    # Sort transactions chronologically
    transactions.sort(key=_sort_key)

    for tx in transactions:
        sym = tx["symbol"]
        t_type = tx["type"].upper()
        qty = float(tx["qty"])
        price = float(tx["price"])
        date = tx["date"]

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

        if t_type == "BUY":
            # Find matching lot by date and price
            matching_lot = None
            for lot in stock["lots"]:
                if lot["buy_date"] == date and abs(float(lot["buy_price"]) - price) < 0.05:
                    matching_lot = lot
                    break
            
            if matching_lot:
                # Increment existing lot total quantity
                matching_lot["quantity"] = float(matching_lot["quantity"]) + qty
            else:
                # Create new lot
                stock["lots"].append({
                    "id": str(uuid.uuid4()),
                    "buy_date": date,
                    "quantity": qty,
                    "buy_price": price,
                    "sells": []
                })
            stock["lots"].sort(key=lambda l: l["buy_date"])

        elif t_type == "SELL":
            buy_date = tx.get("buy_date")
            buy_price = float(tx.get("buy_price", 0)) if buy_date else None
            
            if buy_date:
                # ── Linked SELL (explicit buy info) ───────────────────────
                matching_lot = None
                for lot in stock["lots"]:
                    if lot["buy_date"] == buy_date and abs(float(lot["buy_price"]) - buy_price) < 0.05:
                        matching_lot = lot
                        break
                
                if matching_lot is None:
                    # Create lot based on what was sold
                    matching_lot = {
                        "id": str(uuid.uuid4()),
                        "buy_date": buy_date,
                        "quantity": qty,
                        "buy_price": buy_price,
                        "sells": []
                    }
                    stock["lots"].append(matching_lot)
                    stock["lots"].sort(key=lambda l: l["buy_date"])
                else:
                    # Ensure lot quantity covers this sell and all existing sells.
                    # This handles cases where a BUY was partial or missing, while 
                    # avoiding inflation during re-imports of the same sells.
                    current_sells_total = sum(float(s["quantity"]) for s in matching_lot.get("sells", []))
                    if float(matching_lot["quantity"]) < current_sells_total + qty:
                        matching_lot["quantity"] = current_sells_total + qty
                
                # Add the specific sell record
                if "sells" not in matching_lot: matching_lot["sells"] = []
                matching_lot["sells"].append({
                    "id": str(uuid.uuid4()),
                    "sell_date": date,
                    "quantity": qty,
                    "sell_price": price
                })
            else:
                # ── Standard FIFO SELL (sequential) ───────────────────────
                sell_qty_left = qty
                for lot in stock["lots"]:
                    if sell_qty_left <= 0: break
                    
                    available = float(lot["quantity"]) - sum(float(s["quantity"]) for s in lot.get("sells", []))
                    if available > 0:
                        take = min(sell_qty_left, available)
                        sell_qty_left -= take
                        if "sells" not in lot: lot["sells"] = []
                        lot["sells"].append({
                            "id": str(uuid.uuid4()),
                            "sell_date": date,
                            "quantity": take,
                            "sell_price": price
                        })
                
                if sell_qty_left > 0:
                    logger.warning(f"FIFO SELL shortfall for {sym}: {sell_qty_left} shares not found.")

    portfolio["stocks"] = list(stocks_dict.values())
    return portfolio
