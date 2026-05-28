import pytest
from datetime import datetime
from core.utils import (
    load_app_settings,
    save_app_settings,
    tax_round,
    init_user_storage,
    get_user_dir,
    parse_sort_date,
)

@pytest.mark.unit
def test_tax_round_half_up():
    assert tax_round(2.5, 0) == 3.0
    assert tax_round(3.5, 0) == 4.0
    assert tax_round(2.55, 1) == 2.6
    assert tax_round(2.65, 1) == 2.7

@pytest.mark.unit
def test_tax_round_none():
    assert tax_round(None) == 0.0

@pytest.mark.unit
def test_tax_round_precision():
    assert tax_round(1.005, 2) == 1.01
    assert tax_round(1.004, 2) == 1.00
    assert tax_round(1.006, 2) == 1.01

@pytest.mark.unit
def test_tax_round_invalid():
    assert tax_round("not_a_number") == 0.0
    assert tax_round("123.45") == 123.45

@pytest.mark.unit
def test_parse_sort_date_iso():
    assert parse_sort_date("2024-01-15") == datetime(2024, 1, 15)
    assert parse_sort_date("2024-01-15T12:00:00") == datetime(2024, 1, 15, 12, 0)

@pytest.mark.unit
def test_parse_sort_date_ddmmyyyy():
    assert parse_sort_date("15/01/2024") == datetime(2024, 1, 15)

@pytest.mark.unit
def test_parse_sort_date_empty():
    assert parse_sort_date("") == datetime.min
    assert parse_sort_date(None) == datetime.min
    assert parse_sort_date("invalid-date") == datetime.min

@pytest.mark.unit
def test_get_user_dir_sanitization(tmp_data_dir):
    user_dir, name = get_user_dir("te$t us/er")
    assert name == "tet user"
    assert user_dir.exists()
    assert user_dir.name == "tet user"

@pytest.mark.unit
def test_get_user_dir_empty(tmp_data_dir):
    user_dir, name = get_user_dir("")
    assert name == "Default"
    assert user_dir.exists()

@pytest.mark.unit
def test_load_save_settings_roundtrip(tmp_data_dir):
    settings = {"theme": "dark", "zoom": 1.2}
    save_app_settings(settings)
    loaded = load_app_settings()
    assert loaded["theme"] == "dark"
    assert loaded["zoom"] == 1.2

@pytest.mark.unit
def test_save_settings_merge(tmp_data_dir):
    save_app_settings({"theme": "dark"})
    save_app_settings({"zoom": 1.2})
    loaded = load_app_settings()
    assert loaded["theme"] == "dark"
    assert loaded["zoom"] == 1.2

@pytest.mark.unit
def test_init_user_storage_migration(tmp_data_dir):
    from config import PORTFOLIOS_DIR
    f1 = PORTFOLIOS_DIR / "portfolio_CY2024.json"
    f2 = PORTFOLIOS_DIR / "portfolio_CY2025.json"
    f1.write_text("{}", encoding="utf-8")
    f2.write_text("{}", encoding="utf-8")

    init_user_storage()

    default_dir = PORTFOLIOS_DIR / "Default"
    assert default_dir.exists()
    assert (default_dir / "portfolio_CY2024.json").exists()
    assert (default_dir / "portfolio_CY2025.json").exists()
    assert not f1.exists()
    assert not f2.exists()
