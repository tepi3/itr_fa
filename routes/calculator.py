import logging
import json
from io import BytesIO
from flask import Blueprint, jsonify, request, send_file
from core.calculator import calculate_tax_year_summary, simulate_sell_impact, calculate_a3_rows
from core.csv_export import export_a3_csv
from core.utils import get_user_dir

logger = logging.getLogger(__name__)
calculator_bp = Blueprint("calculator", __name__)

@calculator_bp.route("/api/consolidated-tax-summary", methods=["POST"])
def api_consolidated_tax_summary():
    """
    Join two calendar years to form one Indian Tax Year (Apr-Mar).
    TY Start Year 2023 -> combines:
      - Apr-Dec 2023 (from CY 2023 'curr' bucket)
      - Jan-Mar 2024 (from CY 2024 'prev' bucket)
    """
    try:
        data = request.get_json()
        fy_start_year = data.get("fy_start_year")
        username = data.get("username", "Default")
        current_portfolio = data.get("current_portfolio")
        sbi_tt_mode = data.get("sbi_tt_mode", "split")

        if not fy_start_year:
            return jsonify({"error": "fy_start_year required"}), 400
        
        fyStartYear = int(fy_start_year)

        user_dir, _ = get_user_dir(username)

        def load_cy_summary(year):
            portfolio = None
            if current_portfolio and current_portfolio.get("calendar_year") == year:
                portfolio = current_portfolio
            else:
                path = user_dir / f"portfolio_CY{year}.json"
                if path.exists():
                    try:
                        with open(path, "r", encoding="utf-8") as f:
                            portfolio = json.load(f)
                    except Exception as e:
                        logger.error(f"Error loading CY{year} for consolidated: {e}")
                        return None
            
            if portfolio:
                from core.stock_data import get_dividends
                from core.calculator import _parse_date
                # Ensure dividends for the requested year are present
                for stock in portfolio.get("stocks", []):
                    if stock.get("skip_dividends"):
                        continue
                    ticker = stock.get("yahoo_ticker") or stock.get("ticker")
                    if not ticker:
                        continue
                    
                    divs = stock.get("dividends", [])
                    has_year_divs = False
                    for d in divs:
                        ex_str = d.get("ex_date")
                        if ex_str and _parse_date(ex_str).year == year:
                            has_year_divs = True
                            break
                    
                    if not has_year_divs:
                        fetched = get_dividends(ticker, year)
                        if fetched:
                            if "dividends" not in stock:
                                stock["dividends"] = []
                            for fd in fetched:
                                stock["dividends"].append({
                                    "ex_date": fd["ex_date"],
                                    "payment_date": fd.get("payment_date") or fd["ex_date"],
                                    "amount": fd["amount"],
                                    "is_manual": False
                                })
                return calculate_tax_year_summary(portfolio, mode=sbi_tt_mode)
            return None

        # Load both years
        cy_start_res = load_cy_summary(fyStartYear)
        cy_end_res = load_cy_summary(fyStartYear + 1)

        # Consolidated structure
        consolidated = {
            "fy_label": f"Apr {fyStartYear} – Mar {fyStartYear + 1}",
            "fy_start_year": fyStartYear,
            "fy_end_year": fyStartYear + 1,
            "has_cy_start": cy_start_res is not None,
            "has_cy_end": cy_end_res is not None,
            "stocks": {},
            "totals": {
                "ltcg": {"total": 0, "q1": 0, "q2": 0, "q3": 0, "q4": 0, "q5": 0},
                "ltcl": {"total": 0, "q1": 0, "q2": 0, "q3": 0, "q4": 0, "q5": 0},
                "stcg": {"total": 0, "q1": 0, "q2": 0, "q3": 0, "q4": 0, "q5": 0},
                "stcl": {"total": 0, "q1": 0, "q2": 0, "q3": 0, "q4": 0, "q5": 0},
                "dividends": {"total": 0, "q1": 0, "q2": 0, "q3": 0, "q4": 0, "q5": 0},
            },
            "errors": []
        }

        def merge_ty(source_ty):
            # Merge stocks
            for ticker, sdata in source_ty["stocks"].items():
                if ticker not in consolidated["stocks"]:
                    consolidated["stocks"][ticker] = {
                        "ltcg": {"total": 0, "q1": 0, "q2": 0, "q3": 0, "q4": 0, "q5": 0},
                        "ltcl": {"total": 0, "q1": 0, "q2": 0, "q3": 0, "q4": 0, "q5": 0},
                        "stcg": {"total": 0, "q1": 0, "q2": 0, "q3": 0, "q4": 0, "q5": 0},
                        "stcl": {"total": 0, "q1": 0, "q2": 0, "q3": 0, "q4": 0, "q5": 0},
                        "dividends": {"total": 0, "q1": 0, "q2": 0, "q3": 0, "q4": 0, "q5": 0},
                    }
                dest = consolidated["stocks"][ticker]
                for cat in ["ltcg", "ltcl", "stcg", "stcl", "dividends"]:
                    for q in ["total", "q1", "q2", "q3", "q4", "q5"]:
                        dest[cat][q] += sdata[cat].get(q, 0)

            # Merge totals
            for cat in ["ltcg", "ltcl", "stcg", "stcl", "dividends"]:
                for q in ["total", "q1", "q2", "q3", "q4", "q5"]:
                    consolidated["totals"][cat][q] += source_ty["totals"][cat].get(q, 0)

        if cy_start_res:
            merge_ty(cy_start_res["tax_years"]["curr"])
            consolidated["errors"].extend(cy_start_res.get("errors", []))
        if cy_end_res:
            merge_ty(cy_end_res["tax_years"]["prev"])
            consolidated["errors"].extend(cy_end_res.get("errors", []))

        # Unique errors
        consolidated["errors"] = sorted(list(set(consolidated["errors"])))

        # Re-run offset logic on consolidated data
        from core.calculator import compute_offset_summary
        wrapped = {"prev": consolidated, "curr": {"totals": {
            "ltcg": {"total": 0}, "ltcl": {"total": 0}, "stcg": {"total": 0}, "stcl": {"total": 0}
        }}}
        compute_offset_summary(wrapped)
        
        return jsonify({"success": True, "consolidated": consolidated})
    except Exception as e:
        logger.exception("Consolidated tax summary error")
        return jsonify({"success": False, "error": str(e)}), 500

@calculator_bp.route("/api/calculate", methods=["POST"])
def api_calculate():
    """Calculate all A3 columns for the entire portfolio."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Portfolio data required"}), 400
    try:
        portfolio = data
        mode = data.get("sbi_tt_mode", "split")
        result = calculate_a3_rows(portfolio, mode=mode)
        return jsonify({"success": True, **result})
    except Exception as e:
        logger.exception("Calculation error")
        return jsonify({"success": False, "error": str(e)}), 500

@calculator_bp.route("/api/tax-year-summary", methods=["POST"])
def api_tax_year_summary():
    """Calculate consolidated tax-year summary (LTCG/STCG) with offset logic."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Data required"}), 400
    try:
        mode = data.get("sbi_tt_mode", "split")
        result = calculate_tax_year_summary(data, mode=mode)
        return jsonify({"success": True, **result})
    except Exception as e:
        logger.exception("Tax year summary error")
        return jsonify({"success": False, "error": str(e)}), 500

@calculator_bp.route("/api/sell-helper/simulate", methods=["POST"])
def api_sell_helper_simulate():
    """Simulate capital gains tax impact for hypothetical sells."""
    payload = request.get_json()
    if not payload:
        return jsonify({"error": "Payload required"}), 400
    try:
        mode = payload.get("sbi_tt_mode", "split")
        result = simulate_sell_impact(payload, mode=mode)
        return jsonify({"success": True, **result})
    except Exception as e:
        logger.exception("Sell helper simulation error")
        return jsonify({"success": False, "error": str(e)}), 500

@calculator_bp.route("/api/export-csv", methods=["POST"])
def api_export_csv():
    """Generate and download CSV file."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Data required"}), 400
    rows = data.get("rows", [])
    calendar_year = data.get("calendar_year", 2024)
    try:
        csv_bytes = export_a3_csv(rows, calendar_year)
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
