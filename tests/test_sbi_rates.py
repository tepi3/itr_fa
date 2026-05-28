
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
    # Mock pre-2020 rates to be empty for this test to avoid interference
    monkeypatch.setattr("core.sbi_rates._load_pre_2020_rates", lambda: {})
    
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
    
    # Write some mock cache data
    cache_data = {
        "rates": {
            "USD": {
                "2024-07-31": 83.50, # Post-2020
                "2010-01-31": 99.99, # Pre-2020 PDF override (original is 45.93)
                "2019-12-31": 75.00, # Pre-2020 override (original is 70.52)
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
    sbi_mock_file = tmp_path / "pre_2020_rates.json"
    rbi_mock_file = tmp_path / "rbi_reference_rates_2010_2019.json"
    
    sbi_mock_data = {
        "2010-01-31": 45.93,
        "2010-02-28": 45.51
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
        if filename == "pre_2020_rates.json":
            return sbi_mock_file
        if filename == "rbi_reference_rates_2010_2019.json":
            return rbi_mock_file
        return tmp_path / filename
        
    monkeypatch.setattr("core.sbi_rates._get_static_path", mock_get_static_path)
    
    # Mock _load_pre_2020_rates to return our mock SBI data
    monkeypatch.setattr("core.sbi_rates._load_pre_2020_rates", lambda: sbi_mock_data)
    
    # 3. Perform import
    count = normalize_and_import_rbi_rates()
    
    # Should only import "missing" rates
    # Missing rates: 2010-01-15, 2010-01-29, 2010-02-15, 2010-02-26
    assert count == 4
    
    cache = _load_cache()
    # Check values
    assert cache["rates"]["USD"]["2010-01-15"] == 45.23 # 45.67 - 0.44
    assert cache["rates"]["USD"]["2010-02-15"] == 45.66 # 46.38 - 0.72
    
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
    
    # 5. Verify clear cache resets rbi_USD
    clear_sbi_cache()
    cache_cleared = _load_cache()
    assert len(cache_cleared["rbi_USD"]) == 0



