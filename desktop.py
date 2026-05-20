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
                background: radial-gradient(circle at center, #0f1117 0%, #0b0b14 100%);
                color: white;
                font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                height: 100vh; width: 100vw;
                border-top: 4px solid #6366f1; box-sizing: border-box;
            }}
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

            #globeCanvas {{
                margin-bottom: 18px;
            }}
        </style>
    </head>
    <body>
        <canvas id="globeCanvas" width="120" height="120"></canvas>
        <h1 class="title">FA Desk</h1>
        <p class="subtitle">Foreign Assets ITR Helper</p>
        <div class="loading-text" id="status">Starting up...</div>
        <div class="progress-container">
            <div class="progress-bar" id="bar"></div>
        </div>
        <div class="version">Version {APP_VERSION}</div>

        <script>
            // ---- 3D Wireframe Globe ----
            (function() {{
                const canvas = document.getElementById('globeCanvas');
                const ctx = canvas.getContext('2d');
                const W = canvas.width, H = canvas.height;
                const cx = W / 2, cy = H / 2, R = 42;
                let angle = 0;

                // Hub nodes on the globe surface (lat, lon in radians)
                const hubs = [
                    {{ lat: 0.7, lon: 0.3 }},
                    {{ lat: -0.4, lon: 1.8 }},
                    {{ lat: 0.2, lon: -1.2 }},
                    {{ lat: -0.6, lon: 3.0 }},
                    {{ lat: 0.5, lon: -2.5 }},
                    {{ lat: -0.1, lon: 0.9 }},
                ];

                function project(lat, lon) {{
                    const x = R * Math.cos(lat) * Math.sin(lon + angle);
                    const y = R * Math.sin(lat);
                    const z = R * Math.cos(lat) * Math.cos(lon + angle);
                    return {{ x: cx + x, y: cy - y, z: z }};
                }}

                function draw() {{
                    ctx.clearRect(0, 0, W, H);

                    // Outer orbital glow
                    ctx.beginPath();
                    ctx.arc(cx, cy, R + 6, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(99, 102, 241, 0.18)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    // Outer glow shadow
                    ctx.beginPath();
                    ctx.arc(cx, cy, R + 2, 0, Math.PI * 2);
                    ctx.shadowColor = 'rgba(99, 102, 241, 0.45)';
                    ctx.shadowBlur = 18;
                    ctx.strokeStyle = 'rgba(99, 102, 241, 0.08)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.shadowBlur = 0;

                    // Longitude lines
                    const lonSteps = 12;
                    for (let i = 0; i < lonSteps; i++) {{
                        const lon = (i / lonSteps) * Math.PI * 2;
                        ctx.beginPath();
                        for (let j = 0; j <= 40; j++) {{
                            const lat = (j / 40) * Math.PI - Math.PI / 2;
                            const p = project(lat, lon);
                            const depth = (p.z + R) / (2 * R);
                            if (j === 0) ctx.moveTo(p.x, p.y);
                            else ctx.lineTo(p.x, p.y);
                        }}
                        // We'll stroke per-segment for depth; simplified: use average depth
                        const midP = project(0, lon);
                        const midDepth = (midP.z + R) / (2 * R);
                        if (midDepth > 0.5) {{
                            ctx.strokeStyle = 'rgba(99, 102, 241, ' + (0.15 + midDepth * 0.55) + ')';
                            ctx.lineWidth = 0.8;
                        }} else {{
                            ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
                            ctx.lineWidth = 0.5;
                        }}
                        ctx.stroke();
                    }}

                    // Latitude lines
                    const latSteps = 7;
                    for (let i = 1; i < latSteps; i++) {{
                        const lat = (i / latSteps) * Math.PI - Math.PI / 2;
                        ctx.beginPath();
                        for (let j = 0; j <= 60; j++) {{
                            const lon = (j / 60) * Math.PI * 2;
                            const p = project(lat, lon);
                            if (j === 0) ctx.moveTo(p.x, p.y);
                            else ctx.lineTo(p.x, p.y);
                        }}
                        const testP = project(lat, -angle);
                        const depthL = (testP.z + R) / (2 * R);
                        if (depthL > 0.5) {{
                            ctx.strokeStyle = 'rgba(99, 102, 241, ' + (0.12 + depthL * 0.45) + ')';
                            ctx.lineWidth = 0.6;
                        }} else {{
                            ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
                            ctx.lineWidth = 0.4;
                        }}
                        ctx.stroke();
                    }}

                    // Hub nodes
                    hubs.forEach(function(hub) {{
                        const p = project(hub.lat, hub.lon);
                        const depth = (p.z + R) / (2 * R);
                        if (depth > 0.45) {{
                            // Front-facing: bright violet with halo
                            ctx.beginPath();
                            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                            ctx.fillStyle = 'rgba(167, 139, 250, 0.3)';
                            ctx.fill();
                            ctx.beginPath();
                            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
                            ctx.fillStyle = '#a78bfa';
                            ctx.fill();
                        }} else {{
                            // Back-facing: dimmed
                            ctx.beginPath();
                            ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
                            ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
                            ctx.fill();
                        }}
                    }});

                    angle += 0.012;
                    requestAnimationFrame(draw);
                }}

                draw();
            }})();

            // ---- Progress Bar ----
            let progress = 0;
            const bar = document.getElementById('bar');
            const status = document.getElementById('status');

            setTimeout(() => {{
                progress = 25;
                bar.style.width = '25%';
            }}, 100);

            function updateProgress() {{
                if (progress < 92) {{
                    progress += Math.random() * 8;
                    bar.style.width = Math.min(progress, 92) + '%';
                    let delay = 80 + Math.random() * 120;
                    setTimeout(updateProgress, delay);
                }}
            }}
            setTimeout(updateProgress, 250);

            function setReady() {{
                progress = 100;
                bar.style.transition = 'width 0.4s ease-out';
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
        background_color='#0f1117'
    )

    splash_window = webview.create_window(
        title="FA Desk - Starting",
        html=get_splash_html(),
        width=420,
        height=300,
        frameless=True,
        on_top=True,
        background_color='#0b0b14'
    )

    def start_main_app():
        start_time = time.time()
        if wait_for_flask(timeout=25):
            # Ensure at least 2.0s of "work" progress before finishing
            elapsed = time.time() - start_time
            if elapsed < 2.0:
                time.sleep(2.0 - elapsed)
                
            try:
                splash_window.evaluate_js("setReady()")
            except Exception:
                pass
            
            state.webview_window.load_url(f"http://{FLASK_HOST}:{FLASK_PORT}")
            
            # Final buffer to see the 100% bar and "Ready!"
            time.sleep(1.5)
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
