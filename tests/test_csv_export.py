import pytest
import csv
from io import StringIO
from core.csv_export import (
    CSV_HEADERS,
    _extract_country_region,
    _format_date_csv,
    _format_number,
    export_a3_csv,
)

@pytest.mark.unit
def test_export_headers():
    assert len(CSV_HEADERS) == 12
    assert CSV_HEADERS[0] == "Country/Region name"
    assert CSV_HEADERS[-1] == "Total gross proceeds from sale or redemption of investment during the period"

@pytest.mark.unit
def test_extract_country_region():
    assert _extract_country_region("2-UNITED STATES OF AMERICA") == "UNITED STATES OF AMERICA"
    assert _extract_country_region("91-INDIA") == "INDIA"
    assert _extract_country_region("NO_HYPHEN") == "NO_HYPHEN"
    assert _extract_country_region("") == ""
    assert _extract_country_region(None) == ""

@pytest.mark.unit
def test_format_date_csv():
    assert _format_date_csv("15/01/2024") == "15-01-2024"
    assert _format_date_csv("2024-01-15") == "2024-01-15"
    assert _format_date_csv("") == ""
    assert _format_date_csv(None) == ""

@pytest.mark.unit
def test_format_number_rounding():
    assert _format_number(12345.6) == "12346"
    assert _format_number(12345.4) == "12345"
    assert _format_number(12345) == "12345"

@pytest.mark.unit
def test_format_number_none():
    assert _format_number(None) == ""

@pytest.mark.unit
def test_export_utf8_encoding(sample_a3_rows):
    csv_bytes = export_a3_csv(sample_a3_rows, 2024)
    assert isinstance(csv_bytes, bytes)
    
    # Parse back the CSV bytes
    csv_text = csv_bytes.decode("utf-8")
    f = StringIO(csv_text)
    reader = csv.reader(f)
    
    rows = list(reader)
    # Header row + 2 data rows
    assert len(rows) == 3
    assert rows[0] == CSV_HEADERS + [""]
    
    # Validate the first data row conversion
    first_row = rows[1]
    assert len(first_row) == 13
    assert first_row[0] == "UNITED STATES OF AMERICA"
    assert first_row[1] == "2-UNITED STATES OF AMERICA"
    assert first_row[2] == "Apple Inc. (AAPL)"
    assert first_row[6] == "15-01-2022"  # acquire_date converted to DD-MM-YYYY format
    assert first_row[7] == "625000"       # initial_value formatted as integer string
    assert first_row[11] == "300000"      # sale_proceeds formatted as integer string
    assert first_row[12] == ""            # trailing empty column

