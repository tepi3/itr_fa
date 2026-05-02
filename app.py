"""
Flask application for ITR Schedule FA Section A3 Helper Tool.

Run with: python app.py
Opens at: http://localhost:5000
"""

import json
import logging
import uuid
import webbrowser
from datetime import datetime
from pathlib import Path
from threading import Timer

from flask import Flask, jsonify, render_template, request, send_file

from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG, PORTFOLIOS_DIR
from core.sbi_rates import refresh_cache, get_sbi_tt_rate, get_all_cached_rates, get_monthly_rates, save_manual_rate
from core.stock_data import (
    get_company_info,
    get_historical_prices,
    get_dividends,
    get_price_on_date,
    resolve_yahoo_ticker,
    get_currency_for_ticker,
    has_dividends,
)
from core.calculator import calculate_a3_rows
from core.excel_export import export_a3_excel

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)


# --- Page Routes ---

@app.route("/")
def index():
    """Serve the main UI page."""
    return render_template("index.html")


# --- API Routes ---

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
    """Get SBI TT rate for a specific date."""
    date_str = request.args.get("date")
    currency = request.args.get("currency", "USD")

    if not date_str:
        return jsonify({"error": "date parameter is required"}), 400

    try:
        from datetime import date as dt_date
        d = dt_date.fromisoformat(date_str)
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

    result = get_sbi_tt_rate(d, currency)
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


@app.route("/api/fetch-sbi-rates", methods=["POST"])
def api_fetch_sbi_rates():
    """Download and cache SBI rates from GitHub."""
    data = request.get_json() or {}
    currency = data.get("currency", "USD")

    try:
        count = refresh_cache(currency)
        return jsonify({"success": True, "entries": count, "currency": currency})
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


@app.route("/api/export-excel", methods=["POST"])
def api_export_excel():
    """Generate and download Excel file."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Data required"}), 400

    rows = data.get("rows", [])
    calendar_year = data.get("calendar_year", 2024)

    try:
        excel_bytes = export_a3_excel(rows, calendar_year)
        from io import BytesIO
        buffer = BytesIO(excel_bytes)
        buffer.seek(0)
        filename = f"Schedule_FA_A3_CY{calendar_year}.xlsx"
        return send_file(
            buffer,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=filename,
        )
    except Exception as e:
        logger.exception("Excel export error")
        return jsonify({"error": str(e)}), 500


@app.route("/api/save", methods=["POST"])
def api_save():
    """Save portfolio data to JSON file."""
    portfolio = request.get_json()
    if not portfolio:
        return jsonify({"error": "Portfolio data required"}), 400

    calendar_year = portfolio.get("calendar_year", 2024)
    filename = f"portfolio_CY{calendar_year}.json"
    filepath = PORTFOLIOS_DIR / filename

    with open(filepath, "w") as f:
        json.dump(portfolio, f, indent=2)

    return jsonify({"success": True, "filename": filename, "path": str(filepath)})


@app.route("/api/load", methods=["GET"])
def api_load():
    """Load saved portfolio data."""
    year = request.args.get("year")
    if not year:
        return jsonify({"error": "year parameter required"}), 400

    filename = f"portfolio_CY{year}.json"
    filepath = PORTFOLIOS_DIR / filename

    if not filepath.exists():
        return jsonify({"error": f"No saved portfolio for CY{year}", "found": False}), 404

    with open(filepath, "r") as f:
        portfolio = json.load(f)

    return jsonify({"success": True, "portfolio": portfolio})


@app.route("/api/list-saves", methods=["GET"])
def api_list_saves():
    """List all saved portfolio files."""
    files = []
    for f in sorted(PORTFOLIOS_DIR.glob("portfolio_CY*.json")):
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
    """Get SBI TT rates for each month of a given year."""
    year = request.args.get("year")
    currency = request.args.get("currency", "USD")

    if not year:
        return jsonify({"error": "year parameter required"}), 400

    rates = get_monthly_rates(int(year), currency)
    return jsonify({"success": True, "year": int(year), "currency": currency, "rates": rates})


@app.route("/api/save-manual-rate", methods=["POST"])
def api_save_manual_rate():
    """Save a manually entered SBI TT rate."""
    data = request.get_json()
    rate_date = data.get("rate_date")
    currency = data.get("currency", "USD")
    rate = data.get("rate")

    if not rate_date or rate is None:
        return jsonify({"error": "rate_date and rate are required"}), 400

    try:
        save_manual_rate(rate_date, currency, float(rate))
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/import-previous-year", methods=["POST"])
def api_import_previous_year():
    """Import previous year's portfolio as base for current year."""
    data = request.get_json()
    target_year = data.get("target_year")
    source_year = data.get("source_year", target_year - 1 if target_year else None)

    if not target_year or not source_year:
        return jsonify({"error": "target_year required"}), 400

    filepath = PORTFOLIOS_DIR / f"portfolio_CY{source_year}.json"
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
        new_stock = {
            "id": stock.get("id", str(uuid.uuid4())),
            "ticker": stock["ticker"],
            "yahoo_ticker": stock.get("yahoo_ticker", stock["ticker"]),
            "currency": stock.get("currency", "USD"),
            "skip_dividends": stock.get("skip_dividends", False),
            "company_info": stock.get("company_info", {}),
            "lots": [],
        }

        for lot in stock.get("lots", []):
            # Calculate remaining quantity after all sells
            qty = float(lot["quantity"])
            for sell in lot.get("sells", []):
                qty -= float(sell["quantity"])

            if qty > 0:
                # Carry forward this lot (with all historical sells preserved)
                new_lot = {
                    "id": lot.get("id", str(uuid.uuid4())),
                    "buy_date": lot["buy_date"],
                    "quantity": lot["quantity"],
                    "buy_price": lot["buy_price"],
                    "sells": lot.get("sells", []),  # Keep historical sells
                }
                new_stock["lots"].append(new_lot)

        if new_stock["lots"]:
            new_portfolio["stocks"].append(new_stock)

    return jsonify({"success": True, "portfolio": new_portfolio})


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
