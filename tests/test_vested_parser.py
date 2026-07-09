import pytest
import io
import openpyxl
from datetime import datetime, date, time
from core.vested_parser import parse_vested_datetime, process_vested_files

def test_parse_vested_datetime():
    # test datetime object
    dt, dt_str = parse_vested_datetime(datetime(2025, 10, 11, 5, 3, 1), "05:03:01 AM")
    assert dt_str == "11/10/2025"
    assert dt == datetime(2025, 10, 11, 5, 3, 1)

    # test string date and time formats
    dt, dt_str = parse_vested_datetime("2025-10-11", "05:03:01 AM")
    assert dt_str == "11/10/2025"
    assert dt == datetime(2025, 10, 11, 5, 3, 1)

    dt, dt_str = parse_vested_datetime("10/11/2025", "01:22:24 PM")
    assert dt_str == "11/10/2025"
    assert dt == datetime(2025, 10, 11, 13, 22, 24)

    # test invalid date
    dt, dt_str = parse_vested_datetime(None, "05:03:01 AM")
    assert dt is None

def _create_mock_excel(trades: list) -> bytes:
    wb = openpyxl.Workbook()
    # remove default sheet
    wb.remove(wb.active)
    
    ws = wb.create_sheet(title="Trades")
    headers = [
        "Date", "Time (in UTC)", "Name", "Ticker", "Activity", 
        "Order Type", "Quantity", "Price Per Share (in USD)", 
        "Cash Amount (in USD)", "Commission Charges (in USD)"
    ]
    ws.append(headers)
    
    for t in trades:
        row = [
            t.get("Date", "2025-10-10"),
            t.get("Time (in UTC)", "09:00:00 AM"),
            t.get("Name", "Mock Inc"),
            t.get("Ticker", "MOCK"),
            t.get("Activity", "Buy"),
            t.get("Order Type", "Market"),
            t.get("Quantity", 10.0),
            t.get("Price Per Share", 100.0),
            t.get("Cash Amount", 1000.0),
            t.get("Commission", 0.0)
        ]
        ws.append(row)
        
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()

def test_process_vested_files_buy_only():
    trades = [
        {
            "Date": "2025-10-10", "Time (in UTC)": "10:00:00 AM",
            "Ticker": "AAPL", "Activity": "Buy", "Quantity": 5.5,
            "Price Per Share": 150.0, "Cash Amount": 827.0, "Commission": 2.0
        }
    ]
    excel_bytes = _create_mock_excel(trades)
    
    result = process_vested_files([(excel_bytes, "test.xlsx")], 2025)
    txs = result["transactions"]
    
    assert len(txs) == 1
    assert txs[0]["type"] == "BUY"
    assert txs[0]["symbol"] == "AAPL"
    assert txs[0]["qty"] == 5.5
    # price = cash_amount / qty = 827.0 / 5.5 = 150.36
    assert txs[0]["price"] == 150.36
    assert result["unmatched_sells"] == []
    assert result["skipped_count"] == 0

def test_process_vested_files_fifo_matching():
    trades = [
        # Buy on Oct 10
        {
            "Date": "2025-10-10", "Time (in UTC)": "10:00:00 AM",
            "Ticker": "AAPL", "Activity": "Buy", "Quantity": 10.0,
            "Price Per Share": 150.0, "Cash Amount": 1500.0
        },
        # Sell on Oct 12
        {
            "Date": "2025-10-12", "Time (in UTC)": "11:00:00 AM",
            "Ticker": "AAPL", "Activity": "Sell", "Quantity": 6.0,
            "Price Per Share": 160.0, "Cash Amount": 960.0
        }
    ]
    excel_bytes = _create_mock_excel(trades)
    
    result = process_vested_files([(excel_bytes, "test.xlsx")], 2025)
    txs = result["transactions"]
    
    # We should get a BUY of the carried-forward quantity (4.0), and a linked SELL of 6.0.
    assert len(txs) == 2
    assert result["unmatched_sells"] == []
    
    # First is BUY
    assert txs[0]["type"] == "BUY"
    assert txs[0]["qty"] == 10.0 # Full lot quantity carried into the year
    assert txs[0]["price"] == 150.0

    # Second is SELL
    assert txs[1]["type"] == "SELL"
    assert txs[1]["qty"] == 6.0
    assert txs[1]["price"] == 160.0
    assert txs[1]["buy_date"] == "10/10/2025"
    assert txs[1]["buy_price"] == 150.0

def test_process_vested_files_sell_split():
    trades = [
        # Buy lot 1: 5 shares
        {
            "Date": "2025-10-10", "Time (in UTC)": "10:00:00 AM",
            "Ticker": "AAPL", "Activity": "Buy", "Quantity": 5.0,
            "Price Per Share": 100.0, "Cash Amount": 500.0
        },
        # Buy lot 2: 10 shares
        {
            "Date": "2025-10-11", "Time (in UTC)": "10:00:00 AM",
            "Ticker": "AAPL", "Activity": "Buy", "Quantity": 10.0,
            "Price Per Share": 110.0, "Cash Amount": 1100.0
        },
        # Sell: 8 shares (should consume 5 shares from lot 1, and 3 shares from lot 2)
        {
            "Date": "2025-10-12", "Time (in UTC)": "11:00:00 AM",
            "Ticker": "AAPL", "Activity": "Sell", "Quantity": 8.0,
            "Price Per Share": 120.0, "Cash Amount": 960.0
        }
    ]
    excel_bytes = _create_mock_excel(trades)
    
    result = process_vested_files([(excel_bytes, "test.xlsx")], 2025)
    txs = result["transactions"]
    
    # We should have:
    # BUY lot 1 (qty 5.0), BUY lot 2 (qty 10.0)
    # SELL of 5.0 from lot 1 (buy_price 100.0)
    # SELL of 3.0 from lot 2 (buy_price 110.0)
    assert len(txs) == 4
    
    buys = [t for t in txs if t["type"] == "BUY"]
    sells = [t for t in txs if t["type"] == "SELL"]
    
    assert len(buys) == 2
    assert len(sells) == 2
    
    assert buys[0]["qty"] == 5.0
    assert buys[0]["price"] == 100.0
    assert buys[1]["qty"] == 10.0
    assert buys[1]["price"] == 110.0
    
    assert sells[0]["qty"] == 5.0
    assert sells[0]["buy_price"] == 100.0
    assert sells[0]["price"] == 120.0
    
    assert sells[1]["qty"] == 3.0
    assert sells[1]["buy_price"] == 110.0
    assert sells[1]["price"] == 120.0

def test_process_vested_files_pre_cy_sells():
    trades = [
        # Buy in 2024
        {
            "Date": "2024-05-10", "Time (in UTC)": "10:00:00 AM",
            "Ticker": "AAPL", "Activity": "Buy", "Quantity": 10.0,
            "Price Per Share": 100.0, "Cash Amount": 1000.0
        },
        # Sell 4 in 2024
        {
            "Date": "2024-12-15", "Time (in UTC)": "10:00:00 AM",
            "Ticker": "AAPL", "Activity": "Sell", "Quantity": 4.0,
            "Price Per Share": 110.0, "Cash Amount": 440.0
        },
        # Sell 3 in 2025
        {
            "Date": "2025-05-15", "Time (in UTC)": "10:00:00 AM",
            "Ticker": "AAPL", "Activity": "Sell", "Quantity": 3.0,
            "Price Per Share": 120.0, "Cash Amount": 360.0
        }
    ]
    excel_bytes = _create_mock_excel(trades)
    
    # Target CY is 2025
    result = process_vested_files([(excel_bytes, "test.xlsx")], 2025)
    txs = result["transactions"]
    
    # We should have:
    # BUY carried-forward: 6 shares (10 - 4 sold in 2024)
    # SELL in CY: 3 shares
    assert len(txs) == 2
    assert txs[0]["type"] == "BUY"
    assert txs[0]["qty"] == 6.0
    assert txs[0]["price"] == 100.0
    
    assert txs[1]["type"] == "SELL"
    assert txs[1]["qty"] == 3.0
    assert txs[1]["buy_price"] == 100.0
    assert txs[1]["price"] == 120.0

def test_process_vested_files_skipped_after_cy():
    trades = [
        # Buy in 2025
        {
            "Date": "2025-10-10", "Time (in UTC)": "10:00:00 AM",
            "Ticker": "AAPL", "Activity": "Buy", "Quantity": 10.0,
            "Price Per Share": 150.0, "Cash Amount": 1500.0
        },
        # Buy in 2026
        {
            "Date": "2026-01-15", "Time (in UTC)": "10:00:00 AM",
            "Ticker": "AAPL", "Activity": "Buy", "Quantity": 5.0,
            "Price Per Share": 160.0, "Cash Amount": 800.0
        }
    ]
    excel_bytes = _create_mock_excel(trades)
    
    result = process_vested_files([(excel_bytes, "test.xlsx")], 2025)
    txs = result["transactions"]
    
    assert len(txs) == 1
    assert txs[0]["type"] == "BUY"
    assert txs[0]["qty"] == 10.0
    assert result["skipped_count"] == 1

def test_process_vested_files_unmatched_sells():
    trades = [
        # Sell only
        {
            "Date": "2025-10-10", "Time (in UTC)": "10:00:00 AM",
            "Ticker": "AAPL", "Activity": "Sell", "Quantity": 5.0,
            "Price Per Share": 150.0, "Cash Amount": 750.0
        }
    ]
    excel_bytes = _create_mock_excel(trades)
    
    result = process_vested_files([(excel_bytes, "test.xlsx")], 2025)
    txs = result["transactions"]
    
    assert len(txs) == 0
    assert len(result["unmatched_sells"]) == 1
    assert result["unmatched_sells"][0]["symbol"] == "AAPL"
    assert result["unmatched_sells"][0]["qty"] == 5.0
    assert result["unmatched_sells"][0]["sell_price"] == 150.0
