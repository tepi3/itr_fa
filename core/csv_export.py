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
    Convert DD/MM/YYYY display date to DD-MM-YYYY format for CSV.
    """
    if not date_str:
        return ""
    return date_str.replace("/", "-")


def _format_number(value) -> str:
    """Format number for CSV output — plain number, no commas."""
    if value is None:
        return ""
    return str(round(value))


def export_a3_csv(rows: list, calendar_year: int) -> bytes:
    """
    Generate a CSV file with A3 table data matching the ITR template format.

    Args:
        rows: List of calculated A3 row dicts from calculator.calculate_a3_rows()
        calendar_year: The calendar year being reported

    Returns:
        CSV file as bytes (for download)
    """
    output = StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow(CSV_HEADERS)

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

        writer.writerow(csv_row)

    csv_content = output.getvalue()
    logger.info(f"Generated CSV with {len(rows)} data rows for CY{calendar_year}")
    return csv_content.encode("utf-8")
