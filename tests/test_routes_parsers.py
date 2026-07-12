import pytest
import json
from io import BytesIO

@pytest.mark.unit
def test_api_merge_transactions(client, sample_portfolio):
    txs = [
        {"type": "BUY", "date": "2024-01-01", "symbol": "AAPL", "qty": 5.0, "price": 180.0}
    ]
    res = client.post("/api/merge", json={
        "portfolio": sample_portfolio,
        "transactions": txs
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    # Initial AAPL lots were 2, now should be 3
    assert len(data["portfolio"]["stocks"][0]["lots"]) == 3

@pytest.mark.unit
def test_api_import_previous_year(client, sample_portfolio):
    # Save a portfolio for CY2023
    sample_portfolio["calendar_year"] = 2023
    client.post("/api/save?username=ImportUser", json=sample_portfolio)
    
    # Import from CY2023 to CY2024
    res = client.post("/api/import-previous-year?username=ImportUser", json={
        "source_year": 2023,
        "target_year": 2024
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["portfolio"]["calendar_year"] == 2024
    # AAPL has lot 1 (50 qty, 20 sold -> 30 remains) and lot 2 (30 qty, 0 sold -> 30 remains)
    # Both should be carried forward
    assert len(data["portfolio"]["stocks"][0]["lots"]) == 2
    assert data["portfolio"]["stocks"][0]["lots"][0]["quantity"] == 30.0

@pytest.mark.unit
def test_upload_etrade_mocked(client, sample_portfolio, monkeypatch):
    # Mock etrade processing to return simple transactions
    monkeypatch.setattr("routes.parsers.process_etrade_files", lambda b, n, g, target_year: {
        "transactions": [
            {"symbol": "AAPL", "type": "BUY", "date": "15/01/2024", "price": 185.0, "qty": 10.0}
        ],
        "skipped_count": 0
    })
    
    data = {
        "etradeFile": (BytesIO(b"dummy holdings csv content"), "etrade_holdings.csv"),
        "portfolio": json.dumps(sample_portfolio)
    }
    
    res = client.post("/api/upload-etrade", data=data, content_type="multipart/form-data")
    assert res.status_code == 200
    res_json = res.get_json()
    assert res_json["success"] is True
    assert len(res_json["transactions"]) == 1
    assert res_json["transactions"][0]["symbol"] == "AAPL"

@pytest.mark.unit
def test_upload_etrade_no_holdings_only_gnl(client, sample_portfolio, monkeypatch):
    # Mock etrade processing to verify it receives empty bytes for holdings
    received_bytes = None
    def mock_process(et_bytes, et_name, gnl_files_data, target_year):
        nonlocal received_bytes
        received_bytes = et_bytes
        return {
            "transactions": [
                {"symbol": "TSLA", "type": "SELL", "date": "20/01/2024", "price": 210.0, "qty": 5.0}
            ],
            "skipped_count": 0
        }
    monkeypatch.setattr("routes.parsers.process_etrade_files", mock_process)
    
    data = {
        "sellFiles": (BytesIO(b"dummy gnl csv content"), "etrade_gnl.csv"),
        "portfolio": json.dumps(sample_portfolio)
    }
    
    res = client.post("/api/upload-etrade", data=data, content_type="multipart/form-data")
    assert res.status_code == 200
    res_json = res.get_json()
    assert res_json["success"] is True
    assert len(res_json["transactions"]) == 1
    assert res_json["transactions"][0]["symbol"] == "TSLA"
    assert received_bytes == b""

@pytest.mark.unit
def test_upload_etrade_missing_both_fails(client, sample_portfolio):
    data = {
        "portfolio": json.dumps(sample_portfolio)
    }
    res = client.post("/api/upload-etrade", data=data, content_type="multipart/form-data")
    assert res.status_code == 400
    res_json = res.get_json()
    assert "error" in res_json
    assert "At least one Holdings (ByStatus) or Gain & Loss file is required" in res_json["error"]

@pytest.mark.unit
def test_upload_ibkr_mocked(client, sample_portfolio, monkeypatch):
    # Mock ibkr processing
    monkeypatch.setattr("routes.parsers.process_ibkr_files", lambda files, cy: {
        "transactions": [
            {"symbol": "TSLA", "type": "BUY", "date": "15/01/2024", "price": 200.0, "qty": 5.0}
        ],
        "skipped_count": 0
    })
    
    data = {
        "file": (BytesIO(b"dummy ibkr csv content"), "ibkr.csv"),
        "portfolio": json.dumps(sample_portfolio)
    }
    
    res = client.post("/api/upload-ibkr", data=data, content_type="multipart/form-data")
    assert res.status_code == 200
    res_json = res.get_json()
    assert res_json["success"] is True
    assert len(res_json["transactions"]) == 1
    assert res_json["transactions"][0]["symbol"] == "TSLA"


@pytest.mark.unit
def test_upload_vested_mocked(client, sample_portfolio, monkeypatch):
    # Mock vested processing
    monkeypatch.setattr("routes.parsers.process_vested_files", lambda files, cy: {
        "transactions": [
            {"symbol": "MSFT", "type": "BUY", "date": "15/01/2024", "price": 400.0, "qty": 8.0}
        ],
        "skipped_count": 0,
        "unmatched_sells": []
    })
    
    data = {
        "file": (BytesIO(b"dummy excel contents"), "vested.xlsx"),
        "portfolio": json.dumps(sample_portfolio)
    }
    
    res = client.post("/api/upload-vested", data=data, content_type="multipart/form-data")
    assert res.status_code == 200
    res_json = res.get_json()
    assert res_json["success"] is True
    assert len(res_json["transactions"]) == 1
    assert res_json["transactions"][0]["symbol"] == "MSFT"

@pytest.mark.unit
def test_upload_fidelity_mocked(client, sample_portfolio, monkeypatch):
    # Mock fidelity processing
    monkeypatch.setattr("routes.parsers.process_fidelity_files", lambda open_b, open_n, closed_b, closed_n, ticker, target_year: {
        "transactions": [
            {"symbol": "MSFT", "type": "BUY", "date": "15/01/2024", "price": 400.0, "qty": 8.0, "lot_id": "open_0", "lot_type": "espp", "original_price": 340.0, "fmv_price": 400.0}
        ],
        "skipped_count": 0
    })
    
    data = {
        "openLotsFile": (BytesIO(b"dummy open lots csv"), "open.csv"),
        "closedLotsFile": (BytesIO(b"dummy closed lots csv"), "closed.csv"),
        "ticker": "MSFT",
        "portfolio": json.dumps(sample_portfolio)
    }
    
    res = client.post("/api/upload-fidelity", data=data, content_type="multipart/form-data")
    assert res.status_code == 200
    res_json = res.get_json()
    assert res_json["success"] is True
    assert len(res_json["transactions"]) == 1
    assert res_json["transactions"][0]["symbol"] == "MSFT"
    assert res_json["transactions"][0]["lot_id"] == "open_0"

@pytest.mark.unit
def test_upload_fidelity_missing_open_lots_fails(client, sample_portfolio):
    data = {
        "ticker": "MSFT",
        "portfolio": json.dumps(sample_portfolio)
    }
    res = client.post("/api/upload-fidelity", data=data, content_type="multipart/form-data")
    assert res.status_code == 400
    res_json = res.get_json()
    assert "error" in res_json
    assert "Open Lots CSV file is required" in res_json["error"]

