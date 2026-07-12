import pytest
from datetime import datetime
from core.fidelity_parser import (
    _parse_fidelity_date,
    _strip_html,
    _clean_float,
    _parse_open_lots,
    _parse_closed_lots,
    _detect_espp_lots,
    process_fidelity_files,
)

def test_parse_fidelity_date():
    # Standard format
    assert _parse_fidelity_date("Jun-01-2026") == "01/06/2026"
    assert _parse_fidelity_date("Sep-29-2023") == "29/09/2023"
    # Single digit day format
    assert _parse_fidelity_date("Sep-2-2025") == "02/09/2025"
    assert _parse_fidelity_date("Mar-5-2021") == "05/03/2021"
    # ISO format
    assert _parse_fidelity_date("2026-06-01") == "01/06/2026"
    # Edge cases
    assert _parse_fidelity_date("-") is None
    assert _parse_fidelity_date("") is None
    assert _parse_fidelity_date(None) is None

def test_strip_html():
    assert _strip_html("Quantity") == "Quantity"
    assert _strip_html('<span style="color: red;">Date sold</span>') == "Date sold"
    assert _strip_html('<a>Link</a> Text') == "Link Text"
    assert _strip_html(None) == ""

def test_clean_float():
    assert _clean_float("309.76") == 309.76
    assert _clean_float("$1,234.56") == 1234.56
    assert _clean_float("-") == 0.0
    assert _clean_float("") == 0.0

def test_parse_open_lots_simple():
    csv_content = """Date acquired,Quantity,Cost basis,Cost basis/share,Value,Gain/loss,Sale availability date,Transfer availability date,Grant date,Share source,Holding period
Jun-01-2026,0.6880,309.76,450.23,264.95,-44.81,-,-,-,DO,Short
Sep-29-2023,0.9313,264.66,284.18,358.64,93.98,-,-,Jul-03-2023,SP,Long
"""
    txs, skipped = _parse_open_lots(csv_content, "MSFT", 2026)
    assert skipped == 0
    assert len(txs) == 2
    
    # Check DO lot (RSU/Direct)
    assert txs[0]["type"] == "BUY"
    assert txs[0]["date"] == "01/06/2026"
    assert txs[0]["qty"] == 0.688
    assert txs[0]["price"] == 450.23
    assert txs[0]["lot_type"] == "rsu"
    
    # Check SP lot (ESPP)
    assert txs[1]["type"] == "BUY"
    assert txs[1]["date"] == "29/09/2023"
    assert txs[1]["qty"] == 0.9313
    assert txs[1]["price"] == 284.18
    assert txs[1]["lot_type"] == "espp"
    assert txs[1]["grant_date"] == "03/07/2023"

def test_parse_closed_lots_simple():
    csv_content = """Date acquired,Quantity,<span style="color: rgb(0,0,0);">Date sold or transferred</span>,Proceeds,Cost basis,Gain/loss,Term
Jun-01-2026,2.0,Jun-15-2026,1000.0,900.0,100.0,Short
"""
    pairs, skipped = _parse_closed_lots(csv_content, "MSFT", 2026)
    assert skipped == 0
    assert len(pairs) == 1
    
    buy_tx, sell_tx = pairs[0]
    
    assert buy_tx["type"] == "BUY"
    assert buy_tx["date"] == "01/06/2026"
    assert buy_tx["qty"] == 2.0
    assert buy_tx["price"] == 450.0  # 900.0 / 2.0
    assert buy_tx["original_price"] == 450.0
    assert buy_tx["closed_lot"] is True
    
    assert sell_tx["type"] == "SELL"
    assert sell_tx["date"] == "15/06/2026"
    assert sell_tx["qty"] == 2.0
    assert sell_tx["price"] == 500.0  # 1000.0 / 2.0
    assert sell_tx["buy_date"] == "01/06/2026"
    assert sell_tx["buy_price"] == 450.0
    assert sell_tx["original_buy_price"] == 450.0
    assert sell_tx["closed_lot"] is True

def test_detect_espp_lots_cross_ref(monkeypatch):
    # Mock stock_data closing price
    monkeypatch.setattr("core.fidelity_parser.get_price_on_date", lambda t, d: 500.0)
    
    open_buys = [
        {"type": "BUY", "date": "01/06/2026", "symbol": "MSFT", "qty": 1.0, "price": 425.0, "original_price": 425.0, "lot_type": "espp", "espp_source": "open_lot"}
    ]
    closed_pairs = [
        (
            {"type": "BUY", "date": "01/06/2026", "symbol": "MSFT", "qty": 2.0, "price": 425.0, "original_price": 425.0, "lot_type": "unknown", "espp_source": ""},
            {"type": "SELL", "date": "15/06/2026", "symbol": "MSFT", "qty": 2.0, "price": 600.0, "buy_date": "01/06/2026", "buy_price": 425.0, "original_buy_price": 425.0, "lot_type": "unknown", "espp_source": ""}
        )
    ]
    
    _detect_espp_lots(open_buys, closed_pairs, "MSFT")
    
    # Open lots should be corrected to FMV ($500.0)
    assert open_buys[0]["price"] == 500.0
    assert open_buys[0]["fmv_price"] == 500.0
    
    # Closed lots should inherit ESPP type and FMV prices via cross-reference
    buy_tx, sell_tx = closed_pairs[0]
    assert buy_tx["lot_type"] == "espp"
    assert buy_tx["espp_source"] == "cross_ref"
    assert buy_tx["price"] == 500.0
    assert buy_tx["fmv_price"] == 500.0
    
    assert sell_tx["lot_type"] == "espp"
    assert sell_tx["espp_source"] == "cross_ref"
    assert sell_tx["buy_price"] == 500.0
    assert sell_tx["fmv_buy_price"] == 500.0

def test_detect_espp_lots_heuristic(monkeypatch):
    # Mock stock_data price to $100.0
    monkeypatch.setattr("core.fidelity_parser.get_price_on_date", lambda t, d: 100.0)
    
    open_buys = []
    
    # Case A: Buy price $85 (15% discount) -> should be flagged ESPP
    # Case B: Buy price $98 (2% discount) -> should be flagged RSU (outside ESPP discount range)
    closed_pairs = [
        (
            {"type": "BUY", "date": "01/06/2026", "symbol": "MSFT", "qty": 1.0, "price": 85.0, "original_price": 85.0, "lot_type": "unknown", "espp_source": ""},
            {"type": "SELL", "date": "15/06/2026", "symbol": "MSFT", "qty": 1.0, "price": 120.0, "buy_date": "01/06/2026", "buy_price": 85.0, "original_buy_price": 85.0, "lot_type": "unknown", "espp_source": ""}
        ),
        (
            {"type": "BUY", "date": "02/06/2026", "symbol": "MSFT", "qty": 1.0, "price": 98.0, "original_price": 98.0, "lot_type": "unknown", "espp_source": ""},
            {"type": "SELL", "date": "16/06/2026", "symbol": "MSFT", "qty": 1.0, "price": 120.0, "buy_date": "02/06/2026", "buy_price": 98.0, "original_buy_price": 98.0, "lot_type": "unknown", "espp_source": ""}
        )
    ]
    
    _detect_espp_lots(open_buys, closed_pairs, "MSFT")
    
    # Pair 1: ESPP detected
    b1, s1 = closed_pairs[0]
    assert b1["lot_type"] == "espp"
    assert b1["espp_source"] == "heuristic"
    assert b1["price"] == 100.0
    assert s1["lot_type"] == "espp"
    assert s1["buy_price"] == 100.0
    
    # Pair 2: RSU detected
    b2, s2 = closed_pairs[1]
    assert b2["lot_type"] == "rsu"
    assert b2["price"] == 98.0
    assert s2["lot_type"] == "rsu"
    assert s2["buy_price"] == 98.0

def test_process_fidelity_files(monkeypatch):
    # Mock historical price lookups
    monkeypatch.setattr("core.fidelity_parser.get_price_on_date", lambda t, d: 500.0)
    
    open_lots_csv = """Date acquired,Quantity,Cost basis,Cost basis/share,Value,Gain/loss,Sale availability date,Transfer availability date,Grant date,Share source,Holding period
Jun-01-2026,1.0,425.0,425.0,500.0,75.0,-,-,Apr-01-2026,SP,Short
"""
    closed_lots_csv = """Date acquired,Quantity,Date sold,Proceeds,Cost basis,Gain/loss,Term
Jun-01-2026,2.0,Jun-15-2026,1200.0,850.0,350.0,Short
"""
    result = process_fidelity_files(
        open_lots_csv.encode('utf-8'), "open.csv",
        closed_lots_csv.encode('utf-8'), "closed.csv",
        "MSFT", 2026
    )
    
    txs = result["transactions"]
    # Total transactions should be 3 (1 open buy + 1 closed buy + 1 closed sell)
    assert len(txs) == 3
    assert result["skipped_count"] == 0
    
    # Verify open buy (ESPP)
    open_buy = [t for t in txs if t["type"] == "BUY" and not t.get("closed_lot")][0]
    assert open_buy["price"] == 500.0
    assert open_buy["lot_id"] == "open_0"
    
    # Verify closed buy (cross-referenced as ESPP)
    closed_buy = [t for t in txs if t["type"] == "BUY" and t.get("closed_lot")][0]
    assert closed_buy["price"] == 500.0
    assert closed_buy["lot_id"] == "closed_0"
    
    # Verify closed sell (cross-referenced as ESPP)
    closed_sell = [t for t in txs if t["type"] == "SELL"][0]
    assert closed_sell["buy_price"] == 500.0
    assert closed_sell["lot_id"] == "closed_0"

def test_process_fidelity_files_future_sell(monkeypatch):
    # Target year is 2025. Closed lot is acquired in 2025, but sold in 2026 (future year).
    monkeypatch.setattr("core.fidelity_parser.get_price_on_date", lambda t, d: 350.0)
    
    open_lots_csv = ""
    closed_lots_csv = """Date acquired,Quantity,Date sold,Proceeds,Cost basis,Gain/loss,Term
Jun-01-2025,2.0,Jun-15-2026,1000.0,600.0,400.0,Long
"""
    result = process_fidelity_files(
        open_lots_csv.encode('utf-8'), "open.csv",
        closed_lots_csv.encode('utf-8'), "closed.csv",
        "MSFT", 2025
    )
    
    txs = result["transactions"]
    # We should only have the BUY transaction (since sell is in 2026).
    assert len(txs) == 1
    assert txs[0]["type"] == "BUY"
    assert txs[0]["date"] == "01/06/2025"
    assert txs[0]["qty"] == 2.0
    # Heuristic should detect ESPP (600/2=300 is within 15% discount of 350 FMV)
    assert txs[0]["lot_type"] == "espp"
    assert txs[0]["price"] == 350.0
    assert result["skipped_count"] == 0

