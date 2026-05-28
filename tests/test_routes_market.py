import pytest
import json

@pytest.fixture(autouse=True)
def mock_stock_data_endpoints(monkeypatch):
    """Mock all yfinance/external methods to ensure route tests run fully offline."""
    monkeypatch.setattr("routes.market.get_historical_prices", lambda ticker, s, e: [{"date": "2024-01-15", "close": 150.0}])
    monkeypatch.setattr("routes.market.get_company_info", lambda ticker: {"name": "Test Company", "ticker": ticker})
    monkeypatch.setattr("routes.market.get_price_on_date", lambda ticker, date_str: 155.0)
    monkeypatch.setattr("routes.market.get_dividends", lambda ticker, year: [])
    monkeypatch.setattr("routes.market.has_dividends", lambda ticker: False)
    monkeypatch.setattr("routes.market.get_yearly_max_price", lambda ticker, year: {"max_price": 200.0, "max_price_date": "2024-06-01"})
    monkeypatch.setattr("routes.market.get_live_price", lambda ticker: {"price": 160.0})

@pytest.mark.unit
def test_ticker_history(client):
    res = client.get("/api/ticker-history?ticker=AAPL")
    assert res.status_code == 200
    assert res.get_json()["ticker"] == "AAPL"

@pytest.mark.unit
def test_lookup_stock(client):
    res = client.post("/api/lookup-stock", json={"ticker": "AAPL"})
    assert res.status_code == 200
    assert res.get_json()["name"] == "Test Company"

@pytest.mark.unit
def test_stock_price(client):
    res = client.get("/api/stock-price?ticker=AAPL&date=2024-01-15")
    assert res.status_code == 200
    assert res.get_json()["price"] == 155.0

@pytest.mark.unit
def test_dividends(client):
    res = client.get("/api/dividends?ticker=AAPL&year=2024")
    assert res.status_code == 200
    assert "dividends" in res.get_json()

@pytest.mark.unit
def test_yearly_max_price(client):
    res = client.get("/api/yearly-max-price?ticker=AAPL&year=2024")
    assert res.status_code == 200
    assert res.get_json()["max_price"] == 200.0

@pytest.mark.unit
def test_live_price(client):
    res = client.get("/api/live-price?ticker=AAPL")
    assert res.status_code == 200
    assert res.get_json()["price"] == 160.0

@pytest.mark.unit
def test_sbi_rate_lookup(client, sbi_cache):
    sbi_cache({"2024-06-30": 83.50})
    res = client.get("/api/sbi-rate?date=2024-07-31")
    assert res.status_code == 200
    assert res.get_json()["rate"] == 83.50

@pytest.mark.unit
def test_save_manual_rate(client, tmp_data_dir):
    res = client.post("/api/save-manual-rate", json={"rate_date": "2024-07-31", "rate": 83.75})
    assert res.status_code == 200
    assert res.get_json()["success"] is True
    
    # Verify manual rate is returned in list
    res_list = client.get("/api/get-all-rates")
    assert res_list.status_code == 200
    data = res_list.get_json()
    assert len(data["manual_USD"]) > 0

@pytest.mark.unit
def test_monthly_rates(client, sbi_cache):
    sbi_cache({"2024-07-31": 83.50})
    res = client.get("/api/monthly-rates?year=2024")
    assert res.status_code == 200
    assert res.get_json()["success"] is True

@pytest.mark.unit
def test_daily_rates(client, sbi_cache):
    sbi_cache({"2024-07-31": 83.50})
    res = client.get("/api/daily-rates?year=2024&month=7")
    assert res.status_code == 200
    assert res.get_json()["success"] is True

@pytest.mark.unit
def test_lock_unlock_rates(client, tmp_data_dir):
    # Lock year
    res_lock = client.post("/api/lock-rates", json={"year": 2024})
    assert res_lock.status_code == 200
    assert res_lock.get_json()["success"] is True
    
    # Check locked list
    res_list = client.get("/api/locked-years")
    assert 2024 in res_list.get_json()["locked_years"]
    
    # Unlock year
    res_unlock = client.post("/api/unlock-rates", json={"year": 2024})
    assert res_unlock.status_code == 200
    assert res_unlock.get_json()["success"] is True

@pytest.mark.unit
def test_sbi_cache_status_empty(client, tmp_data_dir):
    res = client.get("/api/sbi-cache-status")
    assert res.status_code == 200
    assert res.get_json()["empty"] is True

@pytest.mark.unit
def test_import_export_rates(client, tmp_data_dir):
    payload = {
        "rates": {
            "USD": {
                "2024-07-31": 83.50
            }
        },
        "manual_USD": [],
        "rbi_USD": ["2012-05-15"],
        "locked_years": []
    }
    
    # Import
    res_import = client.post("/api/import-sbi-rates", json=payload)
    assert res_import.status_code == 200
    
    # Export
    res_export = client.get("/api/export-sbi-rates")
    assert res_export.status_code == 200
    exported = res_export.get_json()["data"]
    assert exported["rates"]["USD"]["2024-07-31"] == 83.50
    assert "2012-05-15" in exported["rbi_USD"]


@pytest.mark.unit
def test_api_import_rbi_rates(client, monkeypatch):
    # Mock normalize_and_import_rbi_rates to return 42
    monkeypatch.setattr("routes.market.normalize_and_import_rbi_rates", lambda: 42)
    
    res = client.post("/api/import-rbi-rates")
    assert res.status_code == 200
    assert res.get_json()["success"] is True
    assert res.get_json()["imported"] == 42
