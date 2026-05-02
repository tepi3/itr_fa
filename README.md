# ITR Schedule FA — Section A3 Helper Tool

A local web tool to automate filling Section A3 (Foreign Equity & Debt Interest) of Schedule FA in Indian Income Tax Return.

## Quick Start

```bash
# Install dependencies
pip3 install -r requirements.txt

# Run the app
python3 app.py

# Open in browser: http://127.0.0.1:5000
```

## Features

- **Auto stock lookup** — Enter ticker symbol (QCOM, VWRA, etc.), company info auto-filled via Yahoo Finance
- **SBI TT rates** — Auto-fetches SBI TT Buying Rate of last working day of previous month for all conversions. Currently supports USD as the base currency.
- **Historical SBI Rates** — View and edit SBI rates for any year going back to 2000
- **Explicit Dividend Management**: Dedicated table for dividend events per stock with manual override.
- **Per-Stock Dividend Summary**: Automated aggregation of total dividends earned per entity.
- **Multi-User Profiles**: Manage separate portfolios for different individuals (e.g., self, spouse, parents) with dedicated storage and user-friendly management (add, rename, delete).
- **Excel Export**: Generate ready-to-use reports for tax filing.
- **All 12 A3 columns** — Auto-calculates initial value, peak value, closing balance, dividends, sale proceeds
- **Per-Stock Summary** — Automatically aggregates all lots to provide a clear per-stock dividend summary
- **FIFO sells** — Supports partial sells and fractional shares
- **Manual override** — Click any calculated value in the A3 table to override manually
- **Year selector** — Pick calendar year, import previous year's data
- **Save/Load** — Portfolio saved as JSON locally
- **Excel export** — Download formatted .xlsx matching ITR A3 layout

## Workflow

1. **Fetch SBI Rates** — Click "⬇ Fetch SBI Rates" button (first time only)
2. **Add stocks** — Enter ticker symbol and click Lookup
3. **Add lots** — Click "+ Add Lot" and enter buy date, quantity, price
4. **Add sells** — Click "+ Add Sell" for any lots sold during the year
5. **Calculate** — Click "⚡ Calculate A3 Values" to compute all 12 columns
6. **Override** — Click any calculated cell in the results table to manually adjust
7. **Export** — Click "📥 Export Excel" to download the formatted spreadsheet
8. **Save** — Click "💾 Save" to save your portfolio for future reference

## Data Sources

- **Stock data**: [Yahoo Finance](https://finance.yahoo.com) via `yfinance` (free, no login)
- **SBI TT rates**: [sbi-fx-ratekeeper](https://github.com/sahilgupta/sbi-fx-ratekeeper) on GitHub (free)

## Files

```
itr_fa/
├── app.py                    # Flask server & API routes
├── config.py                 # Configuration constants
├── requirements.txt          # Python dependencies
├── APPLICATION_PLAN.md       # Detailed plan (for any agent to continue development)
├── core/
│   ├── sbi_rates.py          # SBI TT rate fetch & lookup
│   ├── stock_data.py         # Yahoo Finance wrapper
│   ├── calculator.py         # A3 column calculations
│   └── excel_export.py       # Excel generation
├── data/                     # Runtime data (auto-created)
│   ├── sbi_rates_cache.json  # Cached SBI rates
│   └── portfolios/           # Saved portfolios
├── static/
│   ├── css/style.css         # Dark-mode UI
│   └── js/app.js             # Frontend logic
└── templates/
    └── index.html            # Main UI template
```

## Notes

- Runs locally only — no cloud hosting required
- Works on macOS and Windows
- All APIs are free and require no login
- See `APPLICATION_PLAN.md` for full technical details and implementation status
