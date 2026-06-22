import pytest
import json

@pytest.fixture(autouse=True)
def mock_stock_data(monkeypatch):
    monkeypatch.setattr("core.calculator.get_historical_prices", lambda ticker, s, e: [{"date": "2024-01-15", "close": 150.0}])
    monkeypatch.setattr("core.calculator.get_price_on_date", lambda ticker, date_str: 150.0)

@pytest.mark.unit
def test_calculate_endpoint(client, sample_portfolio, full_2024_sbi_rates, sbi_cache):
    sbi_cache(full_2024_sbi_rates)
    res = client.post("/api/calculate", json=sample_portfolio)
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "rows" in data
    assert len(data["rows"]) > 0

@pytest.mark.unit
def test_calculate_empty_portfolio(client):
    res = client.post("/api/calculate", json={"calendar_year": 2024, "stocks": []})
    assert res.status_code == 200
    assert res.get_json()["success"] is True
    assert len(res.get_json()["rows"]) == 0

@pytest.mark.unit
def test_tax_year_summary(client, sample_portfolio, full_2024_sbi_rates, sbi_cache):
    sbi_cache(full_2024_sbi_rates)
    res = client.post("/api/tax-year-summary", json=sample_portfolio)
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "tax_years" in data
    assert "prev" in data["tax_years"]
    assert "curr" in data["tax_years"]

@pytest.mark.unit
def test_sell_helper_simulate(client, sbi_cache):
    sbi_cache({
        "2024-06-30": 82.50,
        "2024-07-15": 83.00,
        "2024-07-31": 83.50,
        "2024-08-20": 84.00
    })
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
    res = client.post("/api/sell-helper/simulate", json=payload)
    assert res.status_code == 200
    assert res.get_json()["success"] is True

@pytest.mark.unit
def test_export_csv_endpoint(client, sample_a3_rows):
    res = client.post("/api/export-csv", json={"calendar_year": 2024, "rows": sample_a3_rows})
    assert res.status_code == 200
    assert res.headers["Content-Type"] == "text/csv; charset=utf-8"
    assert "attachment" in res.headers["Content-Disposition"]

@pytest.mark.unit
def test_consolidated_tax_summary(client, sample_portfolio, full_2024_sbi_rates, sbi_cache, monkeypatch):
    sbi_cache(full_2024_sbi_rates)
    
    sample_portfolio["calendar_year"] = 2024
    client.post("/api/save?username=ConsolidatedUser", json=sample_portfolio)
    
    sample_portfolio["calendar_year"] = 2025
    client.post("/api/save?username=ConsolidatedUser", json=sample_portfolio)
    
    res = client.post("/api/consolidated-tax-summary", json={
        "fy_start_year": 2024,
        "username": "ConsolidatedUser"
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["consolidated"]["fy_start_year"] == 2024
    assert data["consolidated"]["has_cy_start"] is True
    assert data["consolidated"]["has_cy_end"] is True
    
    offset = data["consolidated"]["offset"]
    assert "net_stcg_quarters" in offset
    assert "net_ltcg_quarters" in offset
    assert offset["net_stcg_quarters"]["total"] == offset["net_stcg"]
    assert offset["net_ltcg_quarters"]["total"] == offset["net_ltcg"]
