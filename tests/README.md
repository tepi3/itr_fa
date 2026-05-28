# ITR FA Pytest Suite Guide

This directory contains the unified, highly isolated pytest suite for the ITR FA (Schedule FA Section A3 Helper) desktop application.

---

## 1. How to Run the Tests

Make sure the Python virtual environment is activated, or use its path directly. When running tests, you must specify the `PYTHONPATH` as the root of the repository so Python can resolve the `core` and `routes` packages.

### 1.1 Run Unit Tests (Default)
Runs all unit and route tests. Excludes slow integration and Playwright-based UI screenshot regression tests:
```bash
PYTHONPATH=. ./venv/bin/pytest
```

### 1.2 Run Route/API Tests Only
```bash
PYTHONPATH=. ./venv/bin/pytest tests/test_routes_*.py
```

### 1.3 Run UI Regression Tests
Requires Playwright to be installed (`playwright install chromium`). This runs headless Chromium, navigates the actual UI, validates 40+ element assertions, and captures screenshots to `docs/screenshots/`:
```bash
PYTHONPATH=. ./venv/bin/pytest -m ui
```

### 1.4 Run E2E Integration Tests
Runs the manual E2E integration test against a live local server (uses the `requests` library):
```bash
PYTHONPATH=. ./venv/bin/pytest -m integration
```

### 1.5 Run Everything
```bash
PYTHONPATH=. ./venv/bin/pytest -m ""
```

---

## 2. Test Directory Structure & Purpose

| File | Type | What it covers |
|------|------|----------------|
| `conftest.py` | Shared Fixtures | Handles complete sandbox file isolation, mock SBI caches, dummy portfolios, and a headless Flask client. |
| `test_utils.py` | Unit | `core/utils.py` logic (ROUND_HALF_UP rounding, sanitization, settings atomic saves, legacy migrations). |
| `test_models.py` | Unit | Pydantic portfolio models, field default constraints, allowed extra attributes. |
| `test_csv_export.py` | Unit | `core/csv_export.py` structure, dates, and UTF-8 download outputs. |
| `test_smart_import.py` | Unit | Smart groupings, sorting, and status logic (`NEW`, `UPDATE`, `DUPLICATE`). |
| `test_calculator.py` | Unit | Capital gains calculations, FY quarters, offset set-off rules, and balance snapshots. |
| `test_merger.py` | Unit | FIFO sell queues, linked sell lot pre-creation, and insufficient balance warnings. |
| `test_peak_value.py` | Unit | Peak holdings value evaluation, lookback flags, and INR valuation dominance. |
| `test_sbi_rates.py` | Unit | Date calculations and manual cache overrides. |
| `test_routes_app.py` | API Route | disclaimer acceptance, theme preferences, update checker (offline mocked). |
| `test_routes_calculator.py`| API Route | calculation summaries, simulated sells, consolidated tax statements. |
| `test_routes_market.py` | API Route | manual rate overrides, market daily calendars, ticker details (offline mocked). |
| `test_routes_portfolio.py` | API Route | saving and loading portfolios. |
| `test_routes_users.py` | API Route | user profile listings, directory renaming, deletion, and demo setup. |
| `test_routes_parsers.py` | API Route | broker report uploads (E-Trade, IBKR) and transactions merging. |
| `test_ui_regression.py` | UI Regression | Runs automated Playwright user flows, asserts 40+ elements, and captures high-resolution screenshots. |
| `test_e2e.py` | Integration | End-to-end integration check against live local server. |

---

## 3. Sandboxing & Isolation

All tests are completely sandboxed. The `tmp_data_dir` fixture in `conftest.py` patches:
* `config.DATA_DIR`, `config.PORTFOLIOS_DIR`, `config.SETTINGS_FILE`, `config.SBI_CACHE_FILE`
* `core.utils.PORTFOLIOS_DIR`, `core.utils.SETTINGS_FILE`
* `routes.users.PORTFOLIOS_DIR`

This guarantees that **no tests will ever create, read, rename, or delete files inside your real `~/.fa_desk_data` user directory.**
