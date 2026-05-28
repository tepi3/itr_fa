import pytest
import json

@pytest.mark.unit
def test_save_and_load(client, sample_portfolio):
    # Save a portfolio
    res_save = client.post("/api/save?username=TestUser", json=sample_portfolio)
    assert res_save.status_code == 200
    save_data = res_save.get_json()
    assert save_data["success"] is True
    assert "portfolio_CY2024.json" in save_data["filename"]
    
    # Load the same portfolio
    res_load = client.get("/api/load?year=2024&username=TestUser")
    assert res_load.status_code == 200
    load_data = res_load.get_json()
    assert load_data["success"] is True
    assert load_data["portfolio"]["calendar_year"] == 2024

@pytest.mark.unit
def test_save_invalid_data(client):
    res = client.post("/api/save", json={"invalid_key": "data"})
    assert res.status_code == 400
    assert "Invalid portfolio data" in res.get_json()["error"]

@pytest.mark.unit
def test_load_missing_year(client):
    res = client.get("/api/load?year=9999")
    assert res.status_code == 404
    assert res.get_json()["found"] is False

@pytest.mark.unit
def test_list_saves(client, sample_portfolio):
    # Ensure there are no saves initially
    res_empty = client.get("/api/list-saves?username=ListUser")
    assert len(res_empty.get_json()["saves"]) == 0
    
    # Save a portfolio
    client.post("/api/save?username=ListUser", json=sample_portfolio)
    
    res_list = client.get("/api/list-saves?username=ListUser")
    assert res_list.status_code == 200
    saves = res_list.get_json()["saves"]
    assert len(saves) == 1
    assert saves[0]["year"] == 2024

@pytest.mark.unit
def test_current_balance(client, sample_portfolio, monkeypatch):
    monkeypatch.setattr("core.calculator.get_price_on_date", lambda ticker, date_str: 150.0)
    
    res = client.post("/api/current-balance", json=sample_portfolio)
    assert res.status_code == 200
    res_data = res_save = res.get_json()
    assert res_data["success"] is True
    assert "snapshot_date" in res_data
