"""
A3 Schedule FA Calculator.

Copyright (c) 2026 Piyush Tewari (tepi3). All rights reserved.
Licensed for personal, non-commercial use only.

Computes all 12 columns of Section A3 for each acquisition lot.
Handles FIFO partial sells, peak value day-by-day, and dividend auto-calculation.
All calculated fields support manual overrides.
"""

import logging
from datetime import date, timedelta
from typing import Optional

from core.sbi_rates import get_sbi_tt_rate
from core.stock_data import get_historical_prices, get_price_on_date

logger = logging.getLogger(__name__)


def _parse_date(date_str: str) -> date:
    """Parse YYYY-MM-DD date string."""
    return date.fromisoformat(date_str)


def _format_date_display(date_str: str) -> str:
    """Convert YYYY-MM-DD to DD/MM/YYYY for display."""
    d = _parse_date(date_str)
    return d.strftime("%d/%m/%Y")


def _get_rate_value(d: date, overrides: dict) -> tuple:
    """Get SBI TT rate value and metadata (USD only)."""
    result = get_sbi_tt_rate(d, overrides)
    return result.get("rate"), result.get("rate_date"), result.get("source")


def calculate_initial_value(lot: dict, sbi_overrides: dict) -> dict:
    """
    Calculate column 8: Initial value of the investment (₹).
    = buy_price × quantity × TTBR(last_wd_prev_month_of_buy_date)
    """
    buy_date = _parse_date(lot["buy_date"])
    buy_price = float(lot["buy_price"])
    quantity = float(lot["quantity"])

    rate, rate_date, source = _get_rate_value(buy_date, sbi_overrides)

    if rate is None:
        return {
            "value": None,
            "rate": None,
            "rate_date": rate_date,
            "error": f"SBI rate not found for {rate_date}",
        }

    value = round(buy_price * quantity * rate)
    return {
        "value": value,
        "rate": rate,
        "rate_date": rate_date,
        "components": {
            "buy_price": buy_price,
            "quantity": quantity,
            "ttbr": rate,
        },
    }


def calculate_peak_value(
    lot: dict,
    sells_in_cy: list,
    yahoo_ticker: str,
    calendar_year: int,
    sbi_overrides: dict,
) -> dict:
    """
    Calculate column 9: Peak value of investment during the period (₹).
    = max(daily_close × qty_held × TTBR) across all trading days in the CY.
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
    sorted_sells = sorted(sells_in_cy, key=lambda s: s["sell_date"])

    # Cache monthly TTBR as (rate, rate_date) to avoid repeated lookups
    monthly_ttbr_cache = {}

    peak_value = 0
    peak_date = None
    peak_price = None
    peak_qty = None
    peak_rate = None
    peak_rate_date = None

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

        # Get TTBR for this month (cached as tuple)
        month_key = f"{trading_date.year}-{trading_date.month:02d}"
        if month_key not in monthly_ttbr_cache:
            rate, rate_date_str, _ = _get_rate_value(trading_date, sbi_overrides)
            monthly_ttbr_cache[month_key] = (rate, rate_date_str)

        ttbr, ttbr_rate_date = monthly_ttbr_cache[month_key]
        if ttbr is None:
            continue

        value_inr = close_price * qty * ttbr

        if value_inr > peak_value:
            peak_value = value_inr
            peak_date = trading_date.isoformat()
            peak_price = close_price
            peak_qty = qty
            peak_rate = ttbr
            peak_rate_date = ttbr_rate_date

    return {
        "value": round(peak_value) if peak_value > 0 else 0,
        "peak_date": peak_date,
        "rate": peak_rate,
        "rate_date": peak_rate_date,
        "components": {
            "peak_price": peak_price,
            "qty_on_peak_date": peak_qty,
            "ttbr": peak_rate,
            "rate_date": peak_rate_date,
        },
    }


def calculate_closing_balance(
    lot: dict,
    yahoo_ticker: str,
    calendar_year: int,
    sbi_overrides: dict,
) -> dict:
    """
    Calculate column 10: Closing balance (₹).
    = close_price_dec31 × remaining_qty × TTBR(last_wd_prev_month_of_dec31)
    0 if fully sold before Dec 31.
    """
    dec31 = date(calendar_year, 12, 31)
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
    rate, rate_date, _ = _get_rate_value(dec31, sbi_overrides)
    if rate is None:
        return {"value": None, "error": f"SBI rate not found for {rate_date}"}

    value = round(close_price * qty * rate)
    return {
        "value": value,
        "remaining_qty": qty,
        "components": {
            "close_price_dec31": close_price,
            "remaining_qty": qty,
            "ttbr": rate,
            "rate_date": rate_date,
        },
    }


def calculate_dividends(
    lot: dict,
    stock: dict,
    calendar_year: int,
    sbi_overrides: dict,
    skip_dividends: bool = False,
) -> dict:
    """
    Calculate column 11: Total gross dividends (₹).
    = Σ(div_per_share × qty_on_ex_date × TTBR(last_wd_prev_month_of_ex_date))
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
        # Only process dividends for the target calendar year
        if ex_date.year != calendar_year:
            continue

        amount = float(div["amount"])

        # Skip if lot didn't exist yet
        if buy_date > ex_date:
            continue

        # Calculate qty held on ex_date
        qty = float(lot["quantity"])
        for sell in lot.get("sells", []):
            sell_date = _parse_date(sell["sell_date"])
            if sell_date <= ex_date:
                qty -= float(sell["quantity"])

        if qty <= 0:
            continue

        # Get TTBR
        rate, rate_date, _ = _get_rate_value(ex_date, sbi_overrides)
        if rate is None:
            entries.append({
                "ex_date": div["ex_date"],
                "amount_foreign": amount,
                "qty": qty,
                "error": f"SBI rate not found",
            })
            continue

        div_inr = amount * qty * rate
        total_div_inr += div_inr

        entries.append({
            "ex_date": div["ex_date"],
            "amount_foreign": amount,
            "qty": qty,
            "ttbr": rate,
            "rate_date": rate_date,
            "div_inr": round(div_inr),
        })

    return {
        "value": round(total_div_inr),
        "dividend_entries": entries,
    }


def calculate_sale_proceeds(
    lot: dict,
    calendar_year: int,
    sbi_overrides: dict,
) -> dict:
    """
    Calculate column 12: Total sale proceeds (₹).
    = Σ(sell_price × sell_qty × TTBR(last_wd_prev_month_of_sell_date))
    Only for sells within the calendar year.
    """
    total_proceeds_inr = 0
    sale_entries = []

    for sell in lot.get("sells", []):
        sell_date = _parse_date(sell["sell_date"])
        if sell_date.year != calendar_year:
            continue

        sell_price = float(sell["sell_price"])
        sell_qty = float(sell["quantity"])

        rate, rate_date, _ = _get_rate_value(sell_date, sbi_overrides)
        if rate is None:
            sale_entries.append({
                "sell_date": sell["sell_date"],
                "sell_price": sell_price,
                "quantity": sell_qty,
                "error": f"SBI rate not found",
            })
            continue

        proceeds_inr = sell_price * sell_qty * rate
        total_proceeds_inr += proceeds_inr

        sale_entries.append({
            "sell_date": sell["sell_date"],
            "sell_price": sell_price,
            "quantity": sell_qty,
            "ttbr": rate,
            "rate_date": rate_date,
            "proceeds_inr": round(proceeds_inr),
        })

    return {
        "value": round(total_proceeds_inr),
        "sale_entries": sale_entries,
    }


def calculate_a3_rows(portfolio: dict) -> list:
    """
    Calculate all A3 rows for the entire portfolio.

    Args:
        portfolio: Full portfolio data dict (see data model in APPLICATION_PLAN.md)

    Returns:
        List of row dicts, one per lot, each with all 12 columns + metadata.
    """
    calendar_year = portfolio.get("calendar_year", 2024)
    sbi_overrides = portfolio.get("sbi_rate_overrides", {})
    overrides = portfolio.get("overrides", {})

    rows = []
    sl_no = 1

    for stock in portfolio.get("stocks", []):
        ticker = stock["ticker"]
        yahoo_ticker = stock.get("yahoo_ticker", ticker)
        company = stock.get("company_info", {})
        skip_divs = stock.get("skip_dividends", False)

        for lot in stock.get("lots", []):
            lot_id = lot.get("id", f"{ticker}_{lot['buy_date']}")

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
            initial = calculate_initial_value(lot, sbi_overrides)
            peak = calculate_peak_value(lot, sells_in_cy, yahoo_ticker, calendar_year, sbi_overrides)
            closing = calculate_closing_balance(lot, yahoo_ticker, calendar_year, sbi_overrides)
            dividends = calculate_dividends(lot, stock, calendar_year, sbi_overrides, skip_divs)
            sales = calculate_sale_proceeds(lot, calendar_year, sbi_overrides)

            # Apply overrides
            lot_overrides = overrides.get(lot_id, {})

            row = {
                "lot_id": lot_id,
                "sl_no": sl_no,
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
                "calculation_details": {
                    "initial": initial,
                    "peak": peak,
                    "closing": closing,
                    "dividends": dividends,
                    "sales": sales,
                },
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

    return rows


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
    return {"q1": 0.0, "q2": 0.0, "q3": 0.0, "q4": 0.0, "q5": 0.0, "total": 0.0}


def _add_to_quarter(bucket: dict, qkey: str, amount: float):
    bucket[qkey] = bucket.get(qkey, 0.0) + amount
    bucket["total"] = bucket.get("total", 0.0) + amount


def _make_stock_entry() -> dict:
    return {
        "ltcg": _empty_quarters(),
        "ltcl": _empty_quarters(),
        "stcg": _empty_quarters(),
        "stcl": _empty_quarters(),
        "dividends": _empty_quarters(),
    }


def _round_quarters(bucket: dict) -> dict:
    return {k: round(v) for k, v in bucket.items()}


def simulate_sell_impact(payload: dict) -> dict:
    """
    Simulate the capital gains tax impact of hypothetical sells.

    Accepts a list of simulated sells (with buy lot info) and returns:
      - per-sell breakdown (gain/loss, type, TTBR rates)
      - yearly totals (STCG / LTCL / STCG / STCL)
      - §70/74 offset result

    This does NOT modify any portfolio data.

    Args:
        payload: {
            "calendar_year": int,
            "sbi_rate_overrides": dict,
            "simulated_sells": [
                {
                    "ticker":        str,
                    "lot_id":        str,
                    "buy_date":      "YYYY-MM-DD",
                    "buy_price":     float,   # in USD
                    "sell_qty":      float,
                    "sell_price":    float,   # in USD
                    "sell_date":     "YYYY-MM-DD",
                }
            ]
        }

    Returns:
        {
            "sells": [ per-sell result dicts ],
            "totals": { "stcg": int, "stcl": int, "ltcg": int, "ltcl": int },
            "offset": { ... same as compute_offset_summary }
        }
    """
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
        buy_rate, buy_rate_date, _ = _get_rate_value(buy_date, sbi_overrides)
        # TTBR at sell date
        sell_rate, sell_rate_date, _ = _get_rate_value(sell_date, sbi_overrides)

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
        }

        if buy_rate is None or sell_rate is None:
            result["error"] = f"TTBR not found (buy: {buy_rate_date}, sell: {sell_rate_date})"
            result["gain_inr"] = None
            result["category"] = None
            sell_results.append(result)
            continue

        buy_inr_per_share  = buy_price  * buy_rate
        sell_inr_per_share = sell_price * sell_rate
        gain_inr = (sell_inr_per_share - buy_inr_per_share) * sell_qty

        result["buy_inr_per_share"]  = round(buy_inr_per_share,  2)
        result["sell_inr_per_share"] = round(sell_inr_per_share, 2)
        result["buy_cost_inr"]       = round(buy_inr_per_share  * sell_qty)
        result["sell_proceeds_inr"]  = round(sell_inr_per_share * sell_qty)
        result["gain_inr"]           = round(gain_inr)

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

    return {
        "sells":  sell_results,
        "totals": totals,
        "offset": offset,
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


def calculate_tax_year_summary(portfolio: dict) -> dict:
    """
    Calculate a per-stock, per-quarter LTCG/LTCL/STCG/STCL and Dividend breakdown
    mapped to the two applicable Indian tax years.

    Indian tax year mapping rule (events in Calendar Year CY):
        Jan-Mar → "prev" tax year: Apr(CY-1) – Mar(CY)
        Apr-Dec → "curr" tax year: Apr(CY)   – Mar(CY+1)

    Capital Gain classification:
        Holding period < 2 years  → Short-Term (STCG/STCL)
        Holding period ≥ 2 years  → Long-Term  (LTCG/LTCL)

    Gain = (sell_price × qty × TTBR_sell) − (buy_price × qty × TTBR_buy)
    Dividend contribution = amount_per_share × qty_on_ex_date × TTBR_ex_date

    Returns:
        {
          "tax_years": {
            "prev": {
              "label": "Apr 2023 – Mar 2024",
              "stocks": { <ticker>: { ltcg, ltcl, stcg, stcl, dividends } },
              "totals": { ltcg, ltcl, stcg, stcl, dividends }
            },
            "curr": { ... }
          }
        }
    """
    calendar_year = portfolio.get("calendar_year", 2024)
    sbi_overrides = portfolio.get("sbi_rate_overrides", {})

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

    def _accumulate_gain(ty_key: str, ticker: str, qkey: str, net_inr: float):
        """Route a net gain to the correct bucket (ltcg/stcg/ltcl/stcl) in both
        the per-stock entry and the tax year totals."""
        ty = _get_ty(ty_key)
        stock_entry = _ensure_stock(ty_key, ticker)

        if net_inr >= 0:
            bucket_key = "ltcg" if _is_long_term else "stcg"
        else:
            bucket_key = "ltcl" if _is_long_term else "stcl"
            net_inr = abs(net_inr)  # store as positive loss amount

        _add_to_quarter(stock_entry[bucket_key], qkey, net_inr)
        _add_to_quarter(ty["totals"][bucket_key], qkey, net_inr)

    # ---- Process each stock ----
    for stock in portfolio.get("stocks", []):
        ticker = stock.get("ticker", "?")
        skip_divs = stock.get("skip_dividends", False)

        for lot in stock.get("lots", []):
            buy_date = _parse_date(lot["buy_date"])
            buy_price = float(lot["buy_price"])

            # Get buy TTBR once for this lot
            buy_rate, _, _ = _get_rate_value(buy_date, sbi_overrides)
            if buy_rate is None:
                logger.warning(f"No TTBR for buy date {buy_date} on {ticker}, skipping gains")
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
                _is_long_term = holding_days >= 730  # ≥ 2 years

                # TTBR at sell date
                sell_rate, _, _ = _get_rate_value(sell_date, sbi_overrides)
                if sell_rate is None:
                    logger.warning(f"No TTBR for sell date {sell_date} on {ticker}, skipping")
                    continue

                if buy_rate_inr_per_share is None:
                    logger.warning(f"No buy TTBR for {ticker} lot {lot['buy_date']}, skipping")
                    continue

                # INR gain = (sell_price × TTBR_sell − buy_price × TTBR_buy) × qty
                sell_inr_per_share = sell_price * sell_rate
                gain_inr = (sell_inr_per_share - buy_rate_inr_per_share) * sell_qty

                # Map to tax year and quarter
                ty_key = _get_tax_year_key(sell_date, calendar_year)
                qkey = _get_quarter_key(sell_date, ty_key)

                _accumulate_gain(ty_key, ticker, qkey, gain_inr)

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
                if buy_date > ex_date:
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
                rate, _, _ = _get_rate_value(ex_date, sbi_overrides)
                if rate is None:
                    continue

                div_inr = amount * qty * rate

                ty_key = _get_tax_year_key(ex_date, calendar_year)
                qkey = _get_quarter_key(ex_date, ty_key)

                ty = _get_ty(ty_key)
                stock_entry = _ensure_stock(ty_key, ticker)
                _add_to_quarter(stock_entry["dividends"], qkey, div_inr)
                _add_to_quarter(ty["totals"]["dividends"], qkey, div_inr)

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

    return {"tax_years": tax_years}
