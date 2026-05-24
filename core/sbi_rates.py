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


def _load_pre_2020_rates() -> dict:
    """Load the shipped pre-2020 rates database."""
    pre_2020_file = Path(__file__).parent / "pre_2020_rates.json"
    if pre_2020_file.exists():
        try:
            with open(pre_2020_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load pre-2020 rates: {e}")
    return {}


def _load_cache() -> dict:
    """Load cached SBI rates from disk and merge with shipped pre-2020 rates."""
    cache = {}
    if SBI_CACHE_FILE.exists():
        try:
            with open(SBI_CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load SBI cache: {e}")
            cache = {}

    if "rates" not in cache:
        cache["rates"] = {}
    if "USD" not in cache["rates"]:
        cache["rates"]["USD"] = {}

    # Merge shipped rates as base, cache rates on disk overwrite them (precedence)
    pre_2020 = _load_pre_2020_rates()
    merged_usd = {}
    for d_str, val in pre_2020.items():
        merged_usd[d_str] = val
    merged_usd.update(cache["rates"]["USD"])
    cache["rates"]["USD"] = merged_usd

    return cache


def _save_cache(cache: dict):
    """Save SBI rates cache to disk."""
    SBI_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SBI_CACHE_FILE, "w", encoding="utf-8") as f:
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


def refresh_cache(overwrite: bool = True):
    """Download fresh SBI USD rates and update the cache. Respects locked years and user overrides."""
    cache = _load_cache()
    if "rates" not in cache:
        cache["rates"] = {}
    if "USD" not in cache["rates"]:
        cache["rates"]["USD"] = {}
    if "manual_USD" not in cache:
        cache["manual_USD"] = []

    locked_years = set(cache.get("locked_years", []))
    rates = download_sbi_csv()

    # Load raw user cache to check if a rate date is overridden by the user
    user_cache = {}
    if SBI_CACHE_FILE.exists():
        try:
            with open(SBI_CACHE_FILE, "r", encoding="utf-8") as f:
                user_cache = json.load(f)
        except Exception:
            pass
    user_rates = user_cache.get("rates", {}).get("USD", {})
    manual_usd = set(user_cache.get("manual_USD", []))

    # Only update rates for unlocked years
    updated = 0
    for date_str, rate in rates.items():
        try:
            # Parse date to determine which calculation year it belongs to
            # Rates from Jan-Nov belong to the current year
            # Rates from Dec belong to Jan of the NEXT year
            y, m, d = map(int, date_str.split("-"))
            calc_year = y + 1 if m == 12 else y
        except (ValueError, IndexError):
            calc_year = None
            
        if calc_year in locked_years or y in locked_years:
            continue
            
        # Overwrite protection: if overwrite is False, do NOT overwrite user manual edits
        if not overwrite and date_str in manual_usd:
            continue
            
        cache["rates"]["USD"][date_str] = rate
        # If we are overwriting with a fetched rate, it is no longer "manual"
        if date_str in manual_usd:
            manual_usd.discard(date_str)
        updated += 1

    cache["manual_USD"] = sorted(list(manual_usd))
    _save_cache(cache)
    skipped = len(rates) - updated
    if skipped > 0:
        logger.info(f"Skipped {skipped} rates for locked years or user overrides.")
    return updated


def get_last_day_prev_month(d: date) -> date:
    """
    Get the last day of the month PRECEDING date d.
    Example: d = 2024-08-20 → last day of July 2024 (2024-07-31)
    """
    first_of_month = d.replace(day=1)
    last_of_prev = first_of_month - timedelta(days=1)
    return last_of_prev


def get_sbi_tt_rate(d: date, overrides: dict = None, use_event_date: bool = False) -> dict:
    """
    Get the SBI TT Buying Rate for a given date.

    Args:
        d: The transaction/event date
        overrides: dict of manual overrides { "YYYY-MM-DD_USD": rate }
        use_event_date: If True, use rate on date 'd'. If False, use last day of prev month.

    Returns:
        dict with keys: rate, rate_date, source ("cache", "override", "not_found")
    """
    if use_event_date:
        # A3 (day of event rate): reverse traverse to nearest date
        # Lookback Limit: Stop searching if we reach past the 4th day from the end of the preceding month
        last_day_prev = get_last_day_prev_month(d)
        limit_date = last_day_prev - timedelta(days=3) # Last 4 days of prev month starts here

        cache = _load_cache()
        currency_rates = cache.get("rates", {}).get("USD", {})
        manual_usd = set(cache.get("manual_USD", []))

        lookup_date = d
        while lookup_date >= limit_date:
            # Check manual overrides first (local portfolio overrides)
            override_key = f"{lookup_date.isoformat()}_USD"
            if overrides and override_key in overrides:
                return {
                    "rate": float(overrides[override_key]),
                    "rate_date": lookup_date.isoformat(),
                    "source": "override",
                }

            # Check cache
            date_str = lookup_date.isoformat()
            if date_str in currency_rates:
                rate = currency_rates[date_str]
                if rate > 0:
                    source = "override" if date_str in manual_usd else "cache"
                    return {
                        "rate": rate,
                        "rate_date": date_str,
                        "source": source,
                    }
            lookup_date -= timedelta(days=1)

        return {
            "rate": None,
            "rate_date": d.isoformat(),
            "source": "not_found",
        }
    else:
        # Tax (last working day of preceding month, with a strict 4-day lookback)
        last_day_prev = get_last_day_prev_month(d)

        cache = _load_cache()
        currency_rates = cache.get("rates", {}).get("USD", {})
        manual_usd = set(cache.get("manual_USD", []))

        # Walk backward up to 4 days from the last day of preceding month
        # Rule 115: Use rate on last day of preceding month. 
        # If not available, we look back up to 4 days.
        for i in range(4):
            lookup_date = last_day_prev - timedelta(days=i)
            # Check manual overrides first (local portfolio overrides)
            override_key = f"{lookup_date.isoformat()}_USD"
            if overrides and override_key in overrides:
                return {
                    "rate": float(overrides[override_key]),
                    "rate_date": lookup_date.isoformat(),
                    "source": "override",
                }

            # Check cache
            date_str = lookup_date.isoformat()
            if date_str in currency_rates:
                rate = currency_rates[date_str]
                if rate > 0:
                    source = "override" if date_str in manual_usd else "cache"
                    return {
                        "rate": rate,
                        "rate_date": date_str,
                        "source": source,
                    }

        return {
            "rate": None,
            "rate_date": last_day_prev.isoformat(),
            "source": "not_found",
        }


def get_rate_for_date_direct(d: date) -> dict:
    """Get SBI TT rate for an exact date (without the prev-month logic). Used for display."""
    cache = _load_cache()
    currency_rates = cache.get("rates", {}).get("USD", {})
    manual_usd = set(cache.get("manual_USD", []))

    for i in range(11):
        lookup_date = d - timedelta(days=i)
        date_str = lookup_date.isoformat()
        if date_str in currency_rates:
            rate = currency_rates[date_str]
            if rate > 0:
                source = "override" if date_str in manual_usd else "cache"
                return {"rate": rate, "rate_date": date_str, "source": source}

    return {"rate": None, "rate_date": d.isoformat(), "source": "not_found"}


def get_all_cached_rates() -> dict:
    """Return the full cache structure (for exporting)."""
    cache = _load_cache()
    # Ensure manual_USD exists in the returned dict
    if "manual_USD" not in cache:
        cache["manual_USD"] = []
    return cache


def get_monthly_rates(year: int, overrides: dict = None) -> list:
    """
    Get the SBI TT rate applicable for each month of the given calendar year.

    For a transaction in month M, we use the rate on last day of month M-1.
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
    If the rate matches the baseline (shipped or fetched), remove the manual override tag.
    """
    cache = _load_cache()
    if "rates" not in cache:
        cache["rates"] = {}
    if "USD" not in cache["rates"]:
        cache["rates"]["USD"] = {}
    if "manual_USD" not in cache:
        cache["manual_USD"] = []

    # Get baseline to see if this is actually an override
    # We temporary remove the manual tag to see what the 'natural' rate would be
    original_manual = set(cache.get("manual_USD", []))
    if rate_date in original_manual:
        cache["manual_USD"] = [d for d in cache["manual_USD"] if d != rate_date]
    
    # Reload baseline without this specific manual override
    pre_2020 = _load_pre_2020_rates()
    # Note: we don't reload the whole cache because we want to compare with 
    # what would be there if THIS date wasn't manual.
    # Fetched rates from GitHub are in cache["rates"]["USD"]
    
    baseline_rate = pre_2020.get(rate_date)
    # If not in pre_2020, check if we have a fetched rate in the disk cache 
    # (that isn't our current manual entry)
    # This is tricky because the disk cache currently stores the manual entry too.
    # However, for now, we can check if the value matches.
    
    is_restoring_baseline = (baseline_rate is not None and abs(baseline_rate - rate) < 0.0001)

    cache["rates"]["USD"][rate_date] = rate
    
    if is_restoring_baseline:
        if rate_date in original_manual:
            logger.info(f"Restored baseline rate for {rate_date}: {rate}. Removing override tag.")
            # manual_USD already has it removed from the check above
    else:
        if rate_date not in original_manual:
            cache["manual_USD"].append(rate_date)
            cache["manual_USD"].sort()
        logger.info(f"Saved manual rate override: {rate_date} USD = {rate}")

    _save_cache(cache)


def ensure_rates_cached():
    """Check if cache is empty and fetch if so. Used for first-start auto-fetch."""
    cache = _load_cache()
    rates = cache.get("rates", {}).get("USD", {})
    if not rates:
        logger.info("SBI rate cache is empty. Performing initial fetch...")
        try:
            refresh_cache()
        except Exception as e:
            logger.error(f"Initial SBI rate fetch failed: {e}")


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


def get_daily_rates(year: int, month: int) -> dict:
    """
    Get SBI TT daily rates for a selected calendar year and month.
    Returns: { "YYYY-MM-DD": { "rate": float or None, "source": "cache" | "override" | "not_found" } }
    """
    import calendar
    # 1. Load the merged cache (includes pre-2020 + user overrides)
    merged_cache = _load_cache()
    merged_rates = merged_cache.get("rates", {}).get("USD", {})

    # 2. Load the raw user cache (to identify actual user overrides)
    user_cache = {}
    if SBI_CACHE_FILE.exists():
        try:
            with open(SBI_CACHE_FILE, "r", encoding="utf-8") as f:
                user_cache = json.load(f)
        except Exception:
            pass
    user_rates = user_cache.get("rates", {}).get("USD", {})

    # 3. Load pre-2020 base rates to distinguish "shipped" vs "override"
    pre_2020 = _load_pre_2020_rates()
    manual_usd = set(user_cache.get("manual_USD", []))

    _, num_days = calendar.monthrange(year, month)
    daily = {}
    for day in range(1, num_days + 1):
        d = date(year, month, day)
        d_str = d.isoformat()
        if d_str in merged_rates:
            rate = merged_rates[d_str]
            
            # Source logic:
            # 1. If it is in manual_usd, it is 'override' (Yellow)
            # 2. If it is not in manual_usd but is in pre_2020, it is 'shipped' (Green)
            # 3. Otherwise, it is 'cache' (Fetched from GitHub, Green)
            source = "cache"
            if d_str in manual_usd:
                source = "override"
            elif d_str in pre_2020:
                source = "shipped"
            else:
                source = "cache"

            daily[d_str] = {
                "rate": rate,
                "source": source
            }
        else:
            daily[d_str] = {
                "rate": None,
                "source": "not_found"
            }
    return daily


def clear_sbi_cache():
    """
    Clear all manual and fetched SBI rates from the disk cache.
    This purges all post-2020 rates, resets pre-2020 PDF rates to default,
    and removes any custom pre-2020 rates.
    """
    cache = {}
    if SBI_CACHE_FILE.exists():
        try:
            with open(SBI_CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load SBI cache: {e}")
            cache = {}

    if "rates" not in cache:
        cache["rates"] = {}
    cache["rates"]["USD"] = {}
    cache["manual_USD"] = []
    _save_cache(cache)
    logger.info("Cleared all SBI rate cache overrides and fetched rates from disk.")

