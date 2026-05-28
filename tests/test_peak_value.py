import pytest
from datetime import date, timedelta
from core.calculator import calculate_peak_value
import json

def test_calculate_peak_value_lookback_flag(tmp_path, monkeypatch):
    """
    Test that peak value correctly identifies lookback rates and flags is_lookback.
    """
    # 1. Setup Mock SBI Rates
    # We want a peak on 2024-05-15.
    # We will have a rate for 2024-05-10 (5 days diff -> should trigger lookback warning)
    # And a rate for 2024-05-12 (3 days diff -> should NOT trigger lookback warning)
    fake_cache_file = tmp_path / "sbi_cache.json"
    monkeypatch.setattr("core.sbi_rates.SBI_CACHE_FILE", fake_cache_file)
    
    # Mock prices: peak is on May 15
    mock_prices = [
        {"date": "2024-05-14", "close": 100.0},
        {"date": "2024-05-15", "close": 150.0}, # Peak USD
        {"date": "2024-05-16", "close": 100.0},
    ]
    monkeypatch.setattr("core.calculator.get_historical_prices", lambda ticker, start, end: mock_prices)

    lot = {
        "id": "test_lot",
        "buy_date": "2024-01-01",
        "quantity": 10,
        "buy_price": 50.0,
        "sells": []
    }

    # Scenario A: Rate is 5 days old (Lookback >= 4 under old logic, >= 5 under new logic)
    cache_data_a = {
        "rates": {
            "USD": {
                "2024-05-10": 80.0,
                "2024-05-16": 80.0,
            }
        }
    }
    with open(fake_cache_file, "w") as f:
        json.dump(cache_data_a, f)

    res_a = calculate_peak_value(lot, [], "AAPL", 2024, {}, mode='split')
    assert res_a["peak_date"] == "2024-05-15"
    assert res_a["is_lookback"] is True # 15th - 10th = 5 days
    assert res_a["rate_date"] == "2024-05-10"

    # Scenario B: Rate is 3 days old (Lookback < 5)
    cache_data_b = {
        "rates": {
            "USD": {
                "2024-05-12": 80.0,
                "2024-05-16": 80.0,
            }
        }
    }
    with open(fake_cache_file, "w") as f:
        json.dump(cache_data_b, f)

    res_b = calculate_peak_value(lot, [], "AAPL", 2024, {}, mode='split')
    assert res_b["peak_date"] == "2024-05-15"
    assert res_b["is_lookback"] is False # 15th - 12th = 3 days
    assert res_b["rate_date"] == "2024-05-12"

    # Scenario C: Rate is 4 days old (Lookback < 5 under new 5-day logic)
    cache_data_c = {
        "rates": {
            "USD": {
                "2024-05-11": 80.0,
                "2024-05-16": 80.0,
            }
        }
    }
    with open(fake_cache_file, "w") as f:
        json.dump(cache_data_c, f)

    res_c = calculate_peak_value(lot, [], "AAPL", 2024, {}, mode='split')
    assert res_c["peak_date"] == "2024-05-15"
    assert res_c["is_lookback"] is False # 15th - 11th = 4 days
    assert res_c["rate_date"] == "2024-05-11"

def test_calculate_peak_value_inr_dominance(tmp_path, monkeypatch):
    """
    Test that peak is chosen based on INR value, not just USD price.
    """
    fake_cache_file = tmp_path / "sbi_cache.json"
    monkeypatch.setattr("core.sbi_rates.SBI_CACHE_FILE", fake_cache_file)
    
    # Day 1: $100 * 80 INR = 8000 INR
    # Day 2: $90  * 90 INR = 8100 INR (Peak INR)
    mock_prices = [
        {"date": "2024-05-14", "close": 100.0},
        {"date": "2024-05-15", "close": 90.0},
    ]
    monkeypatch.setattr("core.calculator.get_historical_prices", lambda ticker, start, end: mock_prices)

    cache_data = {
        "rates": {
            "USD": {
                "2024-05-14": 80.0,
                "2024-05-15": 90.0,
            }
        }
    }
    with open(fake_cache_file, "w") as f:
        json.dump(cache_data, f)

    lot = {"id": "test_lot", "buy_date": "2024-01-01", "quantity": 1, "buy_price": 50.0}
    res = calculate_peak_value(lot, [], "AAPL", 2024, {}, mode='split')
    
    assert res["peak_date"] == "2024-05-15"
    assert res["value"] == 8100
