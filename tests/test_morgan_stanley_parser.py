"""
Tests for the Morgan Stanley Share Sale Cost Basis Report parser.

Tests cover:
- RSU vesting (Releases Report) → BUY transactions
- ESPP purchase → BUY transactions
- RSU sales → linked SELL transactions
- ESPP sales → linked SELL transactions
- Year filtering (skip future buys, skip past sells)
- Company name extraction
- Integration with the real fixture file
"""
import io
import os
import pytest
from datetime import datetime
from pathlib import Path

import openpyxl

from core.morgan_stanley_parser import (
    process_morgan_stanley_file,
    parse_date,
    _clean_float,
    _get_year,
    _extract_company_name,
)


# ────────────────────────────────────────────────────────────
#  Helper: build an in-memory XLSX workbook
# ────────────────────────────────────────────────────────────

def _build_workbook(sheets: dict) -> bytes:
    """Build an XLSX workbook from a dict of {sheet_name: [rows]}.
    
    Each row is a list of cell values.
    Returns the workbook as bytes.
    """
    wb = openpyxl.Workbook()
    # Remove default sheet
    wb.remove(wb.active)
    
    for name, rows in sheets.items():
        ws = wb.create_sheet(title=name)
        for row in rows:
            ws.append(row)
    
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ────────────────────────────────────────────────────────────
#  Unit Tests: Utility Functions
# ────────────────────────────────────────────────────────────

class TestParseDate:
    def test_datetime_object(self):
        assert parse_date(datetime(2025, 11, 14)) == "14/11/2025"

    def test_us_format(self):
        assert parse_date("11/14/2025") == "14/11/2025"

    def test_iso_format(self):
        assert parse_date("2025-11-14") == "14/11/2025"

    def test_none_values(self):
        assert parse_date(None) is None
        assert parse_date("") is None
        assert parse_date("--") is None
        assert parse_date("NA") is None


class TestCleanFloat:
    def test_numeric(self):
        assert _clean_float(69.4) == 69.4

    def test_string_currency(self):
        assert _clean_float("$1,234.56") == 1234.56

    def test_none(self):
        assert _clean_float(None) == 0.0


class TestGetYear:
    def test_normal(self):
        assert _get_year("14/11/2025") == 2025

    def test_two_digit(self):
        assert _get_year("14/11/25") == 2025

    def test_empty(self):
        assert _get_year("") == 0
        assert _get_year(None) == 0


# ────────────────────────────────────────────────────────────
#  Unit Tests: Releases Report (RSU BUY)
# ────────────────────────────────────────────────────────────

class TestReleasesReport:
    def _build_releases_wb(self, data_rows):
        """Build a workbook with a Releases Report sheet."""
        title_row = ["TestCorp, Inc - Releases Report (report run on 30-May-2026)", None]
        header_row = [
            "Employee Number", "First Name", "Last Name", "Award Name",
            "Employee Grant Number", "Grant Date", "Release Date", "Release Price",
            "Release Method - Sentence", "Units", None, None, None,
            "Taxable Compensation", "Federal Tax (Paid)"
        ]
        sub_header_row = [
            None, None, None, None, None, None, None, None, None,
            "Issued", "Released", "Net Withheld", "Sold",
            None, None
        ]
        rows = [title_row, header_row, sub_header_row] + data_rows
        return _build_workbook({"Releases Report": rows})

    def test_basic_rsu_vesting(self):
        data = [
            ["9999999", "Test", "User", "RSU", "IN001",
             datetime(2022, 11, 1), datetime(2023, 11, 1), 69.4,
             "Withhold shares", 46.0, 67.0, 21.0, 0.0, 4649.8, 1457.4]
        ]
        wb_bytes = self._build_releases_wb(data)
        result = process_morgan_stanley_file(wb_bytes, "test.xlsx", target_year=2025, ticker_symbol="MU")
        
        txs = result["transactions"]
        buys = [t for t in txs if t["type"] == "BUY"]
        assert len(buys) == 1
        assert buys[0]["date"] == "01/11/2023"
        assert buys[0]["qty"] == 46.0  # Uses Issued, not Released
        assert buys[0]["price"] == 69.4
        assert buys[0]["symbol"] == "MU"

    def test_skip_future_vesting(self):
        """Shares vesting after the target year should be skipped."""
        data = [
            ["9999999", "Test", "User", "RSU", "IN001",
             datetime(2022, 11, 1), datetime(2026, 5, 1), 542.21,
             "Withhold shares", 11.0, 17.0, 6.0, 0.0, 9217.57, 3253.26]
        ]
        wb_bytes = self._build_releases_wb(data)
        result = process_morgan_stanley_file(wb_bytes, "test.xlsx", target_year=2025, ticker_symbol="MU")
        
        buys = [t for t in result["transactions"] if t["type"] == "BUY"]
        assert len(buys) == 0
        assert result["skipped_count"] >= 1

    def test_multiple_vestings_aggregated(self):
        """Multiple vestings on the same date should produce separate BUY transactions."""
        data = [
            ["9999999", "Test", "User", "RSU", "IN001",
             datetime(2022, 11, 1), datetime(2025, 11, 1), 223.77,
             "Withhold", 11.0, 17.0, 6.0, 0.0, 0, 0],
            ["9999999", "Test", "User", "RSU", "IN002",
             datetime(2023, 11, 1), datetime(2025, 11, 1), 223.77,
             "Withhold", 9.0, 14.0, 5.0, 0.0, 0, 0],
        ]
        wb_bytes = self._build_releases_wb(data)
        result = process_morgan_stanley_file(wb_bytes, "test.xlsx", target_year=2025, ticker_symbol="MU")
        
        buys = [t for t in result["transactions"] if t["type"] == "BUY"]
        assert len(buys) == 2
        assert buys[0]["qty"] == 11.0
        assert buys[1]["qty"] == 9.0


# ────────────────────────────────────────────────────────────
#  Unit Tests: ESPP Purchase (BUY)
# ────────────────────────────────────────────────────────────

class TestEsppPurchase:
    def _build_espp_purchase_wb(self, data_rows):
        title_row = ["TestCorp, Inc - ESPP Purchase (report run on 30-May-2026)", None]
        header_row = [
            "Employee Number", "First Name", "Last Name",
            "Subscription Date", "Subscription Date FMV",
            "Purchase Date", "Purchase Date FMV",
            "Purchase Price", "Shares Purchased", "Total Purchase Price"
        ]
        rows = [title_row, header_row] + data_rows
        return _build_workbook({"ESPP Purchase": rows})

    def test_basic_purchase(self):
        data = [
            ["9999999", "Test", "User",
             datetime(2024, 8, 1), 109.82,
             datetime(2025, 1, 31), 92.5,
             78.63, 14.48, 1138.62]
        ]
        wb_bytes = self._build_espp_purchase_wb(data)
        result = process_morgan_stanley_file(wb_bytes, "test.xlsx", target_year=2025, ticker_symbol="MU")
        
        buys = [t for t in result["transactions"] if t["type"] == "BUY"]
        assert len(buys) == 1
        assert buys[0]["date"] == "31/01/2025"
        assert buys[0]["qty"] == 14.48
        assert buys[0]["price"] == 92.5  # Uses FMV, not Purchase Price
        assert buys[0]["symbol"] == "MU"

    def test_skip_future_purchase(self):
        data = [
            ["9999999", "Test", "User",
             datetime(2025, 8, 1), 109.14,
             datetime(2026, 1, 30), 435.79,
             92.77, 13.042, 1209.99]
        ]
        wb_bytes = self._build_espp_purchase_wb(data)
        result = process_morgan_stanley_file(wb_bytes, "test.xlsx", target_year=2025, ticker_symbol="MU")
        
        buys = [t for t in result["transactions"] if t["type"] == "BUY"]
        assert len(buys) == 0
        assert result["skipped_count"] >= 1


# ────────────────────────────────────────────────────────────
#  Unit Tests: RSU Sales (Linked SELL)
# ────────────────────────────────────────────────────────────

class TestRsuSales:
    def _build_rsu_sales_wb(self, data_rows):
        title_row = ["TestCorp, Inc - RSU Sales (report run on 30-May-2026)", None]
        header_row = [
            "Employee Number", "First Name", "Last Name",
            "Sale Date", "Acquisition Date", "Sale Price",
            "Sale Net Proceeds", "Sale Quantity",
            "Cost Basis per Share", "Cost Basis For Lot", "Gain From Sale"
        ]
        rows = [title_row, header_row] + data_rows
        return _build_workbook({"RSU Sales": rows})

    def test_basic_sell(self):
        data = [
            ["9999999", "Test", "User",
             datetime(2025, 11, 14), datetime(2023, 11, 1),
             253.84, 11676.64, 46.0, 69.4, 3192.4, 8484.24]
        ]
        wb_bytes = self._build_rsu_sales_wb(data)
        result = process_morgan_stanley_file(wb_bytes, "test.xlsx", target_year=2025, ticker_symbol="MU")
        
        sells = [t for t in result["transactions"] if t["type"] == "SELL"]
        assert len(sells) == 1
        assert sells[0]["date"] == "14/11/2025"
        assert sells[0]["qty"] == 46.0
        assert sells[0]["price"] == 253.84
        assert sells[0]["buy_date"] == "01/11/2023"
        assert sells[0]["buy_price"] == 69.4

    def test_skip_sell_before_target_year(self):
        """Sells from before the target year should be skipped."""
        data = [
            ["9999999", "Test", "User",
             datetime(2024, 5, 1), datetime(2023, 11, 1),
             100.0, 4600.0, 46.0, 69.4, 3192.4, 0]
        ]
        wb_bytes = self._build_rsu_sales_wb(data)
        result = process_morgan_stanley_file(wb_bytes, "test.xlsx", target_year=2025, ticker_symbol="MU")
        
        sells = [t for t in result["transactions"] if t["type"] == "SELL"]
        assert len(sells) == 0

    def test_skip_sell_future_buy(self):
        """Sells of shares acquired after target year should be skipped."""
        data = [
            ["9999999", "Test", "User",
             datetime(2027, 1, 1), datetime(2026, 11, 1),
             300.0, 13800.0, 46.0, 200.0, 9200.0, 0]
        ]
        wb_bytes = self._build_rsu_sales_wb(data)
        result = process_morgan_stanley_file(wb_bytes, "test.xlsx", target_year=2025, ticker_symbol="MU")
        
        sells = [t for t in result["transactions"] if t["type"] == "SELL"]
        assert len(sells) == 0


# ────────────────────────────────────────────────────────────
#  Unit Tests: ESPP Sales (Linked SELL)
# ────────────────────────────────────────────────────────────

class TestEsppSales:
    def _build_espp_sales_wb(self, data_rows):
        title_row = ["TestCorp, Inc - ESPP Sales (report run on 30-May-2026)", None]
        header_row = [
            "Employee Number", "First Name", "Last Name",
            "Sale Date", "Subscription Date", "Subscription Date FMV",
            "Purchase Date", "Purchase Date FMV", "Purchase Price",
            "Sale Quantity", "Sale Price",
            "Sale Net Proceeds", "Gain From Sale"
        ]
        rows = [title_row, header_row] + data_rows
        return _build_workbook({"ESPP Sales": rows})

    def test_basic_espp_sell(self):
        data = [
            ["9999999", "Test", "User",
             datetime(2025, 9, 22), datetime(2021, 8, 1), 77.58,
             datetime(2022, 1, 31), 79.27, 65.94,
             7.0, 163.592857, 1145.149999, 590.259999]
        ]
        wb_bytes = self._build_espp_sales_wb(data)
        result = process_morgan_stanley_file(wb_bytes, "test.xlsx", target_year=2025, ticker_symbol="MU")
        
        sells = [t for t in result["transactions"] if t["type"] == "SELL"]
        assert len(sells) == 1
        assert sells[0]["date"] == "22/09/2025"
        assert sells[0]["qty"] == 7.0
        assert sells[0]["price"] == 163.59  # Rounded
        assert sells[0]["buy_date"] == "31/01/2022"
        assert sells[0]["buy_price"] == 79.27  # Uses FMV

    def test_espp_sell_with_commission(self):
        """ESPP sell price should be calculated from Net Proceeds if available (deducting commissions/fees)."""
        data = [
            ["9999999", "Test", "User",
             datetime(2025, 9, 22), datetime(2021, 8, 1), 77.58,
             datetime(2022, 1, 31), 79.27, 65.94,
             10.0, 150.00, 1480.00, 590.259999]
        ]
        wb_bytes = self._build_espp_sales_wb(data)
        result = process_morgan_stanley_file(wb_bytes, "test.xlsx", target_year=2025, ticker_symbol="MU")
        
        sells = [t for t in result["transactions"] if t["type"] == "SELL"]
        assert len(sells) == 1
        assert sells[0]["qty"] == 10.0
        # 1480.00 Net Proceeds / 10.0 Qty = 148.00 (instead of gross Sale Price 150.00)
        assert sells[0]["price"] == 148.00


# ────────────────────────────────────────────────────────────
#  Unit Tests: Company Name Extraction
# ────────────────────────────────────────────────────────────

class TestCompanyNameExtraction:
    def test_extracts_company_name(self):
        sheets = {
            "Releases Report": [
                ["TestCorp, Inc - Releases Report (report run on 30-May-2026)"],
                ["Employee Number", "First Name", "Last Name", "Award Name",
                 "Employee Grant Number", "Grant Date", "Release Date", "Release Price",
                 "Release Method - Sentence", "Units"],
                [None, None, None, None, None, None, None, None, None, "Issued"],
            ]
        }
        wb_bytes = _build_workbook(sheets)
        result = process_morgan_stanley_file(wb_bytes, "test.xlsx", target_year=2025, ticker_symbol="MU")
        assert result["company_name"] == "TestCorp, Inc"


# ────────────────────────────────────────────────────────────
#  Integration Test: Full Multi-Sheet Workbook
# ────────────────────────────────────────────────────────────

class TestFullWorkbook:
    def test_all_four_sheets(self):
        """Build a workbook with all 4 sheets and verify combined output."""
        sheets = {
            "Releases Report": [
                ["Acme Corp - Releases Report (report run on 01-Jan-2026)"],
                ["Employee Number", "First Name", "Last Name", "Award Name",
                 "Employee Grant Number", "Grant Date", "Release Date", "Release Price",
                 "Release Method - Sentence", "Units", None, None, None,
                 "Taxable Compensation", "Federal Tax (Paid)"],
                [None, None, None, None, None, None, None, None, None,
                 "Issued", "Released", "Net Withheld", "Sold", None, None],
                # Vest in 2024 — should be included for target_year=2025
                ["100", "A", "B", "RSU", "G1", datetime(2022, 1, 1), datetime(2024, 6, 1), 50.0,
                 "Withhold", 10.0, 15.0, 5.0, 0.0, 500.0, 150.0],
                # Vest in 2025
                ["100", "A", "B", "RSU", "G2", datetime(2023, 1, 1), datetime(2025, 3, 1), 80.0,
                 "Withhold", 20.0, 30.0, 10.0, 0.0, 1600.0, 480.0],
                # Vest in 2026 — should be skipped
                ["100", "A", "B", "RSU", "G3", datetime(2024, 1, 1), datetime(2026, 1, 1), 120.0,
                 "Withhold", 5.0, 7.0, 2.0, 0.0, 600.0, 180.0],
            ],
            "ESPP Purchase": [
                ["Acme Corp - ESPP Purchase (report run on 01-Jan-2026)"],
                ["Employee Number", "First Name", "Last Name",
                 "Subscription Date", "Subscription Date FMV",
                 "Purchase Date", "Purchase Date FMV",
                 "Purchase Price", "Shares Purchased", "Total Purchase Price"],
                # Purchase in 2025
                ["100", "A", "B", datetime(2024, 8, 1), 100.0,
                 datetime(2025, 1, 31), 110.0, 93.5, 12.0, 1122.0],
            ],
            "RSU Sales": [
                ["Acme Corp - RSU Sales (report run on 01-Jan-2026)"],
                ["Employee Number", "First Name", "Last Name",
                 "Sale Date", "Acquisition Date", "Sale Price",
                 "Sale Net Proceeds", "Sale Quantity",
                 "Cost Basis per Share", "Cost Basis For Lot", "Gain From Sale"],
                # Sell in 2025 of shares acquired in 2024
                ["100", "A", "B", datetime(2025, 8, 15), datetime(2024, 6, 1),
                 95.0, 950.0, 10.0, 50.0, 500.0, 450.0],
            ],
            "ESPP Sales": [
                ["Acme Corp - ESPP Sales (report run on 01-Jan-2026)"],
                ["Employee Number", "First Name", "Last Name",
                 "Sale Date", "Subscription Date", "Subscription Date FMV",
                 "Purchase Date", "Purchase Date FMV", "Purchase Price",
                 "Sale Quantity", "Sale Price",
                 "Sale Net Proceeds", "Gain From Sale"],
                # Sell in 2025
                ["100", "A", "B", datetime(2025, 10, 1), datetime(2024, 8, 1), 100.0,
                 datetime(2025, 1, 31), 110.0, 93.5,
                 5.0, 150.0, 750.0, 200.0],
            ],
        }

        wb_bytes = _build_workbook(sheets)
        result = process_morgan_stanley_file(wb_bytes, "test.xlsx", target_year=2025, ticker_symbol="ACME")

        txs = result["transactions"]
        buys = [t for t in txs if t["type"] == "BUY"]
        sells = [t for t in txs if t["type"] == "SELL"]

        # 2 RSU vests (2024, 2025) + 1 ESPP purchase = 3 BUYs
        assert len(buys) == 3
        # 1 RSU sale + 1 ESPP sale = 2 SELLs
        assert len(sells) == 2
        # 1 skipped (2026 vest)
        assert result["skipped_count"] == 1

        # Verify sells are linked
        for sell in sells:
            assert "buy_date" in sell
            assert "buy_price" in sell

        # Verify company name
        assert result["company_name"] == "Acme Corp"

        # Verify chronological ordering
        from core.utils import parse_sort_date
        dates = [parse_sort_date(t["date"]) for t in txs]
        assert dates == sorted(dates)


# ────────────────────────────────────────────────────────────
#  Integration Test: Real Fixture File
# ────────────────────────────────────────────────────────────

FIXTURE_FILE = Path(__file__).parent.parent / "Share Sale Cost Basis Report.xlsx"

@pytest.mark.skipif(not FIXTURE_FILE.exists(), reason="Fixture file not present")
class TestRealFixtureFile:
    def test_parse_real_file_cy2025(self):
        """Parse the actual Morgan Stanley report for CY2025."""
        with open(FIXTURE_FILE, "rb") as f:
            data = f.read()

        result = process_morgan_stanley_file(data, "Share Sale Cost Basis Report.xlsx",
                                     target_year=2025, ticker_symbol="MU")

        txs = result["transactions"]
        buys = [t for t in txs if t["type"] == "BUY"]
        sells = [t for t in txs if t["type"] == "SELL"]

        # Verify we got transactions
        assert len(txs) > 0
        assert len(buys) > 0

        # All should be MU
        for t in txs:
            assert t["symbol"] == "MU"

        # Company name
        assert len(result["company_name"]) > 0

        # All BUY dates should be <= 2025
        for b in buys:
            assert _get_year(b["date"]) <= 2025

        # All SELL dates should be in 2025
        for s in sells:
            assert _get_year(s["date"]) == 2025

        # Sells should be linked
        for s in sells:
            assert "buy_date" in s
            assert "buy_price" in s
            assert s["buy_price"] > 0

    def test_parse_real_file_counts(self):
        """Verify specific counts from the known fixture data."""
        with open(FIXTURE_FILE, "rb") as f:
            data = f.read()

        result = process_morgan_stanley_file(data, "Share Sale Cost Basis Report.xlsx",
                                     target_year=2025, ticker_symbol="MU")

        txs = result["transactions"]
        buys = [t for t in txs if t["type"] == "BUY"]
        sells = [t for t in txs if t["type"] == "SELL"]

        # From the fixture:
        # Releases Report: rows 3-23 have release dates from 2023-2025 (rows 24-29 are 2026 → skipped)
        # ESPP Purchase: rows 2-8 have purchase dates 2022-2025, rows 9-10 are 2026 → skipped
        # RSU Sales: 1 sale in 2025
        # ESPP Sales: 3 sales in 2025

        # There should be multiple BUYs (RSU vestings + ESPP purchases up to 2025)
        assert len(buys) >= 5, f"Expected at least 5 BUYs, got {len(buys)}"

        # Sells: 1 RSU + 3 ESPP = 4 sells in 2025
        assert len(sells) == 4, f"Expected 4 SELLs, got {len(sells)}"

        # Some transactions should have been skipped (2026 vestings + 2026 purchases)
        assert result["skipped_count"] > 0
