import { state } from '../state.js';
import { parseAppDate, calculateXIRR } from '../utils.js';
import { apiPost } from '../api.js';
import { BOX_SVG, BRIEFCASE_SVG, TREND_UP_SVG, CURRENCY_SVG, PIE_CHART_SVG } from '../constants.js';
import { updateSbiModeHints } from './resultsTable.js';

/**
 * Portfolio Dashboard view controller, theme/density selectors, and SVG chart generator
 */

export function updateDashboard() {
    const dash = document.getElementById("portfolioDashboard");
    if (!dash) return;

    const stocks = state.portfolio.stocks;
    if (stocks.length === 0) {
        dash.classList.add("hidden");
        return;
    }
    dash.classList.remove("hidden");

    // Restore structure if skeletons are present
    if (dash.querySelector(".skeleton-stat-grid")) {
        dash.innerHTML = `
            <div class="dash-stat">
                <span class="dash-icon">${BOX_SVG}</span>
                <span class="dash-value"><span id="dashStockCount">0</span><span style="font-size: 0.6em; color: var(--text-muted); margin: 0 4px;">/</span><span id="dashLotCount">0</span></span>
                <span class="dash-label">Stocks / Lots</span>
            </div>
            <div class="dash-stat">
                <span class="dash-icon">${BRIEFCASE_SVG}</span>
                <span class="dash-value" id="dashTotalAssets">—</span>
                <div id="dashTotalAssetsUSD" style="font-size: 0.9rem; font-weight: 600; margin-top: -2px; margin-bottom: 4px; color: var(--accent);">$—</div>
                <span class="dash-label">Total Assets</span>
            </div>
            <div class="dash-stat">
                <span class="dash-icon">${TREND_UP_SVG}</span>
                <span class="dash-value" id="dashUnrealizedGain">—</span>
                <div id="dashUnrealizedUSD" style="font-size: 0.9rem; font-weight: 600; margin-top: -2px; margin-bottom: 4px; color: var(--accent);">$—</div>
                <div id="dashUnrealizedBreakdown" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; display: flex; gap: 8px; font-weight: 500;">
                    <span id="dashUnrealizedLTCG" title="Long Term Unrealized Gain/Loss">LT: —</span>
                    <span id="dashUnrealizedSTCG" title="Short Term Unrealized Gain/Loss">ST: —</span>
                </div>
                <span class="dash-label">Unrealized G/L</span>
            </div>
            <div class="dash-stat">
                <span class="dash-icon">${CURRENCY_SVG}</span>
                <span class="dash-value" id="dashTotalDividends">—</span>
                <div id="dashTotalDividendsUSD" style="font-size: 0.9rem; font-weight: 600; margin-top: -2px; margin-bottom: 4px; color: var(--accent);">$—</div>
                <span class="dash-label">Total Dividends</span>
            </div>
        `;
    }

    document.getElementById("dashStockCount").textContent = stocks.length;
    document.getElementById("dashLotCount").textContent = stocks.reduce((sum, s) => sum + (s.lots ? s.lots.length : 0), 0);

    // Dynamic injection of missing elements
    const assetsContainer = document.getElementById("dashTotalAssets")?.parentNode;
    if (assetsContainer && !document.getElementById("dashTotalAssetsUSD")) {
        const usdEl = document.createElement("div");
        usdEl.id = "dashTotalAssetsUSD";
        usdEl.style.cssText = "font-size: 0.9rem; font-weight: 600; margin-top: -2px; margin-bottom: 4px; color: var(--accent);";
        usdEl.textContent = "$—";
        assetsContainer.insertBefore(usdEl, assetsContainer.querySelector(".dash-label"));
    }
    
    const divContainer = document.getElementById("dashTotalDividends")?.parentNode;
    if (divContainer && !document.getElementById("dashTotalDividendsUSD")) {
        const usdEl = document.createElement("div");
        usdEl.id = "dashTotalDividendsUSD";
        usdEl.style.cssText = "font-size: 0.9rem; font-weight: 600; margin-top: -2px; margin-bottom: 4px; color: var(--accent);";
        usdEl.textContent = "$—";
        divContainer.insertBefore(usdEl, divContainer.querySelector(".dash-label"));
    }

    const gainContainer = document.getElementById("dashUnrealizedGain")?.parentNode;
    if (gainContainer && !document.getElementById("dashUnrealizedUSD")) {
        const usdEl = document.createElement("div");
        usdEl.id = "dashUnrealizedUSD";
        usdEl.style.cssText = "font-size: 0.9rem; font-weight: 600; margin-top: -2px; margin-bottom: 4px; color: var(--accent);";
        usdEl.textContent = "$—";
        gainContainer.insertBefore(usdEl, document.getElementById("dashUnrealizedBreakdown") || gainContainer.querySelector(".dash-label"));
    }
    if (gainContainer && !document.getElementById("dashUnrealizedBreakdown")) {
        const breakdownEl = document.createElement("div");
        breakdownEl.id = "dashUnrealizedBreakdown";
        breakdownEl.style.cssText = "font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; display: flex; gap: 8px; font-weight: 500;";
        breakdownEl.innerHTML = '<span id="dashUnrealizedLTCG" title="Long Term Unrealized Gain/Loss">LT: \u2014</span><span id="dashUnrealizedSTCG" title="Short Term Unrealized Gain/Loss">ST: \u2014</span>';
        gainContainer.insertBefore(breakdownEl, gainContainer.querySelector(".dash-label"));
    }

    // Assets + Dividends only available after calculation
    if (state.calculatedRows && state.calculatedRows.length > 0) {
        const totalAssets = state.calculatedRows.reduce((s, r) => s + (r.closing_balance || 0), 0);
        const totalDivs = state.calculatedRows.reduce((s, r) => s + (r.total_dividends || 0), 0);
        
        // Calculate Unrealized Gain/Loss and USD variants
        let totalUnrealizedGain = 0;
        let ltcgUnrealized = 0;
        let stcgUnrealized = 0;
        
        let totalAssetsUSD = 0;
        let totalUnrealizedGainUSD = 0;
        let totalDivsUSD = 0;
        
        const refDate = new Date(state.portfolio.calendar_year, 11, 31); // Dec 31 of calendar year
        const unrealizedCashFlows = [];

        state.calculatedRows.forEach(row => {
            const closing = row.closing_balance || 0;
            const details = row.calculation_details;
            if (closing > 0 && details && details.initial && details.closing) {
                const initialRate = details.initial.rate || 0;
                const buyPrice = details.initial.components?.buy_price || 0;
                const remainingQty = details.closing.remaining_qty || 0;
                const costBasisRemaining = buyPrice * remainingQty * initialRate;
                const gain = closing - costBasisRemaining;
                totalUnrealizedGain += gain;
                
                // Calculate USD variants
                const closePriceUSD = details.closing.components?.close_price_dec31 || 0;
                const closingUSD = closePriceUSD * remainingQty;
                totalAssetsUSD += closingUSD;
                
                const costBasisRemainingUSD = buyPrice * remainingQty;
                totalUnrealizedGainUSD += (closingUSD - costBasisRemainingUSD);

                if (row.acquire_date_raw) {
                    const acquireDate = parseAppDate(row.acquire_date_raw);
                    const holdingDays = (refDate - acquireDate) / (1000 * 60 * 60 * 24);
                    if (holdingDays >= 730) {
                        ltcgUnrealized += gain;
                    } else {
                        stcgUnrealized += gain;
                    }

                    if (acquireDate && costBasisRemaining > 0) {
                        unrealizedCashFlows.push({ date: acquireDate, amount: -costBasisRemaining });
                        const valuationDate = details.closing.components?.rate_date
                            ? parseAppDate(details.closing.components.rate_date)
                            : refDate;
                        if (valuationDate) {
                            unrealizedCashFlows.push({ date: valuationDate, amount: closing });
                        }
                    }
                }
            }
            
            if (details && details.dividends && details.dividends.dividend_entries) {
                details.dividends.dividend_entries.forEach(entry => {
                    const foreignAmount = entry.amount_foreign || 0;
                    const qty = entry.qty || 0;
                    totalDivsUSD += (foreignAmount * qty);
                });
            }
        });

        document.getElementById("dashTotalAssets").textContent = "\u20b9" + Math.round(totalAssets).toLocaleString("en-IN");
        const assetsUSDEl = document.getElementById("dashTotalAssetsUSD");
        if (assetsUSDEl) assetsUSDEl.textContent = "$" + Math.round(totalAssetsUSD).toLocaleString("en-US");
        
        document.getElementById("dashTotalDividends").textContent = "\u20b9" + Math.round(totalDivs).toLocaleString("en-IN");
        const divsUSDEl = document.getElementById("dashTotalDividendsUSD");
        if (divsUSDEl) divsUSDEl.textContent = "$" + Math.round(totalDivsUSD).toLocaleString("en-US");
        
        const gainEl = document.getElementById("dashUnrealizedGain");
        const overallXirr = calculateXIRR(unrealizedCashFlows);
        let xirrSuffix = "";
        if (overallXirr !== null) {
            const xirrPct = overallXirr * 100;
            xirrSuffix = ` <span style="font-size: 0.6em; font-weight: 600; margin-left: 4px;">(XIRR ${xirrPct >= 0 ? "+" : ""}${xirrPct.toFixed(2)}%)</span>`;
        }
        gainEl.innerHTML = (totalUnrealizedGain >= 0 ? "+" : "") + "\u20b9" + Math.round(totalUnrealizedGain).toLocaleString("en-IN") + xirrSuffix;
        gainEl.style.color = totalUnrealizedGain >= 0 ? "var(--success)" : "var(--danger)";
        
        const gainUSDEl = document.getElementById("dashUnrealizedUSD");
        if (gainUSDEl) {
            gainUSDEl.textContent = (totalUnrealizedGainUSD >= 0 ? "+" : "") + "$" + Math.round(totalUnrealizedGainUSD).toLocaleString("en-US");
            gainUSDEl.style.color = totalUnrealizedGainUSD >= 0 ? "var(--success)" : "var(--danger)";
        }

        const ltcgEl = document.getElementById("dashUnrealizedLTCG");
        const stcgEl = document.getElementById("dashUnrealizedSTCG");
        if (ltcgEl && stcgEl) {
            ltcgEl.textContent = "LT: " + (ltcgUnrealized >= 0 ? "+" : "") + "\u20b9" + Math.round(ltcgUnrealized).toLocaleString("en-IN");
            ltcgEl.style.color = ltcgUnrealized >= 0 ? "var(--success)" : "var(--danger)";
            
            stcgEl.textContent = "ST: " + (stcgUnrealized >= 0 ? "+" : "") + "\u20b9" + Math.round(stcgUnrealized).toLocaleString("en-IN");
            stcgEl.style.color = stcgUnrealized >= 0 ? "var(--success)" : "var(--danger)";
        }
    } else {
        document.getElementById("dashTotalAssets").textContent = "\u2014";
        const assetsUSDEl = document.getElementById("dashTotalAssetsUSD");
        if (assetsUSDEl) assetsUSDEl.textContent = "$—";
        
        document.getElementById("dashTotalDividends").textContent = "\u2014";
        const divsUSDEl = document.getElementById("dashTotalDividendsUSD");
        if (divsUSDEl) divsUSDEl.textContent = "$—";
        
        document.getElementById("dashUnrealizedGain").textContent = "\u2014";
        document.getElementById("dashUnrealizedGain").style.color = "";
        
        const gainUSDEl = document.getElementById("dashUnrealizedUSD");
        if (gainUSDEl) {
            gainUSDEl.textContent = "$—";
            gainUSDEl.style.color = "var(--accent)";
        }
        
        const ltcgEl = document.getElementById("dashUnrealizedLTCG");
        const stcgEl = document.getElementById("dashUnrealizedSTCG");
        if (ltcgEl && stcgEl) {
            ltcgEl.textContent = "LT: \u2014";
            ltcgEl.style.color = "";
            stcgEl.textContent = "ST: \u2014";
            stcgEl.style.color = "";
        }
    }
}

export function filterStockCards() {
    const filterInput = document.getElementById("stockFilterInput");
    if (!filterInput) return;
    const query = filterInput.value.toLowerCase().trim();
    const cards = document.querySelectorAll(".stock-card");
    let shown = 0;
    cards.forEach(card => {
        const ticker = (card.querySelector(".stock-ticker")?.textContent || "").toLowerCase();
        const name = (card.querySelector(".stock-name")?.textContent || "").toLowerCase();
        const match = !query || ticker.includes(query) || name.includes(query);
        card.style.display = match ? "" : "none";
        if (match) shown++;
    });
    const countEl = document.getElementById("stockFilterCount");
    if (countEl) countEl.textContent = query ? `${shown} / ${cards.length}` : "";
}

export function setSbiTTMode(mode, skipSave = false) {
    state.sbi_tt_mode = mode;
    try { localStorage.setItem("fa_desk_sbi_mode", mode); } catch(e) {}
    
    document.querySelectorAll(".sbi-mode-option").forEach(btn => {
        const isActive = btn.dataset.mode === mode;
        btn.classList.toggle("active", isActive);
    });

    updateSbiModeHints();

    if (!skipSave) {
        apiPost("/api/settings", { sbi_tt_mode: mode }).catch(e => console.error("Failed to save SBI mode to settings", e));
    }
}

export function restoreSbiTTMode() {
    try {
        const backendMode = document.documentElement.dataset.sbiMode;
        if (backendMode && backendMode !== "{{ sbi_tt_mode }}") {
            setSbiTTMode(backendMode, true);
            return;
        }
        const saved = localStorage.getItem("fa_desk_sbi_mode");
        setSbiTTMode(saved || "split", true);
    } catch(e) {
        setSbiTTMode("split", true);
    }
}

export function toggleTheme() {
    const root = document.documentElement;
    const current = root.dataset.theme || "dark";
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    
    try { localStorage.setItem("fa_desk_theme", next); } catch(e) {}
    
    apiPost("/api/settings", { theme: next }).catch(e => console.error("Failed to save theme to settings", e));
}

export function restoreTheme() {
    try {
        const saved = localStorage.getItem("fa_desk_theme");
        if (saved) {
            document.documentElement.dataset.theme = saved;
        }
    } catch(e) {}
}

export function setDensity(density) {
    const root = document.documentElement;
    root.dataset.density = density;
    try {
        localStorage.setItem("fa_desk_density", density);
        if (window.fa_desk_settings) {
            window.fa_desk_settings.fa_desk_density = density;
        }
        apiPost("/api/settings", { fa_desk_density: density })
            .catch(e => console.error("Failed to save density settings to backend:", e));
    } catch(e) {}
    
    document.querySelectorAll(".density-option").forEach(btn => {
        const isActive = btn.dataset.density === density;
        btn.classList.toggle("active", isActive);
        const badge = btn.querySelector(".density-badge");
        if (badge) {
            badge.style.display = isActive ? "inline-block" : "none";
        }
    });
}

export function restoreDensity() {
    try {
        const settings = window.fa_desk_settings || {};
        const saved = settings.fa_desk_density || localStorage.getItem("fa_desk_density");
        setDensity(saved || "standard");
    } catch(e) {
        setDensity("standard");
    }
}

export function autoSaveDraft() {
    if (!state.isDirty || !state.username) return;
    try {
        const key = `fa_desk_draft_${state.username}_${state.portfolio.calendar_year}`;
        localStorage.setItem(key, JSON.stringify({
            portfolio: state.portfolio,
            timestamp: Date.now(),
        }));
    } catch(e) {}
}

export function checkForDraft(username, year) {
    try {
        const key = `fa_desk_draft_${username}_${year}`;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch(e) { return null; }
}

export function clearDraft(username, year) {
    try { localStorage.removeItem(`fa_desk_draft_${username}_${year}`); } catch(e) {}
}

export async function renderAssetPieChart(rows) {
    const container = document.getElementById("assetPieChart");
    const legendContainer = document.getElementById("assetPieChartLegend");
    const chartTitleEl = document.getElementById("assetPieChartTitle");
    if (!container || !legendContainer) return;

    const section = document.getElementById("assetPieChartSection");
    if (section) section.classList.remove("hidden");

    const width = 400;
    const height = 400;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    const currentYear = new Date().getFullYear();
    const portfolioYear = state.portfolio.calendar_year;

    const stockTotals = {}; 
    let totalAssets = 0;
    let chartLabel = "End-of-Year Assets (Dec 31)";

    if (portfolioYear < currentYear) {
        rows.forEach(row => {
            const entity = row.entity_name;
            const bal = row.closing_balance || 0;
            const c = row.calculation_details && row.calculation_details.closing;
            const qty = (c && c.remaining_qty) || 0;
            const price = (c && c.components && c.components.close_price_dec31) || 0;
            const rate = (c && c.components && c.components.ttbr) || 0;
            
            if (!stockTotals[entity]) stockTotals[entity] = { value: 0, qty: 0, price: 0, rate: 0 };
            stockTotals[entity].value += bal;
            stockTotals[entity].qty += qty;
            stockTotals[entity].price = price; 
            stockTotals[entity].rate = rate;
            totalAssets += bal;
        });
    } else {
        try {
            const payload = { ...state.portfolio, sbi_tt_mode: state.sbi_tt_mode };
            const result = await apiPost("/api/current-balance", payload);
            if (result.success && result.stock_balances) {
                const snapshotDate = result.snapshot_date;
                const d = new Date(snapshotDate + "T00:00:00");
                const formatted = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                chartLabel = `Assets as of ${formatted}`;
                result.stock_balances.forEach(item => {
                    if (!stockTotals[item.entity_name]) stockTotals[item.entity_name] = { value: 0, qty: 0, price: 0, rate: 0 };
                    stockTotals[item.entity_name].value += item.balance_inr;
                    stockTotals[item.entity_name].qty += item.quantity || 0;
                    stockTotals[item.entity_name].price = item.price || 0;
                    stockTotals[item.entity_name].rate = item.rate || 0;
                    totalAssets += item.balance_inr;
                });
            }
        } catch (e) {
            console.warn("Failed to fetch current balance for pie chart:", e);
            rows.forEach(row => {
                const entity = row.entity_name;
                const bal = row.closing_balance || 0;
                const c = row.calculation_details && row.calculation_details.closing;
                const qty = (c && c.remaining_qty) || 0;
                
                if (!stockTotals[entity]) stockTotals[entity] = { value: 0, qty: 0, price: 0, rate: 0 };
                stockTotals[entity].value += bal;
                stockTotals[entity].qty += qty;
                totalAssets += bal;
            });
        }
    }

    if (chartTitleEl) chartTitleEl.innerHTML = `${PIE_CHART_SVG}${chartLabel} (INR)`;

    container.innerHTML = "";
    legendContainer.innerHTML = "";

    if (totalAssets === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:14px; text-align:center; width:100%;">No assets to display</div>';
        return;
    }

    const sortedStocks = Object.entries(stockTotals).sort((a, b) => b[1].value - a[1].value);
    
    const colors = [
        "var(--accent)", "var(--success)", "var(--warning)", "var(--danger)", "#8b5cf6",
        "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1"
    ];

    let svgContent = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%; height:auto;">`;
    let startAngle = -0.5 * Math.PI; 

    legendContainer.innerHTML = `
        <table class="pie-legend-table">
            <thead>
                <tr>
                    <th>Stock</th>
                    <th class="text-right">Units</th>
                    <th class="text-right">Value (USD)</th>
                    <th class="text-right">Value (INR)</th>
                    <th class="text-right">%</th>
                </tr>
            </thead>
            <tbody id="pieLegendTableBody"></tbody>
        </table>
    `;
    const tbody = document.getElementById("pieLegendTableBody");

    sortedStocks.forEach(([entity, data], idx) => {
        const { value, qty, price, rate } = data;
        if (value <= 0) return;

        const sliceAngle = (value / totalAssets) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;
        const color = colors[idx % colors.length];

        const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
        const innerRadius = radius * 0.58;

        const x1_out = centerX + radius * Math.cos(startAngle);
        const y1_out = centerY + radius * Math.sin(startAngle);
        let x2_out = centerX + radius * Math.cos(endAngle);
        let y2_out = centerY + radius * Math.sin(endAngle);

        const x1_in = centerX + innerRadius * Math.cos(startAngle);
        const y1_in = centerY + innerRadius * Math.sin(startAngle);
        let x2_in = centerX + innerRadius * Math.cos(endAngle);
        let y2_in = centerY + innerRadius * Math.sin(endAngle);

        if (sliceAngle >= 2 * Math.PI - 0.001) {
            x2_out -= 0.01;
            x2_in -= 0.01;
        }

        svgContent += `<path d="M ${x1_out} ${y1_out} 
                             A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2_out} ${y2_out} 
                             L ${x2_in} ${y2_in} 
                             A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x1_in} ${y1_in} 
                             Z" 
                             fill="transparent" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" />`;

        startAngle = endAngle;

        const pct = ((value / totalAssets) * 100).toFixed(1);
        const valueUsd = qty * price;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <div class="pie-legend-swatch" style="border: 2px solid ${color}; background: transparent; width:10px; height:10px;"></div>
                    <span style="font-weight:600;">${entity}</span>
                </div>
            </td>
            <td class="text-right" style="font-variant-numeric:tabular-nums;">${qty % 1 === 0 ? qty : qty.toFixed(2)}</td>
            <td class="text-right" style="font-variant-numeric:tabular-nums;">$${valueUsd.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="text-right" style="font-weight:700; font-variant-numeric:tabular-nums;">₹${Math.round(value).toLocaleString("en-IN")}</td>
            <td class="text-right" style="color:var(--text-muted); font-size:0.75rem;">${pct}%</td>
        `;
        if (tbody) tbody.appendChild(tr);
    });

    const textColor = "var(--text-primary)";

    svgContent += `
        <text x="${centerX}" y="${centerY - 10}" text-anchor="middle" dominant-baseline="middle" 
              fill="${textColor}" style="font-family: var(--font), sans-serif; font-size: 16px; font-weight: bold;">Total Assets</text>
        <text x="${centerX}" y="${centerY + 12}" text-anchor="middle" dominant-baseline="middle" 
              fill="${textColor}" style="font-family: var(--font), sans-serif; font-size: 18px; font-weight: bold;">₹${Math.round(totalAssets).toLocaleString("en-IN")}</text>
    `;

    svgContent += `</svg>`;
    container.innerHTML = svgContent;
}

export async function renderNavFlowSankey(rows) {
    const container = document.getElementById("navFlowSankey");
    if (!container) return;

    const section = document.getElementById("navFlowSection");
    if (section) section.classList.remove("hidden");

    const width = 800;
    const height = 350;
    const paddingX = 130;
    const paddingY = 40;
    const nodeWidth = 16;

    let startingNavCost = 0;
    let startingNavMarketValue = 0;
    let depositsCost = 0;
    let totalDividends = 0;
    let totalSaleProceeds = 0;
    let totalEndingNav = 0;
    let totalRealizedGains = 0;
    let remainingCostBasis = 0;

    const calendarYear = state.portfolio.calendar_year;

    rows.forEach(row => {
        const details = row.calculation_details;
        if (!details) return;

        const lotCost = row.initial_value || 0;
        const buyPrice = details.initial.components?.buy_price || 0;
        const initialQty = details.initial.components?.quantity || 1;
        const buyDateStr = row.acquire_date_raw;
        
        let buyYear = null;
        if (buyDateStr) {
            const buyDate = parseAppDate(buyDateStr);
            if (buyDate) {
                buyYear = buyDate.getFullYear();
            }
        }

        totalDividends += (row.total_dividends || 0);
        totalSaleProceeds += (row.sale_proceeds || 0);
        totalEndingNav += (row.closing_balance || 0);

        const remainingQty = (details.closing && details.closing.remaining_qty) || 0;
        const remainingCost = lotCost * (remainingQty / initialQty);
        remainingCostBasis += remainingCost;

        if (buyYear && buyYear < calendarYear) {
            let qtyAtStart = initialQty;
            const sells = details.sales?.sale_entries || [];
            sells.forEach(s => {
                const sellDate = s.sell_date ? parseAppDate(s.sell_date) : null;
                if (sellDate && sellDate.getFullYear() < calendarYear) {
                    qtyAtStart -= s.quantity || 0;
                }
            });
            const lotCostAtStart = lotCost * (qtyAtStart / initialQty);
            startingNavCost += lotCostAtStart;

            // Calculate Starting Market Value for Market Value mode
            let prevYearVal = lotCostAtStart; // default fallback to cost basis if missing or failed
            if (details.prev_year_closing) {
                const closePrice = details.prev_year_closing.close_price || 0;
                const rate = details.prev_year_closing.rate || 0;
                prevYearVal = qtyAtStart * closePrice * rate;
            }
            startingNavMarketValue += prevYearVal;
        } else {
            depositsCost += lotCost;
        }

        const sells = details.sales?.sale_entries || [];
        sells.forEach(s => {
            const proceeds = s.proceeds_inr || 0;
            const soldQty = s.quantity || 0;
            const buyCostForSold = lotCost * (soldQty / initialQty);
            const gain = proceeds - buyCostForSold;
            totalRealizedGains += gain;
        });
    });

    const settings = window.fa_desk_settings || {};
    const valuationBasis = settings.fa_desk_sankey_valuation_basis || localStorage.getItem("fa_desk_sankey_valuation_basis") || "market";
    const isMarket = valuationBasis === "market";

    const startingNav = isMarket ? startingNavMarketValue : startingNavCost;

    let m2mGains = 0;
    if (isMarket) {
        m2mGains = (totalEndingNav + totalSaleProceeds) - (startingNav + depositsCost);
    } else {
        const totalUnrealizedGains = totalEndingNav - remainingCostBasis;
        m2mGains = totalUnrealizedGains + totalRealizedGains;
    }

    // Calculate reinvested portion and adjust flows if toggle is active
    const offsetNetFlows = (settings.fa_desk_sankey_net_flows != null)
        ? settings.fa_desk_sankey_net_flows === "true"
        : localStorage.getItem("fa_desk_sankey_net_flows") === "true";
    const reinvested = Math.min(depositsCost, totalSaleProceeds);

    const fmtLocal = val => "₹" + Math.round(val).toLocaleString("en-IN");
    const noticeEl = document.getElementById("sankeyOffsetNotice");
    if (noticeEl) {
        if (offsetNetFlows && reinvested > 0.01) {
            noticeEl.style.display = "inline";
            noticeEl.textContent = `Offsetting ${fmtLocal(reinvested)} of reinvested proceeds`;
        } else {
            noticeEl.style.display = "none";
            noticeEl.textContent = "";
        }
    }

    container.innerHTML = "";

    const leftNodes = [];
    if (startingNav > 0.01) {
        leftNodes.push({ id: "startingNav", label: "Starting NAV", value: startingNav, color: "var(--text-secondary)", strokeColor: "rgba(148, 163, 184, 0.75)" });
    }
    const displayDepositsCost = offsetNetFlows ? depositsCost - reinvested : depositsCost;
    if (displayDepositsCost > 0.01) {
        leftNodes.push({ id: "deposits", label: "Acquisition", value: displayDepositsCost, color: "var(--accent)", strokeColor: "rgba(99, 102, 241, 0.75)" });
    }
    if (m2mGains > 0.01) {
        leftNodes.push({ id: "m2mGains", label: "Gains", value: m2mGains, color: "var(--success)", strokeColor: "rgba(16, 185, 129, 0.75)" });
    }
    if (totalDividends > 0.01) {
        leftNodes.push({ id: "dividends", label: "Dividends", value: totalDividends, color: "#8b5cf6", strokeColor: "rgba(139, 92, 246, 0.75)" });
    }

    const rightNodes = [];
    if (totalEndingNav > 0.01) {
        rightNodes.push({ id: "endingNav", label: "Ending NAV", value: totalEndingNav, color: "var(--accent)", strokeColor: "rgba(99, 102, 241, 0.75)" });
    }
    const displaySaleProceeds = offsetNetFlows ? totalSaleProceeds - reinvested : totalSaleProceeds;
    if (displaySaleProceeds > 0.01) {
        rightNodes.push({ id: "saleProceeds", label: "Sale Proceeds", value: displaySaleProceeds, color: "var(--warning)", strokeColor: "rgba(245, 158, 11, 0.75)" });
    }
    if (m2mGains < -0.01) {
        rightNodes.push({ id: "m2mLoss", label: "Loss", value: Math.abs(m2mGains), color: "var(--danger)", strokeColor: "rgba(239, 68, 68, 0.75)" });
    }
    if (totalDividends > 0.01) {
        rightNodes.push({ id: "dividendsOut", label: "Dividends (Drawn)", value: totalDividends, color: "#8b5cf6", strokeColor: "rgba(139, 92, 246, 0.75)" });
    }

    const totalValue = leftNodes.reduce((sum, n) => sum + n.value, 0);

    if (totalValue === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:14px; text-align:center; width:100%;">No transaction data or closing assets available for NAV Flow.</div>';
        return;
    }

    const drawHeight = height - 2 * paddingY;
    // Scale nodes so they take up 70% of vertical drawing space, leaving 30% for gaps.
    const scale = (drawHeight * 0.70) / totalValue;

    const computeColumnLayout = (nodes, totalNodeHeight, gap) => {
        let yCurrent = paddingY;
        if (nodes.length === 1) {
            nodes[0].h = Math.max(nodes[0].value * scale, 8);
            nodes[0].y = paddingY + (drawHeight - nodes[0].h) / 2;
        } else {
            nodes.forEach(node => {
                node.h = Math.max(node.value * scale, 8); // Enforce clear minimum height of 8px
                node.y = yCurrent;
                yCurrent += node.h + gap;
            });
        }
    };

    const totalLeftHeight = leftNodes.reduce((sum, n) => sum + Math.max(n.value * scale, 8), 0);
    const leftGap = leftNodes.length > 1 ? (drawHeight - totalLeftHeight) / (leftNodes.length - 1) : 0;
    computeColumnLayout(leftNodes, totalLeftHeight, leftGap);

    const totalRightHeight = rightNodes.reduce((sum, n) => sum + Math.max(n.value * scale, 8), 0);
    const rightGap = rightNodes.length > 1 ? (drawHeight - totalRightHeight) / (rightNodes.length - 1) : 0;
    computeColumnLayout(rightNodes, totalRightHeight, rightGap);

    // Central Gross Value node height is exactly equal to the sum of flow thicknesses,
    // ensuring the flow lines maintain constant thickness on both sides.
    const hCenter = totalValue * scale;
    const yCenter = paddingY + (drawHeight - hCenter) / 2;

    const xLeft = paddingX;
    const xCenter = (width - nodeWidth) / 2;
    const xRight = width - paddingX - nodeWidth;

    let svgContent = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%; height:auto;">`;

    // Define color gradients dynamically
    svgContent += `<defs>`;
    leftNodes.forEach((node, idx) => {
        svgContent += `
            <linearGradient id="grad-left-${idx}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="${node.color}" stop-opacity="0.8" />
                <stop offset="100%" stop-color="var(--border-light)" stop-opacity="0.4" />
            </linearGradient>
        `;
    });
    rightNodes.forEach((node, idx) => {
        svgContent += `
            <linearGradient id="grad-right-${idx}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="var(--border-light)" stop-opacity="0.4" />
                <stop offset="100%" stop-color="${node.color}" stop-opacity="0.8" />
            </linearGradient>
        `;
    });
    svgContent += `</defs>`;

    // Helper to format currency
    const fmt = val => "₹" + Math.round(val).toLocaleString("en-IN");

    // 1. Draw Links (Flows)
    let yCenterLeft = yCenter;
    leftNodes.forEach((node, idx) => {
        const flowHLeft = node.h;
        const flowHCenter = (node.value / totalValue) * hCenter;

        const x0 = xLeft + nodeWidth;
        const x1 = xCenter;
        const dx = x1 - x0;
        const cp0 = x0 + dx * 0.35;
        const cp1 = x1 - dx * 0.35;

        const path = `M ${x0} ${node.y}
                      C ${cp0} ${node.y}, ${cp1} ${yCenterLeft}, ${x1} ${yCenterLeft}
                      L ${x1} ${yCenterLeft + flowHCenter}
                      C ${cp1} ${yCenterLeft + flowHCenter}, ${cp0} ${node.y + flowHLeft}, ${x0} ${node.y + flowHLeft}
                      Z`;

        svgContent += `<path class="sankey-link" d="${path}" fill="url(#grad-left-${idx})" stroke="${node.color}" stroke-opacity="0.4" stroke-width="1">
            <title>${node.label} to Gross Value: ${fmt(node.value)}</title>
        </path>`;

        yCenterLeft += flowHCenter;
    });

    let yCenterRight = yCenter;
    rightNodes.forEach((node, idx) => {
        const flowHRight = node.h;
        const flowHCenter = (node.value / totalValue) * hCenter;

        const x0 = xCenter + nodeWidth;
        const x1 = xRight;
        const dx = x1 - x0;
        const cp0 = x0 + dx * 0.35;
        const cp1 = x1 - dx * 0.35;

        const path = `M ${x0} ${yCenterRight}
                      C ${cp0} ${yCenterRight}, ${cp1} ${node.y}, ${x1} ${node.y}
                      L ${x1} ${node.y + flowHRight}
                      C ${cp1} ${node.y + flowHRight}, ${cp0} ${yCenterRight + flowHCenter}, ${x0} ${yCenterRight + flowHCenter}
                      Z`;

        svgContent += `<path class="sankey-link" d="${path}" fill="url(#grad-right-${idx})" stroke="${node.color}" stroke-opacity="0.4" stroke-width="1">
            <title>Gross Value to ${node.label}: ${fmt(node.value)}</title>
        </path>`;

        yCenterRight += flowHCenter;
    });

    // 2. Draw Nodes (Vertical Bars)
    leftNodes.forEach(node => {
        svgContent += `<rect class="sankey-node" x="${xLeft}" y="${node.y}" width="${nodeWidth}" height="${node.h}" fill="${node.color}">
            <title>${node.label}: ${fmt(node.value)}</title>
        </rect>`;
    });

    // Central Node: Gross Value
    svgContent += `<rect class="sankey-node" x="${xCenter}" y="${yCenter}" width="${nodeWidth}" height="${hCenter}" fill="var(--text-secondary)" opacity="0.8">
        <title>Gross Value: ${fmt(totalValue)}</title>
    </rect>`;

    rightNodes.forEach(node => {
        svgContent += `<rect class="sankey-node" x="${xRight}" y="${node.y}" width="${nodeWidth}" height="${node.h}" fill="${node.color}">
            <title>${node.label}: ${fmt(node.value)}</title>
        </rect>`;
    });

    // 3. Draw Node Labels & Values
    leftNodes.forEach(node => {
        const textX = xLeft - 12;
        const textY = node.y + node.h / 2;
        svgContent += `
            <text class="sankey-label" x="${textX}" y="${textY - 2}" text-anchor="end" dominant-baseline="middle">${node.label}</text>
            <text class="sankey-value" x="${textX}" y="${textY + 10}" text-anchor="end" dominant-baseline="middle">${fmt(node.value)}</text>
        `;
    });

    rightNodes.forEach(node => {
        const textX = xRight + nodeWidth + 12;
        const textY = node.y + node.h / 2;
        svgContent += `
            <text class="sankey-label" x="${textX}" y="${textY - 2}" text-anchor="start" dominant-baseline="middle">${node.label}</text>
            <text class="sankey-value" x="${textX}" y="${textY + 10}" text-anchor="start" dominant-baseline="middle">${fmt(node.value)}</text>
        `;
    });

    // Center Node Label
    const centerTextX = xCenter + nodeWidth / 2;
    const centerTextY = yCenter - 18;
    svgContent += `
        <text class="sankey-label" x="${centerTextX}" y="${centerTextY - 2}" text-anchor="middle" dominant-baseline="middle">Gross Value</text>
        <text class="sankey-value" x="${centerTextX}" y="${centerTextY + 10}" text-anchor="middle" dominant-baseline="middle">${fmt(totalValue)}</text>
    `;

    svgContent += `</svg>`;
    container.innerHTML = svgContent;
}

