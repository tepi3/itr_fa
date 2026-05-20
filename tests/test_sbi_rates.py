
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
