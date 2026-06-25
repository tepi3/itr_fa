import pytest
from core.ibkr_parser import parse_date, process_ibkr_files, process_ibkr_file

def test_parse_date():
    assert parse_date("2026-05-26") == "26/05/2026"
    assert parse_date("2026-04-21, 08:37:00") == "21/04/2026"
    assert parse_date("05/26/2026") == "26/05/2026"
    assert parse_date("") is None
    assert parse_date(None) is None


def test_single_file_buy_only():
    csv_data = (
        "Statement,Header,Field Name,Field Value\n"
        "Statement,Data,Title,Activity Statement\n"
        "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code\n"
        "Trades,Data,Order,Stocks,USD,AAPL,\"2026-04-21, 08:37:00\",10,150.00,152.00,-1500.00,-1.50,1501.50,0,20.00,O\n"
    ).encode("utf-8")

    result = process_ibkr_files([(csv_data, "test.csv")], 2026)
    txs = result["transactions"]
    
    assert len(txs) == 1
    assert txs[0]["type"] == "BUY"
    assert txs[0]["symbol"] == "AAPL"
    assert txs[0]["qty"] == 10.0
    # Price = |(-1500) + (-1.50)| / 10 = 150.15
    assert txs[0]["price"] == 150.15
    assert result["unmatched_sells"] == []


def test_single_file_buy_and_sell_lot_matched():
    csv_data = (
        "Statement,Header,Field Name,Field Value\n"
        "Statement,Data,Title,Activity Statement\n"
        "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code\n"
        "Trades,Data,Order,Stocks,USD,AAPL,\"2026-04-21, 08:37:00\",10,150.00,152.00,-1500.00,-1.50,1501.50,0,20.00,O\n"
        "Trades,Data,Order,Stocks,USD,AAPL,\"2026-05-15, 10:00:00\",-5,160.00,160.00,800.00,-1.00,-750.75,48.25,0,C\n"
    ).encode("utf-8")

    result = process_ibkr_files([(csv_data, "test.csv")], 2026)
    txs = result["transactions"]
    
    # We should get a BUY of the REMAINING quantity (5), and a linked SELL of 5.
    assert len(txs) == 2
    assert result["unmatched_sells"] == []

    # Chronological sort means BUY is first
    assert txs[0]["type"] == "BUY"
    assert txs[0]["qty"] == 10.0  # Full quantity carried into the year
    assert txs[0]["price"] == 150.15

    assert txs[1]["type"] == "SELL"
    assert txs[1]["qty"] == 5.0
    # Sell price = |(800) + (-1.00)| / 5 = 159.80
    assert txs[1]["price"] == 159.80
    # Check lot linkage
    assert txs[1]["buy_date"] == "21/04/2026"
    assert txs[1]["buy_price"] == 150.15


def test_multi_file_lot_building():
    # File 1 has the buy
    csv1 = (
        "Statement,Header,Field Name,Field Value\n"
        "Statement,Data,Title,Activity Statement\n"
        "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code\n"
        "Trades,Data,Order,Stocks,USD,AAPL,\"2026-01-10, 08:37:00\",10,150.00,152.00,-1500.00,-1.50,1501.50,0,20.00,O\n"
    ).encode("utf-8")

    # File 2 has the sell
    csv2 = (
        "Statement,Header,Field Name,Field Value\n"
        "Statement,Data,Title,Activity Statement\n"
        "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code\n"
        "Trades,Data,Order,Stocks,USD,AAPL,\"2026-05-15, 10:00:00\",-5,160.00,160.00,800.00,-1.00,-750.75,48.25,0,C\n"
    ).encode("utf-8")

    result = process_ibkr_files([(csv1, "1.csv"), (csv2, "2.csv")], 2026)
    txs = result["transactions"]
    
    assert len(txs) == 2
    assert result["unmatched_sells"] == []


def test_sell_unmatched_warning():
    # Only a sell, no buy to match to
    csv_data = (
        "Statement,Header,Field Name,Field Value\n"
        "Statement,Data,Title,Activity Statement\n"
        "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code\n"
        "Trades,Data,Order,Stocks,USD,AAPL,\"2026-05-15, 10:00:00\",-5,160.00,160.00,800.00,-1.00,-750.75,48.25,0,C\n"
    ).encode("utf-8")

    result = process_ibkr_files([(csv_data, "test.csv")], 2026)
    
    assert len(result["transactions"]) == 0
    assert len(result["unmatched_sells"]) == 1
    assert result["unmatched_sells"][0]["symbol"] == "AAPL"
    # Inferred buy price from Basis = |-750.75| / 5 = 150.15
    assert result["unmatched_sells"][0]["inferred_buy_price"] == 150.15


def test_pre_cy_sells_reduce_lot_qty():
    # Buy in 2025, Sell some in 2025, Sell some in 2026
    csv_data = (
        "Statement,Header,Field Name,Field Value\n"
        "Statement,Data,Title,Activity Statement\n"
        "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code\n"
        "Trades,Data,Order,Stocks,USD,AAPL,\"2025-01-10, 08:37:00\",10,100.00,100.00,-1000.00,-1.00,1001.00,0,0,O\n"
        "Trades,Data,Order,Stocks,USD,AAPL,\"2025-12-15, 10:00:00\",-2,150.00,150.00,300.00,-1.00,-200.20,98.80,0,C\n"
        "Trades,Data,Order,Stocks,USD,AAPL,\"2026-05-15, 10:00:00\",-3,160.00,160.00,480.00,-1.00,-300.30,178.70,0,C\n"
    ).encode("utf-8")

    # Calendar year is 2026
    result = process_ibkr_files([(csv_data, "test.csv")], 2026)
    txs = result["transactions"]
    
    # Expecting: BUY of remaining 8 shares, SELL of 3 shares in CY
    assert len(txs) == 2
    assert txs[0]["type"] == "BUY"
    assert txs[0]["qty"] == 8.0  # (10 - 2 sold in 2025)
    
    assert txs[1]["type"] == "SELL"
    assert txs[1]["qty"] == 3.0  # Sold in 2026


def test_day_trade():
    csv_data = (
        "Statement,Header,Field Name,Field Value\n"
        "Statement,Data,Title,Activity Statement\n"
        "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code\n"
        "Trades,Data,Order,Stocks,USD,VOO,\"2026-06-02, 10:13:08\",100,697.22,698.26,-69722.00,-1.00,69723.00,0,104,O;P\n"
        "Trades,Data,Order,Stocks,USD,VOO,\"2026-06-02, 10:13:30\",-100,697.24,698.26,69724.00,-2.46,-69723.00,-1.46,-102,C;P\n"
    ).encode("utf-8")

    result = process_ibkr_files([(csv_data, "test.csv")], 2026)
    txs = result["transactions"]
    
    # Lot was completely sold, but it happened in the CY, so it should emit both the BUY and SELL
    assert len(txs) == 2
    assert txs[0]["type"] == "BUY"
    assert txs[0]["qty"] == 100.0
    
    assert txs[1]["type"] == "SELL"
    assert txs[1]["qty"] == 100.0
    assert result["unmatched_sells"] == []


def test_non_stock_skipped():
    csv_data = (
        "Statement,Header,Field Name,Field Value\n"
        "Statement,Data,Title,Activity Statement\n"
        "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code\n"
        "Trades,Data,Order,Forex,USD,EUR.USD,\"2026-05-22, 10:08:23\",1000.0,1.08,1.08,-1080.0,0,1080.0,0,0,O\n" 
    ).encode("utf-8")

    result = process_ibkr_files([(csv_data, "test.csv")], 2026)
    assert len(result["transactions"]) == 0


def test_backward_compat_single_file():
    csv_data = (
        "Statement,Header,Field Name,Field Value\n"
        "Statement,Data,Title,Activity Statement\n"
        "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code\n"
        "Trades,Data,Order,Stocks,USD,AAPL,\"2026-04-21, 08:37:00\",10,150.00,152.00,-1500.00,-1.50,1501.50,0,20.00,O\n"
    ).encode("utf-8")

    # Call the old wrapper
    result = process_ibkr_file(csv_data, "test.csv", {"calendar_year": 2026})
    assert len(result["transactions"]) == 1
    assert result["transactions"][0]["type"] == "BUY"
