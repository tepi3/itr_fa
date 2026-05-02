"""Configuration constants for the ITR FA A3 tool."""

import os
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent

# Data directory for caches and saved portfolios
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

PORTFOLIOS_DIR = DATA_DIR / "portfolios"
PORTFOLIOS_DIR.mkdir(exist_ok=True)

# SBI rate cache
SBI_CACHE_FILE = DATA_DIR / "sbi_rates_cache.json"

# SBI CSV URLs from sahilgupta/sbi-fx-ratekeeper
SBI_CSV_URLS = {
    "USD": "https://raw.githubusercontent.com/sahilgupta/sbi-fx-ratekeeper/main/csv_files/SBI_REFERENCE_RATES_USD.csv",
    "GBP": "https://raw.githubusercontent.com/sahilgupta/sbi-fx-ratekeeper/main/csv_files/SBI_REFERENCE_RATES_GBP.csv",
    "EUR": "https://raw.githubusercontent.com/sahilgupta/sbi-fx-ratekeeper/main/csv_files/SBI_REFERENCE_RATES_EUR.csv",
}

# Country code mapping for ITR Schedule FA
COUNTRY_CODES = {
    "United States": "2-UNITED STATES OF AMERICA",
    "United Kingdom": "3-UNITED KINGDOM",
    "Ireland": "4-IRELAND",
    "Germany": "5-GERMANY",
    "Japan": "6-JAPAN",
    "Canada": "7-CANADA",
    "Singapore": "8-SINGAPORE",
    "Hong Kong": "9-HONG KONG",
    "Australia": "10-AUSTRALIA",
    "Switzerland": "11-SWITZERLAND",
    "Netherlands": "12-NETHERLANDS",
    "France": "13-FRANCE",
    "Luxembourg": "14-LUXEMBOURG",
}

# Default Flask settings
FLASK_HOST = "127.0.0.1"
FLASK_PORT = 5000
FLASK_DEBUG = True
