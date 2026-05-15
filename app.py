"""
Flask application for ITR Schedule FA Section A3 Helper Tool.

Copyright (c) 2026 Piyush Tewari (tepi3). All rights reserved.
Licensed for personal, non-commercial use only.
"""

import logging
import webbrowser
import time
from threading import Timer, Thread

from flask import Flask, render_template, request

from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG
from core.utils import init_user_storage
from routes.users import users_bp
from routes.portfolio import portfolio_bp
from routes.market import market_bp
from routes.calculator import calculator_bp
from routes.parsers import parsers_bp

import sys
import os

# Optional native desktop integration
try:
    import pystray
    from PIL import Image
    HAS_NATIVE = True
except ImportError:
    HAS_NATIVE = False

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Handle PyInstaller paths
if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    app = Flask(__name__)

# Global state for heartbeat
last_heartbeat = time.time() + 120 # 2 minute grace period for startup
shutdown_flag = False

@app.route("/api/heartbeat", methods=["POST"])
def heartbeat():
    global last_heartbeat
    last_heartbeat = time.time()
    return {"success": True}

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

@app.route("/api/shutdown", methods=["POST"])
def shutdown():
    """Shut down the Flask server."""
    logger.info("Shutdown requested. Exiting application.")
    global shutdown_flag
    shutdown_flag = True
    Timer(0.5, lambda: os._exit(0)).start()
    return {"success": True, "message": "Shutting down..."}

def open_browser():
    """Open the browser after a short delay."""
    webbrowser.open(f"http://{FLASK_HOST}:{FLASK_PORT}")

def monitor_heartbeat():
    """Background task to shutdown if no browser tabs are active."""
    global shutdown_flag
    while not shutdown_flag:
        time.sleep(10)
        # If no heartbeat for 30 seconds, shutdown
        if time.time() - last_heartbeat > 30:
            logger.info("No heartbeat detected for 30s. Auto-shutting down.")
            os._exit(0)

def run_tray_icon():
    """Create and run a system tray icon."""
    if not HAS_NATIVE:
        return

    icon_path = os.path.join(app.static_folder if hasattr(app, 'static_folder') else 'static', 'icon.png')
    if not os.path.exists(icon_path):
        # Fallback if icon generation failed
        image = Image.new('RGB', (64, 64), color=(99, 102, 241))
    else:
        image = Image.open(icon_path)

    def on_quit(icon, item):
        icon.stop()
        os._exit(0)

    def on_open(icon, item):
        open_browser()

    menu = pystray.Menu(
        pystray.MenuItem("Open FA Desk", on_open),
        pystray.MenuItem("Quit", on_quit)
    )
    
    icon = pystray.Icon("fa_desk", image, "FA Desk — Running", menu)
    icon.run()

if __name__ == "__main__":
    print(f"\n{'='*60}")
    print(f"  FA Desk — Foreign Assets Tracker and ITR Helper")
    print(f"  Open: http://{FLASK_HOST}:{FLASK_PORT}")
    print(f"{'='*60}\n")

    # Start heartbeat monitor
    Thread(target=monitor_heartbeat, daemon=True).start()

    if not FLASK_DEBUG:
        Timer(1.5, open_browser).start()

    # Run Flask in a background thread
    flask_thread = Thread(target=lambda: app.run(host=FLASK_HOST, port=FLASK_PORT, debug=False, use_reloader=False), daemon=True)
    flask_thread.start()

    # Run Tray Icon in the main thread (required by some OS)
    if HAS_NATIVE and not FLASK_DEBUG:
        run_tray_icon()
    else:
        # Just keep main thread alive if no tray icon
        while not shutdown_flag:
            time.sleep(1)
