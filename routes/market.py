import logging
from datetime import date as dt_date
from flask import Blueprint, jsonify, request
from core.sbi_rates import (
    get_sbi_tt_rate, get_monthly_rates, save_manual_rate,
    refresh_cache, lock_year_rates, unlock_year_rates, 
    is_year_locked, get_locked_years, get_daily_rates,
    clear_sbi_cache
)
from core.stock_data import (
    get_company_info, get_price_on_date, get_dividends,
    has_dividends, get_yearly_max_price, get_live_price,
    get_historical_prices, clear_stock_cache
)
from datetime import date as dt_date, timedelta, datetime

logger = logging.getLogger(__name__)
market_bp = Blueprint("market", __name__)

@market_bp.route("/api/ticker-history", methods=["GET"])
def api_ticker_history():
    """Get the last 2 years of closing prices for a ticker."""
    ticker = request.args.get("ticker", "").strip()
    if not ticker:
        return jsonify({"error": "ticker parameter required"}), 400
    
    end = dt_date.today()
    start = end - timedelta(days=750) # Fetch 2 years + buffer
    
    prices = get_historical_prices(ticker, start.isoformat(), end.isoformat())
    return jsonify({"ticker": ticker, "prices": prices})

@market_bp.route("/api/lookup-stock", methods=["POST"])
def api_lookup_stock():
    """Fetch company info by ticker symbol."""
    data = request.get_json()
    ticker = data.get("ticker", "").strip()
    if not ticker:
        return jsonify({"error": "Ticker is required"}), 400
    info = get_company_info(ticker)
    return jsonify(info)

@market_bp.route("/api/sbi-rate", methods=["GET"])
def api_sbi_rate():
    """Get SBI TT rate for a specific date (USD only)."""
    date_str = request.args.get("date")
    use_event = request.args.get("use_event_date", "false").lower() == "true"
    if not date_str:
        return jsonify({"error": "date parameter is required"}), 400
    try:
        if "/" in date_str:
            d = datetime.strptime(date_str, "%d/%m/%Y").date()
        else:
            d = dt_date.fromisoformat(date_str)
    except ValueError:
        return jsonify({"error": "Invalid date format. Use dd/mm/yyyy"}), 400
    result = get_sbi_tt_rate(d, use_event_date=use_event)
    return jsonify(result)

@market_bp.route("/api/stock-price", methods=["GET"])
def api_stock_price():
    """Get stock price on a specific date."""
    ticker = request.args.get("ticker", "")
    date_str = request.args.get("date", "")
    if not ticker or not date_str:
        return jsonify({"error": "ticker and date parameters required"}), 400
    price = get_price_on_date(ticker, date_str)
    return jsonify({"ticker": ticker, "date": date_str, "price": price})

@market_bp.route("/api/dividends", methods=["GET"])
def api_dividends():
    """Get dividend data for a ticker and year."""
    ticker = request.args.get("ticker", "")
    year = request.args.get("year", "")
    if not ticker or not year:
        return jsonify({"error": "ticker and year parameters required"}), 400
    divs = get_dividends(ticker, int(year))
    has_divs = has_dividends(ticker)
    return jsonify({"ticker": ticker, "year": int(year), "dividends": divs, "has_dividends": has_divs})

@market_bp.route("/api/yearly-max-price", methods=["GET"])
def api_yearly_max_price():
    """Get max price for a ticker in a calendar year."""
    ticker = request.args.get("ticker", "")
    year = request.args.get("year", "")
    if not ticker or not year:
        return jsonify({"error": "ticker and year parameters required"}), 400
    result = get_yearly_max_price(ticker, int(year))
    return jsonify(result)

@market_bp.route("/api/live-price", methods=["GET"])
def api_live_price():
    """Get the current live market price for a ticker (intraday, not dividend-adjusted)."""
    ticker = request.args.get("ticker", "").strip()
    if not ticker:
        return jsonify({"error": "ticker parameter required"}), 400
    result = get_live_price(ticker)
    return jsonify(result)

@market_bp.route("/api/monthly-rates", methods=["GET"])
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

@market_bp.route("/api/daily-rates", methods=["GET"])
def api_daily_rates():
    """Get SBI TT daily rates for a selected calendar year and month (USD only)."""
    year = request.args.get("year")
    month = request.args.get("month")
    if not year or not month:
        return jsonify({"error": "year and month parameters required"}), 400
    try:
        year_int = int(year)
        month_int = int(month)
        rates = get_daily_rates(year_int, month_int)
        locked = is_year_locked(year_int)
        return jsonify({
            "success": True,
            "year": year_int,
            "month": month_int,
            "currency": "USD",
            "rates": rates,
            "locked": locked,
        })
    except Exception as e:
        logger.exception("Failed to get daily rates")
        return jsonify({"success": False, "error": str(e)}), 500

@market_bp.route("/api/save-manual-rate", methods=["POST"])
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

@market_bp.route("/api/fetch-sbi-rates", methods=["POST"])
def api_fetch_sbi_rates():
    """Force download and cache SBI rates."""
    try:
        data = request.get_json() or {}
        overwrite = data.get("overwrite", True)
        updated = refresh_cache(overwrite=overwrite)
        return jsonify({"success": True, "updated": updated})
    except Exception as e:
        logger.exception("Failed to fetch SBI rates")
        return jsonify({"success": False, "error": str(e)}), 500


@market_bp.route("/api/clear-sbi-rates", methods=["POST"])
def api_clear_sbi_rates():
    """Clear all manual rate overrides and fetched rates from disk cache."""
    try:
        clear_sbi_cache()
        return jsonify({"success": True})
    except Exception as e:
        logger.exception("Failed to clear SBI rates cache")
        return jsonify({"success": False, "error": str(e)}), 500


@market_bp.route("/api/export-sbi-rates", methods=["GET"])
def api_export_sbi_rates():
    """Export SBI rates cache file as JSON."""
    try:
        from config import SBI_CACHE_FILE
        import json
        if SBI_CACHE_FILE.exists():
            with open(SBI_CACHE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = {"rates": {"USD": {}}}
        return jsonify({"success": True, "data": data})
    except Exception as e:
        logger.exception("Failed to export SBI rates")
        return jsonify({"success": False, "error": str(e)}), 500


@market_bp.route("/api/import-sbi-rates", methods=["POST"])
def api_import_sbi_rates():
    """Import SBI rates cache from uploaded JSON."""
    try:
        import json
        from config import SBI_CACHE_FILE
        from core.sbi_rates import _save_cache
        data = request.get_json()
        if not data or "rates" not in data:
            return jsonify({"success": False, "error": "Invalid format: 'rates' key is required."}), 400
        
        # Validation
        if not isinstance(data["rates"], dict) or "USD" not in data["rates"] or not isinstance(data["rates"]["USD"], dict):
            return jsonify({"success": False, "error": "Invalid structure: 'rates.USD' must be an object."}), 400
        
        cleaned_usd = {}
        for d_str, val in data["rates"]["USD"].items():
            try:
                # Validate format YYYY-MM-DD
                dt_date.fromisoformat(d_str)
                cleaned_usd[d_str] = float(val)
            except ValueError:
                continue
                
        cleaned_data = {
            "rates": {
                "USD": cleaned_usd
            },
            "locked_years": data.get("locked_years", [])
        }
        
        _save_cache(cleaned_data)
        return jsonify({"success": True})
    except Exception as e:
        logger.exception("Failed to import SBI rates")
        return jsonify({"success": False, "error": str(e)}), 500


@market_bp.route("/api/lock-rates", methods=["POST"])
def api_lock_rates():
    """Lock rates for a given year."""
    data = request.get_json()
    year = data.get("year")
    if not year:
        return jsonify({"error": "year required"}), 400
    lock_year_rates(int(year))
    return jsonify({"success": True})

@market_bp.route("/api/unlock-rates", methods=["POST"])
def api_unlock_rates():
    """Unlock rates for a given year."""
    data = request.get_json()
    year = data.get("year")
    if not year:
        return jsonify({"error": "year required"}), 400
    unlock_year_rates(int(year))
    return jsonify({"success": True})

@market_bp.route("/api/locked-years", methods=["GET"])
def api_locked_years():
    """Get list of locked years."""
    return jsonify({"locked_years": get_locked_years()})

@market_bp.route("/api/clear-stock-cache", methods=["POST"])
def api_clear_stock_cache():
    """Clear all cached yfinance data."""
    success = clear_stock_cache()
    return jsonify({"success": success})


@market_bp.route("/api/sbi-cache-status", methods=["GET"])
def api_sbi_cache_status():
    """Check if the SBI rates cache on disk is empty."""
    try:
        from config import SBI_CACHE_FILE
        import json
        raw_rates = {}
        if SBI_CACHE_FILE.exists():
            try:
                with open(SBI_CACHE_FILE, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                    raw_rates = raw_data.get("rates", {}).get("USD", {})
            except Exception:
                pass
        return jsonify({
            "success": True,
            "empty": not bool(raw_rates)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

