"""
Flask application for ITR Schedule FA Section A3 Helper Tool.

Copyright (c) 2026 Piyush Tewari (tepi3). All rights reserved.
Licensed for personal, non-commercial use only.
"""

import logging
import time
import socket
import sys
import os
from threading import Timer, Thread
from dataclasses import dataclass, field

if sys.platform != 'win32':
    import fcntl

# Delayed imports for faster splash screen
Flask = None
render_template = None
request = None
jsonify = None
init_user_storage = None
users_bp = None
portfolio_bp = None
market_bp = None
calculator_bp = None
parsers_bp = None

# Optional native desktop integration
try:
    import pystray
    from PIL import Image
    HAS_NATIVE = True
except ImportError:
    HAS_NATIVE = False

# pywebview for standalone native window
try:
    import webview
    HAS_WEBVIEW = True
except ImportError:
    HAS_WEBVIEW = False

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

@dataclass
class AppState:
    """Encapsulated application state — replaces scattered module globals."""
    app: object = None              # Flask app instance
    webview_window: object = None   # pywebview window reference
    shutdown_flag: bool = False
    last_heartbeat: float = field(default_factory=time.time)
    lock_file_handle: object = None

state = AppState()

def shutdown_app(exit_code=0, reason=""):
    """Centralized shutdown: release lock, flush state, exit."""
    if reason:
        logger.info(f"Shutdown: {reason}")
    
    # Release the lock file
    if state.lock_file_handle:
        try:
            if sys.platform != 'win32':
                fcntl.flock(state.lock_file_handle, fcntl.LOCK_UN)
            else:
                import msvcrt
                try:
                    state.lock_file_handle.seek(0)
                    msvcrt.locking(state.lock_file_handle.fileno(), msvcrt.LK_UNLCK, 1)
                except Exception as e:
                    logger.debug(f"Windows unlock error (harmless): {e}")
            state.lock_file_handle.close()
            state.lock_file_handle = None
        except Exception as e:
            logger.debug(f"Lock release error (harmless): {e}")
    
    # Flush any pending log handlers
    logging.shutdown()
    
    os._exit(exit_code)

def init_flask_app():
    """Initialize Flask and register blueprints only when needed."""
    global Flask, render_template, request, jsonify, init_user_storage
    global users_bp, portfolio_bp, market_bp, calculator_bp, parsers_bp
    
    from flask import Flask, render_template, request, jsonify
    import requests
    from core.utils import init_user_storage
    from routes.users import users_bp
    from routes.portfolio import portfolio_bp
    from routes.market import market_bp
    from routes.calculator import calculator_bp
    from routes.parsers import parsers_bp

    if getattr(sys, 'frozen', False):
        template_folder = os.path.join(sys._MEIPASS, 'templates')
        static_folder = os.path.join(sys._MEIPASS, 'static')
        state.app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
    else:
        state.app = Flask(__name__)

    # Register Blueprints
    state.app.register_blueprint(users_bp)
    state.app.register_blueprint(portfolio_bp)
    state.app.register_blueprint(market_bp)
    state.app.register_blueprint(calculator_bp)
    state.app.register_blueprint(parsers_bp)

    # Initialize storage
    init_user_storage()

    # Initial SBI rates fetch if empty
    from core.sbi_rates import ensure_rates_cached
    Thread(target=ensure_rates_cached, daemon=True).start()

    @state.app.route("/api/heartbeat", methods=["POST"])
    def heartbeat():
        state.last_heartbeat = time.time()
        return {"success": True}

    @state.app.route("/api/focus", methods=["POST"])
    def focus_window():
        """Brings the native window to the front."""
        if not state.webview_window:
            return {"success": False, "error": "No native window available"}, 400
        try:
            Timer(0.1, state.webview_window.show).start()
            Timer(0.2, state.webview_window.restore).start()
            return {"success": True}
        except Exception as e:
            logger.error(f"Focus window error: {e}")
            return {"success": False, "error": str(e)}, 500

    @state.app.route("/")
    def index():
        """Serve the main UI page."""
        return render_template("index.html")

    @state.app.route("/api/version")
    def get_version():
        """Return the current app version."""
        from config import APP_VERSION
        return {"success": True, "version": APP_VERSION}

    @state.app.route("/api/check-update")
    def check_update():
        """Check GitHub for the latest release and compare with current version."""
        from config import APP_VERSION, GITHUB_REPO
        try:
            url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
            resp = requests.get(url, headers={"User-Agent": "FA-Desk-Update-Checker"}, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            latest_tag = data.get("tag_name", "").lstrip("v")
            current = APP_VERSION.lstrip("v")

            def parse_ver(v):
                parts = v.split(".")
                return tuple(int(p) for p in parts if p.isdigit())

            is_newer = parse_ver(latest_tag) > parse_ver(current)

            return {
                "success": True,
                "current_version": APP_VERSION,
                "latest_version": latest_tag,
                "update_available": is_newer,
                "release_url": data.get("html_url", ""),
                "release_name": data.get("name", ""),
                "published_at": data.get("published_at", ""),
            }
        except Exception as e:
            logger.error(f"Update check failed: {e}")
            return {"success": False, "error": str(e)}

    @state.app.route("/api/shutdown", methods=["POST"])
    def shutdown():
        """Shut down the Flask server."""
        logger.info("Shutdown requested. Exiting application.")
        state.shutdown_flag = True
        try:
            if state.webview_window:
                Timer(0.3, state.webview_window.destroy).start()
            else:
                Timer(0.5, lambda: shutdown_app(0, "API shutdown")).start()
        except Exception as e:
            logger.error(f"Shutdown error: {e}")
            shutdown_app(1, f"Shutdown error: {e}")
        return {"success": True, "message": "Shutting down..."}


def check_single_instance(open_browser_if_found=True):
    """
    Check if another instance is already running using both a port check and a lock file.
    """
    from config import DATA_DIR, FLASK_HOST, FLASK_PORT
    
    # 1. First, check if the Flask port is already taken
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.settimeout(0.5)
        result = sock.connect_ex((FLASK_HOST, FLASK_PORT))
        if result == 0:
            logger.info("Another instance detected via port check.")
            # Try to signal the existing instance to focus
            try:
                import requests
                requests.post(f"http://{FLASK_HOST}:{FLASK_PORT}/api/focus", timeout=1)
            except Exception:
                pass

            if open_browser_if_found:
                import webbrowser
                webbrowser.open(f"http://{FLASK_HOST}:{FLASK_PORT}")
            return False
    except Exception:
        pass
    finally:
        sock.close()

    # 2. Second, use a lock file in the data directory (cross-platform exclusive lock)
    lock_path = os.path.join(DATA_DIR, "app.lock")
    try:
        # Create file if not exists
        if not os.path.exists(lock_path):
            with open(lock_path, 'w') as f:
                f.write(str(os.getpid()))
        
        # Open and try to lock
        state.lock_file_handle = open(lock_path, 'r+')
        if sys.platform != 'win32':
            # Unix/macOS lock
            try:
                fcntl.flock(state.lock_file_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except (IOError, OSError):
                logger.info("Another instance detected via lock file.")
                return False
        else:
            # Windows lock (using msvcrt which is built-in)
            import msvcrt
            try:
                msvcrt.locking(state.lock_file_handle.fileno(), msvcrt.LK_NBLCK, 1)
            except (IOError, OSError):
                logger.info("Another instance detected via Windows lock file.")
                return False
                
        # Write current PID to lock file
        state.lock_file_handle.seek(0)
        state.lock_file_handle.write(str(os.getpid()))
        state.lock_file_handle.truncate()
        state.lock_file_handle.flush()
        return True
    except Exception as e:
        logger.debug(f"Lock file check failed (ignoring): {e}")
        return True

if __name__ == "__main__":
    import app as main_app
    from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG, APP_VERSION, SETTINGS_FILE
    from desktop import run_webview_mode, run_browser_mode

    is_frozen = getattr(sys, 'frozen', False)
    use_webview = HAS_WEBVIEW and (is_frozen or not FLASK_DEBUG)

    if not main_app.check_single_instance(open_browser_if_found=not use_webview):
        sys.exit(0)

    if use_webview:
        run_webview_mode(main_app.state)
    else:
        run_browser_mode(main_app.state)
