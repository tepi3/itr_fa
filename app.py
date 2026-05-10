"""
Flask application for ITR Schedule FA Section A3 Helper Tool.

Copyright (c) 2026 Piyush Tewari (tepi3). All rights reserved.
Licensed for personal, non-commercial use only.
"""

import logging
import webbrowser
from threading import Timer

from flask import Flask, render_template

from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG
from core.utils import init_user_storage
from routes.users import users_bp
from routes.portfolio import portfolio_bp
from routes.market import market_bp
from routes.calculator import calculator_bp
from routes.parsers import parsers_bp

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Register Blueprints
app.register_blueprint(users_bp)
app.register_blueprint(portfolio_bp)
app.register_blueprint(market_bp)
app.register_blueprint(calculator_bp)
app.register_blueprint(parsers_bp)

# Initialize storage
init_user_storage()

@app.route("/")
def index():
    """Serve the main UI page."""
    return render_template("index.html")

def open_browser():
    """Open the browser after a short delay."""
    webbrowser.open(f"http://{FLASK_HOST}:{FLASK_PORT}")

if __name__ == "__main__":
    print(f"\n{'='*60}")
    print(f"  FA Desk — Foreign Assets Tracker and ITR Helper")
    print(f"  Open: http://{FLASK_HOST}:{FLASK_PORT}")
    print(f"{'='*60}\n")

    if not FLASK_DEBUG:
        Timer(1.5, open_browser).start()

    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG)
