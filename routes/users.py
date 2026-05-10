import shutil
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
        
    _, safe_new_name = get_user_dir(new_username)
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
