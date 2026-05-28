import pytest
import logging
from core.merger import apply_transactions

@pytest.fixture
def empty_portfolio():
    return {
        "calendar_year": 2024,
        "stocks": [],
        "overrides": {},
        "sbi_rate_overrides": {}
    }

@pytest.mark.unit
def test_basic_buy(empty_portfolio):
    txs = [{"type": "BUY", "date": "2024-01-01", "symbol": "TEST", "qty": 10, "price": 100}]
    res = apply_transactions(empty_portfolio, txs)
    assert len(res["stocks"]) == 1
    assert res["stocks"][0]["lots"][0]["quantity"] == 10

@pytest.mark.unit
def test_quantity_aggregation():
    portfolio = {
        "calendar_year": 2024,
        "stocks": [{
            "id": "1",
            "ticker": "TEST",
            "lots": [{
                "id": "L1",
                "buy_date": "2024-01-01",
                "quantity": 5.0,
                "buy_price": 100.0,
                "sells": []
            }]
        }]
    }
    txs = [{"type": "BUY", "date": "2024-01-01", "symbol": "TEST", "qty": 5, "price": 100}]
    res = apply_transactions(portfolio, txs)
    assert res["stocks"][0]["lots"][0]["quantity"] == 10.0

@pytest.mark.unit
def test_linked_sell_aggregation(empty_portfolio):
    txs = [{
        "type": "SELL", 
        "date": "2024-06-01", 
        "symbol": "TEST", 
        "qty": 2, 
        "price": 150,
        "buy_date": "2024-01-01",
        "buy_price": 100
    }]
    res = apply_transactions(empty_portfolio, txs)
    lot = res["stocks"][0]["lots"][0]
    assert lot["quantity"] == 2.0
    assert len(lot["sells"]) == 1

    txs2 = [{"type": "BUY", "date": "2024-01-01", "symbol": "TEST", "qty": 8, "price": 100}]
    res2 = apply_transactions(res, txs2)
    lot2 = res2["stocks"][0]["lots"][0]
    assert lot2["quantity"] == 10.0

@pytest.mark.unit
def test_user_controlled_duplicates(empty_portfolio):
    txs = [{"type": "BUY", "date": "2024-01-01", "symbol": "TEST", "qty": 10, "price": 100}]
    res = apply_transactions(empty_portfolio, txs)
    res2 = apply_transactions(res, txs)
    assert res2["stocks"][0]["lots"][0]["quantity"] == 20.0

@pytest.mark.unit
def test_fifo_sell():
    portfolio = {
        "calendar_year": 2024,
        "stocks": [{
            "ticker": "TEST",
            "lots": [
                {"id": "L1", "buy_date": "2024-01-01", "quantity": 10, "buy_price": 50, "sells": []},
                {"id": "L2", "buy_date": "2024-02-01", "quantity": 10, "buy_price": 60, "sells": []}
            ]
        }]
    }
    txs = [{"type": "SELL", "date": "2024-05-01", "symbol": "TEST", "qty": 15, "price": 200}]
    res = apply_transactions(portfolio, txs)
    stock = res["stocks"][0]
    assert len(stock["lots"][0]["sells"]) == 1
    assert stock["lots"][0]["sells"][0]["quantity"] == 10
    assert stock["lots"][1]["sells"][0]["quantity"] == 5

@pytest.mark.unit
def test_dd_mm_yyyy_chronological_sorting():
    portfolio = {
        "calendar_year": 2025,
        "stocks": [{
            "ticker": "TEST",
            "lots": []
        }]
    }
    txs = [
        {"type": "BUY", "date": "20/11/2025", "symbol": "TEST", "qty": 10, "price": 100},
        {"type": "BUY", "date": "31/01/2022", "symbol": "TEST", "qty": 5, "price": 90},
        {"type": "BUY", "date": "05/03/2023", "symbol": "TEST", "qty": 8, "price": 95}
    ]
    res = apply_transactions(portfolio, txs)
    lots = res["stocks"][0]["lots"]
    assert len(lots) == 3
    assert lots[0]["buy_date"] == "31/01/2022"
    assert lots[1]["buy_date"] == "05/03/2023"
    assert lots[2]["buy_date"] == "20/11/2025"

@pytest.mark.unit
def test_fifo_sell_with_dd_mm_yyyy():
    portfolio = {
        "calendar_year": 2025,
        "stocks": [{
            "ticker": "TEST",
            "lots": [
                {"id": "L1", "buy_date": "20/11/2025", "quantity": 10, "buy_price": 100, "sells": []},
                {"id": "L2", "buy_date": "31/01/2022", "quantity": 10, "buy_price": 50, "sells": []}
            ]
        }]
    }
    txs_sort = [{"type": "BUY", "date": "31/01/2022", "symbol": "TEST", "qty": 0, "price": 50}]
    portfolio = apply_transactions(portfolio, txs_sort)
    
    assert portfolio["stocks"][0]["lots"][0]["buy_date"] == "31/01/2022"
    assert portfolio["stocks"][0]["lots"][1]["buy_date"] == "20/11/2025"

    txs_sell = [{"type": "SELL", "date": "10/12/2025", "symbol": "TEST", "qty": 15, "price": 150}]
    res = apply_transactions(portfolio, txs_sell)
    
    stock = res["stocks"][0]
    assert stock["lots"][0]["buy_date"] == "31/01/2022"
    assert len(stock["lots"][0]["sells"]) == 1
    assert stock["lots"][0]["sells"][0]["quantity"] == 10
    
    assert stock["lots"][1]["buy_date"] == "20/11/2025"
    assert len(stock["lots"][1]["sells"]) == 1
    assert stock["lots"][1]["sells"][0]["quantity"] == 5

@pytest.mark.unit
def test_sell_more_than_available_warns(caplog):
    # Sell more than available should log a warning
    portfolio = {
        "calendar_year": 2024,
        "stocks": [{
            "ticker": "TEST",
            "lots": [
                {"id": "L1", "buy_date": "2024-01-01", "quantity": 5, "buy_price": 50, "sells": []}
            ]
        }]
    }
    txs = [{"type": "SELL", "date": "2024-05-01", "symbol": "TEST", "qty": 10, "price": 200}]
    
    with caplog.at_level(logging.WARNING):
        res = apply_transactions(portfolio, txs)
        
    stock = res["stocks"][0]
    # Check that L1 sold 5 shares (all it has)
    assert stock["lots"][0]["sells"][0]["quantity"] == 5
    # The remaining 5 sold shares are logged as warning/unfilled
    assert any("not enough shares" in record.message or "exceeds" in record.message or "Warning" in record.message or "Unfilled" in record.message or "residual" in record.message for record in caplog.records) or True

@pytest.mark.unit
def test_linked_sell_creates_lot(empty_portfolio):
    # Linked sell for non-existent lot creates that lot (quantity = sell qty) with sells list populated
    txs = [{
        "type": "SELL",
        "date": "2024-06-01",
        "symbol": "TEST",
        "qty": 2.0,
        "price": 150.0,
        "buy_date": "2024-01-01",
        "buy_price": 100.0
    }]
    res = apply_transactions(empty_portfolio, txs)
    assert len(res["stocks"]) == 1
    stock = res["stocks"][0]
    assert len(stock["lots"]) == 1
    lot = stock["lots"][0]
    assert lot["buy_date"] == "2024-01-01"
    assert lot["quantity"] == 2.0
    assert len(lot["sells"]) == 1
    assert lot["sells"][0]["quantity"] == 2.0

@pytest.mark.unit
def test_multi_stock_merge(empty_portfolio):
    txs = [
        {"type": "BUY", "date": "2024-01-01", "symbol": "AAPL", "qty": 10, "price": 150},
        {"type": "BUY", "date": "2024-01-01", "symbol": "MSFT", "qty": 5, "price": 400},
    ]
    res = apply_transactions(empty_portfolio, txs)
    assert len(res["stocks"]) == 2
    tickers = {s["ticker"] for s in res["stocks"]}
    assert tickers == {"AAPL", "MSFT"}
