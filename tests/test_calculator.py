import pytest
from datetime import date
import json
from core.calculator import simulate_sell_impact

def test_simulate_sell_impact_dual_proceeds(tmp_path, monkeypatch):
    # Setup temporary cache file for SBI rates
    fake_cache_file = tmp_path / "sbi_cache.json"
    monkeypatch.setattr("core.sbi_rates.SBI_CACHE_FILE", fake_cache_file)
    
    # We populate rates for:
    # - Buy date actual: 2024-07-15 -> 83.00
    # - Buy date Rule 115 (prev month last day): 2024-06-30 -> 82.50
    # - Sell date actual: 2024-08-20 -> 84.00
    # - Sell date Rule 115 (prev month last day): 2024-07-31 -> 83.50
    cache_data = {
        "rates": {
            "USD": {
                "2024-06-30": 82.50,
                "2024-07-15": 83.00,
                "2024-07-31": 83.50,
                "2024-08-20": 84.00
            }
        }
    }
    
    with open(fake_cache_file, "w") as f:
        json.dump(cache_data, f)

    payload = {
        "calendar_year": 2024,
        "sbi_rate_overrides": {},
        "simulated_sells": [
            {
                "ticker": "AAPL",
                "lot_id": "lot_aapl_1",
                "buy_date": "2024-07-15",
                "buy_price": 100.0,
                "sell_qty": 10.0,
                "sell_price": 120.0,
                "sell_date": "2024-08-20"
            }
        ]
    }

    result = simulate_sell_impact(payload)
    
    assert "sells" in result
    assert len(result["sells"]) == 1
    
    sell_res = result["sells"][0]
    
    # Rule 115 (Taxable):
    # Buy rate (Rule 115): last day of prev month for buy_date (2024-07-15) is 2024-06-30 -> 82.50
    # Buy cost (Tax) = 100.0 * 10 * 82.50 = 82500
    # Sell rate (Rule 115): last day of prev month for sell_date (2024-08-20) is 2024-07-31 -> 83.50
    # Proceeds (Tax) = 120.0 * 10 * 83.50 = 100200
    # Gain (Tax) = Proceeds (Tax) - Buy Cost (Tax) = 100200 - 82500 = 17700
    assert sell_res["sell_proceeds_inr"] == 100200
    assert sell_res["buy_cost_inr"] == 82500
    assert sell_res["gain_inr"] == 17700
    assert sell_res["ttbr_buy"] == 82.50
    assert sell_res["ttbr_sell"] == 83.50

    # Actual (Event Date):
    # Buy rate (Actual): 2024-07-15 -> 83.00
    # Buy cost (Actual) = 100.0 * 10 * 83.00 = 83000
    # Sell rate (Actual): 2024-08-20 -> 84.00
    # Proceeds (Actual) = 120.0 * 10 * 84.00 = 100800
    # Gain (Actual) = Proceeds (Actual) - Buy Cost (Actual) = 100800 - 83000 = 17800
    assert sell_res["sell_proceeds_actual_inr"] == 100800
    assert sell_res["buy_cost_actual_inr"] == 83000
    assert sell_res["gain_actual_inr"] == 17800
    assert sell_res["ttbr_buy_actual"] == 83.00
    assert sell_res["ttbr_sell_actual"] == 84.00

    # Totals:
    # Since holding period is < 730 days (July to August), it is STCG.
    assert result["totals"]["stcg"] == 17700
    assert result["total_proceeds_tax_inr"] == 100200
    assert result["total_proceeds_actual_inr"] == 100800
