import os
import sys
import time
import socket
import subprocess
import shutil
import pytest
from pathlib import Path
from playwright.sync_api import sync_playwright

WORKSPACE_DIR = Path(__file__).parent.parent.resolve()
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
    lock_file = Path.home() / ".fa_desk_data" / "app.lock"
    if lock_file.exists():
        try:
            lock_file.unlink()
        except Exception as e:
            print(f"Could not delete lock file: {e}")
            
    env = os.environ.copy()
    env["FLASK_DEBUG"] = "0"
    process = subprocess.Popen(
        ["./venv/bin/python", "app.py"],
        cwd=str(WORKSPACE_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
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

@pytest.mark.ui
def test_ui_regression_flow():
    portfolios_dir = Path.home() / ".fa_desk_data" / "portfolios"
    backup_dir = Path.home() / ".fa_desk_data" / "portfolios_backup"
    
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
            context = browser.new_context(viewport={"width": 2560, "height": 1440})
            page = context.new_page()
            
            # Go to home page
            print("Navigating to http://127.0.0.1:5001...")
            page.goto("http://127.0.0.1:5001")
            
            # Assert App Header, Title, Theme Toggle are visible
            assert page.locator("#appHeader").is_visible()
            assert page.locator(".theme-toggle").is_visible()
            
            # 1. Login/Profile Selection (Empty State)
            print("Asserting Profile Selection screen...")
            page.wait_for_selector("#tryDummyBtn", state="visible")
            assert page.locator("#tryDummyBtn").is_visible()
            assert page.locator("#loginSection").is_visible()
            
            print("Capturing 01_profile_selection.png...")
            time.sleep(1.5)
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
            
            # Assert main layout components: dashboard, tab bar, add stock button, footer
            assert page.locator("#portfolioDashboard").is_visible()
            assert page.locator("#tabBar").is_visible()
            assert page.locator("#addStockBtn").is_visible()
            assert page.locator("#calcFab").is_visible()
            
            print("Waiting for stock data and exchange rates to fetch...")
            time.sleep(6.0)
            
            # Assert stock cards are visible
            assert page.locator("#stockCards").is_visible()
            assert page.locator(".stock-card").count() > 0
            
            # Expand the first stock card details showing acquisition, sells, and dividends
            print("Expanding first stock card details...")
            page.locator(".toggle-details-btn").first.click()
            time.sleep(1.5)
            
            # Assert details exist inside expanded card
            assert page.locator(".lots-table").first.is_visible()
            
            # Screenshot of the active stock cards (before report generation)
            print("Capturing 02c_stock_cards.png...")
            page.locator("#stockCards").screenshot(path=str(SCREENSHOTS_DIR / "02c_stock_cards.png"))
            
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
            
            # Assert A3 report header and rows exist
            assert page.locator("#resultsSection").is_visible()
            assert page.locator(".a3-row").count() > 0
            
            # 2b. Portfolio Dashboard Metrics (post-report)
            print("Capturing 02b_dashboard_summary.png...")
            page.locator("#portfolioDashboard").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.locator("#portfolioDashboard").screenshot(path=str(SCREENSHOTS_DIR / "02b_dashboard_summary.png"))
            
            # Screenshot FA Report Section A3
            print("Capturing 03_fa_report_preview.png...")
            page.locator("#resultsSection").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.locator("#resultsSection").screenshot(path=str(SCREENSHOTS_DIR / "03_fa_report_preview.png"))
            
            # 4. Calculation breakdown: Validate A3
            print("Asserting and capturing 04_validate_a3.png...")
            assert page.locator("#validateA3Section").is_visible()
            assert page.locator(".validate-row").count() > 0
            page.locator("#validateA3Section").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.locator("#validateA3Section").screenshot(path=str(SCREENSHOTS_DIR / "04_validate_a3.png"))
            
            # 5. ITR Capital Gains & Dividend Summary
            print("Asserting and capturing 05_capital_gains_summary.png...")
            assert page.locator("#taxYearSection").is_visible()
            assert page.locator(".tax-summary-table").is_visible()
            page.evaluate("document.getElementById('appHeader').style.display = 'none'")
            page.locator("#taxYearSection").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.locator("#taxYearSection").screenshot(path=str(SCREENSHOTS_DIR / "05_capital_gains_summary.png"))
            page.evaluate("document.getElementById('appHeader').style.display = ''")
            
            # 6. Validate Capital Gains & Dividends breakdown
            print("Asserting and capturing 06_validate_tax_details.png...")
            assert page.locator("#validateTaxSection").is_visible()
            page.locator("#validateTaxSection").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.locator("#validateTaxSection").screenshot(path=str(SCREENSHOTS_DIR / "06_validate_tax_details.png"))
            
            # 7. Switch to Sell Simulator tab
            print("Switching to Sell Simulator tab...")
            page.click("#tabSellHelper")
            page.wait_for_selector("#sellHelperPanel", state="visible")
            time.sleep(1.0)
            
            assert page.locator("#sellHelperPanel").is_visible()
            assert page.locator("#shAddRowBtn").is_visible()
            
            # Add a row to show the simulation in action
            print("Adding a simulated sell row...")
            page.click("#shAddRowBtn")
            page.wait_for_selector(".sh-lot-select", state="visible")
            time.sleep(0.5)
            
            # Fill out the simulator row
            page.fill(".sh-sell-date", "20/06/2025")
            page.fill(".sh-sell-qty", "10")
            page.fill(".sh-sell-price", "185.00")
            time.sleep(0.5)
            
            # Click Simulate
            print("Running simulation...")
            page.click("#shSimulateBtn")
            page.wait_for_selector("#shResultsSection", state="visible")
            time.sleep(1.5)
            
            assert page.locator("#shResultsSection").is_visible()
            
            # Screenshot Sell Simulator
            print("Capturing 07_sell_simulator.png...")
            page.locator("#sellHelperPanel").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.screenshot(path=str(SCREENSHOTS_DIR / "07_sell_simulator.png"))
            
            # 8. Switch to Tax Statement tab
            print("Switching to Tax Statement tab...")
            page.click("#tabTaxStatement")
            page.wait_for_selector("#taxStatementPanel", state="visible")
            time.sleep(1.5)
            
            assert page.locator("#taxStatementPanel").is_visible()
            assert page.locator("#generateFYBtn").is_visible()
            
            # Click Generate Consolidated Statement button
            print("Clicking Generate Consolidated Statement button...")
            page.click("#generateFYBtn")
            time.sleep(1.5)
            
            print("Capturing 08_tax_statement.png...")
            page.screenshot(path=str(SCREENSHOTS_DIR / "08_tax_statement.png"))
            
            # 9. SBI TT Rates Used in Calculation
            print("Capturing 09_sbi_rates_used.png...")
            page.click("#tabA3")
            time.sleep(1.0)
            page.locator("#sbiRatesSection").scroll_into_view_if_needed()
            time.sleep(0.5)
            assert page.locator("#sbiRatesSection").is_visible()
            
            page.locator("#sbiRatesSection .collapsible-header").click()
            time.sleep(0.5)
            page.evaluate("document.getElementById('appHeader').style.display = 'none'")
            page.locator("#sbiRatesSection").screenshot(path=str(SCREENSHOTS_DIR / "09_sbi_rates_used.png"))
            page.evaluate("document.getElementById('appHeader').style.display = ''")
            
            # 9b. SBI TT Rates Editor
            print("Capturing 09b_sbi_rate_editor.png...")
            assert page.locator("#toolsMenu").is_visible()
            page.hover("#toolsMenu")
            page.wait_for_selector("#viewRatesBtn", state="visible")
            page.click("#viewRatesBtn")
            page.wait_for_selector("#monthlyRatesSection", state="visible")
            
            assert page.locator("#monthlyRatesSection").is_visible()
            assert page.locator("#ratesYearSelect").is_visible()
            assert page.locator("#ratesMonthSelect").is_visible()
            
            page.select_option("#ratesYearSelect", "2025")
            page.select_option("#ratesMonthSelect", "10")
            time.sleep(1.5)
            
            day_cell = page.locator(".calendar-day[data-date='2025-10-01']")
            day_cell.scroll_into_view_if_needed()
            day_cell.click()
            page.wait_for_selector(".calendar-day-editor-input", state="visible")
            page.fill(".calendar-day-editor-input", "84.50")
            page.keyboard.press("Enter")
            time.sleep(1.0)
            
            page.evaluate("document.getElementById('appHeader').style.display = 'none'")
            page.locator("#monthlyRatesSection").scroll_into_view_if_needed()
            time.sleep(0.5)
            page.locator("#monthlyRatesSection").screenshot(path=str(SCREENSHOTS_DIR / "09b_sbi_rate_editor.png"))
            page.evaluate("document.getElementById('appHeader').style.display = ''")
            
            # 10. Asset Pie Chart
            print("Capturing 10_asset_pie_chart.png...")
            assert page.locator("#assetPieChartSection").is_visible()
            page.evaluate("""
                const content = document.getElementById('assetPieChartContent');
                if (content) content.classList.remove('collapsed');
            """)
            page.locator("#assetPieChartSection").scroll_into_view_if_needed()
            time.sleep(2.0)
            page.locator("#assetPieChartSection").screenshot(path=str(SCREENSHOTS_DIR / "10_asset_pie_chart.png"))
            
            print("Screenshots taken and all UI assertions passed successfully!")
            browser.close()
            
    finally:
        if backup_dir.exists():
            print("Cleanup fallback: Restoring backed-up user profiles...")
            if portfolios_dir.exists():
                shutil.rmtree(portfolios_dir)
            backup_dir.rename(portfolios_dir)
            
        if server_proc:
            print("Stopping Flask server...")
            server_proc.terminate()
            server_proc.wait()
