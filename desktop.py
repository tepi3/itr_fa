"""
Desktop integration and window management for FA Desk.
"""

import os
import sys
import json
import time
import socket
import logging
import webbrowser
from threading import Timer, Thread

from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG, APP_VERSION, SETTINGS_FILE
from app import init_flask_app, shutdown_app

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

logger = logging.getLogger(__name__)

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
            .subtitle {{ color: #94a3b8; font-size: 15px; margin: 8px 0 25px 0; }}
            .loading-text {{ color: #6366f1; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }}
            .progress-container {{ width: 280px; height: 6px; background: #1e1e38; border-radius: 10px; overflow: hidden; }}
            .progress-bar {{ width: 0%; height: 100%; background: #6366f1; border-radius: 10px; transition: width 0.3s ease; }}
            .version {{ margin-top: 20px; color: #475569; font-size: 10px; font-weight: 500; }}
            
            @keyframes pulse {{
                0% {{ opacity: 0.6; }}
                50% {{ opacity: 1; }}
                100% {{ opacity: 0.6; }}
            }}
            .loading-text {{ animation: pulse 1.5s infinite ease-in-out; }}
            
            .globe-container {{
                position: relative;
                width: 60px;
                height: 60px;
                border-radius: 50%;
                overflow: hidden;
                margin-bottom: 20px;
                background: #1e1e38;
                box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
            }}
            .globe-content {{
                display: flex;
                font-size: 60px;
                line-height: 60px;
                white-space: nowrap;
                animation: slide 3s linear infinite;
                cursor: default;
                user-select: none;
            }}
            .globe-overlay {{
                position: absolute;
                top: 0; left: 0; width: 100%; height: 100%;
                background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15) 0%, transparent 40%, rgba(0,0,0,0.4) 100%);
                border-radius: 50%;
                pointer-events: none;
            }}
            @keyframes slide {{
                from {{ transform: translateX(0); }}
                to {{ transform: translateX(-64px); }}
            }}
        </style>
    </head>
    <body>
        <div class="globe-container">
            <div class="globe-content">🌐🌐</div>
            <div class="globe-overlay"></div>
        </div>
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
            
            setTimeout(() => {{
                progress = 15;
                bar.style.width = '15%';
            }}, 100);

            function updateProgress() {{
                if (progress < 92) {{
                    progress += Math.random() * 2;
                    bar.style.width = Math.min(progress, 92) + '%';
                    let delay = 150 + Math.random() * 200;
                    setTimeout(updateProgress, delay);
                }}
            }}
            setTimeout(updateProgress, 400);

            function setReady() {{
                progress = 100;
                bar.style.transition = 'width 0.8s cubic-bezier(0.22, 1, 0.36, 1)';
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
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_settings(settings):
    """Save app settings to file."""
    try:
        current = load_settings()
        current.update(settings)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=4)
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")

def run_tray_icon(state, on_open=None, on_quit=None):
    """Run a system tray icon. Callbacks override default behavior."""
    if not HAS_NATIVE:
        return

    icon_path = os.path.join(
        state.app.static_folder if hasattr(state.app, 'static_folder') else 'static',
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
            shutdown_app(0, "Tray icon quit")

    menu = pystray.Menu(
        pystray.MenuItem("Open FA Desk", _on_open),
        pystray.MenuItem("Quit", _on_quit),
    )
    icon = pystray.Icon("fa_desk", image, "FA Desk — Running", menu)
    icon.run()

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

def monitor_heartbeat(state):
    """Background task to shutdown if no browser/webview tabs are active."""
    while not state.shutdown_flag:
        time.sleep(10)
        if time.time() - state.last_heartbeat > 30:
            logger.info("No heartbeat detected for 30s. Auto-shutting down.")
            shutdown_app(0, "Heartbeat timeout")

def run_webview_mode(state):
    """Run the application in standalone webview mode."""
    def run_server():
        try:
            init_flask_app()
            state.app.run(host=FLASK_HOST, port=FLASK_PORT, debug=False, use_reloader=False)
        except Exception as e:
            logger.error(f"Flask server error: {e}")
            shutdown_app(1, f"Flask server error: {e}")

    flask_thread = Thread(target=run_server, daemon=True)
    flask_thread.start()

    settings = load_settings().get("window", {})
    
    state.webview_window = webview.create_window(
        title=f"FA Desk  v{APP_VERSION}",
        url=None,
        width=settings.get("width", 1400),
        height=settings.get("height", 900),
        x=settings.get("x"),
        y=settings.get("y"),
        min_size=(900, 600),
        hidden=True,
        background_color='#0f0f1a'
    )

    splash_window = webview.create_window(
        title="FA Desk - Starting",
        html=get_splash_html(),
        width=420,
        height=300,
        frameless=True,
        on_top=True,
        background_color='#0f0f1a'
    )

    def start_main_app():
        if wait_for_flask(timeout=25):
            try:
                splash_window.evaluate_js("setReady()")
            except Exception:
                pass
            
            state.webview_window.load_url(f"http://{FLASK_HOST}:{FLASK_PORT}")
            time.sleep(2.0)
            state.webview_window.show()
            
            if settings.get("maximized", True):
                try:
                    state.webview_window.maximize()
                except Exception: pass

            def on_closed():
                shutdown_app(0, "Webview closed")
            
            def save_state():
                try:
                    s = {
                        "width": state.webview_window.width, "height": state.webview_window.height,
                        "x": state.webview_window.x, "y": state.webview_window.y,
                        "maximized": getattr(state.webview_window, 'maximized', True)
                    }
                    save_settings({"window": s})
                except Exception: pass

            state.webview_window.events.closed += on_closed
            state.webview_window.events.resized += lambda w, h: save_state()
            state.webview_window.events.moved += lambda x, y: save_state()

            splash_window.destroy()
        else:
            logger.error("Flask did not start in time.")
            splash_window.destroy()
            shutdown_app(1, "Flask did not start in time")

    webview.start(start_main_app, debug=FLASK_DEBUG)


def run_browser_mode(state):
    """Dev / browser-only mode"""
    init_flask_app()
    flask_thread = Thread(
        target=lambda: state.app.run(host=FLASK_HOST, port=FLASK_PORT,
                               debug=False, use_reloader=False),
        daemon=True,
    )
    flask_thread.start()
    
    Thread(target=monitor_heartbeat, args=(state,), daemon=True).start()
    if not FLASK_DEBUG:
        Timer(1.5, open_browser).start()
    if HAS_NATIVE and not FLASK_DEBUG:
        run_tray_icon(state)
    else:
        try:
            while True: time.sleep(1)
        except KeyboardInterrupt:
            shutdown_app(0, "KeyboardInterrupt")
