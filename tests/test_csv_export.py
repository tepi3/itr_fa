import pytest
import csv
from io import StringIO
from core.csv_export import (
    CSV_HEADERS,
    _extract_country_region,
    _extract_country_code,
    _format_date_csv,
    _format_number,
    _format_zip_code,
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
def test_extract_country_code():
    assert _extract_country_code("2-UNITED STATES OF AMERICA") == "2"
    assert _extract_country_code("91-INDIA") == "91"
    assert _extract_country_code("NO_HYPHEN") == "NO_HYPHEN"
    assert _extract_country_code("") == ""
    assert _extract_country_code(None) == ""

@pytest.mark.unit
def test_format_zip_code():
    assert _format_zip_code("92121-1714") == "92121"
    assert _format_zip_code("92121") == "92121"
    assert _format_zip_code("123456789") == "12345678"
    assert _format_zip_code("") == ""
    assert _format_zip_code(None) == ""

@pytest.mark.unit
def test_format_date_csv():
    assert _format_date_csv("15/01/2024") == "2024-01-15"
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
    # Add a ZIP code with hyphen to verify formatting
    sample_a3_rows[0]["zip"] = "92121-1714"
    
    csv_bytes = export_a3_csv(sample_a3_rows, 2024)
    assert isinstance(csv_bytes, bytes)
    
    # Parse back the CSV bytes
    csv_text = csv_bytes.decode("utf-8")
    f = StringIO(csv_text)
    reader = csv.reader(f)
    
    rows = list(reader)
    # Header row + 2 data rows
    assert len(rows) == 3
    assert rows[0] == CSV_HEADERS
    
    # Validate the first data row conversion
    first_row = rows[1]
    assert len(first_row) == 12
    assert first_row[0] == "UNITED STATES OF AMERICA"
    assert first_row[1] == "2"
    assert first_row[2] == "Apple Inc. (AAPL)"
    assert first_row[3] == "One Apple Park Way Cupertino CA"  # Comma removed
    assert first_row[4] == "92121"  # Hyphenated ZIP code stripped
    assert first_row[6] == "2022-01-15"  # acquire_date converted to YYYY-MM-DD format
    assert first_row[7] == "625000"       # initial_value formatted as integer string
    assert first_row[11] == "300000"      # sale_proceeds formatted as integer string

