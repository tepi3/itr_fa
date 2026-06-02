import pytest
from core.ibkr_parser import parse_date, process_ibkr_file

def test_parse_date():
    # ISO Format
    assert parse_date("2026-05-26") == "26/05/2026"
    # ISO Format with trailing comma and time
    assert parse_date("2026-04-21, 08:37:00") == "21/04/2026"
    # US format
    assert parse_date("05/26/2026") == "26/05/2026"
    # Empty
    assert parse_date("") is None
    assert parse_date(None) is None

def test_process_ibkr_file_deprecated_transaction_history():
    old_csv = (
        "Statement,Header,Field Name,Field Value\n"
        "Statement,Data,Title,Transaction History\n"
        "Transaction History,Header,Date,Account,Description,Transaction Type,Symbol,Quantity,Price,Price Currency,Gross Amount ,Commission,Net Amount\n"
        "Transaction History,Data,2026-05-26,U***57712,VANG FTSE AW USDA,Buy,VWRA,16.0,189.2058,USD,-3027.29,-1.7,-3028.99\n"
    ).encode("utf-8")

    portfolio = {"calendar_year": 2026}
    # Parsing legacy Transaction History should raise a ValueError
    with pytest.raises(ValueError) as excinfo:
        process_ibkr_file(old_csv, "ibkr_old.csv", portfolio)
    assert "Could not find 'Trades' section" in str(excinfo.value)

def test_process_ibkr_file_new_activity_statement_skips_sells():
    new_csv = (
        "Statement,Header,Field Name,Field Value\n"
        "Statement,Data,Title,Activity Statement\n"
        "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code\n"
        "Trades,Data,Order,Stocks,USD,VWRA,\"2026-04-21, 08:37:00\",25.707,180.689691524,179.32,-4644.9949,-2.32249745,4647.31739745,0,-35.2157,O;P\n"
        "Trades,Data,Order,Stocks,USD,VWRA,\"2026-05-13, 08:49:12\",-10.5,185.52,186.4,1947.96,-1.78,-1949.74,0,15.61,O;P\n" # Should be skipped (Sell: quantity < 0)
        "Trades,Data,Order,Forex,USD,EUR.USD,\"2026-05-22, 10:08:23\",1000.0,1.08,1.08,-1080.0,0,1080.0,0,0,O\n" # Should be skipped (Non-Stocks)
    ).encode("utf-8")

    portfolio = {"calendar_year": 2026}
    result = process_ibkr_file(new_csv, "ibkr_new.csv", portfolio)
    
    txs = result["transactions"]
    # Sell and Forex are both skipped, leaving exactly 1 BUY transaction
    assert len(txs) == 1
    
    assert txs[0]["symbol"] == "VWRA"
    assert txs[0]["type"] == "BUY"
    assert txs[0]["qty"] == 25.707
    assert txs[0]["price"] == 180.69
    assert txs[0]["date"] == "21/04/2026"
