"""
Shared pytest fixtures for the ITR FA test suite.

Provides isolated filesystem fixtures, SBI rate cache helpers,
sample portfolio data, and Flask test client.
"""
import json
import pytest
from pathlib import Path


# ────────────────────────────────────────────────────────────
#  Filesystem Isolation
# ────────────────────────────────────────────────────────────

@pytest.fixture
def tmp_data_dir(tmp_path, monkeypatch):
    """
    Redirect all data-directory constants to tmp_path so tests
    never touch the real ~/.fa_desk_data directory.
    """
    data_dir = tmp_path / "fa_desk_data"
    data_dir.mkdir()
    portfolios_dir = data_dir / "portfolios"
    portfolios_dir.mkdir()
    settings_file = data_dir / "settings.json"
    sbi_cache_file = data_dir / "sbi_rates_cache.json"

    # Patch config module constants
    monkeypatch.setattr("config.DATA_DIR", data_dir)
    monkeypatch.setattr("config.PORTFOLIOS_DIR", portfolios_dir)
    monkeypatch.setattr("config.SETTINGS_FILE", settings_file)
    monkeypatch.setattr("config.SBI_CACHE_FILE", sbi_cache_file)

    # Patch sbi_rates module's import of SBI_CACHE_FILE
    monkeypatch.setattr("core.sbi_rates.SBI_CACHE_FILE", sbi_cache_file)

    # Patch utils module's imports
    monkeypatch.setattr("core.utils.PORTFOLIOS_DIR", portfolios_dir)
    monkeypatch.setattr("core.utils.SETTINGS_FILE", settings_file)

    # Patch routes module's imports
    monkeypatch.setattr("routes.users.PORTFOLIOS_DIR", portfolios_dir)

    return data_dir


@pytest.fixture
def sbi_cache(tmp_data_dir):
    """
    Helper to populate the SBI rate cache with test data.

    Usage:
        def test_something(sbi_cache):
            sbi_cache({"2024-07-31": 83.50, "2024-06-30": 82.50})
    """
    cache_file = tmp_data_dir / "sbi_rates_cache.json"

    def _populate(rates: dict, manual_usd: list = None, locked_years: list = None):
        cache_data = {
            "rates": {"USD": rates},
            "manual_USD": manual_usd or [],
            "locked_years": locked_years or [],
        }
        with open(cache_file, "w") as f:
            json.dump(cache_data, f)

    return _populate


# ────────────────────────────────────────────────────────────
#  Sample Portfolio Data
# ────────────────────────────────────────────────────────────

@pytest.fixture
def sample_portfolio():
    """
    A well-formed portfolio dict with:
    - AAPL: 2 lots (one with a sell, one without), dividends
    - TSLA: 1 lot with a sell, skip_dividends=True
    """
    return {
        "calendar_year": 2024,
        "stocks": [
            {
                "id": "stock_aapl",
                "ticker": "AAPL",
                "yahoo_ticker": "AAPL",
                "currency": "USD",
                "skip_dividends": False,
                "company_info": {
                    "country_code": "2-UNITED STATES OF AMERICA",
                    "name": "Apple Inc.",
                    "address": "One Apple Park Way, Cupertino, CA",
                    "zip": "95014",
                    "nature": "Company",
                    "country": "United States",
                    "display_name": "Apple Inc. (AAPL)",
                },
                "lots": [
                    {
                        "id": "lot_aapl_1",
                        "buy_date": "15/01/2022",
                        "quantity": 50.0,
                        "buy_price": 150.00,
                        "sells": [
                            {
                                "id": "sell_aapl_1",
                                "sell_date": "10/05/2024",
                                "quantity": 20.0,
                                "sell_price": 180.00,
                            }
                        ],
                    },
                    {
                        "id": "lot_aapl_2",
                        "buy_date": "20/06/2023",
                        "quantity": 30.0,
                        "buy_price": 170.00,
                        "sells": [],
                    },
                ],
                "dividends": [
                    {"id": "div_1", "ex_date": "2024-02-09", "payment_date": "2024-02-15", "amount": 0.24},
                    {"id": "div_2", "ex_date": "2024-05-10", "payment_date": "2024-05-16", "amount": 0.25},
                    {"id": "div_3", "ex_date": "2024-08-12", "payment_date": "2024-08-15", "amount": 0.25},
                    {"id": "div_4", "ex_date": "2024-11-01", "payment_date": "2024-11-14", "amount": 0.25},
                ],
            },
            {
                "id": "stock_tsla",
                "ticker": "TSLA",
                "yahoo_ticker": "TSLA",
                "currency": "USD",
                "skip_dividends": True,
                "company_info": {
                    "country_code": "2-UNITED STATES OF AMERICA",
                    "name": "Tesla, Inc.",
                    "address": "1 Tesla Road, Austin, TX",
                    "zip": "78725",
                    "nature": "Company",
                    "country": "United States",
                    "display_name": "Tesla, Inc. (TSLA)",
                },
                "lots": [
                    {
                        "id": "lot_tsla_1",
                        "buy_date": "01/03/2021",
                        "quantity": 25.0,
                        "buy_price": 200.00,
                        "sells": [
                            {
                                "id": "sell_tsla_1",
                                "sell_date": "15/07/2024",
                                "quantity": 10.0,
                                "sell_price": 250.00,
                            }
                        ],
                    }
                ],
            },
        ],
        "overrides": {},
        "sbi_rate_overrides": {},
    }


@pytest.fixture
def sample_a3_rows():
    """Sample calculated A3 rows (as returned by calculate_a3_rows)."""
    return [
        {
            "lot_id": "lot_aapl_1",
            "sl_no": 1,
            "ticker": "AAPL",
            "country": "2-UNITED STATES OF AMERICA",
            "entity_name": "Apple Inc. (AAPL)",
            "address": "One Apple Park Way, Cupertino, CA",
            "zip": "95014",
            "nature": "Company",
            "acquire_date": "15/01/2022",
            "initial_value": 625000,
            "peak_value": 750000,
            "closing_balance": 500000,
            "total_dividends": 2000,
            "sale_proceeds": 300000,
        },
        {
            "lot_id": "lot_tsla_1",
            "sl_no": 2,
            "ticker": "TSLA",
            "country": "2-UNITED STATES OF AMERICA",
            "entity_name": "Tesla, Inc. (TSLA)",
            "address": "1 Tesla Road, Austin, TX",
            "zip": "78725",
            "nature": "Company",
            "acquire_date": "01/03/2021",
            "initial_value": 400000,
            "peak_value": 520000,
            "closing_balance": 310000,
            "total_dividends": 0,
            "sale_proceeds": 210000,
        },
    ]


# ────────────────────────────────────────────────────────────
#  SBI Rate Fixture Data
# ────────────────────────────────────────────────────────────

@pytest.fixture
def full_2024_sbi_rates():
    """
    A comprehensive set of SBI TT rates for CY2024 testing.
    Covers month-end dates needed for Rule 115 calculations.
    """
    return {
        # 2023 (needed for Jan 2024 Rule 115)
        "2023-12-29": 83.10,
        "2023-12-31": 83.15,
        # 2024 month-end rates
        "2024-01-31": 83.00,
        "2024-02-09": 83.05,
        "2024-02-15": 83.08,
        "2024-02-29": 83.10,
        "2024-03-29": 83.20,
        "2024-03-31": 83.25,
        "2024-04-30": 83.30,
        "2024-05-10": 83.35,
        "2024-05-16": 83.38,
        "2024-05-31": 83.40,
        "2024-06-20": 83.42,
        "2024-06-28": 83.45,
        "2024-06-30": 83.50,
        "2024-07-15": 83.55,
        "2024-07-31": 83.60,
        "2024-08-12": 83.62,
        "2024-08-15": 83.65,
        "2024-08-30": 83.70,
        "2024-08-31": 83.70,
        "2024-09-30": 83.80,
        "2024-10-31": 84.00,
        "2024-11-01": 84.02,
        "2024-11-14": 84.05,
        "2024-11-29": 84.10,
        "2024-11-30": 84.15,
        "2024-12-31": 84.20,
        # 2022 rates (for lots bought in 2022)
        "2021-12-31": 74.50,
        "2022-01-15": 74.55,
        "2022-01-31": 74.60,
        # 2023 rates (for lots bought in 2023)
        "2023-05-31": 82.50,
        "2023-06-20": 82.55,
        "2023-06-30": 82.60,
        # 2021 rates (for TSLA lot)
        "2021-02-26": 73.00,
        "2021-02-28": 73.05,
        "2021-03-01": 73.10,
    }


# ────────────────────────────────────────────────────────────
#  Flask Test Client
# ────────────────────────────────────────────────────────────

@pytest.fixture
def flask_app(tmp_data_dir, monkeypatch):
    """
    Create a Flask app instance for route testing.
    Uses tmp_data_dir so tests don't touch real data.
    """
    # Prevent baseline rate loading from interfering with tests
    monkeypatch.setattr("core.sbi_rates._load_baseline_rates", lambda: {})

    import app as main_app
    main_app.init_flask_app()
    main_app.state.app.config["TESTING"] = True
    return main_app.state.app


@pytest.fixture
def client(flask_app):
    """Flask test client for API endpoint tests."""
    return flask_app.test_client()
