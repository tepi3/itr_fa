# FA Desk - Foreign Assets ITR Helper

A local web tool to automate filling Section A3 (Foreign Equity & Debt Interest) of Schedule FA in Indian Income Tax Return.

## Quick Start

### Option 1: Download the Portable App (Easiest)
You can run FA Desk without installing Python by downloading the standalone executable:
1. Go to the **[Releases](https://github.com/tepi3/itr_fa/releases/latest)** page on this GitHub repository.
2. Download `fa_desk_macOS.zip`, `fa_desk_Windows.exe`, or `fa_desk_Linux` from the **Assets** section.
3. Run the executable. The app will launch in a **standalone desktop window**.
   - *Note:* In developer/source mode, it still opens in your browser automatically.
   - *Note for Mac users:* Refer to **macOS Installation** below to bypass Apple's unidentified developer warning.
   - *Data storage:* Your saved portfolios will be safely stored in a `.fa_desk_data` folder in your user's home directory.

####  macOS Installation

Because this app is currently unsigned, macOS will block it upon first launch. Please follow one of these methods to run the app:

##### Method 1: The "Open Anyway" (Recommended)
1. Double-click the `fa_desk_macOS` app. When the warning appears, click **Done**.
2. Open **System Settings > Privacy & Security**.
3. Scroll down to the **Security** section.
4. Look for the message: *"fa_desk_macOS" was blocked from use because it is not from an identified developer.*
5. Click **Open Anyway**, enter your password, and click **Open** on the final dialog.

##### Method 2: The Terminal Bypass
1. Open **Terminal**.
2. Run the following command:
   ```bash
   xattr -cr /path/to/fa_desk_macOS.app
   ```
   *(Tip: You can drag the app icon directly into the terminal window to auto-fill the path).*

The app will now open normally with a double-click.

### ✨ Onboarding Demo Profile (No Setup Required!)

If you want to quickly test the application's capabilities without importing or manually typing transaction data:
1. Launch the app (either standalone or via Python).
2. On the welcome/user selection screen, click the **✨ Try with Demo Profile (CY2025)** button.
3. This will instantly initialize a profile named `DemoUser` and load a highly realistic pre-configured portfolio featuring:
   - **Apple Inc. (AAPL)**: 2 lots bought in 2021 & 2022, with partial sells in 2025.
   - **Tesla, Inc. (TSLA)**: 2 lots bought in 2021 & 2022, with partial sells in 2025.
   - **NVIDIA Corporation (NVDA)**: 2 lots bought in 2021 & 2022, with partial sells in 2025.
4. You can immediately click **⚡ Calculate A3 Values** to watch the progressive loader run, test validation audit details, view consolidated reports, simulate sells, and export formatted CSV sheets!

### Option 2: Run via Python (For Developers)

#### One-liner to Clone, Install & Run
```bash
git clone https://github.com/tepi3/itr_fa.git && cd itr_fa && pip3 install -r requirements.txt && python3 app.py
```

#### Manual Setup
```bash
# Clone the repository
git clone https://github.com/tepi3/itr_fa.git
cd itr_fa

# Install dependencies
pip3 install -r requirements.txt

# Run the app
python3 app.py

# Open in browser: http://127.0.0.1:5001
```
*Note: The app runs on port 5001 to avoid conflicts with macOS AirPlay (Control Center).*

## Features

### Portfolio Management
- **Auto stock lookup** — Enter ticker symbol (QCOM, NVDA, etc.), company info auto-filled via Yahoo Finance.
- **E-Trade Import** — Automatically parse your E-Trade Holdings reports (Expanded "By Status" View) to populate all acquisition lots and sale transactions.
- **E-Trade Sell Details Import** — Upload the Gain and Loss Expanded (G&L Expanded) exported `.xlsx` file from E-Trade to populate both acquisition lots and sell transactions.
- **IBKR Import** — Upload your Interactive Brokers CSV transaction history to build the portfolio and apply FIFO sells.
- **FIFO Sells** — Supports partial sells and fractional shares using First-In-First-Out logic.
- **Multi-User Profiles** — Manage separate portfolios for different individuals with dedicated local storage.
- **Manual Override** — Click any calculated cell in the results table to manually adjust values if needed.

### SBI Rates & Currency
- **Dual-Rate Logic** — Automatically applies the correct SBI TT Buying Rate based on context:
  - **Schedule FA (A3)**: Uses the rate as of the **actual date of the event** (Buy, Peak, Closing, Dividend, or Sale) with a 10-day automatic walk-back for weekends and holidays.
  - **Tax Calculation (CG/Dividends)**: Uses the rate on the **last working day of the preceding month** (as per Rule 115).
- **Interactive Rate Overrides** — Click any rate in the "SBI TT Rates Used in Calculation" table at the bottom of the report to edit it inline. Edits are persisted globally to the cache.
- **USD-Only SBI TT rates** — Auto-fetches from a community-maintained GitHub archive.
- **Rate Locking** — Lock rates for a specific year to prevent automatic fetches from overwriting your manual edits.
- **Historical SBI Rates** — View and edit SBI rates for any month going back to 2000.

### Dividends
- **Dividend Auto-Fetch** — Automatically fetches dividend events for the current year when importing data or adding stocks.
- **Per-Stock Fetch Dividends** — Re-fetch dividend data for any individual stock with a single click (🔄 button per stock card).
- **Batch Fetch All Dividends** — Refresh dividend data for all stocks at once from the header (💰 Fetch All Dividends).

### Tax Computation
- **Schedule FA A3 Calculator** — Computes all 12 portal columns: Initial Value, Peak Value, Closing Balance, Dividends, and Sale Proceeds — all converted to ₹.
- **Validate A3 (Audit Trail)** — Provides a complete mathematical breakdown (`Quantity × Price × Rate`) for every calculated cell in Section A3.
  - **Click to Validate**: Click any calculated value in the A3 report table to instantly jump to its detailed breakdown in the validation section.
  - **Override Tracking**: Clearly flags cells where a manual override has been applied, while still showing the original calculated math.
- **ITR Tax Year Summary** — Capital gains (LTCG/STCG) and dividends mapped to Indian tax years with advance-tax quarterly buckets.
- **ITR §70/74 Set-Off** — Automatic capital gains netting: STCL vs STCG, residual STCL vs LTCG, LTCL vs LTCG, with carry-forward tracking.
- **Consolidated Tax Statement** — Generate a unified tax view for any complete Tax Year (Apr–Mar) by combining two calendar year reports. If a year's report is missing, that portion is treated as zero.

### Sell Simulator
- **Tax Impact Simulator** — Simulate hypothetical stock sells and preview STCG/LTCG tax impact without modifying your portfolio.
- **Live Price Fetch** — Fetch real-time intraday prices for sell simulations.
- **Portfolio Lots Reference** — View all acquisition lots from your current portfolio in a read-only reference table while building simulated sells.

### Productivity
- **Undo / Redo** — Undo any portfolio change (add/remove stock, lot, sell, dividend) with ↩ Undo or **Ctrl+Z** (⌘+Z on Mac). Redo with ↪ Redo or **Ctrl+Shift+Z**. Supports up to 50 levels.
- **Save / Open Anywhere** — Use the "Save As" and "Open..." buttons to download your portfolio JSON to any external folder on your computer, or load it from any directory, in addition to the built-in server-side Save/Load.
- **Unsaved Changes Indicator** — A pulsing dot on the Save button warns you about unsaved portfolio modifications.
- **Interactive Tutorial** — Click ❓ Help to launch a guided step-by-step walkthrough of every feature with spotlight highlights.
- **CSV Export** — Generate ready-to-use `.csv` reports strictly matching the ITR portal's Schedule FA A3 template.

## Workflow

1.  **Select User & Year** — Choose an existing profile or create a new one. The app will automatically try to load your portfolio or import holdings from the previous year.
2.  **Fetch SBI Rates** — Click "⬇ Fetch SBI Rates" button (if rates are missing for your year).
3.  **Import Data (Optional)** — Click "📁 Upload ETRADE Docs" to import holdings and/or sell transactions, or use "📥 Import Prev Year" to bring over holdings from a previous year's save.
4.  **Add Stocks/Lots Manually** — Enter ticker symbols and add acquisition lots (date, quantity, price) or sells as needed.
5.  **Fetch Dividends** — Click "💰 Fetch All Dividends" to pull dividend data for all stocks, or use 🔄 per stock.
6.  **Calculate** — Click "⚡ Calculate A3 Values" to compute all 12 portal columns.
7.  **Review Tax Summary** — Review the ITR Tax Year Summary with LTCG/STCG netting, or generate a Consolidated FY Statement.
8.  **Export** — Click "📥 Export CSV" to download the formatted file for tax filing.
9.  **Save** — Click "💾 Save" to store your portfolio locally for future use.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` / `⌘+Z` | Undo |
| `Ctrl+Shift+Z` / `⌘+Shift+Z` | Redo |

## Data Sources

- **Stock data**: [Yahoo Finance](https://finance.yahoo.com) via `yfinance` (free, no login).
- **SBI TT rates**: [sbi-fx-ratekeeper](https://github.com/sahilgupta/sbi-fx-ratekeeper) on GitHub (free).

## Files

```text
itr_fa/
├── .github/
│   └── workflows/
│       └── build.yml         # GitHub Actions CI/CD for portable binaries
├── app.py                    # Flask server & API routes (Port 5001)
├── config.py                 # Configuration constants & data path resolution
├── requirements.txt          # Python dependencies (Flask, yfinance, openpyxl)
├── routes/                   # Flask Blueprints (API endpoints)
│   ├── calculator.py
│   ├── market.py
│   ├── parsers.py
│   ├── portfolio.py
│   └── users.py
├── core/
│   ├── sbi_rates.py          # SBI TT rate fetch, cache, and locking
│   ├── stock_data.py         # Yahoo Finance wrapper
│   ├── calculator.py         # A3 column calculations & tax year summary
│   ├── csv_export.py         # ITR-compliant CSV generation
│   ├── etrade_parser.py      # E-Trade report parser (CSV/XLSX)
│   ├── ibkr_parser.py        # IBKR report parser (CSV)
│   └── sell_details_parser.py # G&L Expanded sell details parser (CSV/XLSX)
├── static/
│   ├── css/style.css         # Modern dark-mode UI
│   └── js/app.js             # Frontend logic & state management
└── templates/
    └── index.html            # Main SPA template
```

## Notes

- **Local Only**: All data is stored locally on your machine in the `~/.fa_desk_data` folder. No cloud hosting or external accounts are used.
- **macOS Compatibility**: Port moved to 5001 to resolve 403 Forbidden errors caused by AirPlay Receiver on port 5000.
- **Using Upload Etrade**: Current Holding will not contain sold stocks.
- **License**: This tool is open-source and free for personal, non-commercial use.

---

**Copyright (c) 2026 Piyush Tewari (tepi3). All rights reserved.**
*Author: Piyush Tewari (tepi3)*
