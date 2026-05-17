"""
Stock data fetcher using yfinance (free, no login required).

Copyright (c) 2026 Piyush Tewari (tepi3). All rights reserved.
Licensed for personal, non-commercial use only.

Provides: company info, historical prices, dividend data.
"""

import logging
import json
import sqlite3
from datetime import date, timedelta
from config import COUNTRY_CODES, DATA_DIR

logger = logging.getLogger(__name__)

# yfinance is lazy-loaded inside functions to speed up app startup
yf = None

def _get_yf():
    global yf
    if yf is None:
        import yfinance as yf_mod
        yf = yf_mod
    return yf

# Ticker suffix mapping for non-US exchanges
EXCHANGE_SUFFIXES = {
    "VWRA": "VWRA.L",   # Vanguard FTSE All-World UCITS ETF (LSE)
    "VWRL": "VWRL.L",   # Vanguard FTSE All-World UCITS ETF Dist (LSE)
    "VUAG": "VUAG.L",   # Vanguard S&P 500 UCITS ETF Acc (LSE)
    "VUSA": "VUSA.L",   # Vanguard S&P 500 UCITS ETF Dist (LSE)
    "CSPX": "CSPX.L",   # iShares Core S&P 500 UCITS ETF (LSE)
}

# ===== SQLite Cache Manager =====
CACHE_DB = DATA_DIR / "yfinance_cache.db"

def _get_cache_conn():
    conn = sqlite3.connect(str(CACHE_DB), timeout=10)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS yfinance_cache (
            cache_key TEXT PRIMARY KEY,
            cache_val TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    return conn

def get_cached_val(key: str):
    try:
        with _get_cache_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT cache_val FROM yfinance_cache WHERE cache_key = ?", (key,))
            row = cursor.fetchone()
            if row:
                return json.loads(row[0])
    except Exception as e:
        logger.warning(f"Cache read error for {key}: {e}")
    return None

def set_cached_val(key: str, val):
    try:
        with _get_cache_conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO yfinance_cache (cache_key, cache_val) VALUES (?, ?)",
                (key, json.dumps(val))
            )
    except Exception as e:
        logger.warning(f"Cache write error for {key}: {e}")


def resolve_yahoo_ticker(ticker: str) -> str:
    """Resolve user ticker to Yahoo Finance ticker symbol."""
    upper = ticker.upper().strip()
    if upper in EXCHANGE_SUFFIXES:
        return EXCHANGE_SUFFIXES[upper]
    return upper


def get_company_info(ticker: str) -> dict:
    """
    Fetch company information from Yahoo Finance.

    Returns dict with: name, display_name, address, zip, country, country_code, nature
    """
    yahoo_ticker = resolve_yahoo_ticker(ticker)
    cache_key = f"company_info:{yahoo_ticker.upper()}"
    
    cached = get_cached_val(cache_key)
    if cached:
        logger.info(f"Loaded company info from cache for {yahoo_ticker}")
        return cached

    logger.info(f"Fetching company info for {yahoo_ticker}")
    try:
        t = _get_yf().Ticker(yahoo_ticker)
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

        res = {
            "success": True,
            "name": long_name,
            "display_name": display_name,
            "address": address,
            "zip": info.get("zip", ""),
            "country": country,
            "country_code": country_code,
            "nature": nature,
            "yahoo_ticker": yahoo_ticker,
            "currency": "USD",
        }
        
        # Cache successful lookup permanently
        set_cached_val(cache_key, res)
        return res
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
    cache_key = f"prices:{yahoo_ticker.upper()}:{start_date}:{end_date}"
    
    cached = get_cached_val(cache_key)
    if cached is not None:
        logger.info(f"Loaded price history from cache for {yahoo_ticker} ({start_date} to {end_date})")
        return cached

    logger.info(f"Fetching prices for {yahoo_ticker} from {start_date} to {end_date}")
    try:
        t = _get_yf().Ticker(yahoo_ticker)
        hist = t.history(start=start_date, end=end_date, auto_adjust=False)
        
        logger.info(f"Prices for {yahoo_ticker}: found {len(hist)} rows")

        prices = []
        for idx, row in hist.iterrows():
            prices.append({
                "date": idx.strftime("%Y-%m-%d"),
                "close": round(float(row["Close"]), 4),
            })
            
        # Only cache if the end_date is in the past (historical) and we got price data
        if prices and end_date < date.today().isoformat():
            set_cached_val(cache_key, prices)
            
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
    cache_key = f"dividends:{yahoo_ticker.upper()}:{year}"
    
    cached = get_cached_val(cache_key)
    if cached is not None:
        logger.info(f"Loaded dividends from cache for {yahoo_ticker} in {year}")
        return cached

    logger.info(f"Fetching dividends for {yahoo_ticker} in {year}")
    try:
        t = _get_yf().Ticker(yahoo_ticker)
        divs = t.dividends

        if divs.empty:
            if year < date.today().year:
                set_cached_val(cache_key, [])
            return []

        # Filter for the calendar year
        year_divs = []
        for idx, amount in divs.items():
            if idx.year == year:
                year_divs.append({
                    "ex_date": idx.strftime("%Y-%m-%d"),
                    "amount": round(float(amount), 6),
                })

        # Cache permanently if this year is fully closed (in the past)
        if year < date.today().year:
            set_cached_val(cache_key, year_divs)

        return year_divs
    except Exception as e:
        logger.error(f"Error fetching dividends for {ticker}: {e}")
        return []


def get_yearly_max_price(ticker: str, year: int) -> dict:
    """
    Fetch the maximum closing price for a ticker during a calendar year.

    Returns:
        {"max_price": float, "max_price_date": "YYYY-MM-DD"} or
        {"max_price": None, "max_price_date": None} on failure.
    """
    yahoo_ticker = resolve_yahoo_ticker(ticker)
    cache_key = f"max_price:{yahoo_ticker.upper()}:{year}"
    
    cached = get_cached_val(cache_key)
    if cached:
        logger.info(f"Loaded yearly max price from cache for {yahoo_ticker} in {year}")
        return cached

    logger.info(f"Fetching yearly max price for {yahoo_ticker} in {year}")
    try:
        t = _get_yf().Ticker(yahoo_ticker)
        hist = t.history(start=f"{year}-01-01", end=f"{year + 1}-01-01", auto_adjust=False)

        if hist.empty:
            res = {"max_price": None, "max_price_date": None}
            if year < date.today().year:
                set_cached_val(cache_key, res)
            return res

        max_idx = hist["Close"].idxmax()
        max_price = round(float(hist.loc[max_idx, "Close"]), 4)
        max_date = max_idx.strftime("%Y-%m-%d")
        
        res = {"max_price": max_price, "max_price_date": max_date}
        
        # Cache permanently if this year is fully closed (in the past)
        if year < date.today().year:
            set_cached_val(cache_key, res)
            
        return res
    except Exception as e:
        logger.error(f"Error fetching yearly max price for {ticker}: {e}")
        return {"max_price": None, "max_price_date": None}


def get_price_on_date(ticker: str, target_date: str) -> float:
    """
    Get the closing price on a specific date.
    If the market was closed, returns the most recent close before that date.
    """
    yahoo_ticker = resolve_yahoo_ticker(ticker)
    cache_key = f"price_on_date:{yahoo_ticker.upper()}:{target_date}"
    
    cached = get_cached_val(cache_key)
    if cached is not None:
        return cached

    try:
        t = _get_yf().Ticker(yahoo_ticker)
        # Fetch a small window around the target date
        d = date.fromisoformat(target_date)
        start = (d - timedelta(days=10)).isoformat()
        end = (d + timedelta(days=1)).isoformat()
        hist = t.history(start=start, end=end, auto_adjust=False)

        if hist.empty:
            return None

        price = None
        # Find the closest date <= target_date
        for idx in reversed(hist.index):
            if idx.strftime("%Y-%m-%d") <= target_date:
                price = round(float(hist.loc[idx, "Close"]), 4)
                break

        if price is None:
            price = round(float(hist.iloc[-1]["Close"]), 4)
            
        # Cache permanently if target_date is in the past
        if price is not None and target_date < date.today().isoformat():
            set_cached_val(cache_key, price)
            
        return price
    except Exception as e:
        logger.error(f"Error getting price for {ticker} on {target_date}: {e}")
        return None


def has_dividends(ticker: str) -> bool:
    """Check if a ticker pays dividends (has any historical dividend data)."""
    yahoo_ticker = resolve_yahoo_ticker(ticker)
    cache_key = f"has_divs:{yahoo_ticker.upper()}"
    
    cached = get_cached_val(cache_key)
    if cached is not None:
        return cached
        
    try:
        t = _get_yf().Ticker(yahoo_ticker)
        res = not t.dividends.empty
        set_cached_val(cache_key, res)
        return res
    except:
        return False


def get_live_price(ticker: str) -> dict:
    """
    Fetch the current live market price for a ticker.

    Uses yfinance fast_info.last_price which returns the most recent
    trade price (intraday, not dividend-adjusted, not end-of-day close).
    
    NOTE: Real-time price query is NEVER cached so it stays 100% accurate.

    Returns:
        {
          "price": float | None,
          "currency": str,
          "market_state": str,   # "REGULAR" | "PRE" | "POST" | "CLOSED"
          "ticker": str
        }
    """
    yahoo_ticker = resolve_yahoo_ticker(ticker)
    logger.info(f"Fetching live price for {yahoo_ticker}")
    try:
        t = _get_yf().Ticker(yahoo_ticker)
        fi = t.fast_info
        price = fi.last_price
        currency = getattr(fi, "currency", "USD") or "USD"
        market_state = getattr(fi, "market_state", "UNKNOWN") or "UNKNOWN"
        return {
            "price": round(float(price), 4) if price is not None else None,
            "currency": currency,
            "market_state": market_state,
            "ticker": yahoo_ticker,
        }
    except Exception as e:
        logger.error(f"Error fetching live price for {ticker}: {e}")
        return {"price": None, "currency": "USD", "market_state": "UNKNOWN", "ticker": yahoo_ticker}


def clear_stock_cache() -> bool:
    """Clear all entries in the yfinance stock cache database."""
    try:
        with _get_cache_conn() as conn:
            conn.execute("DELETE FROM yfinance_cache")
        return True
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        return False
