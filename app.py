"""
Flask application for ITR Schedule FA Section A3 Helper Tool.

Copyright (c) 2026 Piyush Tewari (tepi3). All rights reserved.
Licensed for personal, non-commercial use only.

Run with: python app.py
Opens at: http://localhost:5000
"""

import json
import logging
import uuid
import shutil
import webbrowser
from datetime import datetime
from pathlib import Path
from threading import Timer

from flask import Flask, jsonify, render_template, request, send_file

from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG, PORTFOLIOS_DIR
from core.sbi_rates import (
    refresh_cache, get_sbi_tt_rate, get_all_cached_rates,
    get_monthly_rates, save_manual_rate,
    lock_year_rates, unlock_year_rates, is_year_locked, get_locked_years,
)
from core.stock_data import (
    get_company_info,
    get_historical_prices,
    get_dividends,
    get_price_on_date,
    resolve_yahoo_ticker,
    has_dividends,
    get_yearly_max_price,
)
from core.calculator import calculate_a3_rows
from core.csv_export import export_a3_csv

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)


# --- Initialization & Migration ---

def init_user_storage():
    """Migrate any loose portfolio files to a Default user directory."""
    default_dir = PORTFOLIOS_DIR / "Default"
    
    # Check for legacy files in root of PORTFOLIOS_DIR
    legacy_files = list(PORTFOLIOS_DIR.glob("portfolio_CY*.json"))
    if legacy_files:
        default_dir.mkdir(exist_ok=True)
        for f in legacy_files:
            try:
                shutil.move(str(f), str(default_dir / f.name))
                logger.info(f"Migrated legacy portfolio {f.name} to Default user")
            except Exception as e:
                logger.error(f"Failed to migrate {f.name}: {e}")

init_user_storage()

def get_user_dir(username):
    """Get or create directory for user."""
    if not username:
        username = "Default"
    # Basic sanitization
    safe_name = "".join(c for c in username if c.isalnum() or c in (' ', '-', '_')).strip()
    if not safe_name:
        safe_name = "Default"
    user_dir = PORTFOLIOS_DIR / safe_name
    user_dir.mkdir(exist_ok=True)
    return user_dir, safe_name


# --- Page Routes ---

@app.route("/")
def index():
    """Serve the main UI page."""
    return render_template("index.html")


# --- User API Routes ---

@app.route("/api/users", methods=["GET"])
def api_list_users():
    """List all user profiles."""
    users = []
    for d in PORTFOLIOS_DIR.iterdir():
        if d.is_dir():
            users.append(d.name)
    return jsonify({"users": sorted(users)})

@app.route("/api/users", methods=["POST"])
def api_create_user():
    """Create a new user profile."""
    data = request.get_json()
    username = data.get("username")
    if not username:
        return jsonify({"error": "username required"}), 400
    _, safe_name = get_user_dir(username)
    return jsonify({"success": True, "username": safe_name})

@app.route("/api/users/<old_username>", methods=["PUT"])
def api_rename_user(old_username):
    """Rename a user profile."""
    data = request.get_json()
    new_username = data.get("new_username")
    if not new_username:
        return jsonify({"error": "new_username required"}), 400
    
    old_dir = PORTFOLIOS_DIR / old_username
    if not old_dir.exists() or not old_dir.is_dir():
        return jsonify({"error": "User not found"}), 404
        
    _, safe_new_name = get_user_dir(new_username)
    new_dir = PORTFOLIOS_DIR / safe_new_name
    
    if new_dir.exists() and new_dir != old_dir:
        return jsonify({"error": "New username already exists"}), 400
        
    old_dir.rename(new_dir)
    return jsonify({"success": True, "username": safe_new_name})

@app.route("/api/users/<username>", methods=["DELETE"])
def api_delete_user(username):
    """Delete a user profile and all their portfolios."""
    user_dir = PORTFOLIOS_DIR / username
    if not user_dir.exists() or not user_dir.is_dir():
        return jsonify({"error": "User not found"}), 404
        
    shutil.rmtree(user_dir)
    return jsonify({"success": True})


# --- Portfolio API Routes ---

@app.route("/api/lookup-stock", methods=["POST"])
def api_lookup_stock():
    """Fetch company info by ticker symbol."""
    data = request.get_json()
    ticker = data.get("ticker", "").strip()
    if not ticker:
        return jsonify({"error": "Ticker is required"}), 400

    info = get_company_info(ticker)
    return jsonify(info)


@app.route("/api/sbi-rate", methods=["GET"])
def api_sbi_rate():
    """Get SBI TT rate for a specific date (USD only)."""
    date_str = request.args.get("date")

    if not date_str:
        return jsonify({"error": "date parameter is required"}), 400

    try:
        from datetime import date as dt_date
        d = dt_date.fromisoformat(date_str)
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

    result = get_sbi_tt_rate(d)
    return jsonify(result)


@app.route("/api/stock-price", methods=["GET"])
def api_stock_price():
    """Get stock price on a specific date."""
    ticker = request.args.get("ticker", "")
    date_str = request.args.get("date", "")

    if not ticker or not date_str:
        return jsonify({"error": "ticker and date parameters required"}), 400

    price = get_price_on_date(ticker, date_str)
    return jsonify({"ticker": ticker, "date": date_str, "price": price})


@app.route("/api/dividends", methods=["GET"])
def api_dividends():
    """Get dividend data for a ticker and year."""
    ticker = request.args.get("ticker", "")
    year = request.args.get("year", "")

    if not ticker or not year:
        return jsonify({"error": "ticker and year parameters required"}), 400

    divs = get_dividends(ticker, int(year))
    has_divs = has_dividends(ticker)
    return jsonify({"ticker": ticker, "year": int(year), "dividends": divs, "has_dividends": has_divs})


@app.route("/api/yearly-max-price", methods=["GET"])
def api_yearly_max_price():
    """Get the yearly maximum closing price for a ticker (used for Peak Value calculation)."""
    ticker = request.args.get("ticker", "")
    year = request.args.get("year", "")

    if not ticker or not year:
        return jsonify({"error": "ticker and year parameters required"}), 400

    peak_info = get_yearly_max_price(ticker, int(year))
    return jsonify({
        "ticker": ticker,
        "year": int(year),
        "max_price": peak_info["max_price"],
        "max_price_date": peak_info["max_price_date"],
    })


@app.route("/api/fetch-sbi-rates", methods=["POST"])
def api_fetch_sbi_rates():
    """Download and cache SBI USD rates from GitHub."""
    try:
        count = refresh_cache()
        locked = get_locked_years()
        msg = {"success": True, "entries": count, "currency": "USD"}
        if locked:
            msg["locked_years"] = locked
            msg["note"] = f"Rates for locked years {locked} were not overwritten"
        return jsonify(msg)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    """Calculate all A3 rows for the portfolio."""
    portfolio = request.get_json()
    if not portfolio:
        return jsonify({"error": "Portfolio data required"}), 400

    try:
        rows = calculate_a3_rows(portfolio)
        return jsonify({"success": True, "rows": rows})
    except Exception as e:
        logger.exception("Calculation error")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/export-csv", methods=["POST"])
def api_export_csv():
    """Generate and download CSV file."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Data required"}), 400

    rows = data.get("rows", [])
    calendar_year = data.get("calendar_year", 2024)

    try:
        csv_bytes = export_a3_csv(rows, calendar_year)
        from io import BytesIO
        buffer = BytesIO(csv_bytes)
        buffer.seek(0)
        filename = f"Schedule_FA_A3_CY{calendar_year}.csv"
        return send_file(
            buffer,
            mimetype="text/csv",
            as_attachment=True,
            download_name=filename,
        )
    except Exception as e:
        logger.exception("CSV export error")
        return jsonify({"error": str(e)}), 500


@app.route("/api/save", methods=["POST"])
def api_save():
    """Save portfolio data to JSON file."""
    portfolio = request.get_json()
    if not portfolio:
        return jsonify({"error": "Portfolio data required"}), 400

    username = request.args.get("username", "Default")
    user_dir, _ = get_user_dir(username)

    calendar_year = portfolio.get("calendar_year", 2024)
    filename = f"portfolio_CY{calendar_year}.json"
    filepath = user_dir / filename

    with open(filepath, "w") as f:
        json.dump(portfolio, f, indent=2)

    return jsonify({"success": True, "filename": filename, "path": str(filepath)})


@app.route("/api/load", methods=["GET"])
def api_load():
    """Load saved portfolio data."""
    year = request.args.get("year")
    username = request.args.get("username", "Default")
    
    if not year:
        return jsonify({"error": "year parameter required"}), 400

    user_dir, _ = get_user_dir(username)
    filename = f"portfolio_CY{year}.json"
    filepath = user_dir / filename

    if not filepath.exists():
        return jsonify({"error": f"No saved portfolio for CY{year}", "found": False}), 404

    with open(filepath, "r") as f:
        portfolio = json.load(f)

    return jsonify({"success": True, "portfolio": portfolio})


@app.route("/api/list-saves", methods=["GET"])
def api_list_saves():
    """List all saved portfolio files."""
    username = request.args.get("username", "Default")
    user_dir, _ = get_user_dir(username)
    
    files = []
    for f in sorted(user_dir.glob("portfolio_CY*.json")):
        try:
            year = f.stem.replace("portfolio_CY", "")
            files.append({
                "year": int(year),
                "filename": f.name,
                "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            })
        except ValueError:
            continue
    return jsonify({"saves": files})


@app.route("/api/monthly-rates", methods=["GET"])
def api_monthly_rates():
    """Get SBI TT rates for each month of a given year (USD only)."""
    year = request.args.get("year")

    if not year:
        return jsonify({"error": "year parameter required"}), 400

    year_int = int(year)
    rates = get_monthly_rates(year_int)
    locked = is_year_locked(year_int)
    return jsonify({
        "success": True,
        "year": year_int,
        "currency": "USD",
        "rates": rates,
        "locked": locked,
    })


@app.route("/api/save-manual-rate", methods=["POST"])
def api_save_manual_rate():
    """Save a manually entered SBI TT rate (USD only)."""
    data = request.get_json()
    rate_date = data.get("rate_date")
    rate = data.get("rate")

    if not rate_date or rate is None:
        return jsonify({"error": "rate_date and rate are required"}), 400

    try:
        save_manual_rate(rate_date, float(rate))
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# --- Rate Locking API ---

@app.route("/api/lock-rates", methods=["POST"])
def api_lock_rates():
    """Lock or unlock rates for a given year."""
    data = request.get_json()
    year = data.get("year")
    action = data.get("action", "lock")  # "lock" or "unlock"

    if not year:
        return jsonify({"error": "year is required"}), 400

    try:
        year_int = int(year)
        if action == "lock":
            lock_year_rates(year_int)
        else:
            unlock_year_rates(year_int)
        return jsonify({"success": True, "year": year_int, "locked": action == "lock"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/locked-years", methods=["GET"])
def api_locked_years():
    """Get list of locked years."""
    return jsonify({"locked_years": get_locked_years()})


@app.route("/api/import-previous-year", methods=["POST"])
def api_import_previous_year():
    """Import previous year's portfolio as base for current year, with dividend auto-fetch."""
    data = request.get_json()
    target_year = data.get("target_year")
    source_year = data.get("source_year", target_year - 1 if target_year else None)
    username = request.args.get("username", "Default")

    if not target_year or not source_year:
        return jsonify({"error": "target_year required"}), 400

    user_dir, _ = get_user_dir(username)
    filepath = user_dir / f"portfolio_CY{source_year}.json"
    if not filepath.exists():
        return jsonify({"error": f"No saved portfolio for CY{source_year}"}), 404

    with open(filepath, "r") as f:
        old_portfolio = json.load(f)

    # Create new portfolio for target year
    new_portfolio = {
        "calendar_year": target_year,
        "stocks": [],
        "overrides": {},
        "sbi_rate_overrides": {},
    }

    for stock in old_portfolio.get("stocks", []):
        yahoo_ticker = stock.get("yahoo_ticker", stock["ticker"])

        new_stock = {
            "id": stock.get("id", str(uuid.uuid4())),
            "ticker": stock["ticker"],
            "yahoo_ticker": yahoo_ticker,
            "currency": "USD",
            "skip_dividends": stock.get("skip_dividends", False),
            "company_info": stock.get("company_info", {}),
            "lots": [],
            "dividends": [],
        }

        for lot in stock.get("lots", []):
            # Calculate remaining quantity after all sells
            qty = float(lot["quantity"])
            for sell in lot.get("sells", []):
                qty -= float(sell["quantity"])

            if qty > 0:
                # Carry forward this lot with only the remaining quantity (unsold)
                new_lot = {
                    "id": lot.get("id", str(uuid.uuid4())),
                    "buy_date": lot["buy_date"],
                    "quantity": qty,
                    "buy_price": lot["buy_price"],
                    "sells": [],  # Do not carry forward historical sells
                }
                new_stock["lots"].append(new_lot)

        if new_stock["lots"]:
            # Auto-fetch dividends and yearly max price for the target year
            if not new_stock.get("skip_dividends", False):
                try:
                    divs = get_dividends(yahoo_ticker, target_year)
                    new_stock["dividends"] = [
                        {
                            "id": str(uuid.uuid4()),
                            "ex_date": d["ex_date"],
                            "amount": d["amount"],
                        }
                        for d in divs
                    ]
                    logger.info(f"Fetched {len(divs)} dividends for {yahoo_ticker} in CY{target_year}")
                except Exception as e:
                    logger.warning(f"Could not fetch dividends for {yahoo_ticker}: {e}")

            # Always fetch yearly max price for peak value reference
            try:
                peak_info = get_yearly_max_price(yahoo_ticker, target_year)
                new_stock["yearly_max_price"] = peak_info["max_price"]
                new_stock["yearly_max_price_date"] = peak_info["max_price_date"]
                logger.info(f"Yearly max price for {yahoo_ticker} in CY{target_year}: {peak_info['max_price']} on {peak_info['max_price_date']}")
            except Exception as e:
                logger.warning(f"Could not fetch yearly max price for {yahoo_ticker}: {e}")

            new_portfolio["stocks"].append(new_stock)

    return jsonify({"success": True, "portfolio": new_portfolio})


@app.route("/api/upload-etrade", methods=["POST"])
def api_upload_etrade():
    """Upload and parse an Etrade file (CSV or XLSX)."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if not (file.filename.endswith('.csv') or file.filename.endswith('.xlsx')):
        return jsonify({"error": "File must be a CSV or XLSX"}), 400

    try:
        file_bytes = file.read()
        portfolio_str = request.form.get("portfolio", "{}")
        portfolio = json.loads(portfolio_str)
        
        from core.etrade_parser import process_etrade_file
        updated_portfolio = process_etrade_file(file_bytes, file.filename, portfolio)
        return jsonify({"success": True, "portfolio": updated_portfolio})
    except Exception as e:
        logger.exception("Etrade upload error")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/upload-sell-details", methods=["POST"])
def api_upload_sell_details():
    """Upload and parse a G&L Expanded file to populate acquisition lots and sell transactions."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if not (file.filename.endswith('.csv') or file.filename.endswith('.xlsx')):
        return jsonify({"error": "File must be a CSV or XLSX"}), 400

    try:
        file_bytes = file.read()
        portfolio_str = request.form.get("portfolio", "{}")
        portfolio = json.loads(portfolio_str)
        
        from core.sell_details_parser import process_sell_details_file
        updated_portfolio = process_sell_details_file(file_bytes, file.filename, portfolio)
        return jsonify({"success": True, "portfolio": updated_portfolio})
    except Exception as e:
        logger.exception("Sell details upload error")
        return jsonify({"success": False, "error": str(e)}), 500


def open_browser():
    """Open the browser after a short delay."""
    webbrowser.open(f"http://{FLASK_HOST}:{FLASK_PORT}")


if __name__ == "__main__":
    print(f"\n{'='*60}")
    print(f"  ITR Schedule FA - Section A3 Helper Tool")
    print(f"  Open: http://{FLASK_HOST}:{FLASK_PORT}")
    print(f"{'='*60}\n")

    # Open browser after 1.5 seconds
    if not FLASK_DEBUG:
        Timer(1.5, open_browser).start()

    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG)
