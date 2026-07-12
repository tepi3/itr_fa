import logging
import json
from datetime import datetime
from flask import Blueprint, jsonify, request
from core.utils import get_user_dir
from core.etrade_parser import process_etrade_files
from core.ibkr_parser import process_ibkr_files
from core.morgan_stanley_parser import process_morgan_stanley_file
from core.vested_parser import process_vested_files
from core.fidelity_parser import process_fidelity_files
from core.stock_data import get_company_info
from core.smart_import import group_and_deduplicate_transactions

from core.merger import apply_transactions

logger = logging.getLogger(__name__)
parsers_bp = Blueprint("parsers", __name__)

@parsers_bp.route("/api/merge", methods=["POST"])
def api_merge_transactions():
    """Apply a selected list of transactions to a portfolio."""
    data = request.get_json()
    portfolio = data.get("portfolio")
    transactions = data.get("transactions")

    if not portfolio or transactions is None:
        return jsonify({"error": "portfolio and transactions required"}), 400

    try:
        updated_portfolio = apply_transactions(portfolio, transactions)
        return jsonify({"success": True, "portfolio": updated_portfolio})
    except Exception as e:
        logger.exception("Merge error")
        return jsonify({"success": False, "error": str(e)}), 500

@parsers_bp.route("/api/import-previous-year", methods=["POST"])
def api_import_previous_year():
    """Import unsold lots from a previous year's portfolio."""
    data = request.get_json()
    source_year = data.get("source_year")
    target_year = data.get("target_year")
    username = request.args.get("username", "Default")
    
    if not source_year or not target_year:
        return jsonify({"error": "source_year and target_year required"}), 400

    user_dir, _ = get_user_dir(username)
    source_file = user_dir / f"portfolio_CY{source_year}.json"
    
    if not source_file.exists():
        return jsonify({"error": f"Source portfolio CY{source_year} not found"}), 404

    try:
        with open(source_file, "r", encoding="utf-8") as f:
            source_portfolio = json.load(f)
        
        # Logic to carry forward unsold lots
        new_stocks = []
        for stock in source_portfolio.get("stocks", []):
            new_lots = []
            for lot in stock.get("lots", []):
                # Calculate remaining qty from all sells in previous year's data
                sold_qty = sum(float(s["quantity"]) for s in lot.get("sells", []))
                
                if sold_qty < float(lot["quantity"]):
                    # Carry forward the lot with updated quantity
                    # We strip previous sells to avoid confusion in the UI for the new year
                    new_lot = lot.copy()
                    new_lot["quantity"] = float(lot["quantity"]) - sold_qty
                    new_lot["sells"] = []
                    new_lots.append(new_lot)
            
            if new_lots:
                new_stock = stock.copy()
                new_stock["lots"] = new_lots
                # Reset CY-specific fields
                new_stock.pop("dividends", None)
                new_stock.pop("yearly_max_price", None)
                new_stock.pop("yearly_max_price_date", None)
                new_stocks.append(new_stock)

        imported_portfolio = {
            "calendar_year": int(target_year),
            "stocks": new_stocks,
            "overrides": source_portfolio.get("overrides", {}),
            "sbi_rate_overrides": source_portfolio.get("sbi_rate_overrides", {}),
        }
        return jsonify({"success": True, "portfolio": imported_portfolio})
    except Exception as e:
        logger.exception("Import previous year error")
        return jsonify({"success": False, "error": str(e)}), 500

@parsers_bp.route("/api/upload-etrade", methods=["POST"])
def api_upload_etrade():
    """Upload and parse E-Trade reports (Holdings + Multiple G&L files) for Roll-Back."""
    etrade_file = request.files.get("etradeFile") # ByStatus
    # Multiple G&L files
    sell_files = request.files.getlist("sellFiles")

    has_sell_files = any(sf.filename for sf in sell_files)
    if not etrade_file and not has_sell_files:
        return jsonify({"error": "At least one Holdings (ByStatus) or Gain & Loss file is required"}), 400

    portfolio_data = request.form.get("portfolio")
    if portfolio_data:
        portfolio = json.loads(portfolio_data)
        calendar_year = portfolio.get("calendar_year", datetime.now().year)
    else:
        calendar_year = request.form.get("calendar_year", datetime.now().year)
        portfolio = {"calendar_year": int(calendar_year), "stocks": []}
    
    try:
        et_bytes = etrade_file.read() if etrade_file else b""
        et_name = etrade_file.filename if etrade_file else ""
        
        gnl_files_data = []
        for sf in sell_files:
            if sf.filename:
                gnl_files_data.append((sf.read(), sf.filename))
        
        result = process_etrade_files(
            et_bytes, et_name, 
            gnl_files_data,
            target_year=int(calendar_year)
        )
        
        smart_txs = group_and_deduplicate_transactions(result.get("transactions", []), portfolio)
        return jsonify({
            "success": True, 
            "transactions": smart_txs,
            "skipped_count": result.get("skipped_count", 0),
            "calendar_year": int(calendar_year)
        })
    except Exception as e:
        logger.exception("E-Trade upload error")
        return jsonify({"success": False, "error": str(e)}), 500

@parsers_bp.route("/api/upload-ibkr", methods=["POST"])
def api_upload_ibkr():
    """Upload and parse one or more IBKR Activity Statement CSV files."""
    # Accept multiple files via 'files' key, or single file via 'file' key (backward compat)
    files = request.files.getlist("files")
    if not files or all(not f.filename for f in files):
        single = request.files.get("file")
        if single and single.filename:
            files = [single]
        else:
            return jsonify({"error": "No file(s) uploaded"}), 400
    
    portfolio_data = request.form.get("portfolio")
    if portfolio_data:
        portfolio = json.loads(portfolio_data)
        calendar_year = portfolio.get("calendar_year", datetime.now().year)
    else:
        calendar_year = request.form.get("calendar_year", datetime.now().year)
        portfolio = {"calendar_year": int(calendar_year), "stocks": []}

    try:
        file_list = []
        for f in files:
            if f.filename:
                file_list.append((f.read(), f.filename))
        
        if not file_list:
            return jsonify({"error": "No valid files uploaded"}), 400

        result = process_ibkr_files(file_list, int(calendar_year))
        smart_txs = group_and_deduplicate_transactions(result.get("transactions", []), portfolio)
        
        response = {
            "success": True, 
            "transactions": smart_txs,
            "skipped_count": result.get("skipped_count", 0),
            "calendar_year": int(calendar_year),
        }
        
        # Surface unmatched sells as warnings
        unmatched = result.get("unmatched_sells", [])
        if unmatched:
            response["unmatched_sells"] = unmatched
        
        return jsonify(response)
    except Exception as e:
        logger.exception("IBKR upload error")
        return jsonify({"success": False, "error": str(e)}), 500

@parsers_bp.route("/api/upload-morgan-stanley", methods=["POST"])
def api_upload_morgan_stanley():
    """Upload and parse a Morgan Stanley Share Sale Cost Basis Report (.xlsx)."""
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]

    ticker = request.form.get("ticker", "").strip().upper()
    if not ticker:
        return jsonify({"error": "Ticker symbol is required"}), 400

    portfolio_data = request.form.get("portfolio")
    if portfolio_data:
        portfolio = json.loads(portfolio_data)
        calendar_year = portfolio.get("calendar_year", datetime.now().year)
    else:
        calendar_year = request.form.get("calendar_year", datetime.now().year)
        portfolio = {"calendar_year": int(calendar_year), "stocks": []}

    try:
        file_bytes = file.read()
        result = process_morgan_stanley_file(
            file_bytes, file.filename,
            target_year=int(calendar_year),
            ticker_symbol=ticker
        )
        smart_txs = group_and_deduplicate_transactions(result.get("transactions", []), portfolio)
        return jsonify({
            "success": True,
            "transactions": smart_txs,
            "skipped_count": result.get("skipped_count", 0),
            "calendar_year": int(calendar_year),
            "company_name": result.get("company_name", "")
        })
    except Exception as e:
        logger.exception("Morgan Stanley upload error")
        return jsonify({"success": False, "error": str(e)}), 500

@parsers_bp.route("/api/upload-fidelity", methods=["POST"])
def api_upload_fidelity():
    """Upload and parse Fidelity NetBenefits open/closed lots CSV files."""
    open_lots_file = request.files.get("openLotsFile")
    closed_lots_file = request.files.get("closedLotsFile")
    has_open = open_lots_file and open_lots_file.filename != ""
    has_closed = closed_lots_file and closed_lots_file.filename != ""
    if not has_open and not has_closed:
        return jsonify({"error": "At least one of Open Lots or Closed Lots CSV files is required"}), 400

    ticker = request.form.get("ticker", "").strip().upper()
    if not ticker:
        return jsonify({"error": "Ticker symbol is required"}), 400

    portfolio_data = request.form.get("portfolio")
    if portfolio_data:
        portfolio = json.loads(portfolio_data)
        calendar_year = portfolio.get("calendar_year", datetime.now().year)
    else:
        calendar_year = request.form.get("calendar_year", datetime.now().year)
        portfolio = {"calendar_year": int(calendar_year), "stocks": []}

    try:
        open_bytes = b""
        open_name = ""
        if has_open:
            open_bytes = open_lots_file.read()
            open_name = open_lots_file.filename
            
        closed_bytes = b""
        closed_name = ""
        if has_closed:
            closed_bytes = closed_lots_file.read()
            closed_name = closed_lots_file.filename

        result = process_fidelity_files(
            open_bytes, open_name,
            closed_bytes, closed_name,
            ticker=ticker,
            target_year=int(calendar_year)
        )
        smart_txs = group_and_deduplicate_transactions(result.get("transactions", []), portfolio)
        return jsonify({
            "success": True,
            "transactions": smart_txs,
            "skipped_count": result.get("skipped_count", 0),
            "calendar_year": int(calendar_year)
        })
    except Exception as e:
        logger.exception("Fidelity upload error")
        return jsonify({"success": False, "error": str(e)}), 500

@parsers_bp.route("/api/upload-vested", methods=["POST"])
def api_upload_vested():
    """Upload and parse one or more Vested statements (Excel format)."""
    files = request.files.getlist("files")
    if not files or all(not f.filename for f in files):
        single = request.files.get("file")
        if single and single.filename:
            files = [single]
        else:
            return jsonify({"error": "No file(s) uploaded"}), 400

    portfolio_data = request.form.get("portfolio")
    if portfolio_data:
        portfolio = json.loads(portfolio_data)
        calendar_year = portfolio.get("calendar_year", datetime.now().year)
    else:
        calendar_year = request.form.get("calendar_year", datetime.now().year)
        portfolio = {"calendar_year": int(calendar_year), "stocks": []}

    try:
        file_list = []
        for f in files:
            if f.filename:
                file_list.append((f.read(), f.filename))

        if not file_list:
            return jsonify({"error": "No valid files uploaded"}), 400

        result = process_vested_files(file_list, int(calendar_year))
        smart_txs = group_and_deduplicate_transactions(result.get("transactions", []), portfolio)

        response = {
            "success": True,
            "transactions": smart_txs,
            "skipped_count": result.get("skipped_count", 0),
            "calendar_year": int(calendar_year)
        }

        # Surface unmatched sells as warnings
        unmatched = result.get("unmatched_sells", [])
        if unmatched:
            response["unmatched_sells"] = unmatched

        return jsonify(response)
    except Exception as e:
        logger.exception("Vested upload error")
        return jsonify({"success": False, "error": str(e)}), 500
