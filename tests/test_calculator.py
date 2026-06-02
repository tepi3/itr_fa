import pytest
import json
from datetime import date
from core.calculator import (
    simulate_sell_impact,
    calculate_a3_rows,
    calculate_tax_year_summary,
    calculate_current_balance,
    compute_offset_summary,
)

@pytest.mark.unit
def test_simulate_sell_impact_dual_proceeds(tmp_path, monkeypatch):
    fake_cache_file = tmp_path / "sbi_cache.json"
    monkeypatch.setattr("core.sbi_rates.SBI_CACHE_FILE", fake_cache_file)
    
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
    assert sell_res["sell_proceeds_inr"] == 100200
    assert sell_res["buy_cost_inr"] == 82500
    assert sell_res["gain_inr"] == 17700
    assert sell_res["ttbr_buy"] == 82.50
    assert sell_res["ttbr_sell"] == 83.50

    assert sell_res["sell_proceeds_actual_inr"] == 100800
    assert sell_res["buy_cost_actual_inr"] == 83000
    assert sell_res["gain_actual_inr"] == 17800
    assert sell_res["ttbr_buy_actual"] == 83.00
    assert sell_res["ttbr_sell_actual"] == 84.00

    assert result["totals"]["stcg"] == 17700
    assert result["total_proceeds_tax_inr"] == 100200
    assert result["total_proceeds_actual_inr"] == 100800

@pytest.mark.unit
def test_calculate_a3_rows_basic(sbi_cache, sample_portfolio, full_2024_sbi_rates, monkeypatch):
    sbi_cache(full_2024_sbi_rates)
    
    mock_prices = [
        {"date": "2023-06-20", "close": 170.0},
    ]
    monkeypatch.setattr("core.calculator.get_historical_prices", lambda ticker, start, end: mock_prices)
    
    sample_portfolio["stocks"][0]["lots"] = [sample_portfolio["stocks"][0]["lots"][1]]
    sample_portfolio["stocks"] = [sample_portfolio["stocks"][0]]
    
    res = calculate_a3_rows(sample_portfolio)
    assert "rows" in res
    assert len(res["rows"]) == 1
    row = res["rows"][0]
    assert row["ticker"] == "AAPL"
    # Initial value = qty (30) * buy_price (170) * SBI TTBR for buy event date (2023-06-20 -> 82.55) = 421005
    assert row["initial_value"] == 421005

@pytest.mark.unit
def test_calculate_a3_rows_with_sell(sbi_cache, sample_portfolio, full_2024_sbi_rates, monkeypatch):
    sbi_cache(full_2024_sbi_rates)
    
    mock_prices = [
        {"date": "2022-01-15", "close": 150.0},
        {"date": "2024-05-10", "close": 180.0},
    ]
    monkeypatch.setattr("core.calculator.get_historical_prices", lambda ticker, start, end: mock_prices)
    
    sample_portfolio["stocks"][0]["lots"] = [sample_portfolio["stocks"][0]["lots"][0]]
    sample_portfolio["stocks"] = [sample_portfolio["stocks"][0]]
    
    res = calculate_a3_rows(sample_portfolio)
    assert len(res["rows"]) == 1
    row = res["rows"][0]
    assert row["ticker"] == "AAPL"
    # Sale proceeds = qty (20) * sell_price (180) * sell rate event date (2024-05-10 -> 83.35) = 20 * 180 * 83.35 = 300060
    assert row["sale_proceeds"] == 300060

    # Verify actual buy TT rate and date in sale_entries breakdown for XIRR calculation
    sales_details = row["calculation_details"]["sales"]
    assert len(sales_details["sale_entries"]) == 1
    sell_entry = sales_details["sale_entries"][0]
    assert sell_entry["buy_ttbr_actual"] == 74.55
    assert sell_entry["buy_rate_actual_date"] == "2022-01-15"

@pytest.mark.unit
def test_calculate_a3_rows_multi_stock(sbi_cache, sample_portfolio, full_2024_sbi_rates, monkeypatch):
    sbi_cache(full_2024_sbi_rates)
    monkeypatch.setattr("core.calculator.get_historical_prices", lambda ticker, start, end: [{"date": "2024-01-15", "close": 150.0}])
    
    res = calculate_a3_rows(sample_portfolio)
    assert len(res["rows"]) == 3
    tickers = {r["ticker"] for r in res["rows"]}
    assert tickers == {"AAPL", "TSLA"}

@pytest.mark.unit
def test_calculate_tax_year_summary_stcg(sbi_cache, sample_portfolio, full_2024_sbi_rates, monkeypatch):
    sbi_cache(full_2024_sbi_rates)
    monkeypatch.setattr("core.calculator.get_historical_prices", lambda ticker, start, end: [{"date": "2024-01-15", "close": 150.0}])
    
    sample_portfolio["stocks"][0]["lots"] = [
        {
            "id": "lot_stcg",
            "buy_date": "20/06/2023",
            "quantity": 10.0,
            "buy_price": 100.0,
            "sells": [
                {
                    "id": "sell_stcg",
                    "sell_date": "15/01/2024",
                    "quantity": 10.0,
                    "sell_price": 150.0,
                }
            ]
        }
    ]
    sample_portfolio["stocks"] = [sample_portfolio["stocks"][0]]
    
    res = calculate_tax_year_summary(sample_portfolio)
    totals_prev = res["tax_years"]["prev"]["totals"]
    assert totals_prev["stcg"]["total"] > 0
    assert totals_prev["ltcg"]["total"] == 0

@pytest.mark.unit
def test_calculate_tax_year_summary_ltcg(sbi_cache, sample_portfolio, full_2024_sbi_rates, monkeypatch):
    sbi_cache(full_2024_sbi_rates)
    monkeypatch.setattr("core.calculator.get_historical_prices", lambda ticker, start, end: [{"date": "2024-01-15", "close": 150.0}])
    
    sample_portfolio["stocks"][0]["lots"] = [sample_portfolio["stocks"][0]["lots"][0]]
    sample_portfolio["stocks"] = [sample_portfolio["stocks"][0]]
    
    res = calculate_tax_year_summary(sample_portfolio)
    totals_curr = res["tax_years"]["curr"]["totals"]
    assert totals_curr["ltcg"]["total"] > 0
    assert totals_curr["stcg"]["total"] == 0

@pytest.mark.unit
def test_calculate_tax_year_summary_dividends(sbi_cache, sample_portfolio, full_2024_sbi_rates, monkeypatch):
    sbi_cache(full_2024_sbi_rates)
    monkeypatch.setattr("core.calculator.get_historical_prices", lambda ticker, start, end: [{"date": "2024-01-15", "close": 150.0}])
    
    res = calculate_tax_year_summary(sample_portfolio)
    assert res["tax_years"]["prev"]["totals"]["dividends"]["total"] > 0
    assert res["tax_years"]["curr"]["totals"]["dividends"]["total"] > 0

@pytest.mark.unit
def test_calculate_current_balance(sbi_cache, sample_portfolio, full_2024_sbi_rates, monkeypatch):
    from datetime import date as dt_date
    today_str = dt_date.today().isoformat()
    # Ensure today's rate exists in SBI cache
    rates = {**full_2024_sbi_rates, today_str: 83.50}
    sbi_cache(rates)
    
    monkeypatch.setattr("core.calculator.get_price_on_date", lambda ticker, date_str: 200.0)
    
    res = calculate_current_balance(sample_portfolio)
    assert "snapshot_date" in res
    assert "stock_balances" in res
    balances = {b["entity_name"]: b["balance_inr"] for b in res["stock_balances"]}
    assert len(balances) == 2

@pytest.mark.unit
def test_compute_offset_summary():
    tax_years = {
        "prev": {
            "totals": {
                "stcg": {"total": 50000},
                "stcl": {"total": 20000},
                "ltcg": {"total": 80000},
                "ltcl": {"total": 10000},
            }
        },
        "curr": {
            "totals": {
                "stcg": {"total": 10000},
                "stcl": {"total": 30000},
                "ltcg": {"total": 50000},
                "ltcl": {"total": 10000},
            }
        }
    }
    
    res = compute_offset_summary(tax_years)
    
    offset_prev = res["prev"]["offset"]
    assert offset_prev["net_stcg"] == 30000
    assert offset_prev["net_ltcg"] == 70000
    assert offset_prev["stcl_carry_forward"] == 0
    assert offset_prev["ltcl_carry_forward"] == 0
    
    offset_curr = res["curr"]["offset"]
    assert offset_curr["net_stcg"] == 0
    assert offset_curr["net_ltcg"] == 20000
    assert offset_curr["stcl_vs_stcg"] == 10000
    assert offset_curr["stcl_vs_ltcg"] == 20000
    assert offset_curr["ltcl_vs_ltcg"] == 10000
    assert offset_curr["stcl_carry_forward"] == 0
    assert offset_curr["ltcl_carry_forward"] == 0


@pytest.mark.unit
def test_calculate_a3_rows_prev_year_closing(sbi_cache, sample_portfolio, full_2024_sbi_rates, monkeypatch):
    # Setup rates including 2023-12-31 rate
    rates = {**full_2024_sbi_rates, "2023-12-31": 83.15}
    sbi_cache(rates)
    
    # Mock stock close price for previous year's Dec 31
    monkeypatch.setattr("core.calculator.get_price_on_date", lambda ticker, date_str: 155.50 if "2023-12-31" in date_str else 180.0)
    
    sample_portfolio["calendar_year"] = 2024
    # Lot 0 is AAPL bought in 2022 (pre-existing relative to 2024)
    sample_portfolio["stocks"][0]["lots"] = [sample_portfolio["stocks"][0]["lots"][0]]
    sample_portfolio["stocks"] = [sample_portfolio["stocks"][0]]
    
    res = calculate_a3_rows(sample_portfolio)
    assert len(res["rows"]) == 1
    row = res["rows"][0]
    calc_details = row["calculation_details"]
    assert "prev_year_closing" in calc_details
    prev_close = calc_details["prev_year_closing"]
    assert prev_close is not None
    assert prev_close["close_price"] == 155.50
    assert prev_close["rate"] == 83.15
    assert prev_close["rate_date"] == "2023-12-31"

