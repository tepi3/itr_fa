import os
import sys
import time
import socket
import subprocess
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

WORKSPACE_DIR = Path(__file__).resolve().parent.parent
SCREENSHOTS_DIR = WORKSPACE_DIR / "docs" / "screenshots"
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def start_server():
    if is_port_in_use(5001):
        print("Server is already running on port 5001. Using existing instance.")
        return None
    
    print("Starting Flask server...")
    # Delete app.lock if it exists to avoid single instance error
    lock_file = Path.home() / ".fa_desk_data" / "app.lock"
    if lock_file.exists():
        try:
            lock_file.unlink()
        except Exception as e:
            print(f"Could not delete lock file: {e}")
            
    # Start server in subprocess using venv python
    env = os.environ.copy()
    env["FLASK_DEBUG"] = "0"
    process = subprocess.Popen(
        ["./venv/bin/python", "app.py"],
        cwd=str(WORKSPACE_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    # Wait for server to start
    start_time = time.time()
    while time.time() - start_time < 15:
        if is_port_in_use(5001):
            print("Server is up and running!")
            return process
        time.sleep(0.5)
        
    print("Server failed to start in time.")
    stdout, stderr = process.communicate()
    print("STDOUT:", stdout.decode())
    print("STDERR:", stderr.decode())
    sys.exit(1)

def run_screenshot_flow():
    portfolios_dir = Path.home() / ".fa_desk_data" / "portfolios"
    backup_dir = Path.home() / ".fa_desk_data" / "portfolios_backup"
    
    # Temporarily hide existing users to show "no users" screen
    had_portfolios = portfolios_dir.exists()
    if had_portfolios:
        print("Temporarily backing up existing user profiles...")
        if backup_dir.exists():
            shutil.rmtree(backup_dir)
        portfolios_dir.rename(backup_dir)
        
    server_proc = start_server()
    
    try:
        with sync_playwright() as p:
            print("Launching headless browser...")
            browser = p.chromium.launch(headless=True)
            # Create a context with 2K resolution (2560x1440)
            context = browser.new_context(viewport={"width": 2560, "height": 1440})
            page = context.new_page()
            
            # Go to home page
            print("Navigating to http://127.0.0.1:5001...")
            page.goto("http://127.0.0.1:5001")
            
            # 1. Login/Profile Selection (Empty State)
            print("Capturing 01_profile_selection.png...")
            page.wait_for_selector("#tryDummyBtn", state="visible")
            time.sleep(1.5) # Let animations settle
            page.screenshot(path=str(SCREENSHOTS_DIR / "01_profile_selection.png"))
            
            # Restore existing users before clicking the Demo User button
            if had_portfolios:
                print("Restoring backed-up user profiles...")
                if portfolios_dir.exists():
                    shutil.rmtree(portfolios_dir)
                backup_dir.rename(portfolios_dir)
                
            # Click Try with Demo Profile
            print("Setting up Demo Profile...")
            page.click("#tryDummyBtn")
            
            # Wait for main page to load
            page.wait_for_selector("#portfolioDashboard", state="visible")
            # Wait a few seconds for yfinance live prices and rates to load
            print("Waiting for stock data and exchange rates to fetch...")
            time.sleep(6.0)
            
            # Expand the first stock card details showing acquisition, sells, and dividends
            print("Expanding first stock card details...")
            page.locator(".toggle-details-btn").first.click()
            time.sleep(1.5) # Let expansion transition complete
            
            # 3. Generate FA Report
            print("Generating FA Report Section A3...")
            page.click("#calcFab")
            
            # Wait for calculation results
            page.wait_for_selector("#resultsSection", state="visible")
            time.sleep(2.0)
            
            # 2. Portfolio Dashboard (post-report — shows updated values and preview)
            print("Capturing 02_portfolio_dashboard.png...")
            page.evaluate("window.scrollTo(0, 0)")
            time.sleep(0.5)
            page.screenshot(path=str(SCREENSHOTS_DIR / "02_portfolio_dashboard.png"))
            
            # Screenshot FA Report Section A3
            print("Capturing 03_fa_report_preview.png...")
            page.locator("#resultsSection").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.locator("#resultsSection").screenshot(path=str(SCREENSHOTS_DIR / "03_fa_report_preview.png"))
            
            # 4. Calculation breakdown: Validate A3
            print("Capturing 04_validate_a3.png...")
            page.locator("#validateA3Section").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.locator("#validateA3Section").screenshot(path=str(SCREENSHOTS_DIR / "04_validate_a3.png"))
            
            # 5. ITR Capital Gains & Dividend Summary (hide sticky header for clean shot)
            print("Capturing 05_capital_gains_summary.png...")
            page.evaluate("document.getElementById('appHeader').style.display = 'none'")
            page.locator("#taxYearSection").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.locator("#taxYearSection").screenshot(path=str(SCREENSHOTS_DIR / "05_capital_gains_summary.png"))
            page.evaluate("document.getElementById('appHeader').style.display = ''")
            
            # 6. Validate Capital Gains & Dividends breakdown
            print("Capturing 06_validate_tax_details.png...")
            page.locator("#validateTaxSection").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.locator("#validateTaxSection").screenshot(path=str(SCREENSHOTS_DIR / "06_validate_tax_details.png"))
            
            # 7. Switch to Sell Simulator tab
            print("Switching to Sell Simulator tab...")
            page.click("#tabSellHelper")
            page.wait_for_selector("#sellHelperPanel", state="visible")
            time.sleep(1.0)
            
            # Select stock AAPL, INR target, and enter 100000
            print("Selecting stock AAPL in allocator...")
            page.select_option("#shAllocTicker", "AAPL")
            time.sleep(1.0)
            
            print("Selecting INR target and setting amount to 100000...")
            page.click("#shAllocToggleInr")
            page.fill("#shAllocValue", "100000")
            page.fill("#shAllocDate", "20/06/2025")
            page.fill("#shAllocPrice", "185.00")
            time.sleep(0.5)
            
            print("Clicking Allocate Sell...")
            page.click("#shAllocBtn")
            time.sleep(1.5)
            
            # Click Simulate
            print("Running simulation...")
            page.click("#shSimulateBtn")
            page.wait_for_selector("#shResultsSection", state="visible")
            time.sleep(1.5)
            
            # Screenshot Sell Simulator
            print("Capturing 07_sell_simulator.png...")
            page.locator("#shResultsSection").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.locator("#sellHelperPanel").screenshot(path=str(SCREENSHOTS_DIR / "07_sell_simulator.png"))
            
            # 8. Switch to Tax Statement tab
            print("Switching to Tax Statement tab...")
            page.click("#tabTaxStatement")
            page.wait_for_selector("#taxStatementPanel", state="visible")
            time.sleep(1.5)
            
            # Click Generate Consolidated Statement button to show active statement details
            print("Clicking Generate Consolidated Statement button...")
            page.click("#generateFYBtn")
            time.sleep(1.5)
            
            print("Capturing 08_tax_statement.png...")
            page.screenshot(path=str(SCREENSHOTS_DIR / "08_tax_statement.png"))
            
            # 9. SBI TT Rates Used in Calculation (visible after report generation)
            print("Capturing 09_sbi_rates_used.png...")
            # Switch back to main tab first
            page.click("#tabA3")
            time.sleep(1.0)
            # Expand the SBI rates section
            page.locator("#sbiRatesSection").scroll_into_view_if_needed()
            time.sleep(0.5)
            # Click collapsible header to expand if collapsed
            page.locator("#sbiRatesSection .collapsible-header").click()
            time.sleep(0.5)
            page.evaluate("document.getElementById('appHeader').style.display = 'none'")
            page.locator("#sbiRatesSection").screenshot(path=str(SCREENSHOTS_DIR / "09_sbi_rates_used.png"))
            page.evaluate("document.getElementById('appHeader').style.display = ''")
            
            # 9b. SBI TT Rates Editor
            print("Capturing 09b_sbi_rate_editor.png...")
            page.hover("#toolsMenu")
            page.wait_for_selector("#viewRatesBtn", state="visible")
            page.click("#viewRatesBtn")
            page.wait_for_selector("#monthlyRatesSection", state="visible")
            
            # Select October 2025
            page.select_option("#ratesYearSelect", "2025")
            page.select_option("#ratesMonthSelect", "10")
            time.sleep(1.5) # Wait for load
            
            # Override October 1st
            day_cell = page.locator(".calendar-day[data-date='2025-10-01']")
            day_cell.scroll_into_view_if_needed()
            day_cell.click()
            page.wait_for_selector(".calendar-day-editor-input", state="visible")
            page.fill(".calendar-day-editor-input", "84.50")
            page.keyboard.press("Enter")
            time.sleep(1.0) # Wait for save
            
            # Take screenshot
            page.evaluate("document.getElementById('appHeader').style.display = 'none'")
            page.locator("#monthlyRatesSection").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.locator("#monthlyRatesSection").screenshot(path=str(SCREENSHOTS_DIR / "09b_sbi_rate_editor.png"))
            page.evaluate("document.getElementById('appHeader').style.display = ''")
            
            # 10. Asset Pie Chart (End-of-Year Assets by Stock)
            print("Capturing 10_asset_pie_chart.png...")
            page.evaluate("""
                const content = document.getElementById('assetPieChartContent');
                if (content) content.classList.remove('collapsed');
            """)
            page.locator("#assetPieChartSection").scroll_into_view_if_needed()
            time.sleep(2.0)  # Wait for SVG pie chart to render fully
            page.locator("#assetPieChartSection").screenshot(path=str(SCREENSHOTS_DIR / "10_asset_pie_chart.png"))
            
            # 11. NAV Flow Sankey Chart
            print("Capturing 11_nav_flow_chart.png...")
            page.evaluate("""
                const content = document.getElementById('navFlowContent');
                if (content) content.classList.remove('collapsed');
            """)
            page.locator("#navFlowSection").scroll_into_view_if_needed()
            time.sleep(2.0)  # Wait for SVG chart to render fully
            page.locator("#navFlowSection").screenshot(path=str(SCREENSHOTS_DIR / "11_nav_flow_chart.png"))
            
            print("Screenshots taken successfully!")
            browser.close()
            
    finally:
        # Fallback restore to ensure user profiles are never lost if something crashes
        if backup_dir.exists():
            print("Cleanup fallback: Restoring backed-up user profiles...")
            if portfolios_dir.exists():
                shutil.rmtree(portfolios_dir)
            backup_dir.rename(portfolios_dir)
            
        if server_proc:
            print("Stopping Flask server...")
            server_proc.terminate()
            server_proc.wait()

if __name__ == "__main__":
    run_screenshot_flow()
