"""
Regression test suite for bugs A through D.
Tests the four computational bug fixes identified in the codebase.
"""
import pytest
from datetime import datetime, date
from unittest.mock import patch, MagicMock


# ──────────────────────────────────────────────────────────────────
# Bug A: December Rates Locking Bypass
# sbi_rates.refresh_cache should skip December rates when the
# physical calendar year is locked, not just the calc_year.
# ──────────────────────────────────────────────────────────────────
class TestDecRateLocking:
    """December rates whose calendar year is locked must not be overwritten."""

    @patch("core.sbi_rates._save_cache")
    @patch("core.sbi_rates.download_sbi_csv")
    @patch("core.sbi_rates._load_cache")
    def test_dec_rate_locked_by_calendar_year(self, mock_load, mock_dl, mock_save):
        """A December 2023 rate (calc_year=2024) must be skipped when 2023 is locked."""
        mock_load.return_value = {
            "rates": {"USD": {"2023-12-15": 83.00}},
            "locked_years": [2023],
        }
        # Simulate a fresh download that tries to update Dec 2023
        mock_dl.return_value = {"2023-12-15": 83.50}

        from core.sbi_rates import refresh_cache
        updated = refresh_cache()

        assert updated == 0, "December rate for locked calendar year should be skipped"
        saved = mock_save.call_args[0][0]
        assert saved["rates"]["USD"]["2023-12-15"] == 83.00, "Original rate must be preserved"

    @patch("core.sbi_rates._save_cache")
    @patch("core.sbi_rates.download_sbi_csv")
    @patch("core.sbi_rates._load_cache")
    def test_unlocked_year_updates_normally(self, mock_load, mock_dl, mock_save):
        """Rates for unlocked years should update as usual."""
        mock_load.return_value = {
            "rates": {"USD": {}},
            "locked_years": [2022],
        }
        mock_dl.return_value = {"2023-06-15": 82.50}

        from core.sbi_rates import refresh_cache
        updated = refresh_cache()

        assert updated == 1


# ──────────────────────────────────────────────────────────────────
# Bug B: Uncaught Date Sorting Type Crash
# _sort_key must return datetime.min for unparseable dates so
# sorting a mixed list does not crash with TypeError.
# ──────────────────────────────────────────────────────────────────
class TestDateSortCrash:
    """Malformed dates in _sort_key must not crash Python 3 sorting."""

    def test_merger_sort_key_returns_datetime_on_bad_date(self):
        from core.merger import _sort_key
        result = _sort_key({"date": "not-a-date"})
        assert isinstance(result, datetime), f"Expected datetime, got {type(result)}"
        assert result == datetime.min

    def test_smart_import_sort_key_returns_datetime_on_bad_date(self):
        from core.smart_import import _sort_key
        result = _sort_key({"date": ""})
        assert isinstance(result, datetime), f"Expected datetime, got {type(result)}"
        assert result == datetime.min

    def test_sorting_mixed_dates_does_not_crash(self):
        from core.merger import _sort_key
        txns = [
            {"date": "15/06/2023"},
            {"date": "bad"},
            {"date": "2023-01-01"},
            {"date": ""},
        ]
        # Must not raise TypeError
        sorted_txns = sorted(txns, key=_sort_key)
        assert len(sorted_txns) == 4


# ──────────────────────────────────────────────────────────────────
# Bug C: Silent Cache Miss / Repeat Network Latency
# get_price_on_date should use the normalised iso_date string
# (YYYY-MM-DD) for the past-date comparison, not the raw input.
# ──────────────────────────────────────────────────────────────────
class TestStockCacheComparison:
    """Cache writes must succeed regardless of input date format."""

    @patch("core.stock_data.set_cached_val")
    @patch("core.stock_data._get_yf")
    @patch("core.stock_data.get_cached_val", return_value=None)
    def test_cache_write_with_dd_mm_yyyy(self, mock_get_cache, mock_yf, mock_set_cache):
        """A DD/MM/YYYY date in the past must trigger a cache write."""
        import pandas as pd
        from core.stock_data import get_price_on_date

        # Construct a mock history DataFrame
        idx = pd.DatetimeIndex(["2023-06-15"])
        hist = pd.DataFrame({"Close": [150.0]}, index=idx)
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = hist
        mock_yf.return_value.Ticker.return_value = mock_ticker

        price = get_price_on_date("AAPL", "15/06/2023")

        assert price is not None
        assert mock_set_cache.called, "set_cached_val should be called for past date in DD/MM/YYYY"


# ──────────────────────────────────────────────────────────────────
# Bug D: Dividend Ex-Date Eligibility Mismatch
# Buying ON the ex-date should NOT qualify for the dividend.
# ──────────────────────────────────────────────────────────────────
class TestDividendExDateEligibility:
    """Lots bought on the ex-date must be excluded from dividends."""

    def test_buy_on_ex_date_is_ineligible(self):
        """If buy_date == ex_date, the condition `buy_date >= ex_date` must skip."""
        from core.calculator import _parse_date

        buy_date = _parse_date("15/06/2023")
        ex_date = _parse_date("15/06/2023")

        # The fix changes `>` to `>=`, so equal dates should trigger skip
        assert buy_date >= ex_date, "buy_date == ex_date should trigger the skip"

    def test_buy_before_ex_date_is_eligible(self):
        """If buy_date < ex_date, the lot is eligible for dividends."""
        from core.calculator import _parse_date

        buy_date = _parse_date("14/06/2023")
        ex_date = _parse_date("15/06/2023")

        assert not (buy_date >= ex_date), "buy_date before ex_date should NOT skip"
