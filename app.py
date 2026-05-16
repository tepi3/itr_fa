"""
Flask application for ITR Schedule FA Section A3 Helper Tool.

Copyright (c) 2026 Piyush Tewari (tepi3). All rights reserved.
Licensed for personal, non-commercial use only.
"""

import logging
import webbrowser
import time
import socket
import json
from threading import Timer, Thread, Event
import fcntl  # For lock file on Unix/macOS
# import requests (moved inside init_flask_app for startup speed)

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

import sys
import os

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

app = None
webview_window = None  # reference to native window (if using pywebview)


def init_flask_app():
    """Initialize Flask and register blueprints only when needed."""
    global app, Flask, render_template, request, jsonify, init_user_storage
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
        app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
    else:
        app = Flask(__name__)

    # Register Blueprints
    app.register_blueprint(users_bp)
    app.register_blueprint(portfolio_bp)
    app.register_blueprint(market_bp)
    app.register_blueprint(calculator_bp)
    app.register_blueprint(parsers_bp)

    # Initialize storage
    init_user_storage()

    @app.route("/api/heartbeat", methods=["POST"])
    def heartbeat():
        global last_heartbeat
        last_heartbeat = time.time()
        return {"success": True}

    @app.route("/api/focus", methods=["POST"])
    def focus_window():
        """Brings the native window to the front."""
        if webview_window:
            Timer(0.1, webview_window.show).start()
            Timer(0.2, webview_window.restore).start()
        return {"success": True}

    @app.route("/")
    def index():
        """Serve the main UI page."""
        return render_template("index.html")

    @app.route("/api/version")
    def get_version():
        """Return the current app version."""
        from config import APP_VERSION
        return {"success": True, "version": APP_VERSION}

    @app.route("/api/check-update")
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

    @app.route("/api/shutdown", methods=["POST"])
    def shutdown():
        """Shut down the Flask server."""
        logger.info("Shutdown requested. Exiting application.")
        global shutdown_flag
        shutdown_flag = True

        if webview_window:
            Timer(0.3, webview_window.destroy).start()
        else:
            Timer(0.5, lambda: os._exit(0)).start()

        return {"success": True, "message": "Shutting down..."}


def open_browser():
    """Open the system browser."""
    webbrowser.open(f"http://{FLASK_HOST}:{FLASK_PORT}")


def wait_for_flask(timeout=25):
    """Block until Flask is accepting connections (or timeout)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.5)
            s.connect((FLASK_HOST, FLASK_PORT))
            s.close()
            return True
        except Exception:
            time.sleep(0.2)
    return False


def monitor_heartbeat():
    """Background task to shutdown if no browser/webview tabs are active."""
    global shutdown_flag
    while not shutdown_flag:
        time.sleep(10)
        if time.time() - last_heartbeat > 30:
            logger.info("No heartbeat detected for 30s. Auto-shutting down.")
            os._exit(0)


_lock_file_handle = None

def check_single_instance(open_browser_if_found=True):
    """
    Check if another instance is already running using both a port check and a lock file.
    """
    global _lock_file_handle
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
        _lock_file_handle = open(lock_path, 'r+')
        if sys.platform != 'win32':
            # Unix/macOS lock
            try:
                fcntl.flock(_lock_file_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except (IOError, OSError):
                logger.info("Another instance detected via lock file.")
                return False
        else:
            # Windows lock (using msvcrt which is built-in)
            import msvcrt
            try:
                msvcrt.locking(_lock_file_handle.fileno(), msvcrt.LK_NBLCK, 1)
            except (IOError, OSError):
                logger.info("Another instance detected via Windows lock file.")
                return False
                
        # Write current PID to lock file
        _lock_file_handle.seek(0)
        _lock_file_handle.write(str(os.getpid()))
        _lock_file_handle.truncate()
        _lock_file_handle.flush()
        return True
    except Exception as e:
        logger.debug(f"Lock file check failed (ignoring): {e}")
        return True


def get_splash_html():
    """Returns the HTML content for the webview-based splash screen."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{
                margin: 0; padding: 0; overflow: hidden;
                background: #0f0f1a; color: white;
                font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                height: 100vh; width: 100vw;
                border-top: 4px solid #6366f1; box-sizing: border-box;
            }}
            .icon {{ font-size: 52px; margin-bottom: 15px; }}
            .title {{ font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }}
            .subtitle {{ color: #94a3b8; font-size: 15px; margin: 8px 0 35px 0; }}
            .loading-text {{ color: #6366f1; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }}
            .progress-container {{ width: 280px; height: 6px; background: #1e1e38; border-radius: 10px; overflow: hidden; }}
            .progress-bar {{ width: 0%; height: 100%; background: #6366f1; border-radius: 10px; transition: width 0.3s ease; }}
            .version {{ position: absolute; bottom: 20px; color: #475569; font-size: 10px; font-weight: 500; }}
            
            @keyframes pulse {{
                0% {{ opacity: 0.6; }}
                50% {{ opacity: 1; }}
                100% {{ opacity: 0.6; }}
            }}
            .loading-text {{ animation: pulse 1.5s infinite ease-in-out; }}
        </style>
    </head>
    <body>
        <div class="icon">🌐</div>
        <h1 class="title">FA Desk</h1>
        <p class="subtitle">Foreign Assets ITR Helper</p>
        <div class="loading-text" id="status">Starting up...</div>
        <div class="progress-container">
            <div class="progress-bar" id="bar"></div>
        </div>
        <div class="version">Version {APP_VERSION}</div>

        <script>
            let progress = 0;
            const bar = document.getElementById('bar');
            const status = document.getElementById('status');
            
            // Initial quick movement to show activity
            setTimeout(() => {{
                progress = 15;
                bar.style.width = '15%';
            }}, 100);

            function updateProgress() {{
                if (progress < 92) {{
                    // Slow crawl while loading
                    progress += Math.random() * 2;
                    bar.style.width = Math.min(progress, 92) + '%';
                    let delay = 150 + Math.random() * 200;
                    setTimeout(updateProgress, delay);
                }}
            }}
            setTimeout(updateProgress, 400);

            // Called from Python when Flask is ready
            function setReady() {{
                progress = 100;
                bar.style.transition = 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
                bar.style.width = '100%';
                status.innerText = 'Ready!';
                status.style.color = '#22c55e';
                status.style.animation = 'none';
            }}
        </script>
    </body>
    </html>
    """


def load_settings():
    """Load app settings from file."""
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_settings(settings):
    """Save app settings to file."""
    try:
        # Merge with existing settings if any
        current = load_settings()
        current.update(settings)
        with open(SETTINGS_FILE, "w") as f:
            json.dump(current, f, indent=4)
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")


def run_tray_icon(on_open=None, on_quit=None):
    """Run a system tray icon. Callbacks override default behavior."""
    if not HAS_NATIVE:
        return

    icon_path = os.path.join(
        app.static_folder if hasattr(app, 'static_folder') else 'static',
        'icon.png'
    )
    image = Image.open(icon_path) if os.path.exists(icon_path) \
        else Image.new('RGB', (64, 64), color=(99, 102, 241))

    def _on_open(icon, item):
        if on_open:
            on_open()
        else:
            open_browser()

    def _on_quit(icon, item):
        icon.stop()
        if on_quit:
            on_quit()
        else:
            os._exit(0)

    menu = pystray.Menu(
        pystray.MenuItem("Open FA Desk", _on_open),
        pystray.MenuItem("Quit", _on_quit),
    )
    icon = pystray.Icon("fa_desk", image, "FA Desk — Running", menu)
    icon.run()


if __name__ == "__main__":
    from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG, APP_VERSION, SETTINGS_FILE
    
    is_frozen = getattr(sys, 'frozen', False)
    use_webview = HAS_WEBVIEW and (is_frozen or not FLASK_DEBUG)

    # ── Single-instance guard ──────────────────────────────────────
    if not check_single_instance(open_browser_if_found=not use_webview):
        sys.exit(0)

    # ── Standalone native window (compiled or dev with webview) ────
    if use_webview:
        # 1. Load settings for main window
        settings = load_settings().get("window", {})
        
        # 2. Pre-create Main Window (HIDDEN)
        # Create without URL initially to avoid 'Connection Refused' blank page
        webview_window = webview.create_window(
            title=f"FA Desk  v{APP_VERSION}",
            url=None, # Load later when Flask is ready
            width=settings.get("width", 1400),
            height=settings.get("height", 900),
            x=settings.get("x"),
            y=settings.get("y"),
            min_size=(900, 600),
            hidden=True, # Start hidden to avoid white flash
            background_color='#0f0f1a' # Match splash/app theme
        )

        # 3. Create Splash Window
        splash_window = webview.create_window(
            title="FA Desk - Starting",
            html=get_splash_html(),
            width=420,
            height=300,
            frameless=True,
            on_top=True,
            background_color='#0f0f1a' # Fix white box issue
        )

        def start_main_app():
            """Runs after webview loop starts; initializes Flask and switches to main window."""
            # Start Flask in background thread
            def run_server():
                try:
                    init_flask_app()
                    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=False, use_reloader=False)
                except Exception as e:
                    logger.error(f"Flask server error: {e}")
                    os._exit(1)

            flask_thread = Thread(target=run_server, daemon=True)
            flask_thread.start()

            if wait_for_flask(timeout=25):
                # Notify splash to show 100%
                try:
                    splash_window.evaluate_js("setReady()")
                except Exception:
                    pass
                
                # Load URL in main window now that Flask is ready
                webview_window.load_url(f"http://{FLASK_HOST}:{FLASK_PORT}")
                
                # Small delay to let user see "Ready!" and for URL to start loading
                time.sleep(1.0)

                # Show and focus Main Window
                webview_window.show()
                
                if settings.get("maximized", True):
                    try:
                        webview_window.maximize()
                    except Exception: pass

                # Event handlers for main window
                def on_closed():
                    os._exit(0)
                
                def save_state():
                    try:
                        s = {
                            "width": webview_window.width, "height": webview_window.height,
                            "x": webview_window.x, "y": webview_window.y,
                            "maximized": getattr(webview_window, 'maximized', True)
                        }
                        save_settings({"window": s})
                    except Exception: pass

                webview_window.events.closed += on_closed
                webview_window.events.resized += lambda w, h: save_state()
                webview_window.events.moved += lambda x, y: save_state()

                # Close Splash last to ensure smooth transition
                splash_window.destroy()
            else:
                logger.error("Flask did not start in time.")
                splash_window.destroy()
                os._exit(1)

        # Start Webview (Blocks here)
        webview.start(start_main_app, debug=FLASK_DEBUG)

    else:
        # ── Dev / browser-only mode ────────────────────────────────
        init_flask_app()
        flask_thread = Thread(
            target=lambda: app.run(host=FLASK_HOST, port=FLASK_PORT,
                                   debug=False, use_reloader=False),
            daemon=True,
        )
        flask_thread.start()
        
        Thread(target=monitor_heartbeat, daemon=True).start()
        if not FLASK_DEBUG:
            Timer(1.5, open_browser).start()
        if HAS_NATIVE and not FLASK_DEBUG:
            run_tray_icon()
        else:
            try:
                while True: time.sleep(1)
            except KeyboardInterrupt: os._exit(0)
