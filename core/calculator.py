"""
A3 Schedule FA Calculator.

Copyright (c) 2026 Piyush Tewari (tepi3). All rights reserved.
Licensed for personal, non-commercial use only.

Computes all 12 columns of Section A3 for each acquisition lot.
Handles FIFO partial sells, peak value day-by-day, and dividend auto-calculation.
All calculated fields support manual overrides.
"""

import logging
from datetime import date, timedelta, datetime
from typing import Optional

from core.sbi_rates import get_sbi_tt_rate, get_last_day_prev_month
from core.stock_data import get_historical_prices, get_price_on_date
from core.utils import parse_sort_date

logger = logging.getLogger(__name__)


def _parse_date(date_str: str) -> date:
    """Parse dd/mm/yyyy date string."""
    if not date_str:
        raise ValueError("Date string is empty")
    try:
        return datetime.strptime(date_str, "%d/%m/%Y").date()
    except ValueError:
        try:
            return date.fromisoformat(date_str)
        except ValueError:
            raise ValueError(f"Invalid date format: {date_str}. Expected dd/mm/yyyy")


def _format_date_display(date_str: str) -> str:
    """Ensure date is in DD/MM/YYYY for display."""
    if "/" in date_str:
        return date_str
    try:
        d = date.fromisoformat(date_str)
        return d.strftime("%d/%m/%Y")
    except ValueError:
        return date_str


def _get_rate_value(d: date, overrides: dict, use_event_date: bool = False, mode: str = 'split') -> tuple:
    """
    Get SBI TT rate value and metadata (USD only).
    Returns: (rate, rate_date, source, is_lookback, error_msg)
    """
    effective_use_event_date = False if mode == 'uniform' else use_event_date
    result = get_sbi_tt_rate(d, overrides, use_event_date=effective_use_event_date)
    rate = result.get("rate")
    source = result.get("source")
    is_lookback = result.get("is_lookback", False)
    error_msg = None

    if rate is None or rate == 0:
        if mode == 'uniform' or not effective_use_event_date:
            last_day = get_last_day_prev_month(d)
            month_name = last_day.strftime("%B %Y")
            error_msg = f"Missing SBI TT rate for month-end {month_name}. Please add a rate for the last 5 days of {month_name.split()[0]} in the Rates Editor."
        else:
            d_str = d.strftime("%d/%m/%Y")
            last_day = get_last_day_prev_month(d)
            limit_date = (last_day - timedelta(days=4)).strftime("%d/%m/%Y")
            error_msg = f"Missing SBI TT rate for transaction on {d_str}. Please add an SBI TT rate for this date or within its lookback window (down to {limit_date}) in the Rates Editor."
            
    return rate, result.get("rate_date"), source, is_lookback, error_msg


def calculate_initial_value(lot: dict, sbi_overrides: dict, mode: str = 'split') -> dict:
    """
    Calculate column 8: Initial value of the investment (₹).
    = buy_price × quantity × TTBR(date_of_buy_event)
    """
    buy_date = _parse_date(lot["buy_date"])
    buy_price = float(lot["buy_price"])
    quantity = float(lot["quantity"])

    rate, rate_date, source, is_lookback, error = _get_rate_value(buy_date, sbi_overrides, use_event_date=True, mode=mode)

    # In split mode, also validate Rule 115 rate for tax consistency
    if mode == 'split' and rate is not None:
        _, _, _, _, tax_error = _get_rate_value(buy_date, sbi_overrides, use_event_date=False, mode=mode)
        if tax_error:
            error = tax_error

    if rate is None or error:
        return {
            "value": None,
            "rate": None,
            "rate_date": rate_date,
            "error": error,
        }

    value = round(buy_price * quantity * rate)
    return {
        "value": value,
        "rate": rate,
        "rate_date": rate_date,
        "source": source,
        "is_lookback": (mode == 'split' and is_lookback),
        "components": {
            "buy_price": buy_price,
            "quantity": quantity,
            "ttbr": rate,
            "lot_id": lot.get("id"),
        },
    }


def calculate_peak_value(
    lot: dict,
    sells_in_cy: list,
    yahoo_ticker: str,
    calendar_year: int,
    sbi_overrides: dict,
    mode: str = 'split',
) -> dict:
    """
    Calculate column 9: Peak value of investment during the period (₹).
    = max(daily_close × qty_held × TTBR(date_of_event)) across all trading days in the CY.
    """
    buy_date = _parse_date(lot["buy_date"])
    initial_qty = float(lot["quantity"])

    # Determine the start date for price history
    cy_start = date(calendar_year, 1, 1)
    cy_end = date(calendar_year, 12, 31)

    # If bought after CY start, use buy date as start
    price_start = max(buy_date, cy_start)
    price_end = cy_end

    # If fully sold before CY end, find the last sell date
    total_sold_before_cy_end = sum(
        float(s["quantity"]) for s in sells_in_cy
    )

    # Get daily prices
    prices = get_historical_prices(
        yahoo_ticker,
        price_start.isoformat(),
        (price_end + timedelta(days=1)).isoformat(),
    )

    if not prices:
        return {"value": None, "error": "No price data available"}

    # Sort sells by date
    sorted_sells = sorted(sells_in_cy, key=lambda s: parse_sort_date(s["sell_date"]))

    # Cache daily TTBR as (rate, rate_date, source) to avoid repeated lookups
    daily_ttbr_cache = {}

    peak_value = 0
    peak_date = None
    peak_price = None
    peak_qty = None
    peak_rate = None
    peak_rate_date = None
    peak_source = None

    # Track top N candidate days for validation/audit trail
    TOP_N = 3
    top_candidates = []

    for price_entry in prices:
        trading_date = _parse_date(price_entry["date"])

        # Calculate qty held on this day (initial - sells before this date)
        qty = initial_qty
        # Also subtract sells from previous years (lots carry forward)
        for sell in lot.get("sells", []):
            sell_date = _parse_date(sell["sell_date"])
            if sell_date <= trading_date and sell_date.year < calendar_year:
                qty -= float(sell["quantity"])

        for sell in sorted_sells:
            sell_date = _parse_date(sell["sell_date"])
            if sell_date <= trading_date:
                qty -= float(sell["quantity"])

        if qty <= 0:
            continue

        close_price = price_entry["close"]

        # Get TTBR for this day
        date_key = trading_date.isoformat()
        if date_key not in daily_ttbr_cache:
            rate, rate_date_str, source, is_lookback_daily, error = _get_rate_value(trading_date, sbi_overrides, use_event_date=True, mode=mode)
            if not error:
                daily_ttbr_cache[date_key] = (rate, rate_date_str, source, is_lookback_daily)
            else:
                return {"value": None, "error": error}

        ttbr, ttbr_rate_date, source, is_lookback_daily = daily_ttbr_cache.get(date_key, (None, None, None, None))
        if ttbr is None:
            continue

        value_inr = close_price * qty * ttbr

        # Track top N candidates for validation
        candidate = {
            "date": trading_date.isoformat(),
            "close_price": close_price,
            "qty": qty,
            "ttbr": ttbr,
            "rate_date": ttbr_rate_date,
            "source": source,
            "is_lookback": (mode == 'split' and is_lookback_daily),
            "value_inr": round(value_inr),
        }
        top_candidates.append(candidate)
        # Keep sorted descending by value_inr; trim to TOP_N
        top_candidates.sort(key=lambda c: c["value_inr"], reverse=True)
        if len(top_candidates) > TOP_N:
            top_candidates = top_candidates[:TOP_N]

        if value_inr > peak_value:
            peak_value = value_inr
            peak_date = trading_date.isoformat()
            peak_price = close_price
            peak_qty = qty
            peak_rate = ttbr
            peak_rate_date = ttbr_rate_date
            peak_source = source
            peak_is_lookback = is_lookback_daily

    return {
        "value": round(peak_value) if peak_value > 0 else 0,
        "peak_date": peak_date,
        "rate": peak_rate,
        "rate_date": peak_rate_date,
        "source": peak_source,
        "is_lookback": (mode == 'split' and peak_is_lookback) if peak_date else False,
        "top_candidates": top_candidates,
        "components": {
            "peak_price": peak_price,
            "qty_on_peak_date": peak_qty,
            "ttbr": peak_rate,
            "rate_date": peak_rate_date,
            "lot_id": lot.get("id"),
        },
    }

def calculate_closing_balance(
    lot: dict,
    yahoo_ticker: str,
    calendar_year: int,
    sbi_overrides: dict,
    mode: str = 'split',
) -> dict:
    """
    Calculate column 10: Closing balance (₹).
    = dec31_close_price × remaining_qty × TTBR(last_day_of_year)
    """
    dec31 = date(calendar_year, 12, 31)
    today = date.today()
    if calendar_year == today.year and today < dec31:
        dec31 = today
        
    buy_date = _parse_date(lot["buy_date"])

    # If bought after Dec 31, no closing balance
    if buy_date > dec31:
        return {"value": 0}

    # Calculate remaining quantity
    qty = float(lot["quantity"])
    for sell in lot.get("sells", []):
        sell_date = _parse_date(sell["sell_date"])
        if sell_date <= dec31:
            qty -= float(sell["quantity"])

    if qty <= 0:
        return {"value": 0, "remaining_qty": 0}

    # Get Dec 31 close price
    close_price = get_price_on_date(yahoo_ticker, dec31.isoformat())
    if close_price is None:
        return {"value": None, "error": "Could not fetch Dec 31 price"}

    # Get TTBR
    rate, rate_date, source, is_lookback, error = _get_rate_value(dec31, sbi_overrides, use_event_date=True, mode=mode)
    if rate is None:
        return {"value": None, "error": error}

    value = round(close_price * qty * rate)
    return {
        "value": value,
        "remaining_qty": qty,
        "source": source,
        "is_lookback": (mode == 'split' and is_lookback),
        "components": {
            "close_price_dec31": close_price,
            "remaining_qty": qty,
            "ttbr": rate,
            "rate_date": rate_date,
            "lot_id": lot.get("id"),
        },
    }


def calculate_dividends(
    lot: dict,
    stock: dict,
    calendar_year: int,
    sbi_overrides: dict,
    skip_dividends: bool = False,
    mode: str = 'split',
) -> dict:
    """
    Calculate column 11: Total gross dividends (₹).
    = Σ(div_per_share × qty_on_ex_date × TTBR(date_of_payment_date_event))
    """
    if skip_dividends:
        return {"value": 0, "dividend_entries": [], "skipped": True}

    buy_date = _parse_date(lot["buy_date"])

    # Use explicit dividends passed from frontend
    divs = stock.get("dividends", [])

    if not divs:
        return {"value": 0, "dividend_entries": [], "no_dividends": True}

    total_div_inr = 0
    entries = []

    for div in divs:
        if not div.get("ex_date") or not div.get("amount"):
            continue

        ex_date = _parse_date(div["ex_date"])
        
        # Payment Date determines the rate (Rule 115) and A3 placement
        pay_date_str = div.get("payment_date") or div.get("ex_date")
        pay_date = _parse_date(pay_date_str)

        # Only process dividends for the target calendar year (based on payment date)
        if pay_date.year != calendar_year:
            continue

        amount = float(div["amount"])

        # Skip if lot didn't exist yet (Qualification is on Ex-Date)
        if buy_date >= ex_date:
            continue

        # Calculate qty held on ex_date
        qty = float(lot["quantity"])
        for sell in lot.get("sells", []):
            sell_date = _parse_date(sell["sell_date"])
            if sell_date <= ex_date:
                qty -= float(sell["quantity"])

        if qty <= 0:
            continue

        # Get TTBR (Use actual date of payment for A3)
        rate, rate_date, source, is_lookback, error = _get_rate_value(pay_date, sbi_overrides, use_event_date=True, mode=mode)

        # In split mode, also validate Rule 115 rate to ensure consistency with Tax Summary
        if mode == 'split' and rate is not None:
            _, _, _, _, tax_error = _get_rate_value(pay_date, sbi_overrides, use_event_date=False, mode=mode)
            if tax_error:
                error = tax_error

        if rate is None or error:
            entries.append({
                "ex_date": div["ex_date"],
                "payment_date": pay_date_str,
                "amount_foreign": amount,
                "qty": qty,
                "error": error,
            })
            continue

        div_inr = amount * qty * rate
        total_div_inr += div_inr

        entries.append({
            "lot_id": lot.get("id"),
            "div_id": div.get("id"),
            "ex_date": div["ex_date"],
            "payment_date": pay_date_str,
            "amount_foreign": amount,
            "qty": qty,
            "rate_date": rate_date,
            "ttbr": rate,
            "source": source,
            "is_lookback": (mode == 'split' and is_lookback),
            "value_inr": div_inr,
        })

    return {
        "value": round(total_div_inr),
        "dividend_entries": entries,
        "is_lookback": any(e.get("is_lookback") for e in entries),
    }


def calculate_sale_proceeds(
    lot: dict,
    calendar_year: int,
    sbi_overrides: dict,
    mode: str = 'split',
) -> dict:
    """
    Calculate column 12: Total sale proceeds (₹).
    = Σ(sell_price × sell_qty × TTBR(date_of_sell_event))
    Only for sells within the calendar year.
    """
    total_proceeds_inr = 0
    sale_entries = []

    buy_price = float(lot.get("buy_price", 0))
    buy_date = _parse_date(lot["buy_date"])
    buy_rate, buy_rate_date, _, buy_is_lookback, buy_error = _get_rate_value(buy_date, sbi_overrides, use_event_date=False, mode=mode)
    buy_rate_actual, buy_rate_actual_date, _, _, _ = _get_rate_value(buy_date, sbi_overrides, use_event_date=True, mode=mode)

    for sell in lot.get("sells", []):
        sell_date = _parse_date(sell["sell_date"])
        if sell_date.year != calendar_year:
            continue

        sell_price = float(sell["sell_price"])
        sell_qty = float(sell["quantity"])
        sell_id = sell.get("id")

        rate, rate_date, source, is_lookback, error = _get_rate_value(sell_date, sbi_overrides, use_event_date=True, mode=mode)
        
        # In split mode, also validate Rule 115 rate (prev month) for tax consistency
        if mode == 'split' and rate is not None:
            _, _, _, _, tax_error = _get_rate_value(sell_date, sbi_overrides, use_event_date=False, mode=mode)
            if tax_error:
                error = tax_error

        if rate is None or error:
            sale_entries.append({
                "sell_id": sell_id,
                "sell_date": sell["sell_date"],
                "sell_price": sell_price,
                "quantity": sell_qty,
                "buy_price": buy_price,
                "error": error,
            })
            continue

        proceeds_inr = sell_price * sell_qty * rate
        total_proceeds_inr += proceeds_inr

        # G&L calculations using strictly Rule 115 (preceding month-end) logic for both buy and sell rates
        holding_days = (sell_date - buy_date).days
        is_long_term = holding_days >= 730
        
        pl_usd = round((sell_price - buy_price) * sell_qty, 2)
        
        # Retrieve the sell rate under Rule 115 logic for the tax-based G&L badge
        sell_rate_rule115, _, _, _, _ = _get_rate_value(sell_date, sbi_overrides, use_event_date=False, mode=mode)
        
        buy_cost_inr = round(buy_price * sell_qty * buy_rate) if buy_rate else None
        sell_proceeds_tax_inr = round(sell_price * sell_qty * sell_rate_rule115) if sell_rate_rule115 else None
        pl_inr = round(sell_proceeds_tax_inr - buy_cost_inr) if (buy_cost_inr is not None and sell_proceeds_tax_inr is not None) else None

        buy_cost_actual_inr = round(buy_price * sell_qty * buy_rate_actual) if buy_rate_actual else None
        gain_loss_actual_inr = round(proceeds_inr - buy_cost_actual_inr) if (buy_cost_actual_inr is not None) else None

        sale_entries.append({
            "sell_id": sell_id,
            "sell_date": sell["sell_date"],
            "sell_price": sell_price,
            "quantity": sell_qty,
            "buy_price": buy_price,
            "is_long_term": is_long_term,
            "ttbr": rate,
            "rate_date": rate_date,
            "source": source,
            "is_lookback": (mode == 'split' and is_lookback),
            "proceeds_inr": round(proceeds_inr),
            "buy_cost_inr": buy_cost_inr,
            "gain_loss_usd": pl_usd,
            "gain_loss_inr": pl_inr,
            "gain_loss_actual_inr": gain_loss_actual_inr,
            "buy_ttbr": buy_rate,
            "buy_rate_date": buy_rate_date,
            "buy_ttbr_actual": buy_rate_actual,
            "buy_rate_actual_date": buy_rate_actual_date,
        })

    return {
        "value": round(total_proceeds_inr),
        "sale_entries": sale_entries,
        "is_lookback": any(e.get("is_lookback") for e in sale_entries),
        "error": buy_error if buy_rate is None else None
    }


def calculate_a3_rows(portfolio: dict, mode: str = 'split') -> dict:
    """
    Calculate all A3 rows for the entire portfolio.

    Args:
        portfolio: Full portfolio data dict

    Returns:
        { "rows": [...], "errors": [...] }
    """
    calendar_year = portfolio.get("calendar_year", 2024)
    sbi_overrides = portfolio.get("sbi_rate_overrides", {})
    overrides = portfolio.get("overrides", {})
    errors = []
    seen_errors = set()

    rows = []
    sl_no = 1

    for stock in portfolio.get("stocks", []):
        ticker = stock["ticker"]
        yahoo_ticker = stock.get("yahoo_ticker", ticker)
        company = stock.get("company_info", {})
        skip_divs = stock.get("skip_dividends", False)

        for lot in stock.get("lots", []):
            lot_id = lot.get("id", f"{ticker}_{lot['buy_date']}")
            
            # Helper to collect errors
            def collect_errors(details):
                for k, v in details.items():
                    if isinstance(v, dict) and v.get("error"):
                        err = v["error"]
                        if err not in seen_errors:
                            errors.append(err)
                            seen_errors.add(err)
                    # Handle dividends/sales lists
                    if isinstance(v, dict) and k in ["dividends", "sales"]:
                        entries = v.get("dividend_entries") or v.get("sale_entries") or []
                        for entry in entries:
                            if entry.get("error"):
                                err = entry["error"]
                                if err not in seen_errors:
                                    errors.append(err)
                                    seen_errors.add(err)

            # Filter sells for this calendar year
            sells_in_cy = [
                s for s in lot.get("sells", [])
                if _parse_date(s["sell_date"]).year == calendar_year
            ]

            # Check if this lot was held at any point during the CY
            buy_date = _parse_date(lot["buy_date"])
            if buy_date.year > calendar_year:
                continue  # Bought after CY, skip

            # Check if fully sold before CY started
            total_sold_before_cy = sum(
                float(s["quantity"]) for s in lot.get("sells", [])
                if _parse_date(s["sell_date"]).year < calendar_year
            )
            if total_sold_before_cy >= float(lot["quantity"]):
                continue  # Fully sold in prior year, skip

            # Calculate all columns
            initial = calculate_initial_value(lot, sbi_overrides, mode=mode)
            peak = calculate_peak_value(lot, sells_in_cy, yahoo_ticker, calendar_year, sbi_overrides, mode=mode)
            closing = calculate_closing_balance(lot, yahoo_ticker, calendar_year, sbi_overrides, mode=mode)
            dividends = calculate_dividends(lot, stock, calendar_year, sbi_overrides, skip_divs, mode=mode)
            sales = calculate_sale_proceeds(lot, calendar_year, sbi_overrides, mode=mode)

            calc_details = {
                "initial": initial,
                "peak": peak,
                "closing": closing,
                "dividends": dividends,
                "sales": sales,
            }
            collect_errors(calc_details)

            # Apply overrides
            lot_overrides = overrides.get(lot_id, {})

            row = {
                "lot_id": lot_id,
                "sl_no": sl_no,
                "ticker": ticker,
                "country": company.get("country_code", ""),
                "entity_name": company.get("display_name", ticker),
                "address": company.get("address", ""),
                "zip": company.get("zip", ""),
                "nature": company.get("nature", "Company"),
                "acquire_date": _format_date_display(lot["buy_date"]),
                "acquire_date_raw": lot["buy_date"],
                # Calculated values (with override support)
                "initial_value": lot_overrides.get("initial_value") if lot_overrides.get("initial_value") is not None else initial.get("value"),
                "peak_value": lot_overrides.get("peak_value") if lot_overrides.get("peak_value") is not None else peak.get("value"),
                "closing_balance": lot_overrides.get("closing_balance") if lot_overrides.get("closing_balance") is not None else closing.get("value"),
                "total_dividends": lot_overrides.get("total_dividends") if lot_overrides.get("total_dividends") is not None else dividends.get("value"),
                "sale_proceeds": lot_overrides.get("sale_proceeds") if lot_overrides.get("sale_proceeds") is not None else sales.get("value"),
                # Metadata for display
                "calculation_details": calc_details,
                # Track which fields are overridden
                "is_overridden": {
                    "initial_value": lot_overrides.get("initial_value") is not None,
                    "peak_value": lot_overrides.get("peak_value") is not None,
                    "closing_balance": lot_overrides.get("closing_balance") is not None,
                    "total_dividends": lot_overrides.get("total_dividends") is not None,
                    "sale_proceeds": lot_overrides.get("sale_proceeds") is not None,
                },
            }

            rows.append(row)
            sl_no += 1

    if errors:
        return {"rows": [], "errors": errors}
    return {"rows": rows, "errors": errors}


# ===== ITR Tax Year Capital Gains & Dividend Summary =====

def _get_tax_year_key(event_date: date, calendar_year: int) -> str:
    """
    Return one of two tax year keys for an event date.

    Indian rule applied to events in a Calendar Year (CY):
      - Jan 01 – Mar 31 of CY  →  "prev"  (Apr CY-1 to Mar CY)
      - Apr 01 – Dec 31 of CY  →  "curr"  (Apr CY   to Mar CY+1)
    """
    if event_date.month <= 3:
        return "prev"
    return "curr"


def _get_quarter_key(event_date: date, tax_year_key: str) -> str:
    """
    Map an event date to its advance-tax quarterly bucket.

    For the "prev" tax year (Apr CY-1 → Mar CY) the event falls in Jan-Mar of CY,
    meaning it always lands in Q4 or Q5:
        Jan 01 – Mar 15   → q4   (16 Dec – 15 Mar)
        Mar 16 – Mar 31   → q5   (16 Mar – 31 Mar)

    For the "curr" tax year (Apr CY → Mar CY+1) the event falls in Apr-Dec of CY:
        Apr 01 – Jun 15   → q1   (up to 15 Jun)
        Jun 16 – Sep 15   → q2
        Sep 16 – Dec 15   → q3
        Dec 16 – Dec 31   → q4   (16 Dec – 15 Mar, partial)

    Quarters:
        q1  :  1 Apr  – 15 Jun
        q2  :  16 Jun – 15 Sep
        q3  :  16 Sep – 15 Dec
        q4  :  16 Dec – 15 Mar
        q5  :  16 Mar – 31 Mar
    """
    m = event_date.month
    d = event_date.day

    if tax_year_key == "prev":
        # event is Jan-Mar
        if m == 3 and d >= 16:
            return "q5"
        return "q4"
    else:
        # event is Apr-Dec
        if m < 6 or (m == 6 and d <= 15):
            return "q1"
        if m < 9 or (m == 9 and d <= 15):
            return "q2"
        if m < 12 or (m == 12 and d <= 15):
            return "q3"
        return "q4"


def _empty_quarters() -> dict:
    return {
        "q1": 0.0, "q2": 0.0, "q3": 0.0, "q4": 0.0, "q5": 0.0, "total": 0.0,
        "details": {"q1": [], "q2": [], "q3": [], "q4": [], "q5": [], "total": []}
    }


def _add_to_quarter(bucket: dict, qkey: str, amount: float, detail: dict = None):
    bucket[qkey] = bucket.get(qkey, 0.0) + amount
    bucket["total"] = bucket.get("total", 0.0) + amount
    if detail:
        if "details" not in bucket:
            bucket["details"] = {"q1": [], "q2": [], "q3": [], "q4": [], "q5": [], "total": []}
        bucket["details"][qkey].append(detail)
        bucket["details"]["total"].append(detail)


def _make_stock_entry() -> dict:
    return {
        "ltcg": _empty_quarters(),
        "ltcl": _empty_quarters(),
        "stcg": _empty_quarters(),
        "stcl": _empty_quarters(),
        "dividends": _empty_quarters(),
    }


def _round_quarters(bucket: dict) -> dict:
    res = {k: round(v) for k, v in bucket.items() if k != "details"}
    if "details" in bucket:
        res["details"] = bucket["details"]
    return res


def simulate_sell_impact(payload: dict, mode: str = 'split') -> dict:
    """
    Simulate the capital gains tax impact of hypothetical sells. Always operates in 'split' mode.
    """
    mode = 'split'
    sbi_overrides = payload.get("sbi_rate_overrides", {})
    simulated_sells = payload.get("simulated_sells", [])

    totals = {"stcg": 0.0, "stcl": 0.0, "ltcg": 0.0, "ltcl": 0.0}
    sell_results = []

    for s in simulated_sells:
        buy_date  = _parse_date(s["buy_date"])
        sell_date = _parse_date(s["sell_date"])
        buy_price  = float(s["buy_price"])
        sell_price = float(s["sell_price"])
        sell_qty   = float(s["sell_qty"])
        ticker     = s.get("ticker", "?")

        if sell_qty <= 0:
            continue

        holding_days = (sell_date - buy_date).days
        is_long_term = holding_days >= 730

        # TTBR at buy date
        buy_rate, buy_rate_date, buy_source, buy_is_lookback, buy_error = _get_rate_value(buy_date, sbi_overrides, mode=mode)
        # TTBR at sell date
        sell_rate, sell_rate_date, sell_source, sell_is_lookback, sell_error = _get_rate_value(sell_date, sbi_overrides, mode=mode)

        # In split mode, also validate Actual rates to be consistent with main A3 report
        if mode == 'split':
            if buy_rate is not None:
                _, _, _, _, buy_actual_error = _get_rate_value(buy_date, sbi_overrides, use_event_date=True, mode=mode)
                if buy_actual_error:
                    buy_error = buy_actual_error
                    buy_rate = None
            if sell_rate is not None:
                _, _, _, _, sell_actual_error = _get_rate_value(sell_date, sbi_overrides, use_event_date=True, mode=mode)
                if sell_actual_error:
                    sell_error = sell_actual_error
                    sell_rate = None

        result = {
            "ticker":       ticker,
            "lot_id":       s.get("lot_id", ""),
            "buy_date":     s["buy_date"],
            "buy_price":    buy_price,
            "sell_date":    s["sell_date"],
            "sell_price":   sell_price,
            "sell_qty":     sell_qty,
            "holding_days": holding_days,
            "is_long_term": is_long_term,
            "ttbr_buy":     buy_rate,
            "ttbr_buy_date":buy_rate_date,
            "ttbr_sell":    sell_rate,
            "ttbr_sell_date": sell_rate_date,
            "is_lookback":  (mode == 'split' and (buy_is_lookback or sell_is_lookback))
        }

        if buy_rate is None or sell_rate is None:
            result["error"] = buy_error or sell_error
            result["gain_inr"] = None
            result["category"] = None
            sell_results.append(result)
            continue

        # Actual TTBR (use_event_date=True)
        try:
            buy_rate_actual, buy_rate_actual_date, _, buy_is_lookback_actual, _ = _get_rate_value(buy_date, sbi_overrides, use_event_date=True, mode=mode)
        except Exception:
            buy_rate_actual, buy_rate_actual_date, buy_is_lookback_actual = None, None, False

        try:
            sell_rate_actual, sell_rate_actual_date, _, sell_is_lookback_actual, _ = _get_rate_value(sell_date, sbi_overrides, use_event_date=True, mode=mode)
        except Exception:
            sell_rate_actual, sell_rate_actual_date, sell_is_lookback_actual = None, None, False

        buy_inr_per_share  = buy_price  * buy_rate
        sell_inr_per_share = sell_price * sell_rate
        gain_inr = (sell_inr_per_share - buy_inr_per_share) * sell_qty

        buy_inr_per_share_actual  = buy_price  * buy_rate_actual
        sell_inr_per_share_actual = sell_price * sell_rate_actual
        gain_inr_actual = (sell_inr_per_share_actual - buy_inr_per_share_actual) * sell_qty

        result["buy_inr_per_share"]  = round(buy_inr_per_share,  2)
        result["sell_inr_per_share"] = round(sell_inr_per_share, 2)
        result["buy_cost_inr"]       = round(buy_inr_per_share  * sell_qty)
        result["sell_proceeds_inr"]  = round(sell_inr_per_share * sell_qty)
        result["gain_inr"]           = round(gain_inr)

        result["buy_inr_per_share_actual"]  = round(buy_inr_per_share_actual,  2)
        result["sell_inr_per_share_actual"] = round(sell_inr_per_share_actual, 2)
        result["buy_cost_actual_inr"]       = round(buy_inr_per_share_actual  * sell_qty)
        result["sell_proceeds_actual_inr"]  = round(sell_inr_per_share_actual * sell_qty)
        result["gain_actual_inr"]           = round(gain_inr_actual)
        result["ttbr_buy_actual"]           = buy_rate_actual
        result["ttbr_buy_actual_date"]      = buy_rate_actual_date
        result["ttbr_sell_actual"]          = sell_rate_actual
        result["ttbr_sell_actual_date"]     = sell_rate_actual_date
        if mode == 'split':
            result["is_lookback"] = buy_is_lookback or sell_is_lookback or buy_is_lookback_actual or sell_is_lookback_actual

        if is_long_term:
            category = "ltcg" if gain_inr >= 0 else "ltcl"
        else:
            category = "stcg" if gain_inr >= 0 else "stcl"

        result["category"] = category
        totals[category] += abs(gain_inr)
        sell_results.append(result)

    # Round totals
    totals = {k: round(v) for k, v in totals.items()}

    # Build a mini tax_years structure for compute_offset_summary
    def _eq(val):
        return {"q1": 0, "q2": 0, "q3": 0, "q4": 0, "q5": 0, "total": val}

    mini_tax_years = {
        "prev": {
            "totals": {
                "stcg": _eq(totals["stcg"]),
                "stcl": _eq(totals["stcl"]),
                "ltcg": _eq(totals["ltcg"]),
                "ltcl": _eq(totals["ltcl"]),
                "dividends": _eq(0),
            }
        },
        "curr": {
            "totals": {
                "stcg": _eq(0), "stcl": _eq(0),
                "ltcg": _eq(0), "ltcl": _eq(0), "dividends": _eq(0),
            }
        },
    }
    compute_offset_summary(mini_tax_years)
    offset = mini_tax_years["prev"]["offset"]

    total_proceeds_tax_inr = round(sum(s.get("sell_proceeds_inr", 0) for s in sell_results if s.get("sell_proceeds_inr") is not None))
    total_proceeds_actual_inr = round(sum(s.get("sell_proceeds_actual_inr", 0) for s in sell_results if s.get("sell_proceeds_actual_inr") is not None))

    return {
        "sells":  sell_results,
        "totals": totals,
        "offset": offset,
        "total_proceeds_tax_inr": total_proceeds_tax_inr,
        "total_proceeds_actual_inr": total_proceeds_actual_inr,
    }


def compute_offset_summary(tax_years: dict) -> dict:
    """
    Apply Indian ITR Section 70/74 capital gains set-off rules on yearly totals.

    Rules (applied in order):
      1. STCL offsets STCG first.
         Residual STCL (if STCL > STCG) is then applied against LTCG.
      2. LTCL offsets LTCG only (cannot offset STCG).
      3. Any remaining loss after both offsets is an unadjusted carry-forward loss.

    This is computed on the yearly *total* for each tax year (not per quarter),
    which is the standard treatment for ITR filing.

    Returns the same tax_years dict with an `offset` key added to each year:
    {
      "gross_stcg": int,            # raw STCG total
      "gross_ltcg": int,            # raw LTCG total
      "gross_stcl": int,            # raw STCL total (positive number)
      "gross_ltcl": int,            # raw LTCL total (positive number)
      "stcl_vs_stcg": int,          # STCL absorbed by STCG
      "stcl_vs_ltcg": int,          # residual STCL absorbed by LTCG
      "ltcl_vs_ltcg": int,          # LTCL absorbed by LTCG
      "net_stcg": int,              # STCG after STCL (>=0; excess STCL spills to LTCG)
      "net_ltcg": int,              # LTCG after LTCL + residual STCL (>=0)
      "stcl_carry_forward": int,    # STCL not absorbed anywhere this year
      "ltcl_carry_forward": int,    # LTCL not absorbed anywhere this year
    }
    """
    for ty_key in ("prev", "curr"):
        ty = tax_years[ty_key]
        totals = ty["totals"]

        gross_stcg = totals["stcg"]["total"]
        gross_stcl = totals["stcl"]["total"]
        gross_ltcg = totals["ltcg"]["total"]
        gross_ltcl = totals["ltcl"]["total"]

        # Step 1: STCL vs STCG
        stcl_vs_stcg = min(gross_stcl, gross_stcg)
        residual_stcl = gross_stcl - stcl_vs_stcg       # excess STCL after eating STCG
        net_stcg_after_stcl = gross_stcg - stcl_vs_stcg  # >= 0

        # Step 2: residual STCL vs LTCG
        stcl_vs_ltcg = min(residual_stcl, gross_ltcg)
        remaining_stcl = residual_stcl - stcl_vs_ltcg    # unabsorbed STCL carry-forward

        # Step 3: LTCL vs LTCG (on what's left of LTCG)
        ltcg_after_stcl = gross_ltcg - stcl_vs_ltcg
        ltcl_vs_ltcg = min(gross_ltcl, ltcg_after_stcl)
        remaining_ltcl = gross_ltcl - ltcl_vs_ltcg       # unabsorbed LTCL carry-forward
        net_ltcg = ltcg_after_stcl - ltcl_vs_ltcg        # >= 0

        ty["offset"] = {
            "gross_stcg":          round(gross_stcg),
            "gross_ltcg":          round(gross_ltcg),
            "gross_stcl":          round(gross_stcl),
            "gross_ltcl":          round(gross_ltcl),
            "stcl_vs_stcg":        round(stcl_vs_stcg),
            "stcl_vs_ltcg":        round(stcl_vs_ltcg),
            "ltcl_vs_ltcg":        round(ltcl_vs_ltcg),
            "net_stcg":            round(net_stcg_after_stcl),
            "net_ltcg":            round(net_ltcg),
            "stcl_carry_forward":  round(remaining_stcl),
            "ltcl_carry_forward":  round(remaining_ltcl),
        }

    return tax_years


def calculate_tax_year_summary(portfolio: dict, mode: str = 'split') -> dict:
    """
    Calculate a per-stock, per-quarter LTCG/LTCL/STCG/STCL and Dividend breakdown
    mapped to the two applicable Indian tax years.
    ...
    """
    calendar_year = portfolio.get("calendar_year", 2024)
    sbi_overrides = portfolio.get("sbi_rate_overrides", {})
    logged_errors = set()
    errors = []

    prev_cy = calendar_year - 1
    curr_cy = calendar_year

    tax_years = {
        "prev": {
            "label": f"Apr {prev_cy} – Mar {calendar_year}",
            "stocks": {},
            "totals": _make_stock_entry(),
        },
        "curr": {
            "label": f"Apr {calendar_year} – Mar {calendar_year + 1}",
            "stocks": {},
            "totals": _make_stock_entry(),
        },
    }

    def _get_ty(ty_key: str) -> dict:
        return tax_years[ty_key]

    def _ensure_stock(ty_key: str, ticker: str) -> dict:
        ty = _get_ty(ty_key)
        if ticker not in ty["stocks"]:
            ty["stocks"][ticker] = _make_stock_entry()
        return ty["stocks"][ticker]

    def _accumulate_gain(ty_key: str, ticker: str, qkey: str, net_inr: float, detail: dict = None):
        """Route a net gain to the correct bucket (ltcg/stcg/ltcl/stcl) in both
        the per-stock entry and the tax year totals."""
        ty = _get_ty(ty_key)
        stock_entry = _ensure_stock(ty_key, ticker)

        if net_inr >= 0:
            bucket_key = "ltcg" if detail and detail.get("is_long_term") else "stcg"
        else:
            bucket_key = "ltcl" if detail and detail.get("is_long_term") else "stcl"
            net_inr = abs(net_inr)  # store as positive loss amount

        _add_to_quarter(stock_entry[bucket_key], qkey, net_inr, detail)
        _add_to_quarter(ty["totals"][bucket_key], qkey, net_inr, detail)

    # ---- Process each stock ----
    for stock in portfolio.get("stocks", []):
        ticker = stock.get("ticker", "?")
        skip_divs = stock.get("skip_dividends", False)

        for lot in stock.get("lots", []):
            buy_date = _parse_date(lot["buy_date"])
            buy_price = float(lot["buy_price"])

            # Get buy TTBR once for this lot
            buy_rate, buy_rate_date, buy_source, buy_is_lookback, buy_error = _get_rate_value(buy_date, sbi_overrides, mode=mode)
            if buy_rate is None:
                if buy_error not in logged_errors:
                    logger.warning(buy_error)
                    logged_errors.add(buy_error)
                    errors.append(buy_error)
                buy_rate_inr_per_share = None
            else:
                buy_rate_inr_per_share = buy_price * buy_rate  # INR cost per share at buy

            # ---- Sells ----
            for sell in lot.get("sells", []):
                sell_date_str = sell.get("sell_date")
                if not sell_date_str:
                    continue
                sell_date = _parse_date(sell_date_str)

                # Only process sells within the calendar year
                if sell_date.year != calendar_year:
                    continue

                sell_price = float(sell.get("sell_price", 0))
                sell_qty = float(sell.get("quantity", 0))
                if sell_qty <= 0:
                    continue

                # Holding period
                holding_days = (sell_date - buy_date).days
                is_long_term = holding_days >= 730  # ≥ 2 years

                # TTBR at sell date
                sell_rate, sell_rate_date, sell_source, sell_is_lookback, sell_error = _get_rate_value(sell_date, sbi_overrides, mode=mode)
                if sell_rate is None:
                    if sell_error not in logged_errors:
                        logger.warning(sell_error)
                        logged_errors.add(sell_error)
                        errors.append(sell_error)
                    continue

                if buy_rate_inr_per_share is None:
                    # Already logged/added buy_error above
                    continue

                # INR gain = (sell_price × TTBR_sell − buy_price × TTBR_buy) × qty
                sell_inr_per_share = sell_price * sell_rate
                gain_inr = (sell_inr_per_share - buy_rate_inr_per_share) * sell_qty

                # Map to tax year and quarter
                ty_key = _get_tax_year_key(sell_date, calendar_year)
                qkey = _get_quarter_key(sell_date, ty_key)

                detail = {
                    "lot_id": lot.get("id"),
                    "sell_id": sell.get("id"),
                    "date": sell_date.isoformat(),
                    "buy_date": buy_date.isoformat(),
                    "qty": sell_qty,
                    "sell_price": sell_price,
                    "sell_ttbr": sell_rate,
                    "sell_rate_date": sell_rate_date,
                    "sell_source": sell_source,
                    "sell_is_lookback": sell_is_lookback,
                    "buy_price": buy_price,
                    "buy_ttbr": buy_rate,
                    "buy_rate_date": buy_rate_date,
                    "buy_source": buy_source,
                    "buy_is_lookback": buy_is_lookback,
                    "proceeds_inr": sell_price * sell_rate * sell_qty,
                    "buy_cost_inr": buy_price * buy_rate * sell_qty,
                    "gain_inr": gain_inr,
                    "is_long_term": is_long_term
                }

                _accumulate_gain(ty_key, ticker, qkey, gain_inr, detail)

            # ---- Dividends ----
            if skip_divs:
                continue

            divs = stock.get("dividends", [])
            for div in divs:
                ex_date_str = div.get("ex_date")
                if not ex_date_str:
                    continue
                ex_date = _parse_date(ex_date_str)

                if ex_date.year != calendar_year:
                    continue

                # Skip if lot didn't exist yet on ex_date
                if buy_date >= ex_date:
                    continue

                # Calculate qty held on ex_date
                qty = float(lot["quantity"])
                for sell in lot.get("sells", []):
                    sell_date_obj = _parse_date(sell["sell_date"])
                    if sell_date_obj <= ex_date:
                        qty -= float(sell["quantity"])

                if qty <= 0:
                    continue

                amount = float(div.get("amount", 0))

                # Qualification was on Ex-Date (already checked above)
                # Tax Year Placement & Rule 115 Conversion: Use Payment Date
                pay_date_str = div.get("payment_date") or div.get("ex_date")
                pay_date = _parse_date(pay_date_str)

                # Use Payment Date for tax year key and Rule 115 rate
                ty_key = _get_tax_year_key(pay_date, calendar_year)
                qkey = _get_quarter_key(pay_date, ty_key)

                # Rate for Tax Summary (Rule 115: Last day of prev month)
                rate, rate_date, source, is_lookback, error = _get_rate_value(pay_date, sbi_overrides, use_event_date=False, mode=mode)
                if rate is None:
                    if error not in logged_errors:
                        logger.warning(error)
                        logged_errors.add(error)
                        errors.append(error)
                    continue

                div_inr = amount * qty * rate

                detail = {
                    "lot_id": lot.get("id"),
                    "div_id": div.get("id"),
                    "date": pay_date.isoformat(),
                    "payment_date": pay_date.isoformat(),
                    "ex_date": ex_date.isoformat(),
                    "qty": qty,
                    "amount_foreign": amount,
                    "ttbr": rate,
                    "rate_date": rate_date,
                    "source": source,
                    "is_lookback": is_lookback,
                    "value_inr": div_inr,
                    "rule": "Rule 115 (Prev Month)"
                }

                ty = _get_ty(ty_key)
                stock_entry = _ensure_stock(ty_key, ticker)
                _add_to_quarter(stock_entry["dividends"], qkey, div_inr, detail)
                _add_to_quarter(ty["totals"]["dividends"], qkey, div_inr, detail)

    # Round all values
    for ty_key in ("prev", "curr"):
        ty = tax_years[ty_key]
        for category in ("ltcg", "ltcl", "stcg", "stcl", "dividends"):
            ty["totals"][category] = _round_quarters(ty["totals"][category])
        for ticker, stock_data in ty["stocks"].items():
            for category in ("ltcg", "ltcl", "stcg", "stcl", "dividends"):
                stock_data[category] = _round_quarters(stock_data[category])

    # Apply Indian ITR Section 70/74 set-off rules (yearly totals per tax year)
    compute_offset_summary(tax_years)

    if errors:
        # Clear data if errors present
        for ty in tax_years.values():
            ty["totals"] = {k: _empty_quarters() for k in ["ltcg", "ltcl", "stcg", "stcl", "dividends"]}
            ty["stocks"] = {}
            ty["offset"] = {}

    return {"tax_years": tax_years, "errors": errors}


def calculate_current_balance(portfolio: dict, mode: str = 'split') -> dict:
    """
    Calculate portfolio value as-of the last calendar day of the previous month.

    Used to power the pie chart for in-progress calendar years, where Dec 31
    hasn't occurred yet (so closing_balance from A3 rows would be 0).

    Snapshot date = last calendar day of the previous month relative to today.
    For each stock, fetches the price on (or just before) that date and
    multiplies by remaining quantity × SBI TT rate.

    Returns:
        {
            "snapshot_date": "YYYY-MM-DD",
            "stock_balances": [
                {"entity_name": str, "balance_inr": int}
            ]
        }
    """
    from datetime import date as date_cls
    sbi_overrides = portfolio.get("sbi_rate_overrides", {})

    today = date_cls.today()
    # Price as of today (most recent trading day ≤ today).
    # TTBR: use_event_date=True to get the last available rate in cache for current year.
    snapshot_date = today

    stock_totals = {}  # entity_name -> {"balance_inr": float, "quantity": float}

    for stock in portfolio.get("stocks", []):
        ticker = stock["ticker"]
        yahoo_ticker = stock.get("yahoo_ticker", ticker)
        company = stock.get("company_info", {})
        entity_name = company.get("display_name", ticker)

        # Fetch price on snapshot date (or nearest prior trading day)
        price = get_price_on_date(yahoo_ticker, snapshot_date.isoformat())
        if price is None:
            logger.warning(f"No price for {yahoo_ticker} on {snapshot_date}")
            continue

        # Get SBI TT rate for snapshot date (latest in cache)
        rate, _, _, _, error = _get_rate_value(snapshot_date, sbi_overrides, use_event_date=True, mode=mode)
        if rate is None:
            logger.warning(f"No SBI rate for {snapshot_date}: {error}")
            continue

        # Sum remaining qty across all lots as-of snapshot date
        for lot in stock.get("lots", []):
            if not lot.get("buy_date"):
                continue
            buy_date = _parse_date(lot["buy_date"])
            if buy_date > snapshot_date:
                continue  # Lot not yet acquired

            qty = float(lot.get("quantity", 0))
            for sell in lot.get("sells", []):
                sell_date = _parse_date(sell["sell_date"])
                if sell_date <= snapshot_date:
                    qty -= float(sell["quantity"])

            if qty <= 0:
                continue

            balance_inr = price * qty * rate
            if entity_name not in stock_totals:
                stock_totals[entity_name] = {"balance_inr": 0.0, "quantity": 0.0, "price": price, "rate": rate}
            
            stock_totals[entity_name]["balance_inr"] += balance_inr
            stock_totals[entity_name]["quantity"] += qty

    return {
        "snapshot_date": snapshot_date.isoformat(),
        "stock_balances": [
            {
                "entity_name": k,
                "balance_inr": round(v["balance_inr"]),
                "quantity": round(v["quantity"], 4),
                "price": v["price"],
                "rate": v["rate"]
            }
            for k, v in stock_totals.items()
            if v["balance_inr"] > 0
        ],
    }
