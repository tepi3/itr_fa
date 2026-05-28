import pytest
from core.smart_import import group_and_deduplicate_transactions

@pytest.fixture
def base_portfolio():
    return {
        "calendar_year": 2024,
        "stocks": [
            {
                "ticker": "AAPL",
                "lots": [
                    {
                        "id": "lot_aapl_1",
                        "buy_date": "15/01/2024",
                        "quantity": 10.0,
                        "buy_price": 150.0,
                        "sells": [
                            {
                                "id": "sell_aapl_1",
                                "sell_date": "20/02/2024",
                                "quantity": 3.0,
                                "sell_price": 160.0,
                            }
                        ]
                    }
                ]
            }
        ]
    }

@pytest.mark.unit
def test_group_and_deduplicate_empty():
    assert group_and_deduplicate_transactions([], {}) == []
    assert group_and_deduplicate_transactions(None, {}) == []

@pytest.mark.unit
def test_new_stock_marked_new(base_portfolio):
    txs = [
        {"symbol": "MSFT", "type": "BUY", "date": "10/01/2024", "price": 400.0, "qty": 5.0}
    ]
    result = group_and_deduplicate_transactions(txs, base_portfolio)
    assert len(result) == 1
    assert result[0]["import_status"] == "NEW"
    assert result[0]["qty"] == 5.0

@pytest.mark.unit
def test_exact_duplicate_detected(base_portfolio):
    # Buy matches AAPL lot exactly (date, price, qty)
    txs_buy = [
        {"symbol": "AAPL", "type": "BUY", "date": "15/01/2024", "price": 150.0, "qty": 10.0}
    ]
    res_buy = group_and_deduplicate_transactions(txs_buy, base_portfolio)
    assert len(res_buy) == 1
    assert res_buy[0]["import_status"] == "DUPLICATE"

    # Sell matches AAPL sell exactly (date, price, qty)
    txs_sell = [
        {"symbol": "AAPL", "type": "SELL", "date": "20/02/2024", "price": 160.0, "qty": 3.0}
    ]
    res_sell = group_and_deduplicate_transactions(txs_sell, base_portfolio)
    assert len(res_sell) == 1
    assert res_sell[0]["import_status"] == "DUPLICATE"

@pytest.mark.unit
def test_partial_update_delta(base_portfolio):
    # Document has 15 shares, portfolio has 10 shares
    txs = [
        {"symbol": "AAPL", "type": "BUY", "date": "15/01/2024", "price": 150.0, "qty": 15.0}
    ]
    result = group_and_deduplicate_transactions(txs, base_portfolio)
    assert len(result) == 1
    assert result[0]["import_status"] == "UPDATE"
    assert result[0]["original_qty"] == 15.0
    assert result[0]["qty"] == 5.0  # Delta to import (15 - 10)

@pytest.mark.unit
def test_document_less_than_portfolio_duplicate(base_portfolio):
    # Document has 8 shares, portfolio has 10 shares
    txs = [
        {"symbol": "AAPL", "type": "BUY", "date": "15/01/2024", "price": 150.0, "qty": 8.0}
    ]
    result = group_and_deduplicate_transactions(txs, base_portfolio)
    assert len(result) == 1
    assert result[0]["import_status"] == "DUPLICATE"

@pytest.mark.unit
def test_grouping_by_key(base_portfolio):
    # Two identical transactions in the batch
    txs = [
        {"symbol": "MSFT", "type": "BUY", "date": "10/01/2024", "price": 400.0, "qty": 2.0},
        {"symbol": "MSFT", "type": "BUY", "date": "10/01/2024", "price": 400.0, "qty": 3.0},
    ]
    result = group_and_deduplicate_transactions(txs, base_portfolio)
    assert len(result) == 1
    assert result[0]["import_status"] == "NEW"
    assert result[0]["qty"] == 5.0

@pytest.mark.unit
def test_linked_sell_grouping(base_portfolio):
    # Linked sells with different buy_date / buy_price group separately
    txs = [
        {"symbol": "AAPL", "type": "SELL", "date": "20/02/2024", "price": 160.0, "qty": 1.0, "buy_date": "15/01/2024", "buy_price": 150.0},
        {"symbol": "AAPL", "type": "SELL", "date": "20/02/2024", "price": 160.0, "qty": 2.0, "buy_date": "10/01/2024", "buy_price": 140.0},
    ]
    result = group_and_deduplicate_transactions(txs, base_portfolio)
    assert len(result) == 2
    assert {r["buy_date"] for r in result} == {"15/01/2024", "10/01/2024"}

@pytest.mark.unit
def test_chronological_sort(base_portfolio):
    # Order in list is out of chronological order
    txs = [
        {"symbol": "MSFT", "type": "BUY", "date": "20/01/2024", "price": 400.0, "qty": 1.0},
        {"symbol": "MSFT", "type": "BUY", "date": "10/01/2024", "price": 400.0, "qty": 1.0},
        {"symbol": "MSFT", "type": "BUY", "date": "15/01/2024", "price": 400.0, "qty": 1.0},
    ]
    result = group_and_deduplicate_transactions(txs, base_portfolio)
    assert len(result) == 3
    assert result[0]["date"] == "10/01/2024"
    assert result[1]["date"] == "15/01/2024"
    assert result[2]["date"] == "20/01/2024"
