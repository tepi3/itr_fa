"""
CSV export for Schedule FA Section A3.

Copyright (c) 2026 Piyush Tewari (tepi3). All rights reserved.
Licensed for personal, non-commercial use only.

Generates a CSV file matching the ITR A3 table layout.
Column format matches the template used by income tax portal.
"""

import csv
import logging
from io import StringIO

logger = logging.getLogger(__name__)

# CSV column headers matching the ITR template
CSV_HEADERS = [
    "Country/Region name",
    "Country Name and Code",
    "Name of entity",
    "Address of entity",
    "ZIP Code",
    "Nature of entity",
    "Date of acquiring the interest",
    "Initial value of the investment",
    "Peak value of investment during the Period",
    "Closing balance",
    "Total gross amount paid/credited with respect to the holding during the period",
    "Total gross proceeds from sale or redemption of investment during the period",
]


def _extract_country_region(country_code: str) -> str:
    """
    Extract region name from country code string.
    E.g., '2-UNITED STATES OF AMERICA' -> 'UNITED STATES OF AMERICA'
    """
    if not country_code:
        return ""
    parts = country_code.split("-", 1)
    if len(parts) == 2:
        return parts[1].strip()
    return country_code


def _format_date_csv(date_str: str) -> str:
    """
    Convert DD/MM/YYYY or ISO date to DD-MMM-YYYY format (e.g., 16-Jun-2026).
    """
    if not date_str:
        return ""
    from datetime import datetime
    try:
        if "/" in date_str:
            d = datetime.strptime(date_str, "%d/%m/%Y")
        else:
            d = datetime.fromisoformat(date_str)
        return d.strftime("%d-%b-%Y")
    except Exception:
        return date_str



def _format_number(value) -> str:
    """Format number for CSV output — plain number, no commas."""
    if value is None:
        return ""
    return str(round(value))


def _format_row_as_csv_line(row_fields: list) -> str:
    """
    Format list of fields as a CSV line where every field is double-quoted,
    and a trailing comma is added at the end (matching e-filing template).
    """
    quoted = []
    for field in row_fields:
        s = str(field) if field is not None else ""
        s_escaped = s.replace('"', '""')
        quoted.append(f'"{s_escaped}"')
    return ",".join(quoted) + ",\r\n"


def export_a3_csv(rows: list, calendar_year: int) -> bytes:
    """
    Generate a CSV file with A3 table data matching the ITR template format.

    Args:
        rows: List of calculated A3 row dicts from calculator.calculate_a3_rows()
        calendar_year: The calendar year being reported

    Returns:
        CSV file as bytes (for download)
    """
    lines = []

    # Write header
    lines.append(_format_row_as_csv_line(CSV_HEADERS))

    # Write data rows
    for row_data in rows:
        country_code = row_data.get("country", "")
        country_region = _extract_country_region(country_code)

        csv_row = [
            country_region,
            country_code,
            row_data.get("entity_name", ""),
            row_data.get("address", ""),
            row_data.get("zip", ""),
            row_data.get("nature", ""),
            _format_date_csv(row_data.get("acquire_date", "")),
            _format_number(row_data.get("initial_value")),
            _format_number(row_data.get("peak_value")),
            _format_number(row_data.get("closing_balance")),
            _format_number(row_data.get("total_dividends")),
            _format_number(row_data.get("sale_proceeds")),
        ]
        lines.append(_format_row_as_csv_line(csv_row))

    csv_content = "".join(lines)
    logger.info(f"Generated CSV with {len(rows)} data rows for CY{calendar_year}")
    return csv_content.encode("utf-8")

