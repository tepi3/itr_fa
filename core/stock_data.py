"""
Stock data fetcher using yfinance (free, no login required).

Provides: company info, historical prices, dividend data.
"""

import logging
from datetime import date

import yfinance as yf

from config import COUNTRY_CODES

logger = logging.getLogger(__name__)

# Ticker suffix mapping for non-US exchanges
EXCHANGE_SUFFIXES = {
    "VWRA": "VWRA.L",   # Vanguard FTSE All-World UCITS ETF (LSE)
    "VWRL": "VWRL.L",   # Vanguard FTSE All-World UCITS ETF Dist (LSE)
    "VUAG": "VUAG.L",   # Vanguard S&P 500 UCITS ETF Acc (LSE)
    "VUSA": "VUSA.L",   # Vanguard S&P 500 UCITS ETF Dist (LSE)
    "CSPX": "CSPX.L",   # iShares Core S&P 500 UCITS ETF (LSE)
}

# Currency mapping based on exchange
TICKER_CURRENCIES = {
    ".L": "GBP",
    ".AS": "EUR",
    ".DE": "EUR",
    ".PA": "EUR",
    ".T": "JPY",
    ".HK": "HKD",
    ".SI": "SGD",
}


def resolve_yahoo_ticker(ticker: str) -> str:
    """Resolve user ticker to Yahoo Finance ticker symbol."""
    upper = ticker.upper().strip()
    if upper in EXCHANGE_SUFFIXES:
        return EXCHANGE_SUFFIXES[upper]
    return upper


def get_currency_for_ticker(yahoo_ticker: str) -> str:
    """Determine the currency based on the Yahoo ticker suffix."""
    for suffix, currency in TICKER_CURRENCIES.items():
        if yahoo_ticker.upper().endswith(suffix):
            return currency
    return "USD"  # Default to USD for US stocks


def get_company_info(ticker: str) -> dict:
    """
    Fetch company information from Yahoo Finance.

    Returns dict with: name, display_name, address, zip, country, country_code, nature
    """
    yahoo_ticker = resolve_yahoo_ticker(ticker)
    logger.info(f"Fetching company info for {yahoo_ticker}")

    try:
        t = yf.Ticker(yahoo_ticker)
        info = t.info

        # Determine nature
        quote_type = info.get("quoteType", "EQUITY")
        if quote_type == "ETF":
            nature = "ETF"
        else:
            nature = "Company"

        # Build address
        parts = []
        if info.get("address1"):
            parts.append(info["address1"])
        if info.get("address2"):
            parts.append(info["address2"])
        if info.get("city"):
            parts.append(info["city"])
        if info.get("state"):
            parts.append(info["state"])
        address = ", ".join(parts) if parts else ""

        # Country code
        country = info.get("country", "")
        country_code = COUNTRY_CODES.get(country, f"99-{country.upper()}")

        # Name
        long_name = info.get("longName", info.get("shortName", ticker.upper()))
        display_name = f"{long_name} ({ticker.upper()})"

        return {
            "success": True,
            "name": long_name,
            "display_name": display_name,
            "address": address,
            "zip": info.get("zip", ""),
            "country": country,
            "country_code": country_code,
            "nature": nature,
            "yahoo_ticker": yahoo_ticker,
            "currency": info.get("currency", get_currency_for_ticker(yahoo_ticker)),
        }
    except Exception as e:
        logger.error(f"Error fetching info for {ticker}: {e}")
        return {
            "success": False,
            "error": str(e),
            "yahoo_ticker": yahoo_ticker,
        }


def get_historical_prices(ticker: str, start_date: str, end_date: str) -> list:
    """
    Fetch daily closing prices from Yahoo Finance.

    Args:
        ticker: Yahoo Finance ticker symbol
        start_date: "YYYY-MM-DD"
        end_date: "YYYY-MM-DD"

    Returns:
        List of {"date": "YYYY-MM-DD", "close": float}
    """
    yahoo_ticker = resolve_yahoo_ticker(ticker)
    logger.info(f"Fetching prices for {yahoo_ticker} from {start_date} to {end_date}")

    try:
        t = yf.Ticker(yahoo_ticker)
        hist = t.history(start=start_date, end=end_date)

        prices = []
        for idx, row in hist.iterrows():
            prices.append({
                "date": idx.strftime("%Y-%m-%d"),
                "close": round(float(row["Close"]), 4),
            })
        return prices
    except Exception as e:
        logger.error(f"Error fetching prices for {ticker}: {e}")
        return []


def get_dividends(ticker: str, year: int) -> list:
    """
    Fetch dividend data for a specific calendar year.

    Returns:
        List of {"ex_date": "YYYY-MM-DD", "amount": float}
        Empty list if no dividends.
    """
    yahoo_ticker = resolve_yahoo_ticker(ticker)
    logger.info(f"Fetching dividends for {yahoo_ticker} in {year}")

    try:
        t = yf.Ticker(yahoo_ticker)
        divs = t.dividends

        if divs.empty:
            return []

        # Filter for the calendar year
        year_divs = []
        for idx, amount in divs.items():
            if idx.year == year:
                year_divs.append({
                    "ex_date": idx.strftime("%Y-%m-%d"),
                    "amount": round(float(amount), 6),
                })

        return year_divs
    except Exception as e:
        logger.error(f"Error fetching dividends for {ticker}: {e}")
        return []


def get_price_on_date(ticker: str, target_date: str) -> float:
    """
    Get the closing price on a specific date.
    If the market was closed, returns the most recent close before that date.
    """
    yahoo_ticker = resolve_yahoo_ticker(ticker)
    try:
        t = yf.Ticker(yahoo_ticker)
        # Fetch a small window around the target date
        d = date.fromisoformat(target_date)
        start = (d - __import__("datetime").timedelta(days=10)).isoformat()
        end = (d + __import__("datetime").timedelta(days=1)).isoformat()
        hist = t.history(start=start, end=end)

        if hist.empty:
            return None

        # Find the closest date <= target_date
        for idx in reversed(hist.index):
            if idx.strftime("%Y-%m-%d") <= target_date:
                return round(float(hist.loc[idx, "Close"]), 4)

        return round(float(hist.iloc[-1]["Close"]), 4)
    except Exception as e:
        logger.error(f"Error getting price for {ticker} on {target_date}: {e}")
        return None


def has_dividends(ticker: str) -> bool:
    """Check if a ticker pays dividends (has any historical dividend data)."""
    yahoo_ticker = resolve_yahoo_ticker(ticker)
    try:
        t = yf.Ticker(yahoo_ticker)
        return not t.dividends.empty
    except:
        return False
