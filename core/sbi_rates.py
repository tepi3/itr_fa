"""
SBI TT Buying Rate fetcher, cache, and lookup.

Copyright (c) 2026 Piyush Tewari (tepi3). All rights reserved.
Licensed for personal, non-commercial use only.

Data source: sahilgupta/sbi-fx-ratekeeper GitHub repo (free, no login).
CSV format: DATE,PDF FILE,TT BUY,TT SELL,BILL BUY,BILL SELL,...
- DATE is "YYYY-MM-DD HH:MM"
- TT BUY is 0.00 on weekends/holidays (skip these)
"""

import csv
import json
import logging
from datetime import date, timedelta
from io import StringIO
from pathlib import Path

import requests

from config import SBI_CACHE_FILE, SBI_CSV_URL

logger = logging.getLogger(__name__)


def _load_cache() -> dict:
    """Load cached SBI rates from disk."""
    if SBI_CACHE_FILE.exists():
        with open(SBI_CACHE_FILE, "r") as f:
            return json.load(f)
    return {}


def _save_cache(cache: dict):
    """Save SBI rates cache to disk."""
    SBI_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SBI_CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2, sort_keys=True)


def download_sbi_csv() -> dict:
    """
    Download the full SBI USD rate CSV from GitHub and parse into a dict.
    Returns: { "YYYY-MM-DD": tt_buy_rate, ... }
    Only includes dates where TT BUY > 0.
    """
    logger.info("Downloading SBI USD rates from GitHub...")
    resp = requests.get(SBI_CSV_URL, timeout=60)
    resp.raise_for_status()

    rates = {}
    # Handle BOM and different line endings
    text = resp.text.replace("\r\n", "\n").replace("\r", "\n")
    reader = csv.reader(StringIO(text))

    header = next(reader)
    # Find TT BUY column index (should be index 2)
    tt_buy_idx = None
    for i, col in enumerate(header):
        if "TT BUY" in col.upper() or "TT_BUY" in col.upper():
            tt_buy_idx = i
            break
    if tt_buy_idx is None:
        tt_buy_idx = 2  # Default position

    for row in reader:
        if len(row) <= tt_buy_idx:
            continue
        try:
            date_str = row[0].strip().split(" ")[0]  # Extract YYYY-MM-DD from "YYYY-MM-DD HH:MM"
            tt_buy = float(row[tt_buy_idx].strip())
            if tt_buy > 0:
                rates[date_str] = tt_buy
        except (ValueError, IndexError):
            continue

    logger.info(f"Parsed {len(rates)} USD rate entries")
    return rates


def refresh_cache():
    """Download fresh SBI USD rates and update the cache. Respects locked years."""
    cache = _load_cache()
    if "rates" not in cache:
        cache["rates"] = {}
    if "USD" not in cache["rates"]:
        cache["rates"]["USD"] = {}

    locked_years = set(cache.get("locked_years", []))
    rates = download_sbi_csv()

    # Only update rates for unlocked years
    updated = 0
    for date_str, rate in rates.items():
        try:
            year = int(date_str.split("-")[0])
        except (ValueError, IndexError):
            year = None
        if year in locked_years:
            continue
        cache["rates"]["USD"][date_str] = rate
        updated += 1

    _save_cache(cache)
    skipped = len(rates) - updated
    if skipped > 0:
        logger.info(f"Skipped {skipped} rates for locked years: {sorted(locked_years)}")
    return updated


def get_last_working_day_prev_month(d: date) -> date:
    """
    Get the last working day (Mon-Fri) of the month PRECEDING date d.
    Example: d = 2024-08-20 → last working day of July 2024
    """
    first_of_month = d.replace(day=1)
    last_of_prev = first_of_month - timedelta(days=1)
    # Walk backward to skip weekends
    while last_of_prev.weekday() >= 5:  # 5=Saturday, 6=Sunday
        last_of_prev -= timedelta(days=1)
    return last_of_prev


def get_sbi_tt_rate(d: date, overrides: dict = None) -> dict:
    """
    Get the SBI TT Buying Rate for the last working day of the month preceding date d.

    Args:
        d: The transaction/event date
        overrides: dict of manual overrides { "YYYY-MM-DD_USD": rate }

    Returns:
        dict with keys: rate, rate_date, source ("cache", "override", "not_found")
    """
    rate_date = get_last_working_day_prev_month(d)

    # Check manual overrides first
    override_key = f"{rate_date.isoformat()}_USD"
    if overrides and override_key in overrides:
        return {
            "rate": float(overrides[override_key]),
            "rate_date": rate_date.isoformat(),
            "source": "override",
        }

    # Look up in cache
    cache = _load_cache()
    currency_rates = cache.get("rates", {}).get("USD", {})

    # Try exact date, then walk backward up to 10 days
    for i in range(11):
        lookup_date = rate_date - timedelta(days=i)
        date_str = lookup_date.isoformat()
        if date_str in currency_rates:
            rate = currency_rates[date_str]
            if rate > 0:
                return {
                    "rate": rate,
                    "rate_date": date_str,
                    "source": "cache",
                }

    return {
        "rate": None,
        "rate_date": rate_date.isoformat(),
        "source": "not_found",
    }


def get_rate_for_date_direct(d: date) -> dict:
    """Get SBI TT rate for an exact date (without the prev-month logic). Used for display."""
    cache = _load_cache()
    currency_rates = cache.get("rates", {}).get("USD", {})

    for i in range(11):
        lookup_date = d - timedelta(days=i)
        date_str = lookup_date.isoformat()
        if date_str in currency_rates:
            rate = currency_rates[date_str]
            if rate > 0:
                return {"rate": rate, "rate_date": date_str, "source": "cache"}

    return {"rate": None, "rate_date": d.isoformat(), "source": "not_found"}


def get_all_cached_rates() -> dict:
    """Return all cached USD rates."""
    cache = _load_cache()
    return cache.get("rates", {}).get("USD", {})


def get_monthly_rates(year: int, overrides: dict = None) -> list:
    """
    Get the SBI TT rate applicable for each month of the given calendar year.

    For a transaction in month M, we use the rate on last working day of month M-1.
    So for Jan transactions, we use Dec (previous year) rate, etc.

    Returns list of 12 dicts:
    [
        {"month": 1, "month_name": "January", "rate_date": "...", "rate": ..., "source": "..."},
        ...
    ]
    """
    import calendar
    results = []
    month_names = list(calendar.month_name)[1:]  # Jan-Dec

    for month in range(1, 13):
        # For a transaction on the 15th of this month (arbitrary day)
        d = date(year, month, 15)
        rate_info = get_sbi_tt_rate(d, overrides)
        results.append({
            "month": month,
            "month_name": month_names[month - 1],
            "rate_date": rate_info["rate_date"],
            "rate": rate_info["rate"],
            "source": rate_info["source"],
        })

    return results


def save_manual_rate(rate_date: str, rate: float):
    """
    Save a manually entered rate into the cache.
    This is used when the GitHub CSV doesn't have data for a date.
    """
    cache = _load_cache()
    if "rates" not in cache:
        cache["rates"] = {}
    if "USD" not in cache["rates"]:
        cache["rates"]["USD"] = {}

    cache["rates"]["USD"][rate_date] = rate
    _save_cache(cache)
    logger.info(f"Saved manual rate: {rate_date} USD = {rate}")


# ===== Rate Locking =====

def lock_year_rates(year: int):
    """Lock all rates for a given year so fetch won't overwrite them."""
    cache = _load_cache()
    locked = set(cache.get("locked_years", []))
    locked.add(year)
    cache["locked_years"] = sorted(locked)
    _save_cache(cache)
    logger.info(f"Locked rates for year {year}")


def unlock_year_rates(year: int):
    """Unlock rates for a given year so fetch can update them."""
    cache = _load_cache()
    locked = set(cache.get("locked_years", []))
    locked.discard(year)
    cache["locked_years"] = sorted(locked)
    _save_cache(cache)
    logger.info(f"Unlocked rates for year {year}")


def is_year_locked(year: int) -> bool:
    """Check if rates for a given year are locked."""
    cache = _load_cache()
    return year in cache.get("locked_years", [])


def get_locked_years() -> list:
    """Return list of all locked years."""
    cache = _load_cache()
    return cache.get("locked_years", [])
