"""
A3 Schedule FA Calculator.

Computes all 12 columns of Section A3 for each acquisition lot.
Handles FIFO partial sells, peak value day-by-day, and dividend auto-calculation.
All calculated fields support manual overrides.
"""

import logging
from datetime import date, timedelta
from typing import Optional

from core.sbi_rates import get_sbi_tt_rate
from core.stock_data import get_historical_prices, get_dividends, get_price_on_date

logger = logging.getLogger(__name__)


def _parse_date(date_str: str) -> date:
    """Parse YYYY-MM-DD date string."""
    return date.fromisoformat(date_str)


def _format_date_display(date_str: str) -> str:
    """Convert YYYY-MM-DD to DD/MM/YYYY for display."""
    d = _parse_date(date_str)
    return d.strftime("%d/%m/%Y")


def _get_rate_value(d: date, currency: str, overrides: dict) -> tuple:
    """Get SBI TT rate value and metadata."""
    result = get_sbi_tt_rate(d, currency, overrides)
    return result.get("rate"), result.get("rate_date"), result.get("source")


def calculate_initial_value(lot: dict, currency: str, sbi_overrides: dict) -> dict:
    """
    Calculate column 8: Initial value of the investment (₹).
    = buy_price × quantity × TTBR(last_wd_prev_month_of_buy_date)
    """
    buy_date = _parse_date(lot["buy_date"])
    buy_price = float(lot["buy_price"])
    quantity = float(lot["quantity"])

    rate, rate_date, source = _get_rate_value(buy_date, currency, sbi_overrides)

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
    currency: str,
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

    # Cache monthly TTBR to avoid repeated lookups
    monthly_ttbr_cache = {}

    peak_value = 0
    peak_date = None
    peak_price = None
    peak_qty = None
    peak_rate = None

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

        # Get TTBR for this month (cached)
        month_key = f"{trading_date.year}-{trading_date.month:02d}"
        if month_key not in monthly_ttbr_cache:
            rate, _, _ = _get_rate_value(trading_date, currency, sbi_overrides)
            monthly_ttbr_cache[month_key] = rate

        ttbr = monthly_ttbr_cache[month_key]
        if ttbr is None:
            continue

        value_inr = close_price * qty * ttbr

        if value_inr > peak_value:
            peak_value = value_inr
            peak_date = trading_date.isoformat()
            peak_price = close_price
            peak_qty = qty
            peak_rate = ttbr

    return {
        "value": round(peak_value) if peak_value > 0 else 0,
        "peak_date": peak_date,
        "components": {
            "peak_price": peak_price,
            "qty_on_peak_date": peak_qty,
            "ttbr": peak_rate,
        },
    }


def calculate_closing_balance(
    lot: dict,
    yahoo_ticker: str,
    currency: str,
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
    rate, rate_date, _ = _get_rate_value(dec31, currency, sbi_overrides)
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
    yahoo_ticker: str,
    currency: str,
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

    # Fetch dividends for this year
    divs = get_dividends(yahoo_ticker, calendar_year)

    if not divs:
        return {"value": 0, "dividend_entries": [], "no_dividends": True}

    total_div_inr = 0
    entries = []

    for div in divs:
        ex_date = _parse_date(div["ex_date"])
        amount = div["amount"]

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
        rate, rate_date, _ = _get_rate_value(ex_date, currency, sbi_overrides)
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
    currency: str,
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

        rate, rate_date, _ = _get_rate_value(sell_date, currency, sbi_overrides)
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
        currency = stock.get("currency", "USD")
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
            initial = calculate_initial_value(lot, currency, sbi_overrides)
            peak = calculate_peak_value(lot, sells_in_cy, yahoo_ticker, currency, calendar_year, sbi_overrides)
            closing = calculate_closing_balance(lot, yahoo_ticker, currency, calendar_year, sbi_overrides)
            dividends = calculate_dividends(lot, yahoo_ticker, currency, calendar_year, sbi_overrides, skip_divs)
            sales = calculate_sale_proceeds(lot, currency, calendar_year, sbi_overrides)

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
