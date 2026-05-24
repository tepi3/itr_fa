import json
import logging
from datetime import datetime
from flask import Blueprint, jsonify, request
from core.utils import get_user_dir
from core.models import Portfolio
from core.calculator import calculate_current_balance

logger = logging.getLogger(__name__)
portfolio_bp = Blueprint("portfolio", __name__)

@portfolio_bp.route("/api/save", methods=["POST"])
def api_save():
    """Save portfolio data to JSON file."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Portfolio data required"}), 400

    try:
        # Validate incoming data with Pydantic
        portfolio_model = Portfolio.model_validate(data)
        portfolio = portfolio_model.model_dump()
    except Exception as e:
        logger.error(f"Validation error during save: {e}")
        return jsonify({"error": f"Invalid portfolio data: {str(e)}"}), 400

    username = request.args.get("username", "Default")
    user_dir, _ = get_user_dir(username)

    calendar_year = portfolio.get("calendar_year", 2024)
    filename = f"portfolio_CY{calendar_year}.json"
    filepath = user_dir / filename

    # Strip runtime-only fields
    for stock in portfolio.get("stocks", []):
        # Keep dividends as they now contain manual payment dates
        stock.pop("yearly_max_price", None)
        stock.pop("yearly_max_price_date", None)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(portfolio, f, indent=2)

    return jsonify({"success": True, "filename": filename, "path": str(filepath)})

@portfolio_bp.route("/api/load", methods=["GET"])
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

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Validate data with Pydantic
        portfolio_model = Portfolio.model_validate(data)
        portfolio = portfolio_model.model_dump()
        
        return jsonify({"success": True, "portfolio": portfolio})
    except Exception as e:
        logger.error(f"Error loading portfolio: {e}")
        return jsonify({"error": f"Could not load portfolio: {str(e)}"}), 500

@portfolio_bp.route("/api/list-saves", methods=["GET"])
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

@portfolio_bp.route("/api/current-balance", methods=["POST"])
def api_current_balance():
    """Calculate current-month portfolio value snapshot for in-progress calendar years."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Portfolio data required"}), 400
    try:
        portfolio = data
        mode = data.get("sbi_tt_mode", "split")
        result = calculate_current_balance(portfolio, mode=mode)
        return jsonify({"success": True, **result})
    except Exception as e:
        logger.exception("Current balance error")
        return jsonify({"success": False, "error": str(e)}), 500
