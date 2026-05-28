import pytest
from pydantic import ValidationError
from core.models import Sell, Lot, CompanyInfo, Dividend, Stock, Portfolio

@pytest.mark.unit
def test_portfolio_valid(sample_portfolio):
    portfolio = Portfolio.model_validate(sample_portfolio)
    assert portfolio.calendar_year == 2024
    assert len(portfolio.stocks) == 2
    assert portfolio.stocks[0].ticker == "AAPL"
    assert portfolio.stocks[1].ticker == "TSLA"

@pytest.mark.unit
def test_portfolio_missing_year():
    with pytest.raises(ValidationError):
        Portfolio.model_validate({"stocks": []})

@pytest.mark.unit
def test_stock_defaults():
    # Test that currency defaults to USD and skip_dividends defaults to False
    stock = Stock(id="s1", ticker="MSFT", yahoo_ticker="MSFT")
    assert stock.currency == "USD"
    assert stock.skip_dividends is False

@pytest.mark.unit
def test_lot_extra_fields_allowed():
    # extra="allow" should let us put arbitrary attributes on Lot
    lot_data = {
        "id": "lot_1",
        "buy_date": "01/01/2024",
        "quantity": 10.0,
        "buy_price": 100.0,
        "extra_field_custom": "custom_value",
    }
    lot = Lot.model_validate(lot_data)
    assert lot.id == "lot_1"
    # Ensure extra fields are stored
    assert lot.extra_field_custom == "custom_value"

@pytest.mark.unit
def test_sell_validation():
    # Missing required field
    with pytest.raises(ValidationError):
        Sell.model_validate({"id": "sell_1", "quantity": 10.0, "sell_price": 50.0})

@pytest.mark.unit
def test_portfolio_model_dump_roundtrip(sample_portfolio):
    portfolio1 = Portfolio.model_validate(sample_portfolio)
    dumped = portfolio1.model_dump()
    portfolio2 = Portfolio.model_validate(dumped)
    assert portfolio1.calendar_year == portfolio2.calendar_year
    assert len(portfolio1.stocks) == len(portfolio2.stocks)
