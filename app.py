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
from urllib.request import urlopen, Request
from urllib.error import URLError

from flask import Flask, render_template, request, jsonify

from config import (
    FLASK_HOST, FLASK_PORT, FLASK_DEBUG, APP_VERSION, GITHUB_REPO,
    SETTINGS_FILE
)
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

# pywebview for standalone native window
try:
    import webview
    HAS_WEBVIEW = True
except ImportError:
    HAS_WEBVIEW = False

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

# Global state
last_heartbeat = time.time() + 120  # 2 minute grace period for startup
shutdown_flag = False
webview_window = None  # reference to native window (if using pywebview)


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


@app.route("/api/version")
def get_version():
    """Return the current app version."""
    return {"success": True, "version": APP_VERSION}


@app.route("/api/check-update")
def check_update():
    """Check GitHub for the latest release and compare with current version."""
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        req = Request(url, headers={"User-Agent": "FA-Desk-Update-Checker"})
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

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
        # Close native window first (triggers on_closed → os._exit)
        Timer(0.3, webview_window.destroy).start()
    else:
        Timer(0.5, lambda: os._exit(0)).start()

    return {"success": True, "message": "Shutting down..."}


def open_browser():
    """Open the system browser."""
    webbrowser.open(f"http://{FLASK_HOST}:{FLASK_PORT}")


def wait_for_flask(timeout=15):
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
            time.sleep(0.1)
    return False


def monitor_heartbeat():
    """Background task to shutdown if no browser/webview tabs are active."""
    global shutdown_flag
    while not shutdown_flag:
        time.sleep(10)
        if time.time() - last_heartbeat > 30:
            logger.info("No heartbeat detected for 30s. Auto-shutting down.")
            os._exit(0)


def check_single_instance():
    """
    Check if another instance is already running.
    If so, bring it to front and exit.
    Returns True if this is the only instance.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.settimeout(1)
        result = sock.connect_ex((FLASK_HOST, FLASK_PORT))
        if result == 0:
            logger.info("Another instance detected. Opening existing instance.")
            webbrowser.open(f"http://{FLASK_HOST}:{FLASK_PORT}")
            return False
        return True
    except Exception:
        return True
    finally:
        sock.close()


def show_splash_screen():
    """
    Show a tkinter splash screen while Flask starts.
    Returns the splash Tk root (call .destroy() to close).
    """
    try:
        import tkinter as tk
    except ImportError:
        return None

    splash = tk.Tk()
    splash.title("FA Desk")
    splash.overrideredirect(True)

    w, h = 420, 280
    sw = splash.winfo_screenwidth()
    sh = splash.winfo_screenheight()
    x = (sw - w) // 2
    y = (sh - h) // 2
    splash.geometry(f"{w}x{h}+{x}+{y}")
    splash.configure(bg="#0f0f1a")
    splash.attributes("-topmost", True)

    canvas = tk.Canvas(splash, width=w, height=h, bg="#0f0f1a",
                       highlightthickness=0, bd=0)
    canvas.pack(fill="both", expand=True)

    # Gradient background
    gradient_colors = [
        "#0f0f1a", "#101120", "#111326", "#12152c", "#131732",
        "#141938", "#151b3e", "#141938", "#131732", "#12152c",
        "#111326", "#101120", "#0f0f1a"
    ]
    band_h = h // len(gradient_colors)
    for i, color in enumerate(gradient_colors):
        canvas.create_rectangle(0, i * band_h, w, (i + 1) * band_h + 1,
                                 fill=color, outline=color)

    canvas.create_rectangle(0, 0, w, 4, fill="#6366f1", outline="#6366f1")
    
    # Title & Subtitle
    canvas.create_text(w // 2, 75, text="🌐", font=("Arial", 44), fill="white")
    canvas.create_text(w // 2, 135, text="FA Desk",
                       font=("Inter", 32, "bold"), fill="white")
    canvas.create_text(w // 2, 172, text="Foreign Assets ITR Helper",
                       font=("Inter", 14), fill="#94a3b8")
    
    loading_text_id = canvas.create_text(w // 2, 215, text="Initializing...",
                                          font=("Inter", 11), fill="#6366f1")

    bar_x, bar_y, bar_w, bar_h = 70, 235, w - 140, 6
    canvas.create_rectangle(bar_x, bar_y, bar_x + bar_w, bar_y + bar_h,
                             fill="#1e1e38", outline="#1e1e38")
    progress_bar = canvas.create_rectangle(bar_x, bar_y, bar_x, bar_y + bar_h,
                                            fill="#6366f1", outline="#6366f1")
    
    canvas.create_text(w // 2, 265, text=f"Version {APP_VERSION}",
                       font=("Inter", 10), fill="#475569")

    anim_state = {"progress": 10, "direction": 1, "flask_ready": False, "closed": False}

    def close_splash():
        if not anim_state["closed"]:
            anim_state["closed"] = True
            try:
                splash.destroy()
            except Exception:
                pass

    def animate():
        if anim_state["closed"]:
            return
        if anim_state["flask_ready"]:
            anim_state["progress"] = min(anim_state["progress"] + 8, 100)
            fill_w = int(bar_w * anim_state["progress"] / 100)
            canvas.coords(progress_bar, bar_x, bar_y, bar_x + fill_w, bar_y + bar_h)
            canvas.itemconfig(loading_text_id, text="Ready!", fill="#22c55e")
            if anim_state["progress"] >= 100:
                splash.after(300, close_splash)
                return
        else:
            anim_state["progress"] += anim_state["direction"] * 2
            if anim_state["progress"] >= 80:
                anim_state["direction"] = -1
            elif anim_state["progress"] <= 10:
                anim_state["direction"] = 1
            fill_w = int(bar_w * anim_state["progress"] / 100)
            canvas.coords(progress_bar, bar_x, bar_y, bar_x + fill_w, bar_y + bar_h)
        splash.after(30, animate)

    def poll_flask():
        if anim_state["closed"]:
            return
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.5)
            s.connect((FLASK_HOST, FLASK_PORT))
            s.close()
            anim_state["flask_ready"] = True
            return
        except Exception:
            pass
        splash.after(200, poll_flask)

    splash.after(50, animate)
    splash.after(500, poll_flask)
    splash.after(15000, close_splash)  # safety timeout

    return splash


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
    is_frozen = getattr(sys, 'frozen', False)

    print(f"\n{'='*60}")
    print(f"  FA Desk — Foreign Assets Tracker and ITR Helper")
    print(f"  Version: {APP_VERSION}")
    print(f"  Open: http://{FLASK_HOST}:{FLASK_PORT}")
    print(f"{'='*60}\n")

    # ── Single-instance guard ──────────────────────────────────────
    if not check_single_instance():
        print("Another instance is already running.")
        sys.exit(0)

    # ── Start Flask in background thread ──────────────────────────
    flask_thread = Thread(
        target=lambda: app.run(host=FLASK_HOST, port=FLASK_PORT,
                               debug=False, use_reloader=False),
        daemon=True,
    )
    flask_thread.start()

    # ── Standalone native window (compiled or dev with webview) ────
    if HAS_WEBVIEW and (is_frozen or not FLASK_DEBUG):
        # Show splash while Flask warms up
        # On macOS, the splash mainloop MUST run on the main thread.
        # It will block here until Flask is ready and the splash destroys itself.
        splash = show_splash_screen()
        if splash:
            try:
                splash.mainloop()
            except Exception as e:
                logger.error(f"Splash error: {e}")

        # Wait (blocking) until Flask is ready, then open native window
        if not wait_for_flask(timeout=20):
            logger.error("Flask did not start in time. Aborting.")
            os._exit(1)

        # Icon path for the native window
        icon_path = os.path.join(
            app.static_folder if hasattr(app, 'static_folder') else 'static',
            'icon.png'
        )
        if not os.path.exists(icon_path):
            icon_path = None

        # Load window settings
        settings = load_settings().get("window", {})
        win_w = settings.get("width", 1400)
        win_h = settings.get("height", 900)
        win_x = settings.get("x")
        win_y = settings.get("y")
        win_max = settings.get("maximized", True)

        def on_webview_closed():
            """Called when the user closes the native window."""
            global shutdown_flag
            shutdown_flag = True
            logger.info("Native window closed. Shutting down.")
            os._exit(0)

        def save_window_state():
            """Capture and save current window dimensions and position."""
            if not webview_window:
                return
            try:
                # pywebview might not support all these on all platforms, handle gracefully
                state = {
                    "width": webview_window.width,
                    "height": webview_window.height,
                    "x": webview_window.x,
                    "y": webview_window.y,
                    # Check if maximized (not all platforms support this property directly)
                    "maximized": getattr(webview_window, 'maximized', win_max)
                }
                save_settings({"window": state})
            except Exception as e:
                logger.debug(f"Could not save window state: {e}")

        # Create the native window
        webview_window = webview.create_window(
            title=f"FA Desk  v{APP_VERSION}",
            url=f"http://{FLASK_HOST}:{FLASK_PORT}",
            width=win_w,
            height=win_h,
            x=win_x,
            y=win_y,
            min_size=(900, 600),
        )

        # Set maximized state if it was saved
        if win_max:
            # We delay maximization slightly to ensure window is created
            Timer(0.5, webview_window.maximize).start()

        webview_window.events.closed += on_webview_closed
        webview_window.events.resized += lambda w, h: save_window_state()
        webview_window.events.moved += lambda x, y: save_window_state()

        # Optional tray icon that brings window to front
        def bring_to_front():
            try:
                webview_window.show()
            except Exception:
                pass

        if HAS_NATIVE and is_frozen:
            Thread(target=lambda: run_tray_icon(
                on_open=bring_to_front,
                on_quit=lambda: os._exit(0),
            ), daemon=True).start()

        # Start webview event loop (blocks main thread until window closed)
        webview.start()

    else:
        # ── Dev / browser-only mode ────────────────────────────────
        Thread(target=monitor_heartbeat, daemon=True).start()

        if not FLASK_DEBUG:
            Timer(1.5, open_browser).start()

        if HAS_NATIVE and not FLASK_DEBUG:
            run_tray_icon()
        else:
            while not shutdown_flag:
                time.sleep(1)
