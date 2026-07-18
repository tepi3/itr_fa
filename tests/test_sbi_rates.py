
import pytest
from datetime import date
from core.sbi_rates import get_last_day_prev_month, get_sbi_tt_rate, _save_cache, SBI_CACHE_FILE
import os
import json

def test_get_last_day_prev_month():
    # Regular month
    assert get_last_day_prev_month(date(2024, 8, 20)) == date(2024, 7, 31)
    # January (should go to Dec of prev year)
    assert get_last_day_prev_month(date(2024, 1, 15)) == date(2023, 12, 31)
    # Leap year Feb
    assert get_last_day_prev_month(date(2024, 3, 10)) == date(2024, 2, 29)
    # Non-leap year Feb
    assert get_last_day_prev_month(date(2023, 3, 10)) == date(2023, 2, 28)

def test_get_sbi_tt_rate_logic(tmp_path, monkeypatch):
    # Mock baseline rates to be empty for this test to avoid interference
    monkeypatch.setattr("core.sbi_rates._load_baseline_rates", lambda: {})
    
    # Setup a temporary cache file
    fake_cache_file = tmp_path / "sbi_cache.json"
    monkeypatch.setattr("core.sbi_rates.SBI_CACHE_FILE", fake_cache_file)
    
    cache_data = {
        "rates": {
            "USD": {
                "2024-07-31": 83.50,
                "2024-07-30": 83.45,
                "2024-07-28": 83.40, # Sunday
                "2024-07-27": 83.35, # Saturday
            }
        }
    }
    
    with open(fake_cache_file, "w") as f:
        json.dump(cache_data, f)
        
    # Case 1: Data available on the last day of prev month
    res = get_sbi_tt_rate(date(2024, 8, 20))
    assert res["rate"] == 83.50
    assert res["rate_date"] == "2024-07-31"
    
    # Case 2: Data NOT available on last day, should walk back
    # Let's remove 2024-07-31
    del cache_data["rates"]["USD"]["2024-07-31"]
    with open(fake_cache_file, "w") as f:
        json.dump(cache_data, f)
        
    res = get_sbi_tt_rate(date(2024, 8, 20))
    assert res["rate"] == 83.45
    assert res["rate_date"] == "2024-07-30"

    # Case 3: Data on weekend (July 28 2024 is Sunday)
    # The new logic should find it if it exists
    del cache_data["rates"]["USD"]["2024-07-30"]
    # 2024-07-29 is already missing from cache_data
    # 2024-07-28 is in cache
    with open(fake_cache_file, "w") as f:
        json.dump(cache_data, f)
        
    res = get_sbi_tt_rate(date(2024, 8, 20))
    assert res["rate"] == 83.40
    assert res["rate_date"] == "2024-07-28"


def test_clear_sbi_cache(tmp_path, monkeypatch):
    from core.sbi_rates import clear_sbi_cache, _load_cache
    fake_cache_file = tmp_path / "sbi_cache.json"
    monkeypatch.setattr("core.sbi_rates.SBI_CACHE_FILE", fake_cache_file)
    
    # Mock baseline rates to be something specific
    mock_baseline = {
        "2010-01-31": 45.93,
        "2019-12-31": 70.52
    }
    monkeypatch.setattr("core.sbi_rates._load_baseline_rates", lambda: mock_baseline)
    
    # Write some mock cache data
    cache_data = {
        "rates": {
            "USD": {
                "2024-07-31": 83.50, # Post-2020
                "2010-01-31": 99.99, # Pre-2020 PDF override
                "2019-12-31": 75.00, # Pre-2020 override
            }
        }
    }
    
    with open(fake_cache_file, "w") as f:
        json.dump(cache_data, f)
        
    # Before clear
    merged = _load_cache()
    # Check that override is active
    assert merged["rates"]["USD"]["2010-01-31"] == 99.99
    assert merged["rates"]["USD"]["2024-07-31"] == 83.50
    assert merged["rates"]["USD"]["2019-12-31"] == 75.00
    
    # Call clear
    clear_sbi_cache()
    
    # After clear
    merged_after = _load_cache()
    # Should restore shipped rates (45.93 for 2010-01-31, 70.52 for 2019-12-31)
    assert merged_after["rates"]["USD"]["2010-01-31"] == 45.93
    assert merged_after["rates"]["USD"]["2019-12-31"] == 70.52 # Restored from shipped
    # Should purge post-2020 rates
    assert "2024-07-31" not in merged_after["rates"]["USD"]


def test_normalize_and_import_rbi_rates(tmp_path, monkeypatch):
    from core.sbi_rates import normalize_and_import_rbi_rates, clear_sbi_cache, _load_cache
    
    # 1. Setup temporary cache file
    fake_cache_file = tmp_path / "sbi_cache.json"
    monkeypatch.setattr("core.sbi_rates.SBI_CACHE_FILE", fake_cache_file)
    
    # Write empty cache
    with open(fake_cache_file, "w") as f:
        json.dump({"rates": {"USD": {}}, "manual_USD": [], "rbi_USD": []}, f)
        
    # 2. Mock static files paths using monkeypatch
    sbi_mock_file = tmp_path / "sbi_baseline_rates.json"
    rbi_mock_file = tmp_path / "rbi_reference_rates.json"
    
    sbi_mock_data = {
        "2010-01-29": 45.93, # Matches last RBI date in Jan
        "2010-02-26": 45.51  # Matches last RBI date in Feb
    }
    with open(sbi_mock_file, "w") as f:
        json.dump(sbi_mock_data, f)
        
    rbi_mock_data = [
        {"date": "2010-01-15", "usd": 45.67},
        {"date": "2010-01-29", "usd": 46.37},
        {"date": "2010-02-15", "usd": 46.38},
        {"date": "2010-02-26", "usd": 46.23}
    ]
    with open(rbi_mock_file, "w") as f:
        json.dump(rbi_mock_data, f)
        
    def mock_get_static_path(filename):
        if filename == "data/sbi_baseline_rates.json":
            return sbi_mock_file
        if filename == "data/rbi_reference_rates.json":
            return rbi_mock_file
        return tmp_path / filename
        
    monkeypatch.setattr("core.sbi_rates._get_static_path", mock_get_static_path)
    
    # Mock _load_baseline_rates to return our mock SBI data
    monkeypatch.setattr("core.sbi_rates._load_baseline_rates", lambda: sbi_mock_data)
    
    # 3. Perform import
    count = normalize_and_import_rbi_rates()
    
    # Should only import "missing" rates
    # RBI has 4 dates. SBI has 2 dates (which are both in RBI).
    # So 2 dates are missing (2010-01-15 and 2010-02-15)
    assert count == 2
    
    cache = _load_cache()
    # Check values
    # Jan Delta: 46.37 - 45.93 = 0.44. Jan 15 RBI: 45.67 -> Normalized: 45.67 - 0.44 = 45.23
    assert cache["rates"]["USD"]["2010-01-15"] == 45.23 
    # Feb Delta: 46.23 - 45.51 = 0.72. Feb 15 RBI: 46.38 -> Normalized: 46.38 - 0.72 = 45.66
    assert cache["rates"]["USD"]["2010-02-15"] == 45.66 
    
    # Verify that rbi_USD is correctly populated
    assert "2010-01-15" in cache["rbi_USD"]
    assert "2010-02-15" in cache["rbi_USD"]
    
    # 4. Verify baseline protection:
    # If we add a manual override for "2010-01-15", it should not be overwritten on re-import
    cache["manual_USD"].append("2010-01-15")
    cache["rates"]["USD"]["2010-01-15"] = 99.99
    with open(fake_cache_file, "w") as f:
        json.dump(cache, f)
        
    # Re-import
    normalize_and_import_rbi_rates()
    cache_after = _load_cache()
    # Should remain 99.99
    assert cache_after["rates"]["USD"]["2010-01-15"] == 99.99


def test_normalize_and_import_rbi_rates_as_is(tmp_path, monkeypatch):
    from core.sbi_rates import normalize_and_import_rbi_rates, _load_cache
    
    # 1. Setup temporary cache file
    fake_cache_file = tmp_path / "sbi_cache.json"
    monkeypatch.setattr("core.sbi_rates.SBI_CACHE_FILE", fake_cache_file)
    
    # Write empty cache
    with open(fake_cache_file, "w") as f:
        json.dump({"rates": {"USD": {}}, "manual_USD": [], "rbi_USD": []}, f)
        
    # 2. Mock static files paths using monkeypatch
    sbi_mock_file = tmp_path / "sbi_baseline_rates.json"
    rbi_mock_file = tmp_path / "rbi_reference_rates.json"
    
    sbi_mock_data = {
        "2010-01-29": 45.93,
        "2010-02-26": 45.51
    }
    with open(sbi_mock_file, "w") as f:
        json.dump(sbi_mock_data, f)
        
    rbi_mock_data = [
        {"date": "2010-01-15", "usd": 45.67},
        {"date": "2010-01-29", "usd": 46.37},
        {"date": "2010-02-15", "usd": 46.38},
        {"date": "2010-02-26", "usd": 46.23}
    ]
    with open(rbi_mock_file, "w") as f:
        json.dump(rbi_mock_data, f)
        
    def mock_get_static_path(filename):
        if filename == "data/sbi_baseline_rates.json":
            return sbi_mock_file
        if filename == "data/rbi_reference_rates.json":
            return rbi_mock_file
        return tmp_path / filename
        
    monkeypatch.setattr("core.sbi_rates._get_static_path", mock_get_static_path)
    monkeypatch.setattr("core.sbi_rates._load_baseline_rates", lambda: sbi_mock_data)
    
    # 3. Perform import as-is (normalize=False)
    count = normalize_and_import_rbi_rates(normalize=False)
    
    # Should still import the 2 missing rates
    assert count == 2
    
    cache = _load_cache()
    # Check values - should be imported exactly as-is from rbi_mock_data
    # 2010-01-15 RBI: 45.67 -> As-is: 45.67
    assert cache["rates"]["USD"]["2010-01-15"] == 45.67
    # 2010-02-15 RBI: 46.38 -> As-is: 46.38
    assert cache["rates"]["USD"]["2010-02-15"] == 46.38
    
    # Verify that rbi_USD is correctly populated
    assert "2010-01-15" in cache["rbi_USD"]
    assert "2010-02-15" in cache["rbi_USD"]
def test_refresh_cache_modes(tmp_path, monkeypatch):
    from core.sbi_rates import refresh_cache, _load_cache
    fake_cache_file = tmp_path / "sbi_cache.json"
    monkeypatch.setattr("core.sbi_rates.SBI_CACHE_FILE", fake_cache_file)
    
    # Mock baseline rates to be empty
    monkeypatch.setattr("core.sbi_rates._load_baseline_rates", lambda: {})
    
    # Mock download_sbi_csv to return some fixed rates
    mock_fetched_rates = {
        "2024-01-01": 83.10,
        "2024-01-02": 83.20,
        "2024-01-03": 83.30
    }
    monkeypatch.setattr("core.sbi_rates.download_sbi_csv", lambda: mock_fetched_rates)
    
    # Setup initial cache with:
    # - a manual rate (2024-01-01)
    # - an RBI fallback rate (2024-01-02)
    # - a missing rate (2024-01-03)
    initial_cache = {
        "rates": {
            "USD": {
                "2024-01-01": 99.99, # Manual
                "2024-01-02": 83.00, # RBI
            }
        },
        "manual_USD": ["2024-01-01"],
        "rbi_USD": ["2024-01-02"]
    }
    with open(fake_cache_file, "w") as f:
        json.dump(initial_cache, f)
        
    # 1. Test Missing Mode (overwrite=False)
    refresh_cache(overwrite=False)
    cache = _load_cache()
    
    # Should leave manual untouched
    assert cache["rates"]["USD"]["2024-01-01"] == 99.99
    assert "2024-01-01" in cache["manual_USD"]
    
    # Should overwrite RBI rate
    assert cache["rates"]["USD"]["2024-01-02"] == 83.20
    assert "2024-01-02" not in cache["rbi_USD"]
    
    # Should fill missing rate
    assert cache["rates"]["USD"]["2024-01-03"] == 83.30
    
    # 2. Test Overwrite Mode (overwrite=True)
    # Reset cache first
    with open(fake_cache_file, "w") as f:
        json.dump(initial_cache, f)
        
    refresh_cache(overwrite=True)
    cache = _load_cache()
    
    # Should overwrite EVERYTHING
    assert cache["rates"]["USD"]["2024-01-01"] == 83.10
    assert "2024-01-01" not in cache["manual_USD"]
    
    assert cache["rates"]["USD"]["2024-01-02"] == 83.20
    assert "2024-01-02" not in cache["rbi_USD"]
    
    assert cache["rates"]["USD"]["2024-01-03"] == 83.30

def test_sbi_fetch_overwrites_rbi_even_in_missing_mode(tmp_path, monkeypatch):
    from core.sbi_rates import refresh_cache, _load_cache
    fake_cache_file = tmp_path / "sbi_cache.json"
    monkeypatch.setattr("core.sbi_rates.SBI_CACHE_FILE", fake_cache_file)
    
    # Mock baseline rates to be empty
    monkeypatch.setattr("core.sbi_rates._load_baseline_rates", lambda: {})
    
    # Mock download_sbi_csv to return a fresh official rate for a date that currently has RBI rate
    mock_fetched_rates = {
        "2024-01-02": 83.50 # Fresh official rate
    }
    monkeypatch.setattr("core.sbi_rates.download_sbi_csv", lambda: mock_fetched_rates)
    
    # Setup initial cache with an RBI rate for 2024-01-02
    initial_cache = {
        "rates": {
            "USD": {
                "2024-01-02": 83.00, # Old RBI rate
            }
        },
        "manual_USD": [],
        "rbi_USD": ["2024-01-02"]
    }
    with open(fake_cache_file, "w") as f:
        json.dump(initial_cache, f)
        
    # Run refresh_cache in Missing Mode (overwrite=False)
    refresh_cache(overwrite=False)
    
    cache = _load_cache()
    # It SHOULD have overwritten the RBI rate with the official SBI rate
    assert cache["rates"]["USD"]["2024-01-02"] == 83.50
    # And it should no longer be tagged as RBI
    assert "2024-01-02" not in cache["rbi_USD"]


def test_parse_sbi_ratekeeper_csv_skips_zero_rates():
    from core.sbi_rates import parse_sbi_csv_rates

    csv_text = """DATE,PDF FILE,TT BUY,TT SELL,BILL BUY
2020-01-04 09:00,file.pdf,0.00,0.00,71.29
2020-01-06 09:00,file.pdf,71.65,72.50,71.59
2020-01-07 09:00,file.pdf,71.32,72.17,71.26
"""

    rates = parse_sbi_csv_rates(csv_text)

    assert rates == {
        "2020-01-06": 71.65,
        "2020-01-07": 71.32,
    }


def test_import_sbi_rates_from_csv_writes_official_cache(tmp_path, monkeypatch):
    from core.sbi_rates import import_sbi_rates_from_csv, _load_cache

    fake_cache_file = tmp_path / "sbi_cache.json"
    monkeypatch.setattr("core.sbi_rates.SBI_CACHE_FILE", fake_cache_file)
    monkeypatch.setattr("core.sbi_rates._load_baseline_rates", lambda: {})

    csv_text = """DATE,PDF FILE,TT BUY,TT SELL
2024-07-30 09:00,file.pdf,83.45,84.20
2024-07-31 09:00,file.pdf,83.50,84.25
"""

    imported = import_sbi_rates_from_csv(csv_text)
    cache = _load_cache()

    assert imported == 2
    assert cache["rates"]["USD"] == {
        "2024-07-30": 83.45,
        "2024-07-31": 83.50,
    }
    assert cache["manual_USD"] == []
    assert cache["rbi_USD"] == []


def test_get_rbi_max_year_month(tmp_path, monkeypatch):
    from core.sbi_rates import get_rbi_max_year_month
    import json
    
    rbi_mock_file = tmp_path / "rbi_reference_rates.json"
    rbi_mock_data = [
        {"date": "2010-01-15", "usd": 45.67},
        {"date": "2010-03-20", "usd": 46.12},
        {"date": "2010-02-15", "usd": 46.38},
        {"date": "2010-03-25", "usd": None} # Should ignore None
    ]
    with open(rbi_mock_file, "w") as f:
        json.dump(rbi_mock_data, f)
        
    monkeypatch.setattr("core.sbi_rates._get_static_path", lambda f: rbi_mock_file)
    
    y, m = get_rbi_max_year_month()
    assert y == 2010
    assert m == 3



