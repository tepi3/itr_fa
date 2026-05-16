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
from threading import Timer, Thread
from urllib.request import urlopen, Request
from urllib.error import URLError

from flask import Flask, render_template, request, jsonify

from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG, APP_VERSION, GITHUB_REPO
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
        
        # Simple version comparison (works for semver)
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

def check_single_instance():
    """
    Check if another instance is already running on the same port.
    If so, open the browser to the existing instance and exit.
    Returns True if this is the only instance, False if another is running.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.settimeout(1)
        result = sock.connect_ex((FLASK_HOST, FLASK_PORT))
        if result == 0:
            # Port is in use — another instance is running
            logger.info("Another instance of FA Desk is already running. Opening browser to existing instance.")
            webbrowser.open(f"http://{FLASK_HOST}:{FLASK_PORT}")
            return False
        return True
    except Exception:
        return True
    finally:
        sock.close()

def show_splash_screen(on_ready_callback=None):
    """
    Show a beautiful splash screen using tkinter while the app loads.
    Runs in the main thread. Calls on_ready_callback when Flask is ready.
    """
    try:
        import tkinter as tk
    except ImportError:
        logger.warning("tkinter not available — skipping splash screen")
        return None

    splash = tk.Tk()
    splash.title("FA Desk")
    splash.overrideredirect(True)  # Borderless window

    # Window dimensions
    w, h = 420, 280
    sw = splash.winfo_screenwidth()
    sh = splash.winfo_screenheight()
    x = (sw - w) // 2
    y = (sh - h) // 2
    splash.geometry(f"{w}x{h}+{x}+{y}")
    splash.configure(bg="#0f0f1a")

    # Make window stay on top
    splash.attributes("-topmost", True)

    # Attempt rounded corners on macOS
    try:
        splash.attributes("-transparent", True)
        splash.config(bg="systemTransparent")
    except tk.TclError:
        pass

    # Canvas for custom drawing
    canvas = tk.Canvas(splash, width=w, height=h, bg="#0f0f1a", highlightthickness=0, bd=0)
    canvas.pack(fill="both", expand=True)

    # Background gradient (simulated with horizontal bands)
    gradient_colors = [
        "#0f0f1a", "#101120", "#111326", "#12152c", "#131732",
        "#141938", "#151b3e", "#141938", "#131732", "#12152c",
        "#111326", "#101120", "#0f0f1a"
    ]
    band_h = h // len(gradient_colors)
    for i, color in enumerate(gradient_colors):
        canvas.create_rectangle(0, i * band_h, w, (i + 1) * band_h + 1, fill=color, outline=color)

    # Decorative accent line at top
    canvas.create_rectangle(0, 0, w, 3, fill="#6366f1", outline="#6366f1")

    # App icon emoji (globe)
    canvas.create_text(w // 2, 65, text="🌐", font=("Arial", 40), fill="white")

    # App name
    canvas.create_text(w // 2, 120, text="FA Desk", font=("Helvetica Neue", 28, "bold"), fill="white")

    # Subtitle
    canvas.create_text(w // 2, 152, text="Foreign Assets ITR Helper", font=("Helvetica Neue", 13), fill="#8b8fa3")

    # Loading text
    loading_text_id = canvas.create_text(w // 2, 200, text="Starting up…", font=("Helvetica Neue", 11), fill="#6366f1")

    # Loading bar background
    bar_x, bar_y, bar_w, bar_h = 80, 225, w - 160, 4
    canvas.create_rectangle(bar_x, bar_y, bar_x + bar_w, bar_y + bar_h, fill="#1e1e38", outline="#1e1e38")

    # Loading bar progress (animated)
    progress_bar = canvas.create_rectangle(bar_x, bar_y, bar_x, bar_y + bar_h, fill="#6366f1", outline="#6366f1")

    # Version text
    canvas.create_text(w // 2, 260, text=f"v{APP_VERSION}", font=("Helvetica Neue", 10), fill="#4a4e69")

    # Animation state
    anim_state = {"progress": 0, "direction": 1, "flask_ready": False, "closed": False}

    def animate_loading():
        if anim_state["closed"]:
            return

        if anim_state["flask_ready"]:
            # Fill to 100% and close
            anim_state["progress"] = min(anim_state["progress"] + 8, 100)
            fill_w = int(bar_w * anim_state["progress"] / 100)
            canvas.coords(progress_bar, bar_x, bar_y, bar_x + fill_w, bar_y + bar_h)
            canvas.itemconfig(loading_text_id, text="Ready!", fill="#22c55e")

            if anim_state["progress"] >= 100:
                splash.after(300, close_splash)
                return
        else:
            # Bouncing progress bar animation
            anim_state["progress"] += anim_state["direction"] * 2
            if anim_state["progress"] >= 80:
                anim_state["direction"] = -1
            elif anim_state["progress"] <= 10:
                anim_state["direction"] = 1

            fill_w = int(bar_w * anim_state["progress"] / 100)
            canvas.coords(progress_bar, bar_x, bar_y, bar_x + fill_w, bar_y + bar_h)

        splash.after(30, animate_loading)

    def close_splash():
        if not anim_state["closed"]:
            anim_state["closed"] = True
            try:
                splash.destroy()
            except Exception:
                pass

    def poll_flask():
        """Check if Flask is ready, then trigger completion."""
        if anim_state["closed"]:
            return
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(0.5)
            result = sock.connect_ex((FLASK_HOST, FLASK_PORT))
            sock.close()
            if result == 0:
                anim_state["flask_ready"] = True
                # Open the browser now
                Timer(0.3, open_browser).start()
                return
        except Exception:
            pass
        splash.after(200, poll_flask)

    # Start animations
    splash.after(50, animate_loading)
    splash.after(500, poll_flask)

    # Allow clicking splash to dismiss
    canvas.bind("<Button-1>", lambda e: None)

    # Safety timeout — close splash after 15 seconds no matter what
    splash.after(15000, close_splash)

    return splash

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
    print(f"  Version: {APP_VERSION}")
    print(f"  Open: http://{FLASK_HOST}:{FLASK_PORT}")
    print(f"{'='*60}\n")

    # Single-instance check
    if not check_single_instance():
        print("Another instance is already running. Opening browser to existing instance...")
        sys.exit(0)

    # Start heartbeat monitor
    Thread(target=monitor_heartbeat, daemon=True).start()

    # Run Flask in a background thread
    flask_thread = Thread(target=lambda: app.run(host=FLASK_HOST, port=FLASK_PORT, debug=False, use_reloader=False), daemon=True)
    flask_thread.start()

    # Show splash screen in compiled (frozen) mode, otherwise just open browser
    if getattr(sys, 'frozen', False) and not FLASK_DEBUG:
        splash = show_splash_screen()
        if splash:
            try:
                splash.mainloop()
            except Exception:
                pass
        
        # After splash closes, run tray icon in main thread
        if HAS_NATIVE:
            run_tray_icon()
        else:
            while not shutdown_flag:
                time.sleep(1)
    else:
        # Dev mode — just open browser after delay
        if not FLASK_DEBUG:
            Timer(1.5, open_browser).start()
        
        if HAS_NATIVE and not FLASK_DEBUG:
            run_tray_icon()
        else:
            while not shutdown_flag:
                time.sleep(1)
