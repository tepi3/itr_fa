# ITR Schedule FA — Section A3 Helper Tool

A local web tool to automate filling Section A3 (Foreign Equity & Debt Interest) of Schedule FA in Indian Income Tax Return.

## Quick Start

```bash
# Install dependencies
pip3 install -r requirements.txt

# Run the app
python3 app.py

# Open in browser: http://127.0.0.1:5001
```
*Note: The app runs on port 5001 to avoid conflicts with macOS AirPlay (Control Center).*

## Features

- **Auto stock lookup** — Enter ticker symbol (QCOM, NVDA, etc.), company info auto-filled via Yahoo Finance.
- **USD-Only SBI TT rates** — Auto-fetches SBI TT Buying Rate of the last working day of the previous month for all conversions. (Supports USD for US stocks/ETFs).
- **Rate Locking** — Lock rates for a specific year to prevent automatic fetches from overwriting your manual edits.
- **E-Trade Import** — Automatically parse your E-Trade Holdings reports (Expanded "By Status" View) to populate all acquisition lots and sale transactions.
- **E-Trade Sell Details Import** — Upload the Gain and Loss Expanded (G&L Expanded) exported `.xlsx` file from E-Trade to populate both acquisition lots and sell transactions from sell records.
- **Dividend Auto-Fetch** — Automatically fetches dividend events for the current year when importing data or adding stocks.
- **CSV Export** — Generate ready-to-use `.csv` reports strictly matching the ITR portal's Schedule FA A3 template.
- **Multi-User Profiles** — Manage separate portfolios for different individuals with dedicated local storage.
- **FIFO Sells** — Supports partial sells and fractional shares using First-In-First-Out logic.
- **Historical SBI Rates** — View and edit SBI rates for any month going back to 2000.
- **Manual Override** — Click any calculated cell in the results table to manually adjust values if needed.

## Workflow

1.  **Select User & Year** — Choose an existing profile or create a new one. The app will automatically try to load your portfolio or import holdings from the previous year.
2.  **Fetch SBI Rates** — Click "⬇ Fetch SBI Rates" button (if rates are missing for your year).
3.  **Import Data (Optional)** — Click "📈 Upload Etrade" to import holdings from an E-Trade report, click "📉 Upload Sell Details" to import sell transactions from the Gain and Loss Expanded exported `.xlsx` file, or use "📥 Import Prev Year" to bring over holdings from a previous year's save.
4.  **Add Stocks/Lots Manually** — Enter ticker symbols and add acquisition lots (date, quantity, price) or sells as needed.
5.  **Calculate** — Click "⚡ Calculate A3 Values" to compute all 12 portal columns (Initial Value, Peak Value, Closing Balance, Dividends, Sale Proceeds).
6.  **Export** — Click "📥 Export CSV" to download the formatted file for tax filing.
7.  **Save** — Click "💾 Save" to store your portfolio locally for future use.

## Data Sources

- **Stock data**: [Yahoo Finance](https://finance.yahoo.com) via `yfinance` (free, no login).
- **SBI TT rates**: [sbi-fx-ratekeeper](https://github.com/sahilgupta/sbi-fx-ratekeeper) on GitHub (free).

## Files

```
itr_fa/
├── app.py                    # Flask server & API routes (Port 5001)
├── config.py                 # Configuration constants (USD, SBI URLs)
├── requirements.txt          # Python dependencies (Flask, yfinance, openpyxl)
├── core/
│   ├── sbi_rates.py          # SBI TT rate fetch, cache, and locking
│   ├── stock_data.py         # Yahoo Finance wrapper
│   ├── calculator.py         # A3 column calculations
│   ├── csv_export.py         # ITR-compliant CSV generation
│   ├── etrade_parser.py      # E-Trade report parser (CSV/XLSX)
│   └── sell_details_parser.py # G&L Expanded sell details parser (CSV/XLSX)
├── data/                     # Runtime data (auto-created)
│   ├── sbi_rates_cache.json  # Cached SBI rates & locked years
│   └── portfolios/           # Saved user portfolios (JSON)
├── static/
│   ├── css/style.css         # Modern dark-mode UI
│   └── js/app.js             # Frontend logic & state management
└── templates/
    └── index.html            # Main SPA template
```

## Notes

- **Local Only**: All data is stored locally on your machine in the `data/` folder. No cloud hosting or external accounts are used.
- **macOS Compatibility**: Port moved to 5001 to resolve 403 Forbidden errors caused by AirPlay Receiver on port 5000.
- **Using Upload Etrade**: Current Holding will not contain sold stocks.
- **License**: This tool is open-source and free for personal, non-commercial use.

---

**Copyright (c) 2026 Piyush Tewari (tepi3). All rights reserved.**
*Author: Piyush Tewari (tepi3)*
