import shutil
import json
from flask import Blueprint, jsonify, request
from config import PORTFOLIOS_DIR
from core.utils import get_user_dir

users_bp = Blueprint("users", __name__)

@users_bp.route("/api/users", methods=["GET"])
def api_list_users():
    """List all user profiles."""
    users = []
    if PORTFOLIOS_DIR.exists():
        for d in PORTFOLIOS_DIR.iterdir():
            if d.is_dir():
                users.append(d.name)
    return jsonify({"users": sorted(users)})

@users_bp.route("/api/users", methods=["POST"])
def api_create_user():
    """Create a new user profile."""
    data = request.get_json()
    username = data.get("username")
    if not username:
        return jsonify({"error": "username required"}), 400
    _, safe_name = get_user_dir(username)
    return jsonify({"success": True, "username": safe_name})

@users_bp.route("/api/users/<old_username>", methods=["PUT"])
def api_rename_user(old_username):
    """Rename a user profile."""
    data = request.get_json()
    new_username = data.get("new_username")
    if not new_username:
        return jsonify({"error": "new_username required"}), 400
    
    old_dir = PORTFOLIOS_DIR / old_username
    if not old_dir.exists() or not old_dir.is_dir():
        return jsonify({"error": "User not found"}), 404
        
    safe_new_name = "".join(c for c in new_username if c.isalnum() or c in (' ', '-', '_')).strip()
    if not safe_new_name:
        safe_new_name = "Default"
    new_dir = PORTFOLIOS_DIR / safe_new_name
    
    if new_dir.exists() and new_dir != old_dir:
        return jsonify({"error": "New username already exists"}), 400
        
    old_dir.rename(new_dir)
    return jsonify({"success": True, "username": safe_new_name})

@users_bp.route("/api/users/<username>", methods=["DELETE"])
def api_delete_user(username):
    """Delete a user profile and all their portfolios."""
    user_dir = PORTFOLIOS_DIR / username
    if not user_dir.exists() or not user_dir.is_dir():
        return jsonify({"error": "User not found"}), 404
        
    shutil.rmtree(user_dir)
    return jsonify({"success": True})

@users_bp.route("/api/users/setup-demo", methods=["POST"])
def api_setup_demo():
    """Create a demo profile and load a sample CY2025 portfolio with AAPL, TSLA, and NVDA."""
    user_dir, safe_name = get_user_dir("DemoUser")
    
    dummy_portfolio = {
      "calendar_year": 2025,
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
            "display_name": "Apple Inc. (AAPL)"
          },
          "lots": [
            {
              "id": "lot_aapl_2021",
              "buy_date": "12/04/2021",
              "quantity": 50.0,
              "buy_price": 131.24,
              "sells": [
                {
                  "id": "sell_aapl_2025",
                  "sell_date": "10/03/2025",
                  "quantity": 30.0,
                  "sell_price": 178.50
                }
              ]
            },
            {
              "id": "lot_aapl_2022",
              "buy_date": "25/08/2022",
              "quantity": 40.0,
              "buy_price": 168.40,
              "sells": [
                {
                  "id": "sell_aapl_2025_2",
                  "sell_date": "14/08/2025",
                  "quantity": 20.0,
                  "sell_price": 192.30
                }
              ]
            },
            {
              "id": "lot_aapl_2025",
              "buy_date": "15/05/2025",
              "quantity": 15.0,
              "buy_price": 180.00,
              "sells": []
            }
          ]
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
            "display_name": "Tesla, Inc. (TSLA)"
          },
          "lots": [
            {
              "id": "lot_tsla_2021",
              "buy_date": "05/11/2021",
              "quantity": 25.0,
              "buy_price": 386.57,
              "sells": [
                {
                  "id": "sell_tsla_2025",
                  "sell_date": "20/06/2025",
                  "quantity": 15.0,
                  "sell_price": 255.40
                }
              ]
            },
            {
              "id": "lot_tsla_2022",
              "buy_date": "18/05/2022",
              "quantity": 30.0,
              "buy_price": 236.40,
              "sells": []
            },
            {
              "id": "lot_tsla_2025",
              "buy_date": "10/06/2025",
              "quantity": 10.0,
              "buy_price": 220.00,
              "sells": []
            }
          ]
        },
        {
          "id": "stock_nvda",
          "ticker": "NVDA",
          "yahoo_ticker": "NVDA",
          "currency": "USD",
          "skip_dividends": False,
          "company_info": {
            "country_code": "2-UNITED STATES OF AMERICA",
            "name": "NVIDIA Corporation",
            "address": "2788 San Tomas Expressway, Santa Clara, CA",
            "zip": "95051",
            "nature": "Company",
            "country": "United States",
            "display_name": "NVIDIA Corporation (NVDA)"
          },
          "lots": [
            {
              "id": "lot_nvda_2021",
              "buy_date": "22/07/2021",
              "quantity": 100.0,
              "buy_price": 19.50,
              "sells": [
                {
                  "id": "sell_nvda_2025",
                  "sell_date": "17/02/2025",
                  "quantity": 50.0,
                  "sell_price": 135.20
                }
              ]
            },
            {
              "id": "lot_nvda_2022",
              "buy_date": "14/10/2022",
              "quantity": 80.0,
              "buy_price": 11.20,
              "sells": []
            },
            {
              "id": "lot_nvda_2025",
              "buy_date": "20/09/2025",
              "quantity": 50.0,
              "buy_price": 125.00,
              "sells": []
            }
          ]
        }
      ],
      "overrides": {},
      "sbi_rate_overrides": {}
    }
    
    filepath = user_dir / "portfolio_CY2025.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(dummy_portfolio, f, indent=2)
        
    return jsonify({"success": True, "username": safe_name})
