/**
 * ITR Schedule FA - Section A3 Helper Tool
 * Frontend SPA Logic
 */

// ===== State =====
const state = {
    username: null,
    portfolio: {
        calendar_year: new Date().getFullYear() - 1,
        stocks: [],
        overrides: {},
        sbi_rate_overrides: {},
    },
    calculatedRows: [],
    sbiRatesUsed: [],
    taxYears: null,
    isDirty: false, // Track unsaved changes
};

// ===== SVG Constants =====
const CHEVRON_DOWN_SVG = `<svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; display: inline-block; vertical-align: middle;"><polyline points="6 9 12 15 18 9"></polyline></svg>Details`;
const CHEVRON_RIGHT_SVG = `<svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; display: inline-block; vertical-align: middle;"><polyline points="9 18 15 12 9 6"></polyline></svg>Details`;
const CROSS_SVG = `<svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const FETCH_BTN_HTML = `<svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; display: inline-block; vertical-align: middle;"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>Fetch`;
const LIVE_BTN_HTML = `<svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; display: inline-block; vertical-align: middle;"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9M19.1 4.9c3.9 3.9 3.9 10.3 0 14.2M7.7 16.3c-2.3-2.3-2.3-6 0-8.3M16.3 8c2.3 2.3 2.3 6 0 8.3M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"></path></svg>Live`;
const EDIT_PENCIL_SVG = `<svg class="edit-svg" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
const TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
const FETCH_LOADING_HTML = `<svg class="btn-icon spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; display: inline-block; vertical-align: middle;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>Fetching…`;
const FETCH_DIVS_BTN_HTML = `<svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; display: inline-block; vertical-align: middle;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>Fetch Dividends`;
const FETCH_DETAILS_BTN_HTML = `<svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; display: inline-block; vertical-align: middle;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>Fetch Details`;
const LOCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>Lock Year`;
const UNLOCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>Unlock Year`;
const SAVE_BTN_HTML = `<svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; display: inline-block; vertical-align: middle;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>Save`;
const BADGE_LOCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px; display: inline-block; vertical-align: middle;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
const BADGE_CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; display: inline-block; vertical-align: middle;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const BADGE_WARN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; display: inline-block; vertical-align: middle;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
const CHECK_UPDATE_BTN_HTML = `<svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>Check for Updates`;
const CHECK_LOADING_HTML = `<svg class="btn-icon spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>Checking...`;
const TUTORIAL_NEXT_HTML = `Next<svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px; display: inline-block; vertical-align: middle;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
const TUTORIAL_FINISH_HTML = `Finish<svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px; display: inline-block; vertical-align: middle;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

let _navSource = null;
let _backToSourceTimeout = null;
function showBackToSource(sourceEl, label) {
    _navSource = { element: sourceEl, scrollY: window.scrollY, label };
    const pill = document.getElementById("backToSource");
    if (pill) {
        pill.querySelector("#backToSourceLabel").textContent = `↑ Back to ${label}`;
        pill.classList.remove("hidden");

        // Auto-hide after 30 seconds
        clearTimeout(_backToSourceTimeout);
        _backToSourceTimeout = setTimeout(() => {
            pill.classList.add("hidden");
            _navSource = null;
        }, 30000);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const pill = document.getElementById("backToSource");
    if (pill) {
        pill.addEventListener("click", () => {
            if (!_navSource) return;
            _navSource.element.scrollIntoView({ behavior: "smooth", block: "center" });
            _navSource.element.classList.add("highlight-pulse");
            setTimeout(() => _navSource.element.classList.remove("highlight-pulse"), 2000);
            pill.classList.add("hidden");
            _navSource = null;
            clearTimeout(_backToSourceTimeout);
        });
    }
});

let _tooltipTimeout;
const tooltipEl = document.createElement("div");
tooltipEl.className = "calc-tooltip hidden";
document.body.appendChild(tooltipEl);

function showCalcTooltip(e, contentHTML) {
    if (!contentHTML) return;
    
    clearTimeout(_tooltipTimeout);
    tooltipEl.innerHTML = contentHTML;
    tooltipEl.classList.remove("hidden");

    // Smart positioning
    const x = e.clientX;
    const y = e.clientY;
    const padding = 20; 
    
    let left = x;
    let top = y + padding;

    // Position immediately to prevent 1-frame layout flash
    tooltipEl.style.left = left + "px";
    tooltipEl.style.top = top + "px";

    // Synchronous bounds check (dimensions available since element is visible)
    const rect = tooltipEl.getBoundingClientRect();
    if (left + rect.width > window.innerWidth) {
        left = window.innerWidth - rect.width - padding;
    }
    if (top + rect.height > window.innerHeight) {
        top = y - rect.height - padding;
    }

    // Safety clamps to prevent off-screen overflow on narrow viewports
    left = Math.max(10, left);
    top = Math.max(10, top);

    tooltipEl.style.left = left + "px";
    tooltipEl.style.top = top + "px";
}

function hideCalcTooltip() {
    _tooltipTimeout = setTimeout(() => {
        tooltipEl.classList.add("hidden");
    }, 150);
}

function buildTooltipHTML(details, type) {
    if (!details) return "";
    
    const clickHint = `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:6px;border-top:1px dashed var(--border);padding-top:4px;text-align:center;font-weight:normal;">💡 Click to view breakdown</div>`;

    if (Array.isArray(details)) {
        if (details.length === 0) return "";
        let html = `<div style="font-weight:bold;margin-bottom:4px;border-bottom:1px solid var(--border);padding-bottom:2px;">${type} (${details.length} entries)</div>`;
        
        let showCount = details.length > 6 ? 3 : details.length;
        for (let i = 0; i < showCount; i++) {
            const d = details[i];
            const date = d.date ? formatAppDate(parseAppDate(d.date)) : "";
            html += `<div>${date ? date + ': ' : ''}${d.qty ? d.qty + '×' : ''}$${d.price_usd} × ₹${d.rate} → ₹${Math.round(d.value_inr)}</div>`;
        }        
        if (details.length > 6) {
            html += `<div style="color:var(--text-muted);font-style:italic;margin-top:2px;">+${details.length - 3} more…</div>`;
        }
        
        const total = details.reduce((sum, d) => sum + (d.value_inr || 0), 0);
        html += `<div style="margin-top:4px;border-top:1px solid var(--border);padding-top:2px;font-weight:bold;">Total: ₹${formatINR(Math.round(total))}</div>`;
        html += clickHint;
        return html;
    } else {
        let html = `<div>${details.qty ? details.qty + ' × ' : ''}$${details.price_usd} × ₹${details.rate}</div>`;
        html += `<div style="border-top:1px solid var(--border);margin-top:2px;padding-top:2px;font-weight:bold;">= ₹${formatINR(Math.round(details.value_inr))}</div>`;
        html += clickHint;
        return html;
    }
}

/**
 * Map calculation_details from the backend into the standardized tooltip format.
 * Returns a single object {qty, price_usd, rate, value_inr} for single-entry columns,
 * or an array of {date, qty, price_usd, rate, value_inr} for multi-entry columns.
 * Returns null if no data available.
 */
function mapCalcDetailsToTooltip(calculationDetails, fieldKey) {
    if (!calculationDetails) return null;

    // Map field keys to calculation_details keys
    const keyMap = {
        initial_value: "initial",
        peak_value: "peak",
        closing_balance: "closing",
        total_dividends: "dividends",
        sale_proceeds: "sales"
    };
    const detailKey = keyMap[fieldKey];
    const detail = calculationDetails[detailKey];
    if (!detail) return null;

    if (fieldKey === "initial_value" && detail.components) {
        const c = detail.components;
        return { qty: c.quantity, price_usd: c.buy_price?.toFixed(2), rate: c.ttbr?.toFixed(4), value_inr: c.quantity * c.buy_price * (c.ttbr || 0) };
    }
    if (fieldKey === "peak_value" && detail.components) {
        const c = detail.components;
        return { qty: c.qty_on_peak_date, price_usd: c.peak_price?.toFixed(2), rate: c.ttbr?.toFixed(4), value_inr: c.qty_on_peak_date * c.peak_price * (c.ttbr || 0), date: detail.peak_date };
    }
    if (fieldKey === "closing_balance" && detail.components) {
        const c = detail.components;
        return { qty: c.remaining_qty, price_usd: c.close_price_dec31?.toFixed(2), rate: c.ttbr?.toFixed(4), value_inr: c.remaining_qty * c.close_price_dec31 * (c.ttbr || 0) };
    }
    if (fieldKey === "total_dividends" && detail.dividend_entries?.length > 0) {
        return detail.dividend_entries.map(de => ({
            date: de.ex_date, qty: de.qty, price_usd: de.amount_foreign?.toFixed(4),
            rate: de.ttbr?.toFixed(4), value_inr: de.value_inr || (de.qty * de.amount_foreign * (de.ttbr || 0))
        }));
    }
    if (fieldKey === "sale_proceeds" && detail.sale_entries?.length > 0) {
        return detail.sale_entries.map(se => ({
            date: se.sell_date, qty: se.quantity, price_usd: se.sell_price?.toFixed(2),
            rate: se.ttbr?.toFixed(4), value_inr: se.proceeds_inr || (se.quantity * se.sell_price * (se.ttbr || 0))
        }));
    }
    return null;
}

// ===== Undo/Redo =====
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 50;

function pushUndoSnapshot(label = "Action") {
    undoStack.push({
        portfolio: JSON.parse(JSON.stringify(state.portfolio)),
        label: label,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0; // clear redo on new action
    updateUndoRedoButtons();
    markDirty();
    if (!document.getElementById("historyPanel").classList.contains("hidden")) {
        renderHistoryList();
    }
}

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push({
        portfolio: JSON.parse(JSON.stringify(state.portfolio)),
        label: "Redo state",
        timestamp: new Date().toLocaleTimeString()
    });
    const snapshot = undoStack.pop();
    state.portfolio = snapshot.portfolio;
    restorePortfolioUI();
    updateUndoRedoButtons();
    if (!document.getElementById("historyPanel").classList.contains("hidden")) {
        renderHistoryList();
    }
    showToast(`Undo: ${snapshot.label}`, "info", 1500);
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push({
        portfolio: JSON.parse(JSON.stringify(state.portfolio)),
        label: "Undo state",
        timestamp: new Date().toLocaleTimeString()
    });
    const snapshot = redoStack.pop();
    state.portfolio = snapshot.portfolio;
    restorePortfolioUI();
    updateUndoRedoButtons();
    if (!document.getElementById("historyPanel").classList.contains("hidden")) {
        renderHistoryList();
    }
    showToast("Redo successful", "info", 1500);
}

function restorePortfolioUI() {
    document.getElementById("stockCards").innerHTML = "";
    state.portfolio.stocks.forEach(stock => renderStockCard(stock));
    updateCalcButtonVisibility();
    clearCalculatedSections();
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

// ===== History Panel =====
function toggleHistoryPanel() {
    const panel = document.getElementById("historyPanel");
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) {
        renderHistoryList();
    }
}

function renderHistoryList() {
    const list = document.getElementById("historyList");
    list.innerHTML = "";

    if (undoStack.length === 0) {
        list.innerHTML = '<p class="hint" style="text-align:center;padding:20px;">No actions recorded yet</p>';
        return;
    }

    // Show in reverse order (newest first)
    [...undoStack].reverse().forEach((item, revIdx) => {
        const originalIdx = undoStack.length - 1 - revIdx;
        const el = document.createElement("div");
        el.className = "history-item";
        el.title = "Click to revert to this state";
        el.onclick = () => revertToHistoryItem(originalIdx);
        el.innerHTML = `
            <span class="history-label">${item.label}</span>
            <span class="history-time">${item.timestamp}</span>
        `;
        list.appendChild(el);
    });
}

function revertToHistoryItem(index) {
    if (index < 0 || index >= undoStack.length) return;

    const snapshot = undoStack[index];
    if (!confirm(`Revert to state before "${snapshot.label}"?`)) return;

    // Save current state to redo stack
    redoStack.push({
        portfolio: JSON.parse(JSON.stringify(state.portfolio)),
        label: "Manual Revert",
        timestamp: new Date().toLocaleTimeString()
    });

    // Any items in undoStack *after* the target index should also go to redoStack
    while (undoStack.length > index + 1) {
        redoStack.push(undoStack.pop());
    }

    // The item at index is the one we want to restore
    const targetSnapshot = undoStack.pop();
    state.portfolio = targetSnapshot.portfolio;

    restorePortfolioUI();
    updateUndoRedoButtons();
    renderHistoryList();
    showToast(`Reverted to: ${targetSnapshot.label}`, "success");
}
function markDirty() {
    state.isDirty = true;
    document.getElementById("unsavedDot").classList.remove("hidden");
}

function markClean() {
    state.isDirty = false;
    document.getElementById("unsavedDot").classList.add("hidden");
}

/** Clear all calculated/results sections so stale data doesn't persist. */
function clearCalculatedSections() {
    state.calculatedRows = [];
    state.sbiRatesUsed = [];
    // Hide and clear results
    document.getElementById("resultsSection").classList.add("hidden");
    document.getElementById("a3TableBody").innerHTML = "";
    // Hide and clear SBI rates used section
    document.getElementById("sbiRatesSection").classList.add("hidden");
    document.getElementById("sbiRatesTableBody").innerHTML = "";
    
    // Hide and clear Validate A3 section
    const valA3Section = document.getElementById("validateA3Section");
    if (valA3Section) {
        valA3Section.classList.add("hidden");
        document.getElementById("validateA3TableBody").innerHTML = "";
    }
    // Hide and clear tax year summary section
    document.getElementById("taxYearSection").classList.add("hidden");
    document.getElementById("taxYearBlocks").innerHTML = "";

    // Hide and clear Validate Tax section
    const valTaxSection = document.getElementById("validateTaxSection");
    if (valTaxSection) {
        valTaxSection.classList.add("hidden");
        const tbody = document.getElementById("validateTaxTableBody");
        if (tbody) tbody.innerHTML = "";
    }

    // Clear per-stock summary and pie chart
    const summaryBody = document.getElementById("stockSummaryTableBody");
    if (summaryBody) summaryBody.innerHTML = "";
    const summarySection = document.getElementById("stockSummarySection");
    if (summarySection) summarySection.classList.add("hidden");
    
    const pieCanvas = document.getElementById("assetPieChart");
    if (pieCanvas) {
        const ctx = pieCanvas.getContext("2d");
        ctx.clearRect(0, 0, pieCanvas.width, pieCanvas.height);
    }
    const pieLegend = document.getElementById("assetPieChartLegend");
    if (pieLegend) pieLegend.innerHTML = "";
    
    const pieSection = document.getElementById("assetPieChartSection");
    if (pieSection) pieSection.classList.add("hidden");

    // Clear sell simulator state
    if (typeof simState !== 'undefined') {
        simState.sells = [];
        simState.nextRowId = 1;
        const shSellsBody = document.getElementById("shSellsBody");
        if (shSellsBody) shSellsBody.innerHTML = "";
        
        const shEmptyRow = document.getElementById("shEmptyRow");
        if (shEmptyRow) shEmptyRow.style.display = "";
        
        const shSimulateBtn = document.getElementById("shSimulateBtn");
        if (shSimulateBtn) shSimulateBtn.style.display = "none";
        
        const shResultsSection = document.getElementById("shResultsSection");
        if (shResultsSection) shResultsSection.classList.add("hidden");
    }
}

// ===== Initialization =====
document.addEventListener("DOMContentLoaded", async () => {
    startSmoothProgress("Initialising FA Desk...", 1.5);
    
    initYearSelectors();
    initFYYearSelector();
    bindEvents();
    await initUserSelection();
    initSellHelper();
    initTutorial();
    initQuickJump();
    restoreTheme();
    addYearChangeGuard();

    // Heartbeat to keep server alive (native desktop mode)
    setInterval(sendHeartbeat, 15000);
    sendHeartbeat(); // initial ping

    // Auto-save draft every 30 seconds
    setInterval(autoSaveDraft, 30000);

    await hideLoading();
});

async function sendHeartbeat() {
    try {
        await fetch("/api/heartbeat", { method: "POST" });
    } catch (e) {
        console.warn("Heartbeat failed. Server might be down.");
    }
}

function initYearSelectors() {
    const mainSelect = document.getElementById("yearSelect");
    const rateYearSelect = document.getElementById("ratesYearSelect");
    const initialSelect = document.getElementById("initialYearSelect");
    
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 2024; y--) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        if (y === state.portfolio.calendar_year) opt.selected = true;
        mainSelect.appendChild(opt);

        const rOpt = document.createElement("option");
        rOpt.value = y;
        rOpt.textContent = y;
        if (y === state.portfolio.calendar_year) rOpt.selected = true;
        rateYearSelect.appendChild(rOpt);
        
        const iOpt = document.createElement("option");
        iOpt.value = y;
        iOpt.textContent = y;
        if (y === state.portfolio.calendar_year) iOpt.selected = true;
        initialSelect.appendChild(iOpt);
    }
    
    mainSelect.addEventListener("change", async (e) => {
        state.portfolio.calendar_year = parseInt(e.target.value);
        rateYearSelect.value = state.portfolio.calendar_year;
        if (state.username) await autoLoadForYear(state.portfolio.calendar_year);
    });
    initialSelect.addEventListener("change", (e) => {
        state.portfolio.calendar_year = parseInt(e.target.value);
    });
}

function bindEvents() {
    document.getElementById("lookupBtn").addEventListener("click", lookupStock);
    document.getElementById("tickerInput").addEventListener("keypress", (e) => {
        if (e.key === "Enter") lookupStock();
    });
    document.getElementById("calcFab").addEventListener("click", calculateAll);
    document.getElementById("exportCsvBtn").addEventListener("click", exportCSV);
    document.getElementById("saveBtn").addEventListener("click", savePortfolio);
    document.getElementById("saveAsBtn").addEventListener("click", savePortfolioAs);
    document.getElementById("loadBtn").addEventListener("click", loadPortfolio);
    document.getElementById("openFileBtn").addEventListener("click", openPortfolioFile);
    document.getElementById("fetchRatesBtn").addEventListener("click", fetchSbiRates);
    document.getElementById("fetchAllDividendsBtn").addEventListener("click", fetchAllDividends);
    document.getElementById("importPrevBtn").addEventListener("click", importPreviousYear);
    document.getElementById("clearYearBtn").addEventListener("click", clearCurrentYear);
    document.getElementById("viewRatesBtn").addEventListener("click", showMonthlyRates);
    document.getElementById("refreshMonthlyRatesBtn").addEventListener("click", loadMonthlyRates);
    document.getElementById("ratesYearSelect").addEventListener("change", loadMonthlyRates);
    document.getElementById("lockRatesBtn").addEventListener("click", toggleLockRates);
    document.getElementById("clearSbiBtn").addEventListener("click", clearSbiOverrides);
    document.getElementById("clearCacheBtn").addEventListener("click", clearStockCache);
    document.getElementById("undoBtn").addEventListener("click", undo);
    document.getElementById("redoBtn").addEventListener("click", redo);
    document.getElementById("helpBtn").addEventListener("click", startTutorial);
    document.getElementById("aboutBtn").addEventListener("click", openAboutModal);
    document.getElementById("quitAppBtn").addEventListener("click", async () => {
        if (!confirm("Are you sure you want to quit the application? Any unsaved changes will be lost.")) return;
        try {
            await fetch("/api/shutdown", { method: "POST" });
        } catch (e) {
            // Expected to fail as server terminates
        }
        document.body.innerHTML = `
            <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;background-color:var(--bg-main);color:var(--text-main);font-family:'Inter', sans-serif;">
                <h1 style="font-size:2rem;margin-bottom:16px;">🛑 App will shut down</h1>
                <p style="font-size:1.1rem;color:var(--text-muted);">The application session has ended.</p>
                <p style="font-size:1.1rem;color:var(--text-muted);margin-top:8px;">You can now safely close this window.</p>
            </div>`;
        try { window.close(); } catch(e) {}
    });
    document.getElementById("generateFYBtn").addEventListener("click", fetchConsolidatedTaxSummary);

    setupInteractions();

    document.getElementById("uploadDocsBtn").addEventListener("click", openPlatformModal);
    document.getElementById("switchUserBtn").addEventListener("click", () => {

        document.getElementById("appHeader").classList.add("hidden");
        document.getElementById("appMain").classList.add("hidden");
        document.getElementById("userSelectionScreen").classList.remove("hidden");
        state.username = null;
        fetchUsers();
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "Z" || (e.key === "z" && e.shiftKey))) {
            e.preventDefault();
            redo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            savePortfolio();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "f") {
            e.preventDefault();
            document.getElementById("searchModal").classList.remove("hidden");
            document.getElementById("searchInput").focus();
        }
        if (e.key === "?" && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
            document.getElementById("shortcutsModal").classList.toggle("hidden");
        }
    });

    // Theme toggle
    document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme);

    // Collapse All / Expand All
    document.getElementById("collapseAllBtn").addEventListener("click", () => {
        document.querySelectorAll(".stock-card-body").forEach(body => {
            body.classList.remove("expanded");
            const btn = body.closest(".stock-card").querySelector(".toggle-details-btn");
            if (btn) btn.innerHTML = CHEVRON_RIGHT_SVG;
        });
        document.querySelectorAll(".collapsible-content").forEach(el => {
            el.classList.add("collapsed");
            const header = el.previousElementSibling;
            if (header) {
                const icon = header.querySelector(".toggle-icon");
                if (icon) icon.style.transform = "rotate(-90deg)";
            }
        });
    });
    document.getElementById("expandAllBtn").addEventListener("click", () => {
        document.querySelectorAll(".stock-card-body").forEach(body => {
            body.classList.add("expanded");
            const btn = body.closest(".stock-card").querySelector(".toggle-details-btn");
            if (btn) btn.innerHTML = CHEVRON_DOWN_SVG;
        });
        document.querySelectorAll(".collapsible-content").forEach(el => {
            el.classList.remove("collapsed");
            const header = el.previousElementSibling;
            if (header) {
                const icon = header.querySelector(".toggle-icon");
                if (icon) icon.style.transform = "";
            }
        });
    });

    document.getElementById("findBtn").addEventListener("click", () => {
        document.getElementById("searchModal").classList.remove("hidden");
        document.getElementById("searchInput").focus();
    });

    document.getElementById("searchInput").addEventListener("input", (e) => {
        performGlobalSearch(e.target.value);
    });

    // Stock filter
    document.getElementById("stockFilterInput").addEventListener("input", filterStockCards);

    // Warn before leaving with unsaved changes
    window.addEventListener("beforeunload", (e) => {
        if (state.isDirty) { e.preventDefault(); e.returnValue = ""; }
    });
}

// ===== User Selection & Management =====
async function initUserSelection() {
    document.getElementById("createUserBtn").addEventListener("click", async () => {
        const input = document.getElementById("newUsernameInput");
        const username = input.value.trim();
        if (!username) return showToast("Enter a username", "warning");
        
        showLoading("Creating user...");
        try {
            const resp = await apiPost("/api/users", { username });
            if (resp.success) {
                input.value = "";
                await fetchUsers();
                await selectUser(resp.username);
            } else {
                showToast(resp.error || "Failed to create user", "error");
            }
        } catch (e) {
            showToast("Error creating user", "error");
        }
        await hideLoading();
    });

    document.getElementById("tryDummyBtn").addEventListener("click", async () => {
        showLoading("Setting up Demo Profile...");
        try {
            const resp = await apiPost("/api/users/setup-demo");
            if (resp.success) {
                // Force initial year selection to 2025
                document.getElementById("initialYearSelect").value = "2025";
                
                // Select user DemoUser (which will trigger load of CY2025 sample portfolio!)
                await selectUser(resp.username);
                showToast("Welcome! Loaded Demo Profile for CY2025 with AAPL, TSLA, & NVDA.", "success");
            } else {
                showToast("Failed to setup demo profile", "error");
            }
        } catch (e) {
            console.error("Demo setup error", e);
            showToast("Error setting up demo profile", "error");
        } finally {
            await hideLoading();
        }
    });
    
    await fetchUsers();
}

async function fetchUsers() {
    try {
        const data = await apiGet("/api/users");
        if (data.users) {
            renderUserList(data.users);
        }
    } catch (e) {
        showToast("Failed to load users", "error");
    }
}

function renderUserList(users) {
    const list = document.getElementById("userList");
    list.innerHTML = "";
    
    if (users.length === 0) {
        list.innerHTML = `
            <div style="text-align:center;padding:18px 12px;">
                <div style="font-size:2rem;margin-bottom:8px;">👤</div>
                <div style="font-weight:600;color:var(--text-primary);margin-bottom:6px;">No users found</div>
                <div style="color:var(--text-muted);font-size:0.875rem;">
                    Use the form below to create your first user profile before continuing.
                </div>
            </div>
        `;
        return;
    }
    
    users.forEach(username => {
        const item = document.createElement("div");
        item.className = "user-list-item";
        
        item.innerHTML = `
            <div class="user-name" style="flex-grow: 1;">${username}</div>
            <div class="user-actions" style="display: flex; gap: 8px;">
                <button type="button" class="btn btn-sm btn-outline rename-user-btn" title="Rename" style="padding:4px 8px; display:inline-flex; align-items:center; justify-content:center;">${EDIT_PENCIL_SVG}</button>
                <button type="button" class="btn btn-sm btn-outline delete-user-btn" title="Delete" style="padding:4px 8px; border-color:var(--danger); color:var(--danger); display:inline-flex; align-items:center; justify-content:center;">${TRASH_SVG}</button>
            </div>
        `;
        
        // Use a single listener on the item but check the target
        item.addEventListener("click", async (e) => {
            // If we clicked a button or something inside it, don't select the user
            if (e.target.closest(".user-actions")) return;
            await selectUser(username);
        });
        
        item.querySelector(".rename-user-btn").addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const newName = prompt(`Rename user '${username}' to:`);
            if (newName && newName.trim() && newName.trim() !== username) {
                showLoading("Renaming...");
                const resp = await fetch(`/api/users/${encodeURIComponent(username)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ new_username: newName.trim() })
                }).then(r => r.json());
                
                if (resp.success) await fetchUsers();
                else showToast(resp.error || "Failed to rename", "error");
                await hideLoading();
            }
        });
        
        item.querySelector(".delete-user-btn").addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete user '${username}' AND all their saved data? This cannot be undone.`)) {
                showLoading("Deleting...");
                const resp = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE" }).then(r => r.json());
                if (resp.success) await fetchUsers();
                else showToast(resp.error || "Failed to delete", "error");
                await hideLoading();
            }
        });
        
        list.appendChild(item);
    });
}

async function selectUser(username) {
    state.username = username;
    document.getElementById("activeUserDisplay").textContent = username;
    
    // Sync year dropdowns
    const initYear = document.getElementById("initialYearSelect").value;
    document.getElementById("yearSelect").value = initYear;
    document.getElementById("ratesYearSelect").value = initYear;
    state.portfolio.calendar_year = parseInt(initYear);
    
    document.getElementById("userSelectionScreen").classList.add("hidden");
    document.getElementById("appHeader").classList.remove("hidden");
    document.getElementById("appMain").classList.remove("hidden");
    document.getElementById("tabNav").classList.remove("hidden");
    switchTab("a3"); // always start on A3 tab
    
    // Clear current portfolio state
    state.portfolio.stocks = [];
    state.portfolio.overrides = {};
    state.portfolio.sbi_rate_overrides = {};
    document.getElementById("stockCards").innerHTML = "";
    clearCalculatedSections();
    
    await autoLoadForYear(state.portfolio.calendar_year);
}

// ===== Skeleton Loaders =====
function renderStockCardSkeletons(count = 3) {
    const container = document.getElementById("stockCards");
    container.innerHTML = "";
    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement("div");
        skeleton.className = "skeleton-card";
        skeleton.innerHTML = `
            <div class="skeleton skeleton-line title"></div>
            <div class="skeleton skeleton-line medium"></div>
            <div class="skeleton skeleton-line short"></div>
            <div style="margin-top:auto; display:flex; gap:8px;">
                <div class="skeleton" style="width:80px; height:32px; border-radius:16px;"></div>
                <div class="skeleton" style="width:80px; height:32px; border-radius:16px;"></div>
            </div>
        `;
        container.appendChild(skeleton);
    }
}

function renderDashboardSkeletons() {
    const dash = document.getElementById("portfolioDashboard");
    if (!dash) return;
    dash.classList.remove("hidden");
    dash.innerHTML = `
        <div class="skeleton-stat-grid" style="width:100%;">
            <div class="skeleton skeleton-stat-card"></div>
            <div class="skeleton skeleton-stat-card"></div>
            <div class="skeleton skeleton-stat-card"></div>
            <div class="skeleton skeleton-stat-card"></div>
            <div class="skeleton skeleton-stat-card"></div>
        </div>
    `;
}

// ===== API Helpers =====
async function apiPost(url, data) {
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return resp.json();
}

async function apiGet(url) {
    const resp = await fetch(url);
    return resp.json();
}

// ===== Toast Notifications =====
function showToast(message, type = "info", duration = 4000) {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icons = {
        success: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success, #10B981)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
        error: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-danger, #EF4444)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
        info: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #6366F1)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
        warning: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-warning, #F59E0B)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
    };
    toast.innerHTML = `<div style="display:flex; align-items:center;">${icons[type] || ""}<span>${message}</span></div>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = "slideOut 0.3s ease forwards";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ===== Loading Overlay =====
let _loadingMsgInterval = null;
let _progressInterval = null;

function startSmoothProgress(text, estimatedSeconds = 8) {
    if (_progressInterval) clearInterval(_progressInterval);
    
    let currentPercent = 0;
    showLoading(text, currentPercent);
    
    const startTime = Date.now();
    const duration = estimatedSeconds * 1000;
    
    _progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= duration) {
            currentPercent = 95;
        } else {
            const t = elapsed / duration;
            currentPercent = Math.min(95, Math.round(95 * (1 - Math.pow(1 - t, 3))));
        }
        showLoading(text, currentPercent);
    }, 100);
}

function stopSmoothProgress() {
    if (_progressInterval) {
        clearInterval(_progressInterval);
        _progressInterval = null;
    }
}

function showLoading(text = "Loading...", percent = null) {
    const overlay = document.getElementById("loadingOverlay");
    const textEl = document.getElementById("loadingText");
    overlay.classList.remove("hidden");
    textEl.innerHTML = text.replace(/\n/g, "<br>");

    // Add progress bar if not present
    let fill = overlay.querySelector(".progress-bar-fill");
    if (!fill) {
        const bar = document.createElement("div");
        bar.className = "progress-bar-container";
        bar.innerHTML = '<div class="progress-bar-fill"></div>';
        overlay.querySelector(".loader").appendChild(bar);
        fill = bar.querySelector(".progress-bar-fill");
    }

    if (percent != null) {
        fill.style.animation = "none";
        fill.style.width = percent + "%";
    } else {
        fill.style.animation = "";
        fill.style.width = "";
    }

    // Cycle messages for FA Report generation
    if (_loadingMsgInterval) clearInterval(_loadingMsgInterval);
    if (text.includes("Generating FA Report")) {
        const steps = [
            "Fetching stock prices\u2026",
            "Looking up SBI TT rates\u2026",
            "Computing peak values\u2026",
            "Calculating dividends\u2026",
            "Building A3 rows\u2026",
        ];
        let idx = 0;
        _loadingMsgInterval = setInterval(() => {
            idx = (idx + 1) % steps.length;
            textEl.innerHTML = `Generating FA Report\u2026<br><span style="font-size:0.85rem;color:var(--text-muted)">${steps[idx]}</span>`;
        }, 2500);
    }
}

async function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    const fill = overlay.querySelector(".progress-bar-fill");
    
    if (fill && !overlay.classList.contains("hidden")) {
        // Animate to 100%
        fill.style.transition = "width 0.3s ease-in-out";
        fill.style.width = "100%";
        // Wait for animation to finish
        await new Promise(r => setTimeout(r, 300));
    }

    overlay.classList.add("hidden");
    stopSmoothProgress();
    if (_loadingMsgInterval) { clearInterval(_loadingMsgInterval); _loadingMsgInterval = null; }
    const bar = document.querySelector("#loadingOverlay .progress-bar-container");
    if (bar) bar.remove();
}

// ===== Collapsible Sections =====
function toggleSection(id) {
    const el = document.getElementById(id);
    const isCollapsed = el.classList.toggle("collapsed");
    const icon = el.previousElementSibling.querySelector(".toggle-icon");
    if (icon) icon.style.transform = isCollapsed ? "rotate(-90deg)" : "";
}

function clearSbiOverrides() {
    if (!confirm("Are you sure you want to clear all manual SBI TT rate overrides? This will revert them to auto-fetched values.")) return;
    
    pushUndoSnapshot("Clear SBI Overrides");
    state.portfolio.sbi_rate_overrides = {};
    // Also clear calculated overrides as they likely depend on rates
    state.portfolio.overrides = {}; 
    
    markDirty();
    showToast("SBI TT overrides cleared", "success");
    
    // Refresh UI
    if (state.calculatedRows.length > 0) {
        calculateAll(); // Recalculate if report exists
    } else {
        restorePortfolioUI();
    }
}

async function clearStockCache() {
    if (!confirm("Are you sure you want to clear the local stock data cache? All historical stock info and dividend data will be cleared, forcing fresh queries from Yahoo Finance on your next live fetch.")) return;
    
    showLoading("Clearing stock data cache...");
    try {
        const res = await apiPost("/api/clear-stock-cache");
        if (res.success) {
            showToast("Stock data cache cleared successfully!", "success");
        } else {
            showToast("Failed to clear stock data cache", "error");
        }
    } catch (e) {
        console.error("Failed to clear stock cache", e);
        showToast("Error clearing stock data cache", "error");
    } finally {
        await hideLoading();
    }
}



// ===== Stock Lookup =====
async function lookupStock() {
    const ticker = document.getElementById("tickerInput").value.trim().toUpperCase();
    if (!ticker) return showToast("Enter a ticker symbol", "warning");

    // Check if already added
    if (state.portfolio.stocks.find(s => s.ticker === ticker)) {
        return showToast(`${ticker} is already added`, "warning");
    }

    pushUndoSnapshot(`Add Stock (${ticker})`);
    showLoading(`Looking up ${ticker}...`);
    try {
        const info = await apiPost("/api/lookup-stock", { ticker });

        if (!info.success) {
            await hideLoading();
            return showToast(`Could not find ${ticker}: ${info.error || "Unknown error"}`, "error");
        }

        const stock = {
            id: generateId(),
            ticker: ticker,
            yahoo_ticker: info.yahoo_ticker || ticker,
            currency: info.currency || "USD",
            skip_dividends: false,
            company_info: {
                country_code: info.country_code || "",
                name: info.name || ticker,
                display_name: info.display_name || ticker,
                address: info.address || "",
                zip: info.zip || "",
                nature: info.nature || "Company",
            },
            lots: [],
            dividends: [],
        };

        // Always fetch yearly max price for peak value display (independent of dividends)
        showLoading(`Fetching ${ticker} price history...`);
        try {
            const peakInfo = await apiGet(`/api/yearly-max-price?ticker=${info.yahoo_ticker || ticker}&year=${state.portfolio.calendar_year}`);
            if (peakInfo.max_price != null) {
                stock.yearly_max_price = peakInfo.max_price;
                stock.yearly_max_price_date = peakInfo.max_price_date;
            }
        } catch (e) { console.warn("Failed to fetch yearly max price", e); }

        // Try to fetch dividends for current calendar year
        showLoading(`Fetching ${ticker} dividends...`);
        try {
            const divInfo = await apiGet(`/api/dividends?ticker=${info.yahoo_ticker || ticker}&year=${state.portfolio.calendar_year}`);
            if (divInfo.dividends) {
                stock.dividends = divInfo.dividends.map(d => ({
                    id: generateId(),
                    ex_date: d.ex_date,
                    payment_date: d.payment_date || d.ex_date,
                    amount: d.amount
                }));
            }
        } catch (e) { console.warn("Failed to fetch dividends", e); }

        await hideLoading();
        state.portfolio.stocks.push(stock);
        renderStockCard(stock);
        updateCalcButtonVisibility();
        document.getElementById("tickerInput").value = "";
        showToast(`Added ${info.display_name}`, "success");
    } catch (e) {
        await hideLoading();
        showToast(`Error looking up ${ticker}: ${e.message}`, "error");
    }
}

// ===== Sparklines & Tooltips =====
let _sparklineCache = {};

function initTickerHover(el, ticker) {
    el.classList.add("ticker-hover");
    el.addEventListener("mouseenter", async (e) => {
        console.log(`Hovering on ticker: ${ticker}`);
        const popup = document.getElementById("sparklinePopup");
        const canvas = document.getElementById("sparklineCanvas");
        const tickerEl = document.getElementById("sparklineTicker");
        const priceEl = document.getElementById("sparklinePrice");
        
        tickerEl.textContent = ticker;
        priceEl.textContent = "Loading...";
        
        popup.classList.remove("hidden");
        const rect = el.getBoundingClientRect();
        // Since popup is position: fixed, we use rect directly (viewport coords)
        // No need for window.scrollY/X
        popup.style.top = (rect.bottom + 8) + "px";
        popup.style.left = Math.max(10, rect.left) + "px";
        
        // Ensure popup doesn't go off-screen right
        const popupRect = popup.getBoundingClientRect();
        if (rect.left + 320 > window.innerWidth) {
            popup.style.left = (window.innerWidth - 330) + "px";
        }

        // Ensure popup doesn't clip below viewport bottom
        const popupHeight = popupRect.height || 200; // fallback estimate
        if (rect.bottom + 8 + popupHeight > window.innerHeight) {
            popup.style.top = (rect.top - popupHeight - 8) + "px";
        }
        
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        try {
            if (!_sparklineCache[ticker]) {
                console.log(`Fetching history for ${ticker}...`);
                const res = await apiGet(`/api/ticker-history?ticker=${encodeURIComponent(ticker)}`);
                console.log(`Received ${res.prices ? res.prices.length : 0} points for ${ticker}`);
                _sparklineCache[ticker] = res.prices || [];
            }
            
            const prices = _sparklineCache[ticker];
            if (prices.length > 0) {
                const firstPrice = prices[0].close;
                const lastPrice = prices[prices.length - 1].close;
                const minPrice = Math.min(...prices.map(p => p.close));
                const maxPrice = Math.max(...prices.map(p => p.close));
                
                priceEl.textContent = `$${lastPrice.toFixed(2)}`;
                document.getElementById("sparklineMin").textContent = `Low: $${minPrice.toFixed(2)}`;
                document.getElementById("sparklineMax").textContent = `High: $${maxPrice.toFixed(2)}`;
                
                console.log(`Drawing sparkline for ${ticker}`);
                drawSparkline(canvas, prices, lastPrice >= firstPrice);
            } else {
                priceEl.textContent = "No data";
                console.warn(`No price data for ${ticker}`);
            }
        } catch (e) {
            priceEl.textContent = "Error";
            console.error(`Sparkline error for ${ticker}:`, e);
        }
    });
    
    el.addEventListener("mouseleave", () => {
        document.getElementById("sparklinePopup").classList.add("hidden");
    });
}

function drawSparkline(canvas, data, isPositive = true) {
    if (!data || data.length === 0) {
        console.warn("drawSparkline: No data to draw");
        return;
    }
    
    // Filter for valid numbers to prevent NaN coordinates
    const validPoints = data.filter(p => p.close != null && !isNaN(p.close));
    if (validPoints.length < 2) {
        console.warn("drawSparkline: Insufficient valid points");
        return;
    }

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const padding = 10;
    
    const points = validPoints.map(p => p.close);
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = (max - min) || 1;
    
    console.log(`Drawing ${validPoints.length} points. Min: ${min}, Max: ${max}, Range: ${range}`);
    
    ctx.clearRect(0, 0, width, height);
    
    // DEBUG: Draw a subtle border around canvas to verify visibility
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.strokeRect(0, 0, width, height);

    // Color based on performance
    const mainColor = isPositive ? "#10b981" : "#ef4444";
    const lightColor = isPositive ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)";
    
    // Draw trendline
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 2.0; 
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    
    validPoints.forEach((p, i) => {
        const x = (i / (validPoints.length - 1)) * (width - 2 * padding) + padding;
        const y = height - ((p.close - min) / range) * (height - 2 * padding) - padding;
        
        if (isNaN(x) || isNaN(y)) return;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Gradient fill under the curve
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, lightColor);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    
    // Complete the fill path
    ctx.lineTo(width - padding, height - padding);
    ctx.lineTo(padding, height - padding);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
}

function showTooltip(el, text) {
    const tip = document.getElementById("globalTooltip");
    el.addEventListener("mouseenter", () => {
        tip.textContent = text;
        tip.classList.remove("hidden");
        const rect = el.getBoundingClientRect();
        tip.style.top = (rect.top + window.scrollY - tip.offsetHeight - 8) + "px";
        tip.style.left = (rect.left + window.scrollX + (rect.width/2) - (tip.offsetWidth/2)) + "px";
    });
    el.addEventListener("mouseleave", () => tip.classList.add("hidden"));
}

// ===== Common Setup =====
function setupInteractions() {
    // History btn
    document.getElementById("historyBtn").addEventListener("click", toggleHistoryPanel);
}

// ===== Render Stock Card =====
function setCardLoading(stockId, isLoading) {
    const card = document.querySelector(`.stock-card[data-stock-id="${stockId}"]`);
    if (!card) return;
    if (isLoading) {
        card.classList.add("loading-skeleton");
    } else {
        card.classList.remove("loading-skeleton");
    }
}

function renderStockCard(stock) {
    const template = document.getElementById("stockCardTemplate");
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector(".stock-card");

    card.dataset.stockId = stock.id;
    card.querySelector(".stock-ticker").textContent = stock.ticker;
    card.querySelector(".stock-name").textContent = stock.company_info.name;

    initTickerHover(card.querySelector(".stock-ticker"), stock.yahoo_ticker || stock.ticker);

    // Update price column headers
    const buyHeader = card.querySelector(".buy-price-header");
    if (buyHeader) buyHeader.textContent = `Buy Price ($)`;
    const sellHeader = card.querySelector(".sell-price-header");
    if (sellHeader) sellHeader.textContent = `Sell Price ($)`;
    const divHeader = card.querySelector(".div-amount-header");
    if (divHeader) divHeader.textContent = `Dividend Per Share ($)`;

    // Fill company info
    card.querySelector(".company-country").value = stock.company_info.country_code;
    card.querySelector(".company-name").value = stock.company_info.display_name;
    card.querySelector(".company-address").value = stock.company_info.address;
    card.querySelector(".company-zip").value = stock.company_info.zip;
    card.querySelector(".company-nature").value = stock.company_info.nature;
    card.querySelector(".skip-dividends-check").checked = stock.skip_dividends;

    // Ensure sections have correct classes for cross-linking
    const lotTable = card.querySelector(".lots-table");
    if (lotTable && lotTable.parentElement) lotTable.parentElement.classList.add("lots-section");
    const sellTable = card.querySelector(".sells-table");
    if (sellTable && sellTable.parentElement) sellTable.parentElement.classList.add("sells-section");
    const divTable = card.querySelector(".dividends-table");
    if (divTable && divTable.parentElement) divTable.parentElement.classList.add("dividends-section");

    // Bind company info changes
    card.querySelectorAll(".company-info-section input, .company-info-section select").forEach(el => {
        el.addEventListener("change", () => syncStockFromCard(card));
    });

    card.querySelector(".skip-dividends-check").addEventListener("change", () => syncStockFromCard(card));

    // Staggered Entrance Animation
    const existingCards = document.querySelectorAll(".stock-card");
    card.style.setProperty("--stagger-delay", `${existingCards.length * 0.08}s`);
    card.classList.add("stagger-in");

    // Toggle details
    card.querySelector(".toggle-details-btn").addEventListener("click", (e) => {
        const body = card.querySelector(".stock-card-body");
        const isExpanded = body.classList.toggle("expanded");
        e.currentTarget.innerHTML = isExpanded ? CHEVRON_DOWN_SVG : CHEVRON_RIGHT_SVG;
    });

    // Remove stock
    card.querySelector(".remove-stock-btn").addEventListener("click", () => {
        pushUndoSnapshot(`Remove Stock (${stock.ticker})`);
        state.portfolio.stocks = state.portfolio.stocks.filter(s => s.id !== stock.id);
        card.remove();
        updateCalcButtonVisibility();
        showToast(`Removed ${stock.ticker}`, "info");
    });

    // Add lot button
    card.querySelector(".add-lot-btn").addEventListener("click", () => addLotRow(card, stock));

    // Add sell button
    card.querySelector(".add-sell-btn").addEventListener("click", () => addSellRow(card, stock));

    // Add div button
    card.querySelector(".add-div-btn").addEventListener("click", () => addDividendRow(card, stock));

    // Fetch dividends button
    card.querySelector(".fetch-dividends-btn").addEventListener("click", () => fetchDividendsForStock(card, stock));

    // Fetch company details button
    card.querySelector(".fetch-company-details-btn").addEventListener("click", () => fetchCompanyDetailsForStock(card, stock));

    // Drag and drop reordering
    initDragAndDrop(card, stock);

    // CSV lot import
    initCsvLotImport(card, stock);

    // Render existing lots, sells, and dividends
    stock.lots.forEach(lot => {
        if (lot.buy_date) {
            const buyYear = parseAppDate(lot.buy_date).getFullYear();
            if (buyYear > state.portfolio.calendar_year) return;
        }
        renderLotRow(card, stock, lot);
    });
    stock.lots.forEach(lot => {
        (lot.sells || []).forEach(sell => renderSellRow(card, stock, lot, sell));
    });
    (stock.dividends || []).forEach(div => renderDividendRow(card, stock, div));

    // Show yearly max price badge if available
    if (stock.yearly_max_price != null) {
        showPeakPriceBadge(card, stock.yearly_max_price, stock.yearly_max_price_date);
    }

    document.getElementById("stockCards").appendChild(card);
}

function syncStockFromCard(card) {
    const stockId = card.dataset.stockId;
    const stock = state.portfolio.stocks.find(s => s.id === stockId);
    if (!stock) return;

    stock.company_info.country_code = card.querySelector(".company-country").value;
    stock.company_info.display_name = card.querySelector(".company-name").value;
    stock.company_info.address = card.querySelector(".company-address").value;
    stock.company_info.zip = card.querySelector(".company-zip").value;
    stock.company_info.nature = card.querySelector(".company-nature").value;
    stock.skip_dividends = card.querySelector(".skip-dividends-check").checked;
}

// ===== Lots =====
function addLotRow(card, stock, lotData = null) {
    const lot = lotData || {
        id: generateId(),
        buy_date: "",
        quantity: "",
        buy_price: "",
        sells: [],
    };

    if (!lotData) {
        pushUndoSnapshot(`Add Lot (${stock.ticker})`);
        stock.lots.push(lot);
    }

    renderLotRow(card, stock, lot);
}

function renderLotRow(card, stock, lot) {
    const tbody = card.querySelector(".lots-tbody");
    const tr = document.createElement("tr");
    tr.dataset.lotId = lot.id;

    tr.innerHTML = `
        <td><input type="text" class="lot-date" value="${lot.buy_date}" placeholder="DD/MM/YYYY"></td>
        <td><input type="number" class="lot-qty" value="${lot.quantity}" step="any" min="0" placeholder="0"></td>
        <td>
            <div class="price-input-group">
                <input type="number" class="lot-price" value="${lot.buy_price}" step="any" min="0" placeholder="0.00">
                <button class="btn btn-sm btn-fetch-price fetch-close-price-btn" title="Fetch closing price for this date">${FETCH_BTN_HTML}</button>
            </div>
        </td>
        <td><button class="btn btn-sm btn-danger remove-lot-btn">${CROSS_SVG}</button></td>
    `;

    // Bind changes
    tr.querySelectorAll("input").forEach(input => {
        input.addEventListener("change", () => {
            pushUndoSnapshot("Edit Lot");
            lot.buy_date = tr.querySelector(".lot-date").value;
            lot.quantity = parseFloat(tr.querySelector(".lot-qty").value) || 0;
            lot.buy_price = parseFloat(tr.querySelector(".lot-price").value) || 0;
            updateSellLotOptions(card, stock);
            validateSellQuantities(stock, lot);
        });
    });

    // Fetch closing price
    tr.querySelector(".fetch-close-price-btn").addEventListener("click", async () => {
        const dateVal = tr.querySelector(".lot-date").value;
        if (!dateVal) return showToast("Set a buy date first before fetching price", "warning");

        const ticker = stock.yahoo_ticker || stock.ticker;
        const btn = tr.querySelector(".fetch-close-price-btn");
        btn.disabled = true;
        btn.innerHTML = FETCH_LOADING_HTML;

        try {
            const result = await apiGet(`/api/stock-price?ticker=${encodeURIComponent(ticker)}&date=${dateVal}`);
            if (result.price != null) {
                const priceInput = tr.querySelector(".lot-price");
                priceInput.value = result.price;
                lot.buy_price = result.price;
                showToast(`Closing price on ${dateVal}: $${result.price}`, "success");
            } else {
                showToast(`No price data for ${ticker} on ${dateVal}. Try a different date (market may have been closed).`, "warning");
            }
        } catch (e) {
            showToast(`Failed to fetch price: ${e.message}`, "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = FETCH_BTN_HTML;
        }
    });

    // Remove
    tr.querySelector(".remove-lot-btn").addEventListener("click", () => {
        pushUndoSnapshot(`Remove Lot (${stock.ticker})`);
        stock.lots = stock.lots.filter(l => l.id !== lot.id);
        tr.remove();
        updateSellLotOptions(card, stock);
    });

    tbody.appendChild(tr);
    updateSellLotOptions(card, stock);
}

// ===== Sells =====
function validateSellQuantities(stock, lot) {
    if (!lot) return true;
    const totalSold = (lot.sells || []).reduce((sum, s) => sum + (parseFloat(s.quantity) || 0), 0);
    // Use a small epsilon for float comparison to avoid issues with floating point precision
    if (totalSold > parseFloat(lot.quantity) + 0.000001) {
        showToast(`Warning for ${stock.ticker}: Total sold (${totalSold.toFixed(4).replace(/\.?0+$/, "")}) from lot bought on ${formatAppDate(parseAppDate(lot.buy_date))} exceeds its quantity (${lot.quantity})`, "warning");
        return false;
    }
    return true;
}

function addSellRow(card, stock, lotId = null, sellData = null) {
    if (stock.lots.length === 0) {
        return showToast("Add a lot first before adding sells", "warning");
    }

    const targetLot = lotId ? stock.lots.find(l => l.id === lotId) : stock.lots[0];
    if (!targetLot) return;

    const sell = sellData || {
        id: generateId(),
        sell_date: "",
        quantity: "",
        sell_price: "",
    };

    if (!sellData) {
        pushUndoSnapshot(`Add Sell (${stock.ticker})`);
        if (!targetLot.sells) targetLot.sells = [];
        targetLot.sells.push(sell);
    }

    renderSellRow(card, stock, targetLot, sell);
}

function renderSellRow(card, stock, lot, sell) {
    const tbody = card.querySelector(".sells-tbody");
    const tr = document.createElement("tr");
    tr.dataset.sellId = sell.id;
    tr.dataset.lotId = lot.id;

    // Build lot options
    let lotOptions = stock.lots.map(l =>
        `<option value="${l.id}" ${l.id === lot.id ? "selected" : ""}>${l.buy_date ? formatAppDate(parseAppDate(l.buy_date)) : "No date"} (qty: ${l.quantity || 0})</option>`
    ).join("");

    const buyPrice = lot.buy_price ? `$${parseFloat(lot.buy_price).toFixed(2)}` : "—";

    tr.innerHTML = `
        <td><select class="sell-lot-select">${lotOptions}</select></td>
        <td class="sell-buy-price">${buyPrice}</td>
        <td><input type="text" class="sell-date" value="${sell.sell_date}" placeholder="DD/MM/YYYY"></td>
        <td><input type="number" class="sell-qty" value="${sell.quantity}" step="any" min="0" placeholder="0"></td>
        <td><input type="number" class="sell-price" value="${sell.sell_price}" step="0.01" min="0" placeholder="0.00"></td>
        <td class="sell-gl-container"></td>
        <td><button class="btn btn-sm btn-danger remove-sell-btn">${CROSS_SVG}</button></td>
    `;

    // Bind changes
    tr.querySelectorAll("input").forEach(input => {
        input.addEventListener("change", () => {
            pushUndoSnapshot(`Edit Sell (${stock.ticker})`);
            sell.sell_date = tr.querySelector(".sell-date").value;
            sell.quantity = parseFloat(tr.querySelector(".sell-qty").value) || 0;
            sell.sell_price = parseFloat(tr.querySelector(".sell-price").value) || 0;
            validateSellQuantities(stock, lot);
        });
    });

    // Lot change
    tr.querySelector(".sell-lot-select").addEventListener("change", (e) => {
        // Move sell from old lot to new lot
        const oldLot = stock.lots.find(l => l.id === tr.dataset.lotId);
        const newLot = stock.lots.find(l => l.id === e.target.value);
        if (oldLot && newLot && oldLot.id !== newLot.id) {
            oldLot.sells = (oldLot.sells || []).filter(s => s.id !== sell.id);
            if (!newLot.sells) newLot.sells = [];
            newLot.sells.push(sell);
            tr.dataset.lotId = newLot.id;
            
            // Update displayed buy price
            const buyPriceCell = tr.querySelector(".sell-buy-price");
            if (buyPriceCell) {
                buyPriceCell.textContent = newLot.buy_price ? `$${parseFloat(newLot.buy_price).toFixed(2)}` : "—";
            }
            // Clear G&L as it needs recalculation
            const glContainer = tr.querySelector(".sell-gl-container");
            if (glContainer) glContainer.innerHTML = "";

            validateSellQuantities(stock, newLot);
        }
    });

    // Remove
    tr.querySelector(".remove-sell-btn").addEventListener("click", () => {
        pushUndoSnapshot(`Remove Sell (${stock.ticker})`);
        const parentLot = stock.lots.find(l => l.id === tr.dataset.lotId);
        if (parentLot) {
            parentLot.sells = (parentLot.sells || []).filter(s => s.id !== sell.id);
        }
        tr.remove();
    });

    tbody.appendChild(tr);
}

function updateSellLotOptions(card, stock) {
    card.querySelectorAll(".sell-lot-select").forEach(select => {
        const currentValue = select.value;
        select.innerHTML = stock.lots.map(l =>
            `<option value="${l.id}" ${l.id === currentValue ? "selected" : ""}>${l.buy_date ? formatAppDate(parseAppDate(l.buy_date)) : "No date"} (qty: ${l.quantity || 0})</option>`
        ).join("");
    });
}

// ===== Peak Price Badge =====
function showPeakPriceBadge(card, maxPrice, maxDate) {
    const badge = card.querySelector(".stock-peak-badge");
    const label = card.querySelector(".peak-price-label");
    if (!badge || !label) return;
    const displayDate = maxDate ? formatAppDate(parseAppDate(maxDate)) : "?";
    label.textContent = `Peak Price: $${maxPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} on ${displayDate}`;
    badge.classList.remove("hidden");
}

// ===== Dividends =====
function addDividendRow(card, stock, divData = null) {
    const div = divData || {
        id: generateId(),
        ex_date: "",
        payment_date: "",
        amount: "",
    };
    if (!divData) {
        pushUndoSnapshot(`Add Dividend (${stock.ticker})`);
        if (!stock.dividends) stock.dividends = [];
        stock.dividends.push(div);
    }
    renderDividendRow(card, stock, div);
}

function renderDividendRow(card, stock, div) {
    const tbody = card.querySelector(".dividends-tbody");
    const tr = document.createElement("tr");
    tr.dataset.divId = div.id;

    const formattedExDate = div.ex_date ? formatAppDate(parseAppDate(div.ex_date)) : "";
    const formattedPayDate = div.payment_date ? formatAppDate(parseAppDate(div.payment_date)) : "";

    tr.innerHTML = `
        <td><input type="text" class="div-date" value="${formattedExDate}" placeholder="DD/MM/YYYY"></td>
        <td><input type="text" class="div-pay-date" value="${formattedPayDate}" placeholder="DD/MM/YYYY"></td>
        <td><input type="number" class="div-amount" value="${div.amount}" step="any" min="0" placeholder="0.00"></td>
        <td><button class="btn btn-sm btn-danger remove-div-btn">${CROSS_SVG}</button></td>
    `;

    const exDateInput = tr.querySelector(".div-date");
    const payDateInput = tr.querySelector(".div-pay-date");

    tr.querySelectorAll("input").forEach(input => {
        input.addEventListener("change", () => {
            pushUndoSnapshot("Edit Dividend");
            // Auto-fill payment date if it's empty when ex-date is set
            if (input === exDateInput && !payDateInput.value) {
                payDateInput.value = exDateInput.value;
            }
            div.ex_date = exDateInput.value;
            div.payment_date = payDateInput.value;
            div.amount = parseFloat(tr.querySelector(".div-amount").value) || 0;
        });
    });

    tr.querySelector(".remove-div-btn").addEventListener("click", () => {
        pushUndoSnapshot(`Remove Dividend (${stock.ticker})`);
        stock.dividends = (stock.dividends || []).filter(d => d.id !== div.id);
        tr.remove();
    });

    tbody.appendChild(tr);
}

// ===== Calculate =====
async function calculateAll() {
    // Validate
    let hasLots = false;
    for (const stock of state.portfolio.stocks) {
        syncStockFromCard(document.querySelector(`.stock-card[data-stock-id="${stock.id}"]`));
        if (stock.lots.some(l => l.buy_date && l.quantity > 0)) hasLots = true;
    }

    if (!hasLots) {
        return showToast("Add at least one lot with a date and quantity", "warning");
    }

    clearCalculatedSections();
    renderDashboardSkeletons();
    state.portfolio.stocks.forEach(s => setCardLoading(s.id, true));
    
    const estimatedSecs = Math.min(12, Math.max(4, state.portfolio.stocks.length * 1.2));
    startSmoothProgress("Generating FA Report...\nThis may take a moment (fetching prices & rates)", estimatedSecs);

    try {
        const result = await apiPost("/api/calculate", state.portfolio);
        stopSmoothProgress();
        showLoading("Generating FA Report...\nThis may take a moment (fetching prices & rates)", 100);
        setTimeout(() => hideLoading(), 200);

        if (!result.success) {
            return showToast(`Calculation error: ${result.error}`, "error");
        }

        state.calculatedRows = result.rows;
        renderResultsTable(result.rows);
        
        // Populate Per-Stock Dividend Summary
        const summaryTbody = document.getElementById("stockSummaryTableBody");
        const summarySection = document.getElementById("stockSummarySection");
        if (summaryTbody && summarySection) {
            summaryTbody.innerHTML = "";
            const stockTotals = {};

            result.rows.forEach(row => {
                const entity = row.entity_name;
                if (!stockTotals[entity]) stockTotals[entity] = 0;
                stockTotals[entity] += row.total_dividends || 0;
            });

            const hasDividends = Object.values(stockTotals).some(t => t > 0);
            if (hasDividends) {
                summarySection.classList.remove("hidden");
                Object.entries(stockTotals).forEach(([entity, total]) => {
                    if (total === 0) return;
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td><strong>${entity}</strong></td>
                        <td style="color:var(--success); font-weight:600;">₹${formatINR(total)}</td>
                    `;
                    summaryTbody.appendChild(tr);
                });
            } else {
                summarySection.classList.add("hidden");
            }
        }

        collectSbiRates(result.rows);

        // Update peak price badges with actual calculation results
        // Find the lot with highest INR peak per stock and update its card
        const stockPeakMap = {}; // stockId -> { price, date, inrValue }
        result.rows.forEach(row => {
            const peak = row.calculation_details && row.calculation_details.peak;
            if (!peak || !peak.peak_date || !peak.components || peak.components.peak_price == null) return;
            const stock = state.portfolio.stocks.find(s =>
                s.lots && s.lots.some(l => l.id === row.lot_id)
            );
            if (!stock) return;
            const inrVal = row.peak_value || 0;
            if (!stockPeakMap[stock.id] || inrVal > stockPeakMap[stock.id].inrValue) {
                stockPeakMap[stock.id] = {
                    price: peak.components.peak_price,
                    date: peak.peak_date,
                    inrValue: inrVal,
                };
            }
        });
        Object.entries(stockPeakMap).forEach(([stockId, info]) => {
            const card = document.querySelector(`.stock-card[data-stock-id="${stockId}"]`);
            if (card) showPeakPriceBadge(card, info.price, info.date);
        });

        // Apply G&L badges to sell rows
        result.rows.forEach(row => {
            if (row.calculation_details && row.calculation_details.sales && row.calculation_details.sales.sale_entries) {
                row.calculation_details.sales.sale_entries.forEach(sellEntry => {
                    if (sellEntry.sell_id) {
                        const tr = document.querySelector(`tr[data-sell-id="${sellEntry.sell_id}"]`);
                        if (tr) {
                            const glContainer = tr.querySelector(".sell-gl-container");
                            if (glContainer) {
                                const usdVal = sellEntry.gain_loss_usd || 0;
                                const inrVal = sellEntry.gain_loss_inr || 0;
                                const isProfit = usdVal >= 0;
                                const cls = isProfit ? "profit" : "loss";
                                const usdText = (isProfit ? "+$" : "-$") + Math.abs(usdVal).toFixed(2);
                                const inrText = (inrVal >= 0 ? "+₹" : "-₹") + Math.abs(inrVal).toLocaleString("en-IN");
                                
                                glContainer.innerHTML = `
                                    <div class="sell-gl-badge ${cls}" title="USD G&L: ${usdText} | INR G&L: ${inrText}">
                                        <span>${usdText}</span>
                                        <span style="font-size:0.65rem;opacity:0.8;">${inrText}</span>
                                    </div>
                                `;
                            }
                        }
                    }
                });
            }
        });

        // Render Pie Chart
        await renderAssetPieChart(result.rows);

        document.getElementById("resultsSection").classList.remove("hidden");
        document.getElementById("sbiRatesSection").classList.remove("hidden");

        // Auto-collapse SBI TT rates section (start minimised)
        const sbiContent = document.getElementById("sbiRatesContent");
        if (sbiContent && !sbiContent.classList.contains("collapsed")) {
            sbiContent.classList.add("collapsed");
            const sbiIcon = sbiContent.previousElementSibling.querySelector(".toggle-icon");
            if (sbiIcon) sbiIcon.style.transform = "rotate(-90deg)";
        }

        // Fetch and render ITR tax year capital gains & dividend summary
        await fetchTaxYearSummary();

        // Scroll to results
        document.getElementById("resultsSection").scrollIntoView({ behavior: "smooth" });
        showToast(`FA Report generated — ${result.rows.length} row(s)`, "success");

        // Clear all loading states
        state.portfolio.stocks.forEach(s => setCardLoading(s.id, false));

        // Update dashboard with calculated values
        updateDashboard();

        // Save for YoY comparison + render if prev year data exists
        saveCalcResultsForYoY();
        renderYoYComparison();
    } catch (e) {
        await hideLoading();
        showToast(`Error: ${e.message}`, "error");
    }
}

// ===== Import Review Modal =====
let proposedTransactions = [];

function showImportReview(transactions, label) {
    proposedTransactions = transactions;
    const modal = document.getElementById("importReviewModal");
    const tbody = document.getElementById("importReviewTableBody");
    tbody.innerHTML = "";

    const selectAllBtn = document.getElementById("selectAllImportBtn");
    selectAllBtn.checked = true;

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">No new transactions found for this year.</td></tr>';
        document.getElementById("confirmImportBtn").disabled = true;
    } else {
        document.getElementById("confirmImportBtn").disabled = false;
        
        let allDuplicates = true;

        transactions.forEach((tx, idx) => {
            const tr = document.createElement("tr");
            
            const isDuplicate = tx.import_status === "DUPLICATE";
            if (!isDuplicate) allDuplicates = false;
            
            const isUpdate = tx.import_status === "UPDATE";
            
            if (isDuplicate) {
                tr.style.opacity = "0.5";
                tr.style.backgroundColor = "var(--bg-main)";
            } else if (isUpdate) {
                tr.style.backgroundColor = "rgba(245, 158, 11, 0.1)"; // subtle warning/amber
            }
            
            let statusBadge = "";
            if (tx.import_status === "NEW") statusBadge = `<span class="badge" style="background-color: var(--success); color: white;">NEW</span>`;
            else if (tx.import_status === "UPDATE") statusBadge = `<span class="badge" style="background-color: var(--warning); color: white;" title="Original Qty: ${tx.original_qty}">DELTA</span>`;
            else if (tx.import_status === "DUPLICATE") statusBadge = `<span class="badge" style="background-color: var(--text-muted); color: white;">DUP</span>`;

            const qtyDisplay = isUpdate ? `+${tx.qty.toLocaleString()} <span style="font-size: 0.75rem; color: var(--text-muted);">(of ${tx.original_qty})</span>` : tx.qty.toLocaleString();

            tr.innerHTML = `
                <td><input type="checkbox" class="tx-import-check" data-idx="${idx}" ${isDuplicate ? '' : 'checked'} ${isDuplicate ? 'disabled' : ''}></td>
                <td>${statusBadge}</td>
                <td><span class="badge ${tx.type === 'BUY' ? 'badge-success' : 'badge-danger'}">${tx.type}</span></td>
                <td>${tx.date}</td>
                <td><strong>${tx.symbol}</strong></td>
                <td>${qtyDisplay}</td>
                <td>$${tx.price.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
        
        if (allDuplicates) selectAllBtn.checked = false;
    }

    // Select All logic
    selectAllBtn.onchange = () => {
        const checks = document.querySelectorAll(".tx-import-check:not([disabled])");
        checks.forEach(c => c.checked = selectAllBtn.checked);
    };

    modal.classList.remove("hidden");
    
    // Set up confirmation button
    const confirmBtn = document.getElementById("confirmImportBtn");
    confirmBtn.onclick = async () => {
        const selectedIndices = Array.from(document.querySelectorAll(".tx-import-check:checked")).map(c => parseInt(c.dataset.idx));
        if (selectedIndices.length === 0) {
            showToast("No transactions selected", "warning");
            return;
        }

        const selectedTxs = selectedIndices.map(i => proposedTransactions[i]);
        
        // E-Trade Pre-processing: Holdings only give unsold shares. 
        // We add the sold shares from the G&L report so the lot is created with the true total quantity.
        const buys = selectedTxs.filter(t => t.type === 'BUY');
        const sells = selectedTxs.filter(t => t.type === 'SELL' && t.buy_date);
        
        buys.forEach(buy => {
            const linkedSells = sells.filter(s => 
                s.symbol === buy.symbol && 
                s.buy_date === buy.date && 
                Math.abs(s.buy_price - buy.price) < 0.01
            );
            const totalSold = linkedSells.reduce((sum, s) => sum + s.qty, 0);
            buy.qty += totalSold;
        });

        showLoading("Merging selected transactions...");
        try {
            const result = await apiPost("/api/merge", {
                portfolio: state.portfolio,
                transactions: selectedTxs
            });
            
            if (result.success) {
                state.portfolio = result.portfolio;
                renderPortfolio();
                closeImportReview();
                closeEtradeModal();
                closeIbkrModal();
                showToast(`${label} imported successfully (${selectedTxs.length} tx)`, "success");
                // Enrich missing company info for new stocks
                if (state.portfolio.stocks.length > 0) {
                    await fetchRuntimeDataForAllStocks();
                }
                pushUndoSnapshot(`Import ${label}`);
            } else {
                showToast("Merge error: " + result.error, "error");
            }
        } catch (e) {
            showToast("Merge failed: " + e.message, "error");
        } finally {
            await hideLoading();
        }
    };
}

function closeImportReview() {
    document.getElementById("importReviewModal").classList.add("hidden");
    proposedTransactions = [];
}

function renderPortfolio() {
    document.getElementById("stockCards").innerHTML = "";
    state.portfolio.stocks.forEach(stock => renderStockCard(stock));
    updateCalcButtonVisibility();
    updateDashboard();
}

// ===== Platform Selection Modal =====
function openPlatformModal() {
    document.getElementById("platformModal").classList.remove("hidden");
}

function closePlatformModal() {
    document.getElementById("platformModal").classList.add("hidden");
}

function selectPlatform(platform) {
    closePlatformModal();
    if (platform === "etrade") {
        openEtradeModal();
    } else if (platform === "ibkr") {
        openIbkrModal();
    }
}

// ===== ETRADE Upload Modal =====
function openEtradeModal() {
    document.getElementById("etradeUploadModal").classList.remove("hidden");
}

function closeEtradeModal() {
    document.getElementById("etradeUploadModal").classList.add("hidden");
    // Reset file inputs + labels
    document.getElementById("etradeFileInput").value = "";
    document.getElementById("sellDetailsFileInput").value = "";
    document.getElementById("etradeFileName").textContent = "No file chosen";
    document.getElementById("sellDetailsFileName").textContent = "No files chosen";
}

// ===== IBKR Upload Modal =====
function openIbkrModal() {
    document.getElementById("ibkrUploadModal").classList.remove("hidden");
}

function closeIbkrModal() {
    document.getElementById("ibkrUploadModal").classList.add("hidden");
    document.getElementById("ibkrFileInput").value = "";
    document.getElementById("ibkrFileName").textContent = "No file chosen";
}

// Wire file-chosen labels once DOM is ready (called from initSellHelper since DOMContentLoaded already ran)
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("etradeFileInput").addEventListener("change", e => {
        const f = e.target.files[0];
        document.getElementById("etradeFileName").textContent = f ? f.name : "No file chosen";
    });
    document.getElementById("sellDetailsFileInput").addEventListener("change", e => {
        const files = e.target.files;
        if (files.length === 0) {
            document.getElementById("sellDetailsFileName").textContent = "No files chosen";
        } else if (files.length === 1) {
            document.getElementById("sellDetailsFileName").textContent = files[0].name;
        } else {
            document.getElementById("sellDetailsFileName").textContent = `${files.length} files selected`;
        }
    });
    document.getElementById("etradeImportBtn").addEventListener("click", importEtradeDocs);

    // IBKR
    document.getElementById("ibkrFileInput").addEventListener("change", e => {
        const f = e.target.files[0];
        document.getElementById("ibkrFileName").textContent = f ? f.name : "No file chosen";
    });
    document.getElementById("ibkrImportBtn").addEventListener("click", importIbkrDocs);
});

async function importEtradeDocs() {
    const etradeFile = document.getElementById("etradeFileInput").files[0];
    const sellFiles   = document.getElementById("sellDetailsFileInput").files;

    if (!etradeFile) {
        showToast("Please choose the Holdings (ByStatus) file to import", "warning");
        return;
    }

    showLoading("Parsing E*TRADE files for Roll-Back...");
    try {
        const fd = new FormData();
        fd.append("etradeFile", etradeFile);
        for (let i = 0; i < sellFiles.length; i++) {
            fd.append("sellFiles", sellFiles[i]);
        }
        fd.append("portfolio", JSON.stringify(state.portfolio));

        const resp = await fetch("/api/upload-etrade", { method: "POST", body: fd });
        const result = await resp.json();
        
        await hideLoading();
        if (result.success) {
            closeEtradeModal();
            if (result.transactions && result.transactions.length > 0) {
                showImportReview(result.transactions, `E*TRADE Roll-Back Import`);
            } else {
                showToast("No new transactions found in E*TRADE files.", "info");
            }
        } else {
            showToast("E*TRADE import error: " + result.error, "error");
        }
    } catch (err) {
        await hideLoading();
        showToast("E*TRADE upload failed: " + err.message, "error");
    }
}

async function importIbkrDocs() {
    const ibkrFile = document.getElementById("ibkrFileInput").files[0];

    if (!ibkrFile) {
        showToast("Please choose an IBKR file to import", "warning");
        return;
    }

    showLoading("Parsing IBKR Transaction History...");
    try {
        const fd = new FormData();
        fd.append("file", ibkrFile);
        fd.append("portfolio", JSON.stringify(state.portfolio));
        const resp = await fetch("/api/upload-ibkr", { method: "POST", body: fd });
        const result = await resp.json();
        
        if (result.success) {
            const totalSkipped = result.skipped_count || 0;
            const cy = result.calendar_year || "";

            if (totalSkipped > 0) {
                showToast(
                    `⚠ ${totalSkipped} transaction${totalSkipped > 1 ? "s" : ""} skipped — dated after CY${cy}`,
                    "warning"
                );
            }
            closeIbkrModal();
            showImportReview(result.transactions || [], "IBKR Portfolio");
        } else {
            showToast("IBKR file error: " + result.error, "error");
        }
    } catch (err) {
        showToast("IBKR upload failed: " + err.message, "error");
    } finally {
        await hideLoading();
    }
}


// ===== Render Results Table =====
function renderResultsTable(rows) {
    const tbody = document.getElementById("a3TableBody");
    tbody.innerHTML = "";

    let currentEntity = null;
    let stockProceedsTotal = 0;

    const flushSubtotal = () => {
        if (currentEntity && stockProceedsTotal > 0) {
            const tr = document.createElement("tr");
            tr.className = "stock-subtotal-row";
            tr.innerHTML = `
                <td colspan="11" style="text-align: right;">Total Gross Proceeds for <strong>${currentEntity}</strong></td>
                <td>${formatINR(stockProceedsTotal)}</td>
            `;
            tbody.appendChild(tr);
        }
    };

    rows.forEach((row, idx) => {
        if (currentEntity !== null && currentEntity !== row.entity_name) {
            flushSubtotal();
            stockProceedsTotal = 0;
        }
        currentEntity = row.entity_name;
        stockProceedsTotal += (row.sale_proceeds || 0);

        const tr = document.createElement("tr");
        tr.dataset.lotId = row.lot_id;

        // Columns 1-7 (text)
        const textCols = [
            row.sl_no,
            row.country,
            row.entity_name,
            row.address,
            row.zip,
            row.nature,
            row.acquire_date,
        ];

        textCols.forEach((val, i) => {
            const td = document.createElement("td");
            td.textContent = val || "";
            tr.appendChild(td);
        });

        // Columns 8-12 (numeric, editable)
        const numFields = [
            { key: "initial_value", val: row.initial_value },
            { key: "peak_value", val: row.peak_value, peak: row.calculation_details?.peak },
            { key: "closing_balance", val: row.closing_balance },
            { key: "total_dividends", val: row.total_dividends },
            { key: "sale_proceeds", val: row.sale_proceeds },
        ];

        numFields.forEach(field => {
            const td = document.createElement("td");
            td.className = "editable-cell";
            if (row.is_overridden && row.is_overridden[field.key]) {
                td.classList.add("overridden");
            }
            
            const val = field.val != null ? Math.round(field.val) : 0;
            const textVal = val > 0 ? formatINR(val) : "0";
            
            td.innerHTML = `<span class="val-link">${textVal}</span><span class="edit-icon" title="Click to manually override value">${EDIT_PENCIL_SVG}</span>`;
            
            td.dataset.lotId = row.lot_id;
            td.dataset.field = field.key;
            td.dataset.originalValue = field.val;

            // Click on the value span → jump to validation
            const valLink = td.querySelector(".val-link");
            valLink.addEventListener("click", (e) => {
                e.stopPropagation();
                jumpToValidation(row.lot_id, field.key, valLink, `A3 Row ${row.sl_no}`);
            });

            // Hover tooltip
            valLink.addEventListener("mouseenter", (e) => {
                const tooltipData = mapCalcDetailsToTooltip(row.calculation_details, field.key);
                if (tooltipData) {
                    const label = field.key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                    showCalcTooltip(e, buildTooltipHTML(tooltipData, label));
                }
            });
            valLink.addEventListener("mouseleave", hideCalcTooltip);

            // Click on the cell (anywhere else) → edit
            td.addEventListener("click", () => enableCellEdit(td, row, field.key));
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    flushSubtotal(); // Flush last stock

    document.getElementById("resultsSection").classList.remove("hidden");
    document.getElementById("resultsContent").classList.remove("collapsed");

    // Also render validation tables
    renderValidationTable(rows);
    // renderTaxValidationTable(rows); <-- Handled by fetchTaxYearSummary
}

// ===== Validation Tables Helpers =====

/** Helper to wrap TTBR rate in a clickable cross-link span */
const rateLink = (rateVal, rateDate) => {
    if (!rateVal || !rateDate) return `₹${rateVal ? rateVal.toFixed(4) : '?'}`;
    const displayDate = formatAppDate(parseAppDate(rateDate));
    return `<span class="validate-crosslink" data-jump-rate="${rateDate}" title="Jump to SBI rate for ${displayDate}">₹${rateVal.toFixed(4)}</span>`;
};

// ===== Render Validation Table =====
function renderValidationTable(rows) {
    const tbody = document.getElementById("validateA3TableBody");
    const section = document.getElementById("validateA3Section");
    if (!tbody || !section) return;

    tbody.innerHTML = "";
    section.classList.remove("hidden");

    rows.forEach(row => {
        const details = row.calculation_details || {};
        const lotId = row.lot_id;
        const ticker = row.ticker;

        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${row.sl_no}</td><td><strong>${ticker}</strong></td>`;

        const cols = [
            { key: "initial_value", detail: details.initial },
            { key: "peak_value", detail: details.peak },
            { key: "closing_balance", detail: details.closing },
            { key: "total_dividends", detail: details.dividends },
            { key: "sale_proceeds", detail: details.sales }
        ];

        cols.forEach(col => {
            const td = document.createElement("td");
            td.id = `val-${lotId}-${col.key}`;
            td.className = "val-cell";
            
            let breakdown = "—";
            let finalVal = row[col.key];

            // Helper to wrap lot math in a clickable cross-link span
            const sectionLink = (text, sectionClass, targetId) => {
                let idAttr = targetId ? `data-jump-id="${targetId}"` : "";
                return `<span class="validate-crosslink" data-jump-stock="${ticker}" data-jump-section="${sectionClass}" ${idAttr} title="Jump to specific row in ${ticker}">${text}</span>`;
            };

            if (col.key === "initial_value" && col.detail?.components) {
                const c = col.detail.components;
                const rd = col.detail.rate_date || (c && c.rate_date);
                const mathText = `(${c.quantity}×$${c.buy_price.toFixed(2)})`;
                breakdown = `<div class="b-math">${sectionLink(mathText, 'lots-section', c.lot_id)}×${rateLink(c.ttbr, rd)}</div>`;
            } else if (col.key === "peak_value" && col.detail?.components) {
                const c = col.detail.components;
                const rd = col.detail.rate_date || (c && c.rate_date);
                const mathText = `(${c.qty_on_peak_date}×$${c.peak_price.toFixed(2)})`;
                breakdown = `<div class="b-math" style="font-size:0.65rem;opacity:0.7;">Peak: ${formatAppDate(parseAppDate(col.detail.peak_date))}</div>
                             <div class="b-math">${sectionLink(mathText, 'lots-section', c.lot_id)}×${rateLink(c.ttbr, rd)}</div>`;
            } else if (col.key === "closing_balance" && col.detail?.components) {
                const c = col.detail.components;
                const rd = col.detail.rate_date || (c && c.rate_date);
                const mathText = `(${c.remaining_qty}×$${c.close_price_dec31.toFixed(2)})`;
                breakdown = `<div class="b-math">${sectionLink(mathText, 'lots-section', c.lot_id)}×${rateLink(c.ttbr, rd)}</div>`;
            } else if (col.key === "total_dividends" && col.detail?.dividend_entries?.length > 0) {
                breakdown = col.detail.dividend_entries.map(de => {
                    const payDate = de.payment_date ? formatAppDate(parseAppDate(de.payment_date)) : "";
                    const exDate = de.ex_date ? formatAppDate(parseAppDate(de.ex_date)) : "";
                    const dateLabel = de.payment_date ? `Pay: ${payDate} (Ex: ${exDate})` : `Ex: ${exDate}`;
                    const mathText = `(${de.qty}×$${de.amount_foreign.toFixed(4)})`;
                    const divLotPart = sectionLink('Lot', 'lots-section', de.lot_id);
                    return `<div class="b-item" title="${dateLabel}">${sectionLink(mathText, 'dividends-section', de.div_id)}×${rateLink(de.ttbr, de.rate_date)} (${divLotPart})</div>`;
                }).join("");
            } else if (col.key === "sale_proceeds" && col.detail?.sale_entries?.length > 0) {
                breakdown = col.detail.sale_entries.map(se => {
                    const mathText = `${formatAppDate(parseAppDate(se.sell_date))}: (${se.quantity}×$${se.sell_price.toFixed(2)})`;
                    return `<div class="b-item">${sectionLink(mathText, 'sells-section', se.sell_id)}×${rateLink(se.ttbr, se.rate_date)}</div>`;
                }).join("");
            }

            const isOverridden = row.is_overridden && row.is_overridden[col.key];
            let displayVal = isOverridden 
                ? (state.portfolio.overrides[lotId] || {})[col.key] 
                : row[col.key];

            td.innerHTML = `<div class="b-container">${breakdown}</div><div class="b-total">₹${formatINR(displayVal)}</div>`;

            // Wire cross-link click handlers
            td.querySelectorAll(".validate-crosslink[data-jump-rate]").forEach(el => {
                el.addEventListener("click", (e) => {
                    e.stopPropagation();
                    jumpToSbiRate(el.dataset.jumpRate);
                });
            });
            td.querySelectorAll(".validate-crosslink[data-jump-stock]").forEach(el => {
                el.addEventListener("click", (e) => {
                    e.stopPropagation();
                    jumpToStockSection(el.dataset.jumpStock, el.dataset.jumpSection, el.dataset.jumpId);
                });
            });
            
            if (isOverridden) {
                const badge = document.createElement("div");
                badge.className = "override-badge";
                badge.textContent = "Manual Override";
                td.appendChild(badge);
            }

            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });
}

// ===== Render Tax Validation Table =====
function renderTaxValidationTable(taxYears) {
    const tbody = document.getElementById("validateTaxTableBody");
    const section = document.getElementById("validateTaxSection");
    if (!tbody || !section) return;

    tbody.innerHTML = "";
    
    // Helper to wrap lot math in a clickable cross-link span
    const sectionLink = (ticker, text, sectionClass, targetId) => {
        let idAttr = targetId ? `data-jump-id="${targetId}"` : "";
        return `<span class="validate-crosslink" data-jump-stock="${ticker}" data-jump-section="${sectionClass}" ${idAttr} title="Jump to specific row in ${ticker || 'Portfolio'}">${text}</span>`;
    };

    // Extract all events from taxYears structure
    const events = [];
    const categories = ["ltcg", "ltcl", "stcg", "stcl", "dividends"];
    const quarters = ["q1", "q2", "q3", "q4", "q5"];

    ["prev", "curr"].forEach(tyKey => {
        const ty = taxYears[tyKey];
        const tyLabel = ty.label;
        
        Object.keys(ty.stocks).forEach(ticker => {
            const stockData = ty.stocks[ticker];
            categories.forEach(cat => {
                quarters.forEach(qk => {
                    const details = stockData[cat].details?.[qk] || [];
                    details.forEach(d => {
                        events.push({
                            ty: tyLabel,
                            ticker,
                            category: cat,
                            qk,
                            type: cat === "dividends" ? "DIVIDEND" : "SALE",
                            date: d.date,
                            buy_cost: d.buy_cost_inr || 0,
                            proceeds: d.proceeds_inr || d.value_inr || 0,
                            gain: d.gain_inr || d.value_inr || 0,
                            details: d,
                            lot_id: d.lot_id
                        });
                    });
                });
            });
        });
    });

    if (events.length === 0) {
        section.classList.add("hidden");
        return;
    }
    section.classList.remove("hidden");

    // Sort: Tax Year (desc) -> Ticker (asc) -> Category (asc) -> Quarter (asc) -> Date (asc)
    const categoryOrder = { "ltcg": 1, "ltcl": 2, "stcg": 3, "stcl": 4, "dividends": 5 };
    events.sort((a, b) => {
        if (a.ty !== b.ty) return b.ty.localeCompare(a.ty);
        if (a.ticker !== b.ticker) return a.ticker.localeCompare(b.ticker);
        if (a.category !== b.category) return categoryOrder[a.category] - categoryOrder[b.category];
        if (a.qk !== b.qk) return a.qk.localeCompare(b.qk);
        return a.date.localeCompare(b.date);
    });

    let lastGroupKey = null;
    events.forEach((e, idx) => {
        const tr = document.createElement("tr");
        tr.id = `val-tax-${e.ticker}-${e.type}-${e.date}-${idx}`;

        const groupKey = `${e.ty}-${e.ticker}-${e.category}-${e.qk}`;
        if (groupKey !== lastGroupKey) {
            tr.classList.add("group-start");
            lastGroupKey = groupKey;
        }

        // Mark group end for the previous row if this is a new group
        if (idx > 0 && groupKey !== `${events[idx-1].ty}-${events[idx-1].ticker}-${events[idx-1].category}-${events[idx-1].qk}`) {
            tbody.lastElementChild.classList.add("group-end");
        }
        if (idx === events.length - 1) {
            tr.classList.add("group-end");
        }

        tr.dataset.ticker = e.ticker;
        tr.dataset.ty = e.ty;
        tr.dataset.quarter = e.qk;
        tr.dataset.category = e.category;
        tr.className += " tax-val-row";
        
        let breakdown = "";
        if (e.type === "SALE") {
            const se = e.details;
            const sellPricePart = sectionLink(e.ticker, `(${se.qty}×$${se.sell_price.toFixed(2)})`, 'sells-section', se.sell_id);
            const buyPricePart = sectionLink(e.ticker, `(${se.qty}×$${se.buy_price.toFixed(2)})`, 'lots-section', e.lot_id);
            const sellRatePart = rateLink(se.sell_ttbr, se.sell_rate_date || se.date);
            const buyRatePart = rateLink(se.buy_ttbr, se.buy_rate_date);

            breakdown = `
                <div class="b-container">
                    <div class="b-math"><strong>Sell:</strong> ${sectionLink(e.ticker, formatAppDate(parseAppDate(e.date)), 'sells-section', se.sell_id)}</div>
                    <div class="b-math" style="margin-top:4px;">Proceeds: ${sellPricePart} × ${sellRatePart} = <span style="font-weight:600">₹${formatINR(e.proceeds)}</span></div>
                    <div class="b-math">Buy Cost: ${buyPricePart} × ${buyRatePart} = <span style="font-weight:600">₹${formatINR(e.buy_cost)}</span></div>
                </div>`;
        } else {
            const de = e.details;
            const payDate = de.payment_date ? formatAppDate(parseAppDate(de.payment_date)) : "";
            const exDate = de.ex_date ? formatAppDate(parseAppDate(de.ex_date)) : "";
            const payLabel = de.payment_date ? `Paid: ${payDate}` : `Ex: ${exDate}`;
            const divPricePart = sectionLink(e.ticker, `(${de.qty}×$${de.amount_foreign.toFixed(4)})`, 'dividends-section', de.div_id);
            const divRatePart = rateLink(de.ttbr, de.rate_date);
            const divLotPart = sectionLink(e.ticker, 'Lot', 'lots-section', e.lot_id);

            breakdown = `
                <div class="b-container">
                    <div class="b-math"><strong>Div:</strong> ${sectionLink(e.ticker, payLabel, 'dividends-section', de.div_id)}</div>
                    <div class="b-math" style="font-size:0.65rem;opacity:0.7;">${de.rule || 'Rule 115 (Prev Month Rate)'}</div>
                    <div class="b-math" style="margin-top:4px;">Amount: ${divPricePart} × ${divRatePart} = <span style="font-weight:600">₹${formatINR(e.proceeds)}</span> (${divLotPart})</div>
                </div>`;
        }
        tr.innerHTML = `
            <td><span class="ty-badge">${e.ty}</span></td>
            <td><strong>${e.ticker}</strong></td>
            <td>${breakdown}</td>
            <td style="text-align:right">₹${formatINR(e.buy_cost)}</td>
            <td style="text-align:right">₹${formatINR(e.proceeds)}</td>
            <td style="text-align:right; font-weight:700; color: ${e.gain >= 0 ? 'var(--accent)' : 'var(--danger)'}">₹${formatINR(e.gain)}</td>
        `;
        
        // Wire cross-link click handlers
        tr.querySelectorAll(".validate-crosslink[data-jump-rate]").forEach(el => {
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                jumpToSbiRate(el.dataset.jumpRate);
            });
        });
        tr.querySelectorAll(".validate-crosslink[data-jump-stock]").forEach(el => {
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                jumpToStockSection(el.dataset.jumpStock, el.dataset.jumpSection, el.dataset.jumpId);
            });
        });

        tbody.appendChild(tr);
    });
}

function jumpToTaxSummaryBreakdown(ticker, category, quarter, tyLabel, sourceEl = null, label = "") {
    const section = document.getElementById("validateTaxSection");
    if (section.classList.contains("hidden")) return;
    
    // Ensure content is expanded
    const content = document.getElementById("validateTaxContent");
    if (content.classList.contains("collapsed")) {
        toggleSection('validateTaxContent');
    }

    // Find all matching rows
    const allRows = document.querySelectorAll(".tax-val-row");
    let firstMatch = null;
    let matchCount = 0;

    // tyLabel is like "FY 2024-2025"
    // row.dataset.ty is also like "FY 2024-2025"
    const tyFilter = tyLabel;

    allRows.forEach(row => {
        const isTickerMatch = !ticker || row.dataset.ticker === ticker;
        const isCatMatch = row.dataset.category === category;
        const isQkMatch = quarter === "total" || row.dataset.quarter === quarter;
        const isTyMatch = !tyFilter || row.dataset.ty === tyFilter;

        if (isTickerMatch && isCatMatch && isQkMatch && isTyMatch) {
            row.classList.add("highlight-pulse");
            // Highlight background only, leave permanent borders as they are
            setTimeout(() => row.classList.remove("highlight-pulse"), 5000);
            
            if (!firstMatch) firstMatch = row;
            matchCount++;
        }
    });

    if (firstMatch) {
        if (sourceEl && label) showBackToSource(sourceEl, label);
        const header = document.getElementById("appHeader");
        const headerHeight = header ? header.offsetHeight : 0;
        const top = firstMatch.getBoundingClientRect().top + window.scrollY - headerHeight - 120;
        window.scrollTo({ top, behavior: "smooth" });
        showToast(`Found ${matchCount} transactions for ${category.toUpperCase()} ${quarter !== 'total' ? quarter.toUpperCase() : 'Total'}`, "info");
    } else {
        showToast(`No detailed breakdown found in this CY for ${ticker || 'Total'} ${category.toUpperCase()}`, "warning");
    }
}

function jumpToTaxValidation(ticker, type, eventDate) {
    const section = document.getElementById("validateTaxSection");
    if (section.classList.contains("hidden")) return;
    
    // Ensure content is expanded
    const content = document.getElementById("validateTaxContent");
    if (content.classList.contains("collapsed")) {
        toggleSection('validateTaxContent');
    }

    const targetId = `val-tax-${ticker}-${type}-${eventDate}`;
    const el = document.getElementById(targetId);
    if (el) {
        // Highlight row
        el.classList.add("highlight-pulse");
        setTimeout(() => el.classList.remove("highlight-pulse"), 2000);
        
        const header = document.getElementById("appHeader");
        const headerHeight = header ? header.offsetHeight : 0;
        const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 120;
        window.scrollTo({ top, behavior: "smooth" });
    }
}

function jumpToValidation(lotId, fieldKey, sourceEl = null, label = "") {
    const section = document.getElementById("validateA3Section");
    if (section.classList.contains("hidden")) return;

    // Ensure content is expanded
    const content = document.getElementById("validateA3Content");
    if (content.classList.contains("collapsed")) {
        toggleSection('validateA3Content');
    }

    const targetId = `val-${lotId}-${fieldKey}`;
    const el = document.getElementById(targetId);
    if (el) {
        if (sourceEl && label) showBackToSource(sourceEl, label);
        // Highlight cell
        el.classList.add("highlight-pulse");
        setTimeout(() => el.classList.remove("highlight-pulse"), 2000);

        const header = document.getElementById("appHeader");
        const headerHeight = header ? header.offsetHeight : 0;
        const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 120;
        window.scrollTo({ top, behavior: "smooth" });
    }
}
function enableCellEdit(td, row, fieldKey) {
    if (td.querySelector("input")) return; // Already editing

    const currentVal = row.is_overridden[fieldKey]
        ? (state.portfolio.overrides[row.lot_id] || {})[fieldKey]
        : td.dataset.originalValue;

    const input = document.createElement("input");
    input.type = "number";
    input.value = currentVal || 0;
    input.step = "1";

    td.innerHTML = "";
    td.appendChild(input);
    input.focus();
    input.select();

    const save = () => {
        const newVal = parseInt(input.value) || 0;
        const originalVal = parseInt(td.dataset.originalValue) || 0;

        if (newVal !== originalVal) {
            // Set override
            if (!state.portfolio.overrides[row.lot_id]) {
                state.portfolio.overrides[row.lot_id] = {};
            }
            state.portfolio.overrides[row.lot_id][fieldKey] = newVal;
            row[fieldKey] = newVal;
            row.is_overridden[fieldKey] = true;
            td.classList.add("overridden");
        } else {
            // Clear override
            if (state.portfolio.overrides[row.lot_id]) {
                delete state.portfolio.overrides[row.lot_id][fieldKey];
            }
            row.is_overridden[fieldKey] = false;
            td.classList.remove("overridden");
        }

        const displayVal = formatINR(row[fieldKey]);
        td.innerHTML = `<span class="val-link" title="Click to view calculation breakdown">${displayVal}</span><span class="edit-icon" title="Click to manually override value">✏️</span>`;
        
        // Re-bind jump listener
        td.querySelector(".val-link").addEventListener("click", (e) => {
            e.stopPropagation();
            jumpToValidation(row.lot_id, fieldKey);
        });

        // Sync with Validate A3 table
        const valCell = document.getElementById(`val-${row.lot_id}-${fieldKey}`);
        if (valCell) {
            const bTotal = valCell.querySelector(".b-total");
            if (bTotal) {
                bTotal.innerHTML = `₹${displayVal}`;
                // Add override badge to validation if not present
                if (row.is_overridden[fieldKey]) {
                    if (!valCell.querySelector(".override-badge")) {
                        const badge = document.createElement("div");
                        badge.className = "override-badge";
                        badge.textContent = "Manual Override";
                        valCell.appendChild(badge);
                    }
                } else {
                    const badge = valCell.querySelector(".override-badge");
                    if (badge) badge.remove();
                }
            }
        }
    };

    input.addEventListener("blur", save);
    input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            input.blur();
        }
    });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            td.innerHTML = `${formatINR(row[fieldKey])}<span class="edit-icon">✏️</span>`;
        }
    });
}

// ===== SBI Rates Used in Calculation =====
function collectSbiRates(rows, taxYears = null) {
    const tbody = document.getElementById("sbiRatesTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const seenRates = new Set();
    const allEntries = [];

    // 1. From A3 Rows (result.rows)
    if (rows) {
        rows.forEach(row => {
            const details = row.calculation_details || {};
            const ticker = row.ticker || row.entity_name || '';
            const a3Cols = [
                { label: `${ticker} — Buy (${formatAppDate(parseAppDate(row.acquire_date))})`, data: details.initial, field: 'initial_value' },
                { label: `${ticker} — Peak Value (${details.peak && details.peak.peak_date ? formatAppDate(parseAppDate(details.peak.peak_date)) : '?'})`, data: details.peak, field: 'peak_value' },
                { label: `${ticker} — Closing (Dec 31)`, data: details.closing, field: 'closing_balance' },
            ];
            a3Cols.forEach(entry => {
                if (!entry.data) return;
                const rate = entry.data.rate || entry.data.ttbr || (entry.data.components && entry.data.components.ttbr);
                const rateDate = entry.data.rate_date || (entry.data.components && entry.data.components.rate_date);
                if (rate && rateDate) {
                    allEntries.push({
                        label: entry.label,
                        rate,
                        rateDate,
                        source: entry.data.source,
                        origin: { section: 'resultsSection', selector: `tr[data-lot-id="${row.lot_id}"]` }
                    });
                }
            });
            if (details.dividends && details.dividends.dividend_entries) {
                details.dividends.dividend_entries.forEach(de => {
                    const payDate = de.payment_date || de.ex_date;
                    allEntries.push({
                        label: `${ticker} — Dividend A3 (${formatAppDate(parseAppDate(payDate))})`,
                        rate: de.ttbr,
                        rateDate: de.rate_date,
                        source: de.source,
                        origin: { section: 'resultsSection', selector: `tr[data-lot-id="${row.lot_id}"]` }
                    });
                });
            }
            if (details.sales && details.sales.sale_entries) {
                details.sales.sale_entries.forEach(se => {
                    allEntries.push({
                        label: `${ticker} — Sale A3 (${formatAppDate(parseAppDate(se.sell_date))})`,
                        rate: se.ttbr,
                        rateDate: se.rate_date,
                        source: se.source,
                        origin: { section: 'resultsSection', selector: `tr[data-lot-id="${row.lot_id}"]` }
                    });
                });
            }
        });
    }

    // 2. From Tax Year Summary (taxYears)
    if (taxYears) {
        ["prev", "curr"].forEach(tyKey => {
            const ty = taxYears[tyKey];
            Object.keys(ty.stocks).forEach(ticker => {
                const stockData = ty.stocks[ticker];
                ["ltcg", "ltcl", "stcg", "stcl", "dividends"].forEach(cat => {
                    Object.values(stockData[cat].details || {}).forEach(qDetails => {
                        qDetails.forEach(d => {
                            if (cat === "dividends") {
                                allEntries.push({
                                    label: `${ticker} — Dividend Tax (${formatAppDate(parseAppDate(d.date))})`,
                                    rate: d.ttbr,
                                    rateDate: d.rate_date,
                                    source: d.source,
                                    origin: { section: 'taxYearSection', selector: `tr[data-ticker="${ticker}"]` }
                                });
                            } else {
                                if (d.sell_ttbr && d.sell_rate_date) {
                                    allEntries.push({
                                        label: `${ticker} — Sale Tax (${formatAppDate(parseAppDate(d.date))})`,
                                        rate: d.sell_ttbr,
                                        rateDate: d.sell_rate_date,
                                        source: d.source,
                                        origin: { section: 'taxYearSection', selector: `tr[data-ticker="${ticker}"]` }
                                    });
                                }
                                if (d.buy_ttbr && d.buy_rate_date) {
                                    allEntries.push({
                                        label: `${ticker} — Buy Tax (Lot ${formatAppDate(parseAppDate(d.buy_rate_date))})`,
                                        rate: d.buy_ttbr,
                                        rateDate: d.buy_rate_date,
                                        source: d.source,
                                        origin: { section: 'taxYearSection', selector: `tr[data-ticker="${ticker}"]` }
                                    });
                                }
                            }
                        });
                    });
                });
            });
        });
    }

    state.sbiRatesUsed = [];
    allEntries.forEach(entry => {
        const { label, rate, rateDate, source } = entry;
        if (!rate || !rateDate) return;
        const key = `${label}_${rateDate}`;
        if (seenRates.has(key)) return;
        seenRates.add(key);
        state.sbiRatesUsed.push(entry);

        const src = source || 'cache';
        const statusClass = src === 'override' ? 'override' : src === 'cache' ? 'cached' : 'missing';
        
        const tr = document.createElement("tr");
        tr.dataset.rateDate = rateDate;
        tr.innerHTML = `
            <td style="display:flex; justify-content:space-between; align-items:center;">
                <span>${label}</span>
                ${entry.origin ? `<button class="btn-link jump-back-btn" title="Jump to where this was used" style="padding:2px 6px; font-size:0.9rem;">↗</button>` : ''}
            </td>
            <td>${formatAppDate(parseAppDate(rateDate))}</td>
            <td class="editable-rate" data-date="${rateDate}" title="Click to edit rate">
                <span class="rate-val">₹${rate.toFixed(4)}</span>
                <span class="edit-icon">✏️</span>
            </td>
            <td><span class="rate-status ${statusClass}">${src}</span></td>
        `;

        if (entry.origin) {
            tr.querySelector(".jump-back-btn").addEventListener("click", () => {
                switchTab('a3');
                jumpToSection(entry.origin.section, entry.origin.selector);
            });
        }

        const rateCell = tr.querySelector(".editable-rate");
        rateCell.addEventListener("click", () => {
            const currentVal = rate;
            const input = document.createElement("input");
            input.type = "number";
            input.step = "0.0001";
            input.value = currentVal;
            input.style.width = "80px";
            
            const originalContent = rateCell.innerHTML;
            rateCell.innerHTML = "";
            rateCell.appendChild(input);
            input.focus();
            
            let finished = false;
            const save = async () => {
                if (finished) return;
                finished = true;
                const newVal = parseFloat(input.value);
                if (!isNaN(newVal) && newVal !== currentVal) {
                    try {
                        const res = await fetch("/api/save-manual-rate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ rate_date: rateDate, rate: newVal })
                        });
                        const data = await res.json();
                        if (data.success) {
                            showToast(`Saved rate for ${rateDate}: ₹${newVal}`);
                            calculateAll();
                        } else {
                            alert("Failed to save rate: " + data.error);
                            rateCell.innerHTML = originalContent;
                        }
                    } catch (err) {
                        alert("Error saving rate: " + err);
                        rateCell.innerHTML = originalContent;
                    }
                } else {
                    rateCell.innerHTML = originalContent;
                }
            };

            input.addEventListener("blur", save);
            input.addEventListener("keypress", (e) => { if (e.key === "Enter") input.blur(); });
            input.addEventListener("keydown", (e) => { if (e.key === "Escape") { finished = true; rateCell.innerHTML = originalContent; } });
        });
        tbody.appendChild(tr);
    });
}

// ===== Format INR (Indian comma style) =====
function formatINR(value) {
    if (value === null || value === undefined) return "—";
    if (value === 0) return "0";
    const num = Math.abs(Math.round(value));
    let s = num.toString();
    if (s.length <= 3) return (value < 0 ? "-" : "") + s;
    let result = s.slice(-3);
    s = s.slice(0, -3);
    while (s.length > 0) {
        result = s.slice(-2) + "," + result;
        s = s.slice(0, -2);
    }
    return (value < 0 ? "-" : "") + result;
}

// ===== Save/Load =====
async function savePortfolio() {
    showLoading("Saving...");
    try {
        // Sync all cards
        document.querySelectorAll(".stock-card").forEach(card => syncStockFromCard(card));

        const result = await fetch(`/api/save?username=${encodeURIComponent(state.username)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state.portfolio),
        }).then(r => r.json());
        
        await hideLoading();

        if (result.success) {
            markClean();
            clearDraft(state.username, state.portfolio.calendar_year);
            showToast(`Saved for CY${state.portfolio.calendar_year}`, "success");
        } else {
            showToast(`Save failed: ${result.error}`, "error");
        }
    } catch (e) {
        await hideLoading();
        showToast(`Save error: ${e.message}`, "error");
    }
}

async function loadPortfolio() {
    const year = state.portfolio.calendar_year;
    showLoading(`Loading data for CY${year}...`);
    renderDashboardSkeletons();
    renderStockCardSkeletons(3);

    try {
        const result = await apiGet(`/api/load?year=${year}&username=${encodeURIComponent(state.username)}`);
        await hideLoading();

        if (!result.success) {
            return showToast(result.error || `No saved data for CY${year}`, "warning");
        }

        state.portfolio = result.portfolio;
        document.getElementById("yearSelect").value = state.portfolio.calendar_year;

        // Re-render all stock cards
        document.getElementById("stockCards").innerHTML = "";
        state.portfolio.stocks.forEach(stock => renderStockCard(stock));
        updateCalcButtonVisibility();
        updateDashboard();

        showToast(`Loaded portfolio for CY${year}`, "success");
        if (state.portfolio.stocks.length > 0) await fetchRuntimeDataForAllStocks();
    } catch (e) {
        await hideLoading();
        showToast(`Load error: ${e.message}`, "error");
    }
}

async function savePortfolioAs() {
    // Sync all cards
    document.querySelectorAll(".stock-card").forEach(card => syncStockFromCard(card));

    // Deep clone and strip runtime-only fields before downloading
    const portfolioToSave = JSON.parse(JSON.stringify(state.portfolio));
    portfolioToSave.stocks.forEach(stock => {
        // Keep dividends as they now contain manual payment dates
        delete stock.yearly_max_price;
        delete stock.yearly_max_price_date;
    });

    const filename = `portfolio_CY${state.portfolio.calendar_year}_${state.username}.json`;
    const jsonContent = JSON.stringify(portfolioToSave, null, 2);

    const result = await saveFileRobustly(jsonContent, filename, 'JSON File', 'application/json', '.json');
    
    if (result.success) {
        markClean();
        const msg = result.method === 'browser-download' ? "Portfolio downloaded to your computer." : "Portfolio saved successfully!";
        showToast(msg, "success");
    } else if (result.error !== 'Cancelled') {
        showToast(`Save error: ${result.error}`, "error");
    }
}
function openPortfolioFile() {
    document.getElementById("openFileInput").click();
}

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("openFileInput");
    if (fileInput) {
        fileInput.addEventListener("change", function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    // Basic validation
                    if (!data.calendar_year || !data.stocks) {
                        throw new Error("Invalid portfolio format");
                    }
                    state.portfolio = data;
                    document.getElementById("yearSelect").value = state.portfolio.calendar_year;

                    // Re-render all stock cards
                    document.getElementById("stockCards").innerHTML = "";
                    state.portfolio.stocks.forEach(stock => renderStockCard(stock));
                    updateCalcButtonVisibility();
                    
                    showToast("Portfolio loaded from file", "success");
                    // Fetch runtime data (dividends + peak prices) in background
                    if (state.portfolio.stocks.length > 0) {
                        fetchRuntimeDataForAllStocks().then(hideLoading).catch(() => hideLoading());
                    }
                } catch (err) {
                    showToast(`Failed to read file: ${err.message}`, "error");
                }
            };
            reader.readAsText(file);
            // Reset so the same file can be loaded again if needed
            e.target.value = "";
        });
    }
});

// ===== Runtime Data Fetcher =====
/**
 * After loading a portfolio (from disk, import, or file), fetch dividends and
 * peak prices for all stocks. These are runtime-only values — never stored in
 * the portfolio JSON — and must always be fetched fresh.
 */
async function fetchRuntimeDataForAllStocks() {
    const year = state.portfolio.calendar_year;
    const total = state.portfolio.stocks.length;
    let idx = 0;
    
    for (const stock of state.portfolio.stocks) {
        idx++;
        const ticker = stock.yahoo_ticker || stock.ticker;

        setCardLoading(stock.id, true);

        // Pre-create promises for parallel execution to avoid sequential roundtrips
        const infoPromise = (!stock.company_info || !stock.company_info.name || !stock.company_info.address)
            ? apiPost("/api/lookup-stock", { ticker: ticker })
            : Promise.resolve(null);

        const divPromise = (!stock.skip_dividends && (!stock.dividends || stock.dividends.length === 0))
            ? apiGet(`/api/dividends?ticker=${encodeURIComponent(ticker)}&year=${year}`)
            : Promise.resolve(null);

        const peakPromise = apiGet(`/api/yearly-max-price?ticker=${encodeURIComponent(ticker)}&year=${year}`);

        // Set up local smooth progressive progress tracking for this stock
        let stockPercent = 0;
        const basePercent = ((idx - 1) / total) * 100;
        const stepWidth = 100 / total;

        const updateStockProgress = (subStepMsg) => {
            const currentTotalPercent = basePercent + (stockPercent / 100) * stepWidth;
            showLoading(`Fetching live data (${idx}/${total}): ${stock.ticker}…\n<span style="font-size:0.85rem;color:var(--text-muted)">${subStepMsg}</span>`, currentTotalPercent);
        };

        // Determine initial sub-step message
        let subStepMsg = "Fetching company details";
        updateStockProgress(subStepMsg);

        // Animate local progress smoothly from 0% to 92% over 3.5 seconds
        const startTime = Date.now();
        const estimatedDuration = 3500;
        const progressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(1, elapsed / estimatedDuration);
            stockPercent = 92 * (1 - Math.pow(1 - t, 3)); // easeOutCubic

            // Dynamic message updates based on elapsed time to make it feel extremely responsive
            if (elapsed > 1000 && elapsed <= 2000) {
                subStepMsg = "Fetching dividends";
            } else if (elapsed > 2000) {
                subStepMsg = "Calculating peak asset value";
            }

            updateStockProgress(subStepMsg);
        }, 100);

        try {
            // Run all queries simultaneously in parallel!
            const [info, divData, peakInfo] = await Promise.all([infoPromise, divPromise, peakPromise]);

            clearInterval(progressInterval);
            stockPercent = 100;
            updateStockProgress("Done!");

            // 1. Process company info
            if (info && info.success) {
                stock.company_info = {
                    country_code: info.country_code,
                    name: info.name,
                    display_name: info.display_name,
                    address: info.address,
                    zip: info.zip,
                    nature: info.nature
                };
                if (info.yahoo_ticker) stock.yahoo_ticker = info.yahoo_ticker;

                const card = document.querySelector(`.stock-card[data-stock-id="${stock.id}"]`);
                if (card) {
                    card.querySelector(".stock-name").textContent = stock.company_info.name;
                    card.querySelector(".company-country").value = stock.company_info.country_code || "";
                    card.querySelector(".company-name").value = stock.company_info.display_name || "";
                    card.querySelector(".company-address").value = stock.company_info.address || "";
                    card.querySelector(".company-zip").value = stock.company_info.zip || "";
                    card.querySelector(".company-nature").value = stock.company_info.nature || "Company";
                }
            }

            // 2. Process dividends
            if (divData) {
                stock.dividends = (divData.dividends || []).map(d => ({
                    id: generateId(), 
                    ex_date: d.ex_date, 
                    payment_date: d.payment_date || d.ex_date,
                    amount: d.amount,
                }));
                const card = document.querySelector(`.stock-card[data-stock-id="${stock.id}"]`);
                if (card) {
                    const tbody = card.querySelector(".dividends-tbody");
                    tbody.innerHTML = "";
                    stock.dividends.forEach(div => renderDividendRow(card, stock, div));
                }
            }
            // 3. Process peak price
            if (peakInfo && peakInfo.max_price != null) {
                stock.yearly_max_price = peakInfo.max_price;
                stock.yearly_max_price_date = peakInfo.max_price_date;
                const card = document.querySelector(`.stock-card[data-stock-id="${stock.id}"]`);
                if (card) showPeakPriceBadge(card, peakInfo.max_price, peakInfo.max_price_date);
            }

        } catch (e) {
            clearInterval(progressInterval);
            console.warn(`Parallel fetch failed for ${ticker}`, e);
        }

        setCardLoading(stock.id, false);
        
        // Wait briefly before moving to next stock so that the user sees the 100% done state
        await new Promise(resolve => setTimeout(resolve, 150));
    }
}
async function fetchSbiRates() {
    showLoading("Downloading SBI USD rates from GitHub...");
    try {
        const result = await apiPost("/api/fetch-sbi-rates");
        await hideLoading();
        if (result.success) {
            let msg = `Fetched ${result.updated} USD rates`;
            if (result.locked_years && result.locked_years.length > 0) {
                msg += ` (locked years ${result.locked_years.join(", ")} preserved)`;
            }
            showToast(msg, "success");
        } else {
            showToast(result.error || "Failed to fetch rates", "error");
        }
    } catch (e) {
        await hideLoading();
        showToast(`Error fetching SBI rates: ${e.message}`, "error");
    }
}

// ===== Import Previous Year =====
async function importPreviousYear() {
    const targetYear = state.portfolio.calendar_year;
    const sourceYear = targetYear - 1;

    showLoading(`Importing CY${sourceYear} data...`);
    try {
        const result = await fetch(`/api/import-previous-year?username=${encodeURIComponent(state.username)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                target_year: targetYear,
                source_year: sourceYear,
            })
        }).then(r => r.json());
        await hideLoading();

        if (!result.success) {
            return showToast(result.error || `No data for CY${sourceYear}`, "warning");
        }

        state.portfolio = result.portfolio;

        // Re-render
        document.getElementById("stockCards").innerHTML = "";
        state.portfolio.stocks.forEach(stock => renderStockCard(stock));
        updateCalcButtonVisibility();

        showToast(`Imported ${state.portfolio.stocks.length} stock(s) from CY${sourceYear}`, "success");
        if (state.portfolio.stocks.length > 0) {
            await fetchRuntimeDataForAllStocks();
        }
    } catch (e) {
        showToast(`Import error: ${e.message}`, "error");
    } finally {
        await hideLoading();
    }
}

function clearCurrentYear() {
    if (!confirm(`Are you sure you want to clear all data for CY${state.portfolio.calendar_year}? This will remove all stocks and overrides currently loaded on screen.`)) return;
    pushUndoSnapshot("Clear Year Data");
    state.portfolio.stocks = [];
    state.portfolio.overrides = {};
    document.getElementById("stockCards").innerHTML = "";
    clearCalculatedSections();
    updateCalcButtonVisibility();
    showToast(`Cleared all data for CY${state.portfolio.calendar_year}`, "success");
}

// ===== Export CSV =====
async function saveFileRobustly(content, filename, fileTypeLabel, fileTypeMime, fileExtension) {
    const fileTypeSpec = `${fileTypeLabel} (*${fileExtension})`;
    
    // Tier 1: File System Access API (Modern Browsers / WebView2 on Windows)
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: fileTypeLabel,
                    accept: { [fileTypeMime]: [fileExtension] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            return { success: true, method: 'native-picker' };
        } catch (err) {
            if (err.name === 'AbortError') return { success: false, error: 'Cancelled' };
            console.warn("File System Access API failed, trying Tier 2", err);
        }
    }

    // Tier 2: Native Bridge (macOS WebKit / Linux standalone)
    try {
        const response = await fetch("/api/save-native", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content: content,
                filename: filename,
                file_type: fileTypeSpec
            })
        });
        const result = await response.json();
        if (result.success) return { success: true, method: 'native-bridge' };
        if (result.error === 'Cancelled') return { success: false, error: 'Cancelled' };
        // If result.error is 'Not running in native window mode', we fall through to Tier 3
    } catch (err) {
        console.warn("Native bridge failed, trying Tier 3", err);
    }

    // Tier 3: Browser Blob Download (Legacy Fallback)
    try {
        const blob = new Blob([content], { type: fileTypeMime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        return { success: true, method: 'browser-download' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function exportCSV() {
    if (!state.calculatedRows.length) {
        return showToast("Calculate first, then export", "warning");
    }

    showLoading("Generating CSV...");
    try {
        const resp = await fetch("/api/export-csv", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                rows: state.calculatedRows,
                calendar_year: state.portfolio.calendar_year,
            }),
        });

        if (!resp.ok) throw new Error("Export failed");
        
        const content = await resp.text();
        const filename = `Schedule_FA_A3_CY${state.portfolio.calendar_year}.csv`;
        
        await hideLoading();
        const result = await saveFileRobustly(content, filename, 'CSV File', 'text/csv', '.csv');
        
        if (result.success) {
            const msg = result.method === 'browser-download' ? "CSV downloaded!" : "CSV saved successfully!";
            showToast(msg, "success");
        } else if (result.error !== 'Cancelled') {
            showToast(`Save error: ${result.error}`, "error");
        }
    } catch (e) {
        await hideLoading();
        showToast(`Export error: ${e.message}`, "error");
    }
}


// ===== Utilities =====
function generateId() {
    return "id_" + Math.random().toString(36).substr(2, 9);
}

function updateCalcButtonVisibility() {
    const hasStocks = state.portfolio.stocks.length > 0;
    const tabA3 = document.getElementById("tabA3");
    const isA3 = tabA3 ? tabA3.classList.contains("active") : false;

    // FAB + Quick Jump Nav: visible when stocks exist AND in A3 tab
    const fab = document.getElementById("calcFab");
    const qjNav = document.getElementById("quickJumpNav");
    if (fab) fab.classList.toggle("hidden", !hasStocks || !isA3);
    if (qjNav) qjNav.classList.toggle("hidden", !hasStocks || !isA3);

    // Filter bar: visible when ≥ 3 stocks AND in A3 tab
    const filterBar = document.getElementById("stockFilterBar");
    if (filterBar) filterBar.classList.toggle("hidden", state.portfolio.stocks.length < 3 || !isA3);

    // Dashboard
    updateDashboard();
}

// ===== Monthly Rates Manager =====
async function showMonthlyRates() {
    const section = document.getElementById("monthlyRatesSection");
    if (!section.classList.contains("hidden")) {
        section.classList.add("hidden");
        return;
    }
    section.classList.remove("hidden");
    await loadMonthlyRates();
    section.scrollIntoView({ behavior: "smooth" });
}

async function loadMonthlyRates() {
    const year = parseInt(document.getElementById("ratesYearSelect").value) || state.portfolio.calendar_year;
    const tbody = document.getElementById("monthlyRatesTableBody");
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Loading rates...</td></tr>';

    try {
        const data = await apiGet(`/api/monthly-rates?year=${year}`);
        tbody.innerHTML = "";
        if (!data.success) {
            tbody.innerHTML = '<tr><td colspan="5" style="color:var(--danger)">Error loading rates</td></tr>';
            return;
        }

        // Update lock button state
        const lockBtn = document.getElementById("lockRatesBtn");
        if (data.locked) {
            lockBtn.textContent = "🔓 Unlock Year";
            lockBtn.classList.add("locked");
        } else {
            lockBtn.textContent = "🔒 Lock Year";
            lockBtn.classList.remove("locked");
        }

        data.rates.forEach(r => {
            const statusClass = r.source === 'override' ? 'override' : r.source === 'cache' ? 'cached' : 'missing';
            const statusLabel = r.source === 'not_found' ? 'Missing — enter manually' : r.source;
            const rateVal = r.rate !== null ? r.rate : '';
            const isLocked = data.locked;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${r.month_name}</strong> ${year}</td>
                <td>${r.rate_date || '—'}</td>
                <td>
                    <input type="number" class="monthly-rate-input" step="0.01" value="${rateVal}"
                           placeholder="Enter ₹ rate" data-rate-date="${r.rate_date}" ${isLocked ? 'disabled' : ''}>
                </td>
                <td><span class="rate-status ${statusClass}">${statusLabel}${isLocked ? ' 🔒' : ''}</span></td>
                <td><button class="btn btn-sm btn-primary save-rate-btn" data-rate-date="${r.rate_date}"
                    ${isLocked ? 'disabled' : ''}>💾 Save</button></td>
            `;
            // Save button handler
            tr.querySelector(".save-rate-btn").addEventListener("click", async () => {
                const input = tr.querySelector(".monthly-rate-input");
                const val = parseFloat(input.value);
                if (!val || val <= 0) return showToast("Enter a valid rate", "warning");
                const rateDate = input.dataset.rateDate;
                try {
                    await apiPost("/api/save-manual-rate", { rate_date: rateDate, rate: val });
                    showToast(`Saved ₹${val} for ${rateDate}`, "success");
                    const badge = tr.querySelector(".rate-status");
                    badge.className = "rate-status cached";
                    badge.textContent = "cache";
                } catch (e) {
                    showToast(`Error: ${e.message}`, "error");
                }
            });
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger)">Error: ${e.message}</td></tr>`;
    }
}

// ===== Lock/Unlock Rates =====
async function toggleLockRates() {
    const year = parseInt(document.getElementById("ratesYearSelect").value) || state.portfolio.calendar_year;
    const lockBtn = document.getElementById("lockRatesBtn");
    const isCurrentlyLocked = lockBtn.classList.contains("locked");
    const action = isCurrentlyLocked ? "unlock" : "lock";

    try {
        const resp = await apiPost("/api/lock-rates", { year, action });
        if (resp.success) {
            showToast(`Rates for ${year} ${action}ed`, "success");
            await loadMonthlyRates();
        } else {
            showToast(resp.error || `Failed to ${action} rates`, "error");
        }
    } catch (e) {
        showToast(`Error: ${e.message}`, "error");
    }
}

// ===== Auto-Load Portfolio on Year Change =====
async function autoLoadForYear(year) {
    showLoading(`Loading CY${year}...`);
    renderDashboardSkeletons();
    renderStockCardSkeletons(3);

    try {
        // Try to load saved portfolio
        const resp = await fetch(`/api/load?year=${year}&username=${encodeURIComponent(state.username)}`);
        const data = await resp.json();

        if (data.success) {
            state.portfolio = data.portfolio;
            document.getElementById("stockCards").innerHTML = "";
            state.portfolio.stocks.forEach(stock => renderStockCard(stock));
            updateCalcButtonVisibility();
            clearCalculatedSections();
            updateDashboard();
            showToast(`Loaded saved portfolio for CY${year}`, "success");
            clearDraft(state.username, year);
            if (state.portfolio.stocks.length > 0) await fetchRuntimeDataForAllStocks();
            await hideLoading();
            return;
        }

        // Try import from previous year
        const sourceYear = year - 1;
        const importResp = await fetch(`/api/import-previous-year?username=${encodeURIComponent(state.username)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target_year: year, source_year: sourceYear }),
        }).then(r => r.json());

        if (importResp.success && importResp.portfolio.stocks.length > 0) {
            state.portfolio = importResp.portfolio;
            document.getElementById("stockCards").innerHTML = "";
            state.portfolio.stocks.forEach(stock => renderStockCard(stock));
            updateCalcButtonVisibility();
            clearCalculatedSections();
            updateDashboard();
            showToast(`Imported ${state.portfolio.stocks.length} stock(s) from CY${sourceYear}`, "info");
            if (state.portfolio.stocks.length > 0) await fetchRuntimeDataForAllStocks();
            await hideLoading();
            return;
        }

        // Check for localStorage draft
        const draft = checkForDraft(state.username, year);
        if (draft && draft.portfolio && draft.portfolio.stocks && draft.portfolio.stocks.length > 0) {
            await hideLoading();
            const ago = Math.round((Date.now() - draft.timestamp) / 60000);
            if (confirm(`Found unsaved draft from ${ago} min ago with ${draft.portfolio.stocks.length} stock(s). Restore it?`)) {
                state.portfolio = draft.portfolio;
                document.getElementById("stockCards").innerHTML = "";
                state.portfolio.stocks.forEach(stock => renderStockCard(stock));
                updateCalcButtonVisibility();
                clearCalculatedSections();
                updateDashboard();
                showToast("Draft restored", "success");
                if (state.portfolio.stocks.length > 0) await fetchRuntimeDataForAllStocks();
                return;
            }
        }

        // Clear and start fresh
        state.portfolio = {
            calendar_year: year,
            stocks: [],
            overrides: {},
            sbi_rate_overrides: {},
        };
        document.getElementById("stockCards").innerHTML = "";
        updateCalcButtonVisibility();
        clearCalculatedSections();
        updateDashboard();
        await hideLoading();
        showToast(`No data found for CY${year}. Starting fresh.`, "info");
    } catch (e) {
        await hideLoading();
        showToast(`Error: ${e.message}`, "error");
    }
}

// ===== ITR Tax Year Capital Gains & Dividend Summary =====

async function fetchTaxYearSummary() {
    try {
        const result = await apiPost("/api/tax-year-summary", state.portfolio);
        if (result.success && result.tax_years) {
            state.taxYears = result.tax_years;
            renderTaxYearSummary(result.tax_years);
            renderTaxValidationTable(result.tax_years);
            // Refresh SBI rates to include those used in tax summary (e.g. Rule 115)
            collectSbiRates(state.calculatedRows, result.tax_years);
            document.getElementById("taxYearSection").classList.remove("hidden");
        }
 else {
            console.warn("Tax year summary failed:", result.error);
        }
    } catch (e) {
        console.warn("Failed to fetch tax year summary:", e);
    }
}

function renderTaxYearSummary(taxYears) {
    const container = document.getElementById("taxYearBlocks");
    container.innerHTML = "";

    const quarterLabels = {
        q1: "Up to 15/6",
        q2: "16/6 – 15/9",
        q3: "16/9 – 15/12",
        q4: "16/12 – 15/3",
        q5: "16/3 – 31/3",
    };
    const quarters = ["q1", "q2", "q3", "q4", "q5"];

    const categoryMeta = {
        ltcg:      { label: "LTCG", color: "#10b981", title: "Long-Term Capital Gain (held ≥ 2 yrs)" },
        ltcl:      { label: "LTCL", color: "#ef4444", title: "Long-Term Capital Loss (held ≥ 2 yrs)" },
        stcg:      { label: "STCG", color: "#22c55e", title: "Short-Term Capital Gain (held < 2 yrs)" },
        stcl:      { label: "STCL", color: "#f97316", title: "Short-Term Capital Loss (held < 2 yrs)" },
        dividends: { label: "Div",  color: "#6366f1", title: "Dividend Income" },
    };
    const categoryOrder = ["ltcg", "ltcl", "stcg", "stcl", "dividends"];

    ["prev", "curr"].forEach(tyKey => {
        const ty = taxYears[tyKey];
        const hasData = Object.values(ty.totals).some(b => b.total > 0);

        const block = document.createElement("div");
        block.className = "tax-block";
        block.style.cssText = "margin-bottom:40px;";

        // ── Tax year header ──────────────────────────────────────────────
        const headerEl = document.createElement("div");
        headerEl.style.cssText = [
            "display:flex;align-items:center;gap:12px;",
            "padding:10px 16px;margin-bottom:16px;",
            "background:var(--bg-input);border-radius:8px;",
            "border-left:4px solid var(--accent);"
        ].join("");
        headerEl.innerHTML =
            "<span style=\"font-size:1.1rem;font-weight:700;color:var(--text-main);\">Tax Year: " + ty.label + "</span>" +
            (!hasData ? "<span style=\"color:var(--text-muted);font-size:0.85rem;\">(no transactions in this CY)</span>" : "");
        block.appendChild(headerEl);

        if (!hasData) {
            const note = document.createElement("p");
            note.style.cssText = "color:var(--text-muted);padding:0 16px;font-size:0.875rem;";
            note.textContent = "No gains, losses, or dividends fall in this tax year for the selected calendar year.";
            block.appendChild(note);
            container.appendChild(block);
            return;
        }

        // ── SECTION 1: Gross per-stock breakdown ─────────────────────────
        const sec1Header = document.createElement("div");
        sec1Header.style.cssText = "font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;padding:0 4px;";
        sec1Header.textContent = "① Gross Breakdown — Per Stock (Before Set-Off)";
        block.appendChild(sec1Header);

        const wrapper = document.createElement("div");
        wrapper.style.cssText = "overflow-x:auto;margin-bottom:24px;";

        const table = document.createElement("table");
        table.style.cssText = "width:100%;border-collapse:collapse;font-size:0.84rem;";

        // thead
        const thead = document.createElement("thead");
        const hrow = document.createElement("tr");
        const colHeaders = ["Stock / Category"].concat(quarters.map(q => quarterLabels[q])).concat(["Total"]);
        colHeaders.forEach((h, i) => {
            const th = document.createElement("th");
            th.textContent = h;
            th.style.cssText = [
                "padding:8px 10px;",
                "background:var(--bg-input);",
                "color:var(--text-muted);",
                "font-weight:600;font-size:0.76rem;",
                "text-align:" + (i === 0 ? "left" : "right") + ";",
                "border-bottom:2px solid var(--border);",
                "white-space:nowrap;"
            ].join("");
            hrow.appendChild(th);
        });
        thead.appendChild(hrow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        const stockTickers = Object.keys(ty.stocks);

        stockTickers.forEach((ticker, sIdx) => {
            const stockData = ty.stocks[ticker];

            const sHeaderRow = document.createElement("tr");
            sHeaderRow.dataset.ticker = ticker;
            const sHeaderTd = document.createElement("td");
            sHeaderTd.colSpan = 7;
            sHeaderTd.style.cssText = [
                "padding:10px 10px 4px;",
                "font-weight:700;color:var(--text-main);font-size:0.88rem;",
                "border-top:" + (sIdx > 0 ? "2px solid var(--border)" : "none") + ";"
            ].join("");
            sHeaderTd.innerHTML = `<span style="opacity:0.4;margin-right:6px;">◆</span>${ticker} <span class="validate-crosslink" style="font-size:0.75rem;margin-left:8px;" title="Jump to ${ticker} calculation breakdown" onclick="scrollToSection('validateTaxSection')">🔍</span>`;
            sHeaderRow.appendChild(sHeaderTd);
            tbody.appendChild(sHeaderRow);

            categoryOrder.forEach(cat => {
                const bucket = stockData[cat];
                if (bucket.total === 0) return;
                const meta = categoryMeta[cat];

                const tr = document.createElement("tr");
                tr.addEventListener("mouseenter", () => tr.style.background = "var(--bg-input)");
                tr.addEventListener("mouseleave", () => tr.style.background = "");

                const labelTd = document.createElement("td");
                labelTd.style.cssText = "padding:5px 10px 5px 26px;white-space:nowrap;";
                labelTd.innerHTML = `<span class="validate-crosslink" style="` +
                    "display:inline-block;padding:2px 7px;border-radius:4px;" +
                    "font-size:0.71rem;font-weight:700;letter-spacing:0.04em;" +
                    "background:" + meta.color + "22;color:" + meta.color + ";" +
                    "border:1px solid " + meta.color + "44;" +
                    `" title="Click to view breakdown for ${meta.label}" onclick="scrollToSection('validateTaxSection')">${meta.label}</span>`;
                tr.appendChild(labelTd);

                quarters.concat(["total"]).forEach(qk => {
                    const td = document.createElement("td");
                    const val = bucket[qk] || 0;
                    td.style.cssText = [
                        "padding:5px 10px;text-align:right;",
                        "color:" + (val > 0 ? meta.color : "var(--text-muted)") + ";",
                        "font-variant-numeric:tabular-nums;"
                    ].join("");
                    if (val > 0) {
                        if (qk === "total") {
                            // Total column for individual stock: show plain value
                            td.textContent = formatINR(val);
                        } else {
                            // Quarterly column: show clickable link
                            td.innerHTML = `<span class="val-link">${formatINR(val)}</span>`;
                            const link = td.querySelector(".val-link");
                            link.addEventListener("click", () => jumpToTaxSummaryBreakdown(ticker, cat, qk, ty.label, link, `${ticker} ${meta.label}`));
                            
                            link.addEventListener("mouseenter", (e) => {
                                const events = bucket.details?.[qk] || [];
                                const details = events.map(ev => ({
                                    date: ev.date, 
                                    qty: ev.qty,
                                    price_usd: ev.sell_price || ev.amount_foreign || 0,
                                    rate: ev.sell_ttbr || ev.ttbr || 0,
                                    value_inr: ev.proceeds_inr || ev.value_inr || 0
                                }));
                                showCalcTooltip(e, buildTooltipHTML(details, `${ticker} ${meta.label}`));
                            });
                            link.addEventListener("mouseleave", hideCalcTooltip);
                        }
                    } else {
                        td.textContent = "—";
                    }
                    if (qk === "total") {
                        td.style.fontWeight = "700";
                        td.style.borderLeft = "1px solid var(--border)";
                    }
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
        });

        // Separator + Grand totals
        const sepRow = document.createElement("tr");
        const sepTd = document.createElement("td");
        sepTd.colSpan = 7;
        sepTd.style.cssText = "padding:0;border-top:2px solid var(--accent);";
        sepRow.appendChild(sepTd);
        tbody.appendChild(sepRow);

        categoryOrder.forEach(cat => {
            const bucket = ty.totals[cat];
            if (bucket.total === 0) return;
            const meta = categoryMeta[cat];

            const tr = document.createElement("tr");
            tr.style.background = "var(--bg-input)";

            const labelTd = document.createElement("td");
            labelTd.style.cssText = "padding:7px 10px;font-weight:700;font-size:0.82rem;white-space:nowrap;";
            labelTd.innerHTML =
                "<span style=\"color:var(--text-muted);font-size:0.72rem;margin-right:5px;\">TOTAL</span>" +
                "<span style=\"color:" + meta.color + ";font-weight:800;\">" + meta.label + "</span>";
            tr.appendChild(labelTd);

            quarters.concat(["total"]).forEach(qk => {
                const td = document.createElement("td");
                const val = bucket[qk] || 0;
                td.style.cssText = [
                    "padding:7px 10px;text-align:right;font-weight:700;",
                    "color:" + (val > 0 ? meta.color : "var(--text-muted)") + ";",
                    "font-variant-numeric:tabular-nums;"
                ].join("");
                if (val > 0) {
                    // Total rows at bottom: always show plain value (disabled link)
                    td.textContent = formatINR(val);
                } else {
                    td.textContent = "—";
                }
                if (qk === "total") {
                    td.style.borderLeft = "1px solid var(--border)";
                    td.style.background = meta.color + "11";
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrapper.appendChild(table);
        block.appendChild(wrapper);

        // ── SECTION 2: ITR Set-Off Summary ───────────────────────────────
        const off = ty.offset;
        if (off) {
            const sec2Header = document.createElement("div");
            sec2Header.style.cssText = "font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;padding:0 4px;";
            sec2Header.textContent = "② Net Capital Gains After Set-Off (ITR §70/74)";
            block.appendChild(sec2Header);

            const offCard = document.createElement("div");
            offCard.style.cssText = [
                "background:var(--bg-input);border-radius:10px;",
                "border:1px solid var(--border);padding:20px 24px;",
                "display:grid;grid-template-columns:1fr 1fr;gap:28px;"
            ].join("");

            // Helper to build one column (STCG or LTCG)
            function buildOffsetColumn(title, rows, netLabel, netVal) {
                const col = document.createElement("div");

                const colTitle = document.createElement("div");
                colTitle.style.cssText = "font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;";
                colTitle.textContent = title;
                col.appendChild(colTitle);

                const lineBox = document.createElement("div");
                lineBox.style.cssText = "display:flex;flex-direction:column;gap:4px;";

                rows.forEach(row => {
                    if (row.val === 0 && !row.alwaysShow) return;
                    const line = document.createElement("div");
                    line.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;gap:8px;" +
                        (row.isSeparator ? "border-top:1px solid var(--border);margin-top:4px;padding-top:6px;" : "");

                    const lbl = document.createElement("span");
                    lbl.style.cssText = "font-size:0.82rem;color:" + (row.dimLabel ? "var(--text-muted)" : "var(--text-main)") + ";white-space:nowrap;";
                    lbl.innerHTML = (row.prefix ? "<span style=\"font-weight:600;margin-right:4px;color:" + row.prefixColor + ";\">" + row.prefix + "</span>" : "") + row.label;

                    const amt = document.createElement("span");
                    amt.style.cssText = "font-size:0.85rem;font-weight:" + (row.isSeparator ? "700" : "600") + ";color:" + row.color + ";font-variant-numeric:tabular-nums;white-space:nowrap;";
                    amt.textContent = row.val === 0 ? "—" : (row.negative ? "−" : "") + "₹" + formatINR(row.val);

                    line.appendChild(lbl);
                    line.appendChild(amt);
                    lineBox.appendChild(line);
                });

                // Net result highlight
                const netRow = document.createElement("div");
                netRow.style.cssText = [
                    "display:flex;justify-content:space-between;align-items:center;",
                    "margin-top:10px;padding:10px 12px;border-radius:7px;",
                    "background:" + (netVal > 0 ? "var(--success)" : "var(--bg-card)") + "18;",
                    "border:1px solid " + (netVal > 0 ? "var(--success)" : "var(--border)") + "44;"
                ].join("");
                netRow.innerHTML =
                    "<span style=\"font-size:0.85rem;font-weight:700;color:var(--text-main);\">" + netLabel + "</span>" +
                    "<span style=\"font-size:1rem;font-weight:800;color:" + (netVal > 0 ? "var(--success)" : "var(--text-muted)") + ";font-variant-numeric:tabular-nums;\">" +
                    (netVal > 0 ? "₹" + formatINR(netVal) : "₹0") + "</span>";
                col.appendChild(lineBox);
                col.appendChild(netRow);

                return col;
            }

            // STCG column
            const stcgCol = buildOffsetColumn("Short-Term Capital Gains", [
                { label: "Gross STCG",               val: off.gross_stcg, color: "#22c55e", alwaysShow: true },
                { label: "STCL set off vs STCG",      val: off.stcl_vs_stcg, color: "var(--danger)", negative: true, prefix: "−", prefixColor: "var(--danger)", dimLabel: true },
                off.stcl_vs_ltcg > 0
                    ? { label: "Residual STCL → offsets LTCG", val: off.stcl_vs_ltcg, color: "#f97316", negative: false, dimLabel: true, isSeparator: false }
                    : null,
            ].filter(Boolean), "Net STCG (Taxable)", off.net_stcg);

            // LTCG column
            const ltcgCol = buildOffsetColumn("Long-Term Capital Gains", [
                { label: "Gross LTCG",                val: off.gross_ltcg, color: "var(--success)", alwaysShow: true },
                { label: "LTCL set off vs LTCG",      val: off.ltcl_vs_ltcg, color: "var(--danger)", negative: true, prefix: "−", prefixColor: "var(--danger)", dimLabel: true },
                off.stcl_vs_ltcg > 0
                    ? { label: "Residual STCL set off vs LTCG", val: off.stcl_vs_ltcg, color: "#f97316", negative: true, prefix: "−", prefixColor: "#f97316", dimLabel: true }
                    : null,
            ].filter(Boolean), "Net LTCG (Taxable)", off.net_ltcg);

            offCard.appendChild(stcgCol);
            offCard.appendChild(ltcgCol);

            // Carry-forward losses row (if any)
            const cfStcl = off.stcl_carry_forward;
            const cfLtcl = off.ltcl_carry_forward;
            if (cfStcl > 0 || cfLtcl > 0) {
                const cfRow = document.createElement("div");
                cfRow.style.cssText = "grid-column:1/-1;margin-top:4px;padding:10px 12px;border-radius:7px;background:#f9731622;border:1px solid #f9731644;display:flex;gap:24px;flex-wrap:wrap;align-items:center;";
                cfRow.innerHTML = "<span style=\"font-size:0.78rem;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:0.05em;\">⚠ Unadjusted Losses (Carry Forward to Next Year)</span>";
                if (cfStcl > 0) {
                    cfRow.innerHTML += `<span style="font-size:0.83rem;color:var(--text-main);">Unabsorbed STCL: <strong style="color:#f97316;">₹${formatINR(cfStcl)}</strong></span>`;
                }
                if (cfLtcl > 0) {
                    cfRow.innerHTML += `<span style="font-size:0.83rem;color:var(--text-main);">Unabsorbed LTCL: <strong style="color:var(--danger);">₹${formatINR(cfLtcl)}</strong></span>`;
                }
                offCard.appendChild(cfRow);
            }

            block.appendChild(offCard);
        }

        container.appendChild(block);
    });
}

// ===== Tab Switching =====
function switchTab(tab) {
    const isA3 = tab === "a3";
    const isSellHelper = tab === "sellHelper";
    const isTaxStatement = tab === "taxStatement";

    // All A3 tab elements to hide when switching away
    const allA3Els = [
        "addStockSection", "stockCards", "portfolioDashboard", "stockFilterBar",
        "resultsSection", "stockSummarySection", "sbiRatesSection", "taxYearSection",
        "monthlyRatesSection", "assetPieChartSection", "validateA3Section", "validateTaxSection"
    ];

    allA3Els.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!isA3) {
            el.classList.add("hidden");
        }
    });

    // If active tab is A3, show core and conditionally calculated sections
    if (isA3) {
        // Core A3 sections that are always visible
        const alwaysVisible = ["addStockSection", "stockCards", "portfolioDashboard", "stockFilterBar"];
        alwaysVisible.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove("hidden");
        });

        // Calculated sections only visible if a calculation has run
        const hasCalculated = state.calculatedRows && state.calculatedRows.length > 0;
        if (hasCalculated) {
            const calculatedEls = [
                "resultsSection", "stockSummarySection", "sbiRatesSection", "taxYearSection",
                "assetPieChartSection", "validateA3Section", "validateTaxSection"
            ];
            calculatedEls.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove("hidden");
            });
        }
    }

    document.getElementById("sellHelperPanel").classList.toggle("hidden", !isSellHelper);
    document.getElementById("taxStatementPanel").classList.toggle("hidden", !isTaxStatement);

    document.getElementById("tabA3").classList.toggle("active", isA3);
    document.getElementById("tabSellHelper").classList.toggle("active", isSellHelper);
    document.getElementById("tabTaxStatement").classList.toggle("active", isTaxStatement);

    if (isSellHelper) shImportLots();

    // Show/hide FAB + quick-jump nav based on tab and stock count
    const qjNav = document.getElementById("quickJumpNav");
    const calcFab = document.getElementById("calcFab");
    const hasStocks = state.portfolio.stocks.length > 0;
    if (calcFab) calcFab.classList.toggle("hidden", !isA3 || !hasStocks);
    if (qjNav) qjNav.classList.toggle("hidden", !isA3 || !hasStocks);
}

// ===== Quick Jump Sidebar =====
function initQuickJump() {
    const nav = document.getElementById("quickJumpNav");
    if (!nav) return;

    const btns = nav.querySelectorAll(".qj-btn");

    // Click → smooth scroll
    btns.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.dataset.target;
            const el = document.getElementById(targetId);
            if (el) {
                const header = document.getElementById("appHeader");
                const headerHeight = header ? header.offsetHeight : 0;
                const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
                window.scrollTo({ top, behavior: "smooth" });
            }
        });
    });

    // IntersectionObserver for active highlighting
    const sectionIds = Array.from(btns).map(b => b.dataset.target);
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const btn = nav.querySelector(`.qj-btn[data-target="${entry.target.id}"]`);
            if (!btn) return;

            // Show/hide button based on whether section is in the DOM and visible
            const isHidden = entry.target.classList.contains("hidden") ||
                             entry.target.offsetParent === null;
            btn.classList.toggle("qj-hidden", isHidden);

            if (entry.isIntersecting) {
                btns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
            }
        });
    }, { rootMargin: "-10% 0px -70% 0px", threshold: 0 });

    sectionIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
    });

    // Periodically update button visibility (sections are added/removed dynamically)
    setInterval(() => {
        btns.forEach(btn => {
            const el = document.getElementById(btn.dataset.target);
            const isHidden = !el || el.classList.contains("hidden") || el.offsetParent === null;
            btn.classList.toggle("qj-hidden", isHidden);
        });
    }, 1000);
}

// ===== Sell Simulator =====
const simState = {
    lots: [],       // [{ticker, yahoo_ticker, lot_id, buy_date, buy_price, available_qty, display}]
    sells: [],      // [{rowId, lotIdx, sell_date, sell_qty, sell_price}]
    nextRowId: 1,
};

function initSellHelper() {
    document.getElementById("shAddRowBtn").addEventListener("click", () => shAddRow());
    document.getElementById("shRefreshBtn").addEventListener("click", shImportLots);
    document.getElementById("shSimulateBtn").addEventListener("click", shRunSimulation);
}

/** Build the flat lots list from current portfolio state */
function shImportLots() {
    simState.lots = [];
    for (const stock of state.portfolio.stocks) {
        for (const lot of (stock.lots || [])) {
            if (!lot.buy_date || !lot.quantity) continue;
            
            // Only show lots acquired on or before the selected calendar year
            const buyYear = parseAppDate(lot.buy_date).getFullYear();
            if (buyYear > state.portfolio.calendar_year) continue;

            // Compute available qty (initial − all actual sells)
            let sold = 0;
            for (const s of (lot.sells || [])) sold += parseFloat(s.quantity) || 0;
            const available = (parseFloat(lot.quantity) || 0) - sold;
            if (available <= 0) continue;
            simState.lots.push({
                ticker:       stock.ticker,
                yahoo_ticker: stock.yahoo_ticker || stock.ticker,
                lot_id:       lot.id,
                buy_date:     lot.buy_date,
                buy_price:    parseFloat(lot.buy_price) || 0,
                available_qty: available,
                display: `${stock.ticker} — ${lot.buy_date} (avail: ${available})`,
            });
        }
    }
    // Re-render existing rows' lot dropdowns
    document.querySelectorAll(".sh-lot-select").forEach(sel => {
        const curVal = sel.value;
        sel.innerHTML = shLotOptions(curVal);
    });
    // Render the read-only lots reference table
    shRenderLotsReference();
    if (simState.lots.length === 0 && simState.sells.length === 0) {
        showToast("No available lots found in current portfolio", "warning");
    }
}

function shLotOptions(selected = "") {
    if (simState.lots.length === 0)
        return `<option value="">— Load a portfolio first —</option>`;
    return simState.lots.map((l, i) =>
        `<option value="${i}" ${String(i) === String(selected) ? "selected" : ""}>${l.display}</option>`
    ).join("");
}

function shAddRow(lotIdx = 0) {
    const rowId = simState.nextRowId++;
    simState.sells.push({ rowId, lotIdx: String(lotIdx), sell_date: "", sell_qty: "", sell_price: "" });

    // Hide empty placeholder
    const emptyRow = document.getElementById("shEmptyRow");
    if (emptyRow) emptyRow.style.display = "none";

    const tbody = document.getElementById("shSellsBody");
    const tr = document.createElement("tr");
    tr.dataset.rowId = rowId;

    const today = formatAppDate(new Date());

    tr.innerHTML = `
        <td>
            <select class="sh-lot-select">${shLotOptions(lotIdx)}</select>
        </td>
        <td class="sh-sell-buy-price" style="font-size:0.8rem;color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap;"></td>
        <td><input type="text" class="sh-sell-date" value="${today}" placeholder="DD/MM/YYYY"></td>
        <td>
            <div class="price-input-group">
                <input type="number" class="sh-sell-qty" placeholder="0" step="any" min="0" style="width:70px;">
                <button class="btn btn-sm btn-outline sh-sell-all-btn" title="Sell all available quantity">All</button>
            </div>
        </td>
        <td>
            <div class="price-input-group">
                <input type="number" class="sh-sell-price" placeholder="e.g. 135.50" step="any" min="0" style="min-width:110px;">
                <button class="btn btn-sm btn-fetch-price sh-fetch-price-btn" title="Fetch current live price">📡 Live</button>
            </div>
        </td>
        <td><span class="sh-holding-badge neutral">—</span></td>
        <td><button class="btn btn-sm btn-danger sh-remove-btn">✕</button></td>
    `;

    // Update buy price helper
    const updateBuyPrice = () => {
        const lotI = parseInt(tr.querySelector(".sh-lot-select").value);
        const lot = simState.lots[lotI];
        const cell = tr.querySelector(".sh-sell-buy-price");
        if (lot && lot.buy_price) {
            cell.textContent = `$${parseFloat(lot.buy_price).toFixed(2)}`;
        } else {
            cell.textContent = "—";
        }
    };
    updateBuyPrice();
    tr.querySelector(".sh-lot-select").addEventListener("change", updateBuyPrice);

    // Holding badge updater
    const updateBadge = () => {
        const sell = simState.sells.find(s => s.rowId === rowId);
        if (!sell) return;
        const lotI = parseInt(tr.querySelector(".sh-lot-select").value);
        const lot = simState.lots[lotI];
        const sellDateVal = tr.querySelector(".sh-sell-date").value;
        const badge = tr.querySelector(".sh-holding-badge");
        if (!lot || !sellDateVal) {
            badge.className = "sh-holding-badge neutral";
            badge.textContent = "—";
            return;
        }
        const buyD = parseAppDate(lot.buy_date);
        const sellD = parseAppDate(sellDateVal);
        const days = Math.round((sellD - buyD) / 86400000);
        const isLT = days >= 730;
        const price = parseFloat(tr.querySelector(".sh-sell-price").value) || 0;
        const cost = parseFloat(lot.buy_price) || 0;
        let type;
        if (price > 0 && cost > 0) {
            const gain = price > cost;
            type = isLT ? (gain ? "ltcg" : "ltcl") : (gain ? "stcg" : "stcl");
        } else {
            type = isLT ? "ltcg" : "stcg"; // assume gain if price blank
        }
        const labels = { ltcg: "LTCG", ltcl: "LTCL", stcg: "STCG", stcl: "STCL" };
        badge.className = `sh-holding-badge ${type}`;
        badge.textContent = `${labels[type]} · ${days}d`;
    };

    tr.querySelector(".sh-lot-select").addEventListener("change", e => {
        const sell = simState.sells.find(s => s.rowId === rowId);
        if (sell) sell.lotIdx = e.target.value;
        updateBadge();
    });
    tr.querySelector(".sh-sell-date").addEventListener("change", e => {
        const sell = simState.sells.find(s => s.rowId === rowId);
        if (sell) sell.sell_date = e.target.value;
        updateBadge();
    });
    tr.querySelector(".sh-sell-qty").addEventListener("input", e => {
        const sell = simState.sells.find(s => s.rowId === rowId);
        if (sell) sell.sell_qty = e.target.value;
    });
    tr.querySelector(".sh-sell-all-btn").addEventListener("click", () => {
        const lotI = parseInt(tr.querySelector(".sh-lot-select").value);
        const lot = simState.lots[lotI];
        if (lot) {
            const qtyInput = tr.querySelector(".sh-sell-qty");
            qtyInput.value = lot.available_qty;
            const sell = simState.sells.find(s => s.rowId === rowId);
            if (sell) sell.sell_qty = String(lot.available_qty);
            updateBadge();
        }
    });
    tr.querySelector(".sh-sell-price").addEventListener("change", e => {
        let parsed = parseFloat(e.target.value) || 0;
        if (e.target.value) {
            e.target.value = Math.round(parsed * 100) / 100;
        }
        const sell = simState.sells.find(s => s.rowId === rowId);
        if (sell) sell.sell_price = e.target.value;
        updateBadge();
    });
    tr.querySelector(".sh-sell-price").addEventListener("input", e => {
        const sell = simState.sells.find(s => s.rowId === rowId);
        if (sell) sell.sell_price = e.target.value;
        updateBadge();
    });

    // Live price fetch
    tr.querySelector(".sh-fetch-price-btn").addEventListener("click", async () => {
        const lotI = parseInt(tr.querySelector(".sh-lot-select").value);
        const lot = simState.lots[lotI];
        if (!lot) return showToast("Select a lot first", "warning");
        const btn = tr.querySelector(".sh-fetch-price-btn");
        btn.disabled = true;
        btn.textContent = "⏳";
        try {
            const res = await apiGet(`/api/live-price?ticker=${encodeURIComponent(lot.yahoo_ticker)}`);
            if (res.price != null) {
                const priceInput = tr.querySelector(".sh-sell-price");
                priceInput.value = res.price;
                const sell = simState.sells.find(s => s.rowId === rowId);
                if (sell) sell.sell_price = String(res.price);
                const mktLabel = (res.market_state !== "REGULAR" && res.market_state !== "UNKNOWN") ? ` (${res.market_state})` : "";
                showToast(`Live price for ${lot.ticker}: $${res.price}${mktLabel}`, "success");
                updateBadge();
            } else {
                showToast("Could not fetch live price", "warning");
            }
        } catch (e) {
            showToast(`Fetch error: ${e.message}`, "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "📡 Live";
        }
    });

    tr.querySelector(".sh-remove-btn").addEventListener("click", () => {
        simState.sells = simState.sells.filter(s => s.rowId !== rowId);
        tr.remove();
        if (simState.sells.length === 0) {
            const empty = document.getElementById("shEmptyRow");
            if (empty) empty.style.display = "";
            document.getElementById("shSimulateBtn").style.display = "none";
            document.getElementById("shResultsSection").classList.add("hidden");
        }
    });

    tbody.appendChild(tr);
    updateBadge(); // set initial badge with today's date
    document.getElementById("shSimulateBtn").style.display = "";
}

async function shRunSimulation() {
    if (simState.sells.length === 0) return showToast("Add at least one simulated sell", "warning");

    const simSells = [];
    const lotUsage = {}; // Track aggregate usage per lot

    for (const sell of simState.sells) {
        const lotI = parseInt(sell.lotIdx);
        const lot = simState.lots[lotI];
        if (!lot) continue;
        const qty = parseFloat(sell.sell_qty);
        const price = parseFloat(sell.sell_price);
        const sellDate = sell.sell_date ||
            document.querySelector(`tr[data-row-id="${sell.rowId}"] .sh-sell-date`)?.value || "";
        
        if (!qty || qty <= 0) { showToast(`Row ${sell.rowId}: enter a sell quantity`, "warning"); return; }
        if (!price || price <= 0) { showToast(`Row ${sell.rowId}: enter a sell price`, "warning"); return; }
        if (!sellDate) { showToast(`Row ${sell.rowId}: enter a sell date`, "warning"); return; }
        
        // Aggregate usage check
        const lotId = lot.lot_id;
        lotUsage[lotId] = (lotUsage[lotId] || 0) + qty;
        
        if (lotUsage[lotId] > lot.available_qty) {
            if (simState.sells.filter(s => parseInt(s.lotIdx) === lotI).length > 1) {
                showToast(`Total qty for lot ${lot.ticker} (bought ${lot.buy_date}) exceeds available ${lot.available_qty}`, "warning");
            } else {
                showToast(`Row ${sell.rowId}: qty ${qty} exceeds available ${lot.available_qty}`, "warning");
            }
            return;
        }

        simSells.push({
            ticker:     lot.ticker,
            lot_id:     lot.lot_id,
            buy_date:   lot.buy_date,
            buy_price:  lot.buy_price,
            sell_qty:   qty,
            sell_price: price,
            sell_date:  sellDate,
        });
    }

    if (simSells.length === 0) return showToast("No valid sells to simulate", "warning");

    showLoading("Simulating tax impact...");
    try {
        const result = await apiPost("/api/sell-helper/simulate", {
            calendar_year: state.portfolio.calendar_year,
            sbi_rate_overrides: state.portfolio.sbi_rate_overrides || {},
            simulated_sells: simSells,
        });
        await hideLoading();
        if (!result.success) return showToast(`Simulation error: ${result.error}`, "error");
        shRenderResults(result);
    } catch (e) {
        await hideLoading();
        showToast(`Error: ${e.message}`, "error");
    }
}

function shRenderResults(data) {
    const section = document.getElementById("shResultsSection");
    section.classList.remove("hidden");
    section.scrollIntoView({ behavior: "smooth" });

    // ── Per-sell table ───────────────────────────────────────────────────
    const tbody = document.getElementById("shResultsBody");
    tbody.innerHTML = "";

    const catMeta = {
        ltcg: { label: "LTCG", color: "#10b981" },
        ltcl: { label: "LTCL", color: "#ef4444" },
        stcg: { label: "STCG", color: "#22c55e" },
        stcl: { label: "STCL", color: "#f97316" },
    };

    data.sells.forEach(s => {
        const tr = document.createElement("tr");
        const gainColor = s.gain_inr == null ? "var(--text-muted)" :
            s.gain_inr >= 0 ? "var(--success)" : "var(--danger)";
        const gainStr = s.gain_inr == null ? "—" :
            (s.gain_inr >= 0 ? "" : "−") + "₹" + formatINR(Math.abs(s.gain_inr));
        const cat = s.category ? catMeta[s.category] : null;
        const catBadge = cat
            ? `<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.71rem;font-weight:700;background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${cat.label}</span>`
            : `<span style="color:var(--text-muted);font-size:0.8rem;">${s.error || "—"}</span>`;

        tr.innerHTML = `
            <td style="font-weight:600;color:var(--accent);">${s.ticker}</td>
            <td style="color:var(--text-muted);font-size:0.8rem;">${s.buy_date}</td>
            <td style="color:var(--text-muted);font-size:0.8rem;">${s.sell_date}</td>
            <td>${s.sell_qty}</td>
            <td>${s.buy_cost_inr != null ? "₹" + formatINR(s.buy_cost_inr) : "—"}</td>
            <td>${s.sell_proceeds_inr != null ? "₹" + formatINR(s.sell_proceeds_inr) : "—"}</td>
            <td style="color:${gainColor};font-weight:700;">${gainStr}</td>
            <td>${catBadge}</td>
            <td style="color:var(--text-muted);font-size:0.8rem;">${s.ttbr_buy != null ? "₹" + s.ttbr_buy + "<br><span style='font-size:0.7rem;'>" + (s.ttbr_buy_date || "") + "</span>" : "—"}</td>
            <td style="color:var(--text-muted);font-size:0.8rem;">${s.ttbr_sell != null ? "₹" + s.ttbr_sell + "<br><span style='font-size:0.7rem;'>" + (s.ttbr_sell_date || "") + "</span>" : "—"}</td>
        `;
        tbody.appendChild(tr);
    });

    // ── Offset card ──────────────────────────────────────────────────────
    const offCard = document.getElementById("shOffsetCard");
    offCard.innerHTML = "";
    const off = data.offset;
    if (!off) return;

    const card = document.createElement("div");
    card.style.cssText = [
        "background:var(--bg-input);border-radius:10px;",
        "border:1px solid var(--border);padding:20px 24px;",
        "display:grid;grid-template-columns:1fr 1fr;gap:28px;"
    ].join("");

    function buildCol(title, rows, netLabel, netVal) {
        const col = document.createElement("div");
        const colTitle = document.createElement("div");
        colTitle.style.cssText = "font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;";
        colTitle.textContent = title;
        col.appendChild(colTitle);

        const lineBox = document.createElement("div");
        lineBox.style.cssText = "display:flex;flex-direction:column;gap:4px;";
        rows.forEach(row => {
            if (!row || (row.val === 0 && !row.alwaysShow)) return;
            const line = document.createElement("div");
            line.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;gap:8px;" +
                (row.sep ? "border-top:1px solid var(--border);margin-top:4px;padding-top:6px;" : "");
            const lbl = document.createElement("span");
            lbl.style.cssText = "font-size:0.82rem;color:" + (row.dim ? "var(--text-muted)" : "var(--text-main)") + ";white-space:nowrap;";
            lbl.innerHTML = (row.prefix ? `<span style="font-weight:600;margin-right:4px;color:${row.pc};">${row.prefix}</span>` : "") + row.label;
            const amt = document.createElement("span");
            amt.style.cssText = "font-size:0.85rem;font-weight:600;color:" + row.color + ";font-variant-numeric:tabular-nums;white-space:nowrap;";
            amt.textContent = row.val === 0 ? "—" : (row.neg ? "−" : "") + "₹" + formatINR(row.val);
            line.appendChild(lbl); line.appendChild(amt);
            lineBox.appendChild(line);
        });

        const netRow = document.createElement("div");
        netRow.style.cssText = [
            "display:flex;justify-content:space-between;align-items:center;",
            "margin-top:10px;padding:10px 12px;border-radius:7px;",
            "background:" + (netVal > 0 ? "var(--success)" : "var(--bg-card)") + "18;",
            "border:1px solid " + (netVal > 0 ? "var(--success)" : "var(--border)") + "44;"
        ].join("");
        netRow.innerHTML =
            `<span style="font-size:0.85rem;font-weight:700;color:var(--text-main);">${netLabel}</span>` +
            `<span style="font-size:1rem;font-weight:800;color:${netVal > 0 ? "var(--success)" : "var(--text-muted)"};font-variant-numeric:tabular-nums;">${netVal > 0 ? "₹" + formatINR(netVal) : "₹0"}</span>`;
        col.appendChild(lineBox);
        col.appendChild(netRow);
        return col;
    }

    card.appendChild(buildCol("Short-Term Capital Gains", [
        { label: "Gross STCG", val: off.gross_stcg, color: "#22c55e", alwaysShow: true },
        { label: "STCL set off vs STCG", val: off.stcl_vs_stcg, color: "var(--danger)", neg: true, prefix: "−", pc: "var(--danger)", dim: true },
        off.stcl_vs_ltcg > 0 ? { label: "Residual STCL → LTCG", val: off.stcl_vs_ltcg, color: "#f97316", dim: true } : null,
    ], "Net STCG (Taxable)", off.net_stcg));

    card.appendChild(buildCol("Long-Term Capital Gains", [
        { label: "Gross LTCG", val: off.gross_ltcg, color: "var(--success)", alwaysShow: true },
        { label: "LTCL set off vs LTCG", val: off.ltcl_vs_ltcg, color: "var(--danger)", neg: true, prefix: "−", pc: "var(--danger)", dim: true },
        off.stcl_vs_ltcg > 0 ? { label: "Residual STCL set off vs LTCG", val: off.stcl_vs_ltcg, color: "#f97316", neg: true, prefix: "−", pc: "#f97316", dim: true } : null,
    ], "Net LTCG (Taxable)", off.net_ltcg));

    const cfStcl = off.stcl_carry_forward;
    const cfLtcl = off.ltcl_carry_forward;
    if (cfStcl > 0 || cfLtcl > 0) {
        const cfRow = document.createElement("div");
        cfRow.style.cssText = "grid-column:1/-1;margin-top:4px;padding:10px 12px;border-radius:7px;background:#f9731622;border:1px solid #f9731644;display:flex;gap:24px;flex-wrap:wrap;align-items:center;";
        cfRow.innerHTML = "<span style='font-size:0.78rem;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:0.05em;'>⚠ Unadjusted Losses (Carry Forward)</span>";
        if (cfStcl > 0) cfRow.innerHTML += `<span style="font-size:0.83rem;color:var(--text-main);">Unabsorbed STCL: <strong style="color:#f97316;">₹${formatINR(cfStcl)}</strong></span>`;
        if (cfLtcl > 0) cfRow.innerHTML += `<span style="font-size:0.83rem;color:var(--text-main);">Unabsorbed LTCL: <strong style="color:var(--danger);">₹${formatINR(cfLtcl)}</strong></span>`;
        card.appendChild(cfRow);
    }

    offCard.appendChild(card);
    showToast(`Simulated ${data.sells.length} sell(s) successfully`, "success");
}

// ===== Fetch Dividends (Per-Stock & All) =====
async function fetchDividendsForStock(card, stock) {
    const ticker = stock.yahoo_ticker || stock.ticker;
    const year = state.portfolio.calendar_year;
    const btn = card.querySelector(".fetch-dividends-btn");
    btn.disabled = true;
    btn.textContent = "⏳ Fetching…";
    try {
        const data = await apiGet(`/api/dividends?ticker=${encodeURIComponent(ticker)}&year=${year}`);
        pushUndoSnapshot(`Fetch Dividends (${stock.ticker})`);
        stock.dividends = (data.dividends || []).map(d => {
            const exD = formatAppDate(parseAppDate(d.ex_date));
            const payD = d.payment_date ? formatAppDate(parseAppDate(d.payment_date)) : exD;
            return {
                id: generateId(),
                ex_date: exD,
                payment_date: payD,
                amount: d.amount,
            };
        });
        // Re-render dividends tbody
        const tbody = card.querySelector(".dividends-tbody");
        tbody.innerHTML = "";
        stock.dividends.forEach(div => renderDividendRow(card, stock, div));
        showToast(`Fetched ${stock.dividends.length} dividend(s) for ${stock.ticker}`, "success");
    } catch (e) {
        showToast(`Failed to fetch dividends for ${stock.ticker}: ${e.message}`, "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "🔄 Fetch Dividends";
    }
}

async function fetchCompanyDetailsForStock(card, stock) {
    const ticker = stock.ticker;
    const btn = card.querySelector(".fetch-company-details-btn");
    btn.disabled = true;
    btn.textContent = "⏳ Fetching…";
    try {
        const info = await apiPost("/api/lookup-stock", { ticker });
        if (!info.success) {
            showToast(`Could not fetch details for ${ticker}: ${info.error || "Unknown error"}`, "error");
            return;
        }
        pushUndoSnapshot(`Fetch Details (${stock.ticker})`);
        // Override company info fields
        stock.company_info.country_code = info.country_code || stock.company_info.country_code;
        stock.company_info.name = info.name || stock.company_info.name;
        stock.company_info.display_name = info.display_name || stock.company_info.display_name;
        stock.company_info.address = info.address || stock.company_info.address;
        stock.company_info.zip = info.zip || stock.company_info.zip;
        stock.company_info.nature = info.nature || stock.company_info.nature;
        if (info.yahoo_ticker) stock.yahoo_ticker = info.yahoo_ticker;
        // Update card fields
        card.querySelector(".company-country").value = stock.company_info.country_code;
        card.querySelector(".company-name").value = stock.company_info.display_name;
        card.querySelector(".company-address").value = stock.company_info.address;
        card.querySelector(".company-zip").value = stock.company_info.zip;
        card.querySelector(".company-nature").value = stock.company_info.nature;
        card.querySelector(".stock-name").textContent = stock.company_info.name;
        showToast(`Updated company details for ${ticker}`, "success");
    } catch (e) {
        showToast(`Failed to fetch details for ${ticker}: ${e.message}`, "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "🔄 Fetch Details";
    }
}

async function fetchAllDividends() {
    if (state.portfolio.stocks.length === 0) return showToast("No stocks to fetch dividends for", "warning");
    pushUndoSnapshot("Fetch All Dividends");
    
    let total = 0;
    let idx = 0;
    const numStocks = state.portfolio.stocks.length;
    
    for (const stock of state.portfolio.stocks) {
        idx++;
        if (stock.skip_dividends) {
            showLoading(`Fetching dividends (${idx}/${numStocks})…`, (idx / numStocks) * 100);
            continue;
        }
        const ticker = stock.yahoo_ticker || stock.ticker;
        showLoading(`Fetching dividends (${idx}/${numStocks}): ${stock.ticker}…`, (idx / numStocks) * 100);
        try {
            const data = await apiGet(`/api/dividends?ticker=${encodeURIComponent(ticker)}&year=${state.portfolio.calendar_year}`);
            stock.dividends = (data.dividends || []).map(d => {
                const exD = formatAppDate(parseAppDate(d.ex_date));
                const payD = d.payment_date ? formatAppDate(parseAppDate(d.payment_date)) : exD;
                return {
                    id: generateId(),
                    ex_date: exD,
                    payment_date: payD,
                    amount: d.amount,
                };
            });
            total += stock.dividends.length;
            const card = document.querySelector(`.stock-card[data-stock-id="${stock.id}"]`);
            if (card) {
                const tbody = card.querySelector(".dividends-tbody");
                tbody.innerHTML = "";
                stock.dividends.forEach(div => renderDividendRow(card, stock, div));
            }
        } catch (e) { console.warn(`Dividend fetch failed for ${ticker}`, e); }
    }
    await hideLoading();
    showToast(`Fetched ${total} total dividend(s) across all stocks`, "success");
}

// ===== FY Year Selector =====
function initFYYearSelector() {
    const select = document.getElementById("fyYearSelect");
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 2024; y--) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = `TY ${y}-${String(y + 1).slice(-2)} (Apr ${y} – Mar ${y + 1})`;
        if (y === state.portfolio.calendar_year) opt.selected = true;
        select.appendChild(opt);
    }
}

// ===== Consolidated FY Tax Summary =====
async function fetchConsolidatedTaxSummary() {
    const fyStart = parseInt(document.getElementById("fyYearSelect").value);
    if (!fyStart || !state.username) return showToast("Select a tax year", "warning");
    showLoading(`Generating consolidated statement for TY ${fyStart}-${String(fyStart + 1).slice(-2)}…`);
    try {
        const result = await apiPost("/api/consolidated-tax-summary", {
            fy_start_year: fyStart, 
            username: state.username,
            current_portfolio: state.portfolio
        });
        await hideLoading();
        if (!result.success) return showToast(result.error || "Failed", "error");
        renderConsolidatedTaxSummary(result.consolidated);
        document.getElementById("consolidatedFYBlocks").scrollIntoView({ behavior: "smooth" });
    } catch (e) {
        await hideLoading();
        showToast(`Error: ${e.message}`, "error");
    }
}

function renderConsolidatedTaxSummary(data) {
    const container = document.getElementById("consolidatedFYBlocks");
    container.innerHTML = "";

    // Source availability badges
    const sourceDiv = document.createElement("div");
    sourceDiv.style.cssText = "margin-bottom:16px;";
    sourceDiv.innerHTML = `
        <span class="fy-source-note ${data.has_cy_start ? 'available' : 'missing'}">${data.has_cy_start ? '✓' : '⚠'} CY${data.fy_start_year} ${data.has_cy_start ? 'loaded' : 'missing (treated as 0)'}</span>
        <span class="fy-source-note ${data.has_cy_end ? 'available' : 'missing'}">${data.has_cy_end ? '✓' : '⚠'} CY${data.fy_end_year} ${data.has_cy_end ? 'loaded' : 'missing (treated as 0)'}</span>
    `;
    container.appendChild(sourceDiv);

    // Reuse the same rendering as renderTaxYearSummary but for a single consolidated block
    const fakeYears = { prev: data };
    // Render using existing helper — just the "prev" key
    const quarterLabels = { q1: "Up to 15/6", q2: "16/6 – 15/9", q3: "16/9 – 15/12", q4: "16/12 – 15/3", q5: "16/3 – 31/3" };
    const quarters = ["q1", "q2", "q3", "q4", "q5"];
    const categoryMeta = {
        ltcg: { label: "LTCG", color: "#10b981", title: "Long-Term Capital Gain" },
        ltcl: { label: "LTCL", color: "#ef4444", title: "Long-Term Capital Loss" },
        stcg: { label: "STCG", color: "#22c55e", title: "Short-Term Capital Gain" },
        stcl: { label: "STCL", color: "#f97316", title: "Short-Term Capital Loss" },
        dividends: { label: "Div", color: "#6366f1", title: "Dividend Income" },
    };
    const categoryOrder = ["ltcg", "ltcl", "stcg", "stcl", "dividends"];
    const ty = data;
    const hasData = Object.values(ty.totals).some(b => b.total > 0);

    const block = document.createElement("div");
    block.style.cssText = "margin-bottom:24px;";

    const headerEl = document.createElement("div");
    headerEl.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 16px;margin-bottom:16px;background:var(--bg-input);border-radius:8px;border-left:4px solid var(--accent);";
    headerEl.innerHTML = `<span style="font-size:1.1rem;font-weight:700;color:var(--text-main);">${ty.fy_label} — Consolidated</span>` +
        (!hasData ? `<span style="color:var(--text-muted);font-size:0.85rem;">(no data)</span>` : "");
    block.appendChild(headerEl);

    if (!hasData) {
        block.innerHTML += `<p style="color:var(--text-muted);padding:0 16px;font-size:0.875rem;">No gains, losses, or dividends found for this tax year.</p>`;
        container.appendChild(block);
        return;
    }

    // Build table (same pattern as renderTaxYearSummary)
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "overflow-x:auto;margin-bottom:24px;";
    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;font-size:0.84rem;";

    const thead = document.createElement("thead");
    const hrow = document.createElement("tr");
    ["Stock / Category"].concat(quarters.map(q => quarterLabels[q])).concat(["Total"]).forEach((h, i) => {
        const th = document.createElement("th");
        th.textContent = h;
        th.style.cssText = `padding:8px 10px;background:var(--bg-input);color:var(--text-muted);font-weight:600;font-size:0.76rem;text-align:${i === 0 ? "left" : "right"};border-bottom:2px solid var(--border);white-space:nowrap;`;
        hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    Object.keys(ty.stocks).forEach((ticker, sIdx) => {
        const stockData = ty.stocks[ticker];
        const sHeaderRow = document.createElement("tr");
        const sHeaderTd = document.createElement("td");
        sHeaderTd.colSpan = 7;
        sHeaderTd.style.cssText = `padding:10px 10px 4px;font-weight:700;color:var(--text-main);font-size:0.88rem;border-top:${sIdx > 0 ? "2px solid var(--border)" : "none"};`;
        sHeaderTd.innerHTML = `<span style="opacity:0.4;margin-right:6px;">◆</span>${ticker}`;
        sHeaderRow.appendChild(sHeaderTd);
        tbody.appendChild(sHeaderRow);

        categoryOrder.forEach(cat => {
            const bucket = stockData[cat];
            if (bucket.total === 0) return;
            const meta = categoryMeta[cat];
            const tr = document.createElement("tr");
            tr.addEventListener("mouseenter", () => tr.style.background = "var(--bg-input)");
            tr.addEventListener("mouseleave", () => tr.style.background = "");
            const labelTd = document.createElement("td");
            labelTd.style.cssText = "padding:5px 10px 5px 26px;white-space:nowrap;";
            labelTd.innerHTML = `<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.71rem;font-weight:700;letter-spacing:0.04em;background:${meta.color}22;color:${meta.color};border:1px solid ${meta.color}44;" title="${meta.title}">${meta.label}</span>`;
            tr.appendChild(labelTd);
            quarters.concat(["total"]).forEach(qk => {
                const td = document.createElement("td");
                const val = bucket[qk] || 0;
                td.style.cssText = `padding:5px 10px;text-align:right;color:${val > 0 ? meta.color : "var(--text-muted)"};font-variant-numeric:tabular-nums;`;
                td.textContent = val > 0 ? formatINR(val) : "—";
                if (qk === "total") { td.style.fontWeight = "700"; td.style.borderLeft = "1px solid var(--border)"; }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    });

    // Grand totals
    const sepRow = document.createElement("tr");
    const sepTd = document.createElement("td");
    sepTd.colSpan = 7;
    sepTd.style.cssText = "padding:0;border-top:2px solid var(--accent);";
    sepRow.appendChild(sepTd);
    tbody.appendChild(sepRow);

    categoryOrder.forEach(cat => {
        const bucket = ty.totals[cat];
        if (bucket.total === 0) return;
        const meta = categoryMeta[cat];
        const tr = document.createElement("tr");
        tr.style.background = "var(--bg-input)";
        const labelTd = document.createElement("td");
        labelTd.style.cssText = "padding:7px 10px;font-weight:700;font-size:0.82rem;white-space:nowrap;";
        labelTd.innerHTML = `<span style="color:var(--text-muted);font-size:0.72rem;margin-right:5px;">TOTAL</span><span style="color:${meta.color};font-weight:800;">${meta.label}</span>`;
        tr.appendChild(labelTd);
        quarters.concat(["total"]).forEach(qk => {
            const td = document.createElement("td");
            const val = bucket[qk] || 0;
            td.style.cssText = `padding:7px 10px;text-align:right;font-weight:700;color:${val > 0 ? meta.color : "var(--text-muted)"};font-variant-numeric:tabular-nums;`;
            td.textContent = val > 0 ? formatINR(val) : "—";
            if (qk === "total") { td.style.borderLeft = "1px solid var(--border)"; td.style.background = meta.color + "11"; }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    block.appendChild(wrapper);

    // Offset card
    const off = ty.offset;
    if (off) {
        const sec2Header = document.createElement("div");
        sec2Header.style.cssText = "font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;";
        sec2Header.textContent = "Net Capital Gains After Set-Off (ITR §70/74)";
        block.appendChild(sec2Header);

        const offCard = document.createElement("div");
        offCard.style.cssText = "background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:20px 24px;display:grid;grid-template-columns:1fr 1fr;gap:28px;";

        function buildCol(title, rows, netLabel, netVal) {
            const col = document.createElement("div");
            const colTitle = document.createElement("div");
            colTitle.style.cssText = "font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;";
            colTitle.textContent = title;
            col.appendChild(colTitle);
            const lineBox = document.createElement("div");
            lineBox.style.cssText = "display:flex;flex-direction:column;gap:4px;";
            rows.forEach(row => {
                if (!row || (row.val === 0 && !row.alwaysShow)) return;
                const line = document.createElement("div");
                line.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;gap:8px;";
                const lbl = document.createElement("span");
                lbl.style.cssText = `font-size:0.82rem;color:${row.dim ? "var(--text-muted)" : "var(--text-main)"};white-space:nowrap;`;
                lbl.innerHTML = (row.prefix ? `<span style="font-weight:600;margin-right:4px;color:${row.pc};">${row.prefix}</span>` : "") + row.label;
                const amt = document.createElement("span");
                amt.style.cssText = `font-size:0.85rem;font-weight:600;color:${row.color};font-variant-numeric:tabular-nums;white-space:nowrap;`;
                amt.textContent = row.val === 0 ? "—" : (row.neg ? "−" : "") + "₹" + formatINR(row.val);
                line.appendChild(lbl); line.appendChild(amt);
                lineBox.appendChild(line);
            });
            const netRow = document.createElement("div");
            netRow.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:10px 12px;border-radius:7px;background:${netVal > 0 ? "var(--success)" : "var(--bg-card)"}18;border:1px solid ${netVal > 0 ? "var(--success)" : "var(--border)"}44;`;
            netRow.innerHTML = `<span style="font-size:0.85rem;font-weight:700;color:var(--text-main);">${netLabel}</span><span style="font-size:1rem;font-weight:800;color:${netVal > 0 ? "var(--success)" : "var(--text-muted)"};font-variant-numeric:tabular-nums;">${netVal > 0 ? "₹" + formatINR(netVal) : "₹0"}</span>`;
            col.appendChild(lineBox);
            col.appendChild(netRow);
            return col;
        }

        offCard.appendChild(buildCol("Short-Term Capital Gains", [
            { label: "Gross STCG", val: off.gross_stcg, color: "#22c55e", alwaysShow: true },
            { label: "STCL set off vs STCG", val: off.stcl_vs_stcg, color: "var(--danger)", neg: true, prefix: "−", pc: "var(--danger)", dim: true },
            off.stcl_vs_ltcg > 0 ? { label: "Residual STCL → LTCG", val: off.stcl_vs_ltcg, color: "#f97316", dim: true } : null,
        ], "Net STCG (Taxable)", off.net_stcg));

        offCard.appendChild(buildCol("Long-Term Capital Gains", [
            { label: "Gross LTCG", val: off.gross_ltcg, color: "var(--success)", alwaysShow: true },
            { label: "LTCL set off vs LTCG", val: off.ltcl_vs_ltcg, color: "var(--danger)", neg: true, prefix: "−", pc: "var(--danger)", dim: true },
            off.stcl_vs_ltcg > 0 ? { label: "Residual STCL set off vs LTCG", val: off.stcl_vs_ltcg, color: "#f97316", neg: true, prefix: "−", pc: "#f97316", dim: true } : null,
        ], "Net LTCG (Taxable)", off.net_ltcg));

        block.appendChild(offCard);
    }

    container.appendChild(block);
    showToast(`Consolidated statement generated for ${data.fy_label}`, "success");
}

// ===== Sell Simulator Lots Reference =====
function shRenderLotsReference() {
    const tbody = document.getElementById("shLotsRefBody");
    tbody.innerHTML = "";
    if (simState.lots.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--text-muted);font-size:0.85rem;">No lots available. Load a portfolio on the Schedule FA A3 tab first.</td></tr>`;
        return;
    }
    for (const stock of state.portfolio.stocks) {
        for (const lot of (stock.lots || [])) {
            if (!lot.buy_date || !lot.quantity) continue;
            const totalQty = parseFloat(lot.quantity) || 0;
            let sold = 0;
            for (const s of (lot.sells || [])) sold += parseFloat(s.quantity) || 0;
            const avail = totalQty - sold;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${stock.ticker}</td>
                <td>${lot.buy_date}</td>
                <td>$${(parseFloat(lot.buy_price) || 0).toFixed(2)}</td>
                <td>${totalQty}</td>
                <td>${sold > 0 ? sold : "—"}</td>
                <td class="${avail > 0 ? 'avail-positive' : 'avail-zero'}">${avail}</td>
            `;
            tbody.appendChild(tr);
        }
    }
}

// ===== Pie Chart =====
async function renderAssetPieChart(rows) {
    const canvas = document.getElementById("assetPieChart");
    const legendContainer = document.getElementById("assetPieChartLegend");
    const chartTitleEl = document.getElementById("assetPieChartTitle");
    if (!canvas || !legendContainer) return;

    const section = document.getElementById("assetPieChartSection");
    if (section) section.classList.remove("hidden");

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    const currentYear = new Date().getFullYear();
    const portfolioYear = state.portfolio.calendar_year;

    // Aggregate by stock — use current-month snapshot for in-progress years
    const stockTotals = {};
    let totalAssets = 0;
    let chartLabel = "End-of-Year Assets (Dec 31)";

    if (portfolioYear < currentYear) {
        // Completed year: use Dec 31 closing_balance from A3 rows
        rows.forEach(row => {
            const entity = row.entity_name;
            const bal = row.closing_balance || 0;
            if (!stockTotals[entity]) stockTotals[entity] = 0;
            stockTotals[entity] += bal;
            totalAssets += bal;
        });
    } else {
        // In-progress year: fetch current-month snapshot
        try {
            const result = await apiPost("/api/current-balance", state.portfolio);
            if (result.success && result.stock_balances) {
                const snapshotDate = result.snapshot_date;
                const d = new Date(snapshotDate + "T00:00:00");
                const formatted = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                chartLabel = `Assets as of ${formatted}`;
                result.stock_balances.forEach(item => {
                    stockTotals[item.entity_name] = (stockTotals[item.entity_name] || 0) + item.balance_inr;
                    totalAssets += item.balance_inr;
                });
            }
        } catch (e) {
            console.warn("Failed to fetch current balance for pie chart:", e);
            // Fallback: try closing_balance (likely 0 for current year)
            rows.forEach(row => {
                const entity = row.entity_name;
                const bal = row.closing_balance || 0;
                if (!stockTotals[entity]) stockTotals[entity] = 0;
                stockTotals[entity] += bal;
                totalAssets += bal;
            });
        }
    }

    // Update section title
    if (chartTitleEl) chartTitleEl.textContent = `🧩 ${chartLabel} (INR)`;

    ctx.clearRect(0, 0, width, height);
    legendContainer.innerHTML = "";

    if (totalAssets === 0) {
        ctx.fillStyle = "var(--text-muted)";
        ctx.font = "14px Inter";
        ctx.textAlign = "center";
        ctx.fillText("No assets to display", centerX, centerY);
        return;
    }

    // Sort by value descending
    const sortedStocks = Object.entries(stockTotals).sort((a, b) => b[1] - a[1]);
    
    // Vibrant color palette
    const colors = [
        "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
        "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1"
    ];

    let startAngle = -0.5 * Math.PI; // Start at top

    sortedStocks.forEach(([entity, value], idx) => {
        if (value <= 0) return;

        const sliceAngle = (value / totalAssets) * 2 * Math.PI;
        const color = colors[idx % colors.length];

        // Draw slice
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        // Add small border between slices for aesthetics
        ctx.lineWidth = 2;
        ctx.strokeStyle = "var(--bg-secondary)";
        ctx.stroke();

        startAngle += sliceAngle;

        // Build legend
        const pct = ((value / totalAssets) * 100).toFixed(1);
        const item = document.createElement("div");
        item.className = "pie-legend-item";
        item.innerHTML = `
            <div class="pie-legend-swatch" style="background-color: ${color};"></div>
            <div class="pie-legend-label">${entity}</div>
            <div class="pie-legend-value">₹${value.toLocaleString("en-IN")}</div>
            <div class="pie-legend-pct">${pct}%</div>
        `;
        legendContainer.appendChild(item);
    });

    // Draw donut hole (optional, but looks premium)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.55, 0, 2 * Math.PI);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--bg-secondary").trim();
    ctx.fill();

    // Text in center
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text-primary").trim();
    ctx.font = "bold 16px Inter";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Total Assets", centerX, centerY - 10);
    ctx.font = "bold 18px Inter";
    ctx.fillText(`₹${totalAssets.toLocaleString("en-IN")}`, centerX, centerY + 12);
}

// ===== Tutorial System =====
const tutorialStepsA3 = [
    { selector: "#portfolioMenu", title: "Portfolio Menu", desc: "This menu contains all file and data operations. Hover over it to access Upload, Load, Open, and Save As options." },
    { selector: "#toolsMenu", title: "Tools Menu", desc: "Access market data tools here, including SBI TT Rates download and the Batch Dividend Fetcher." },
    { selector: "#manageMenu", title: "Manage Menu", desc: "Year-level operations like importing from the previous year or clearing the current session's data." },
    { selector: "#viewMenu", title: "View Menu", desc: "Customize your display by collapsing/expanding all stock cards, or view your session's Action History." },
    { selector: "#saveBtn", title: "Quick Save", desc: "Save your current work to the server. The pulsing blue dot indicates unsaved changes." },
    { selector: "#undoBtn", title: "Undo / Redo", desc: "Mistakes are easy to fix! Use ↩ to undo any action (or Ctrl+Z) and ↪ to redo. We track up to 50 actions." },
    { selector: "#tickerInput", title: "Add Stock / ETF", desc: "Enter a ticker symbol (e.g., QCOM, NVDA, VWRA) and click Lookup to add it to your portfolio. Tickers for non-US exchanges are auto-resolved." },
    { selector: ".add-lot-btn", title: "Acquisition Lots", desc: "Each stock has acquisition lots representing your purchase transactions. Add the buy date, quantity, and price. Use the 📈 Fetch button to auto-fill the closing price." },
    { selector: ".add-sell-btn", title: "Sell Transactions", desc: "Record any sell transactions against a specific lot. The tool uses FIFO matching and tracks partial sells." },
    { selector: ".fetch-dividends-btn", title: "Fetch Dividends", desc: "Fetch exact dividend data (including Payment Dates) from Nasdaq for the calendar year. This ensures accurate Rule 115 calculations without manual date entry." },
    { selector: "#calcFab", title: "Generate FA Report", desc: "Click the floating button to compute all 12 columns of Schedule FA Section A3, including initial value, peak value, closing balance, dividends, and sale proceeds — all in ₹ using SBI TT rates." },
];

const tutorialStepsSell = [
    { selector: "#shRefreshBtn", title: "Refresh Lots", desc: "Re-import the latest acquisition lots from your current portfolio." },
    { selector: "#shAddRowBtn", title: "Add Simulated Sell", desc: "Add a hypothetical sell transaction. You can pick from your existing lots." },
    { selector: "#shSimulateBtn", title: "Simulate Tax Impact", desc: "Calculate the estimated tax breakdown (STCG/LTCG) based on your simulated sells using ITR set-off rules." },
    { selector: "#shResultsSection", title: "Simulation Results", desc: "View the tax breakdown and net impact without affecting your real portfolio." }
];

const tutorialStepsTax = [
    { selector: "#fyYearSelect", title: "Select Tax Year", desc: "Choose the Indian Financial Year (e.g., 2024-25) to generate the tax statement for." },
    { selector: "#generateFYBtn", title: "Generate Tax Statement", desc: "Combines data from two calendar years to generate a complete view of Capital Gains and Dividends for the Indian Financial Year." }
];

let activeTutorialSteps = [];
let currentTutorialStep = -1;

function initTutorial() {
    document.getElementById("tutorialCloseBtn").addEventListener("click", endTutorial);
    document.getElementById("tutorialNextBtn").addEventListener("click", nextTutorialStep);
    document.getElementById("tutorialPrevBtn").addEventListener("click", prevTutorialStep);
    document.getElementById("tutorialBackdrop").addEventListener("click", endTutorial);
}

function startTutorial() {
    currentTutorialStep = -1;
    document.getElementById("tutorialOverlay").classList.remove("hidden");
    
    if (document.getElementById("tabSellHelper").classList.contains("active")) {
        activeTutorialSteps = tutorialStepsSell;
    } else if (document.getElementById("tabTaxStatement").classList.contains("active")) {
        activeTutorialSteps = tutorialStepsTax;
    } else {
        activeTutorialSteps = tutorialStepsA3;
    }
    
    nextTutorialStep();
}

function endTutorial() {
    document.getElementById("tutorialOverlay").classList.add("hidden");
    // Remove any existing spotlight
    document.querySelectorAll(".tutorial-spotlight").forEach(el => el.remove());
    currentTutorialStep = -1;
}

function nextTutorialStep() {
    currentTutorialStep++;
    if (currentTutorialStep >= activeTutorialSteps.length) { endTutorial(); return; }
    showTutorialStep(currentTutorialStep);
}

function prevTutorialStep() {
    if (currentTutorialStep <= 0) return;
    currentTutorialStep--;
    showTutorialStep(currentTutorialStep);
}

function showTutorialStep(index) {
    const step = activeTutorialSteps[index];
    const target = document.querySelector(step.selector);

    document.getElementById("tutorialStepCounter").textContent = `Step ${index + 1} of ${activeTutorialSteps.length}`;
    document.getElementById("tutorialTitle").textContent = step.title;
    document.getElementById("tutorialDesc").textContent = step.desc;
    document.getElementById("tutorialPrevBtn").disabled = index === 0;
    document.getElementById("tutorialNextBtn").textContent = index === activeTutorialSteps.length - 1 ? "Finish ✓" : "Next →";

    // Remove old spotlight and dimmed class
    document.querySelectorAll(".tutorial-spotlight").forEach(el => el.remove());
    document.getElementById("tutorialBackdrop").classList.remove("dimmed");

    const tooltip = document.getElementById("tutorialTooltip");
    tooltip.style.transform = "none"; // clear any previous centering transform

    if (target) {
        target.scrollIntoView({ behavior: "auto", block: "center" });
        setTimeout(() => {
            const rect = target.getBoundingClientRect();
            const pad = 8;

            // Create spotlight cutout
            const spotlight = document.createElement("div");
            spotlight.className = "tutorial-spotlight";
            spotlight.style.top = (rect.top - pad) + "px";
            spotlight.style.left = (rect.left - pad) + "px";
            spotlight.style.width = (rect.width + pad * 2) + "px";
            spotlight.style.height = (rect.height + pad * 2) + "px";
            document.getElementById("tutorialOverlay").appendChild(spotlight);

            // Position tooltip
            let tooltipTop = rect.bottom + 16;
            let tooltipLeft = rect.left;

            // Wait a tick for the tooltip to have layout size
            requestAnimationFrame(() => {
                const ttRect = tooltip.getBoundingClientRect();
                
                // If it goes off bottom, place it above target
                if (tooltipTop + ttRect.height > window.innerHeight - 10) {
                    tooltipTop = rect.top - ttRect.height - 16;
                }
                
                // Final clamp vertically
                tooltipTop = Math.max(10, Math.min(tooltipTop, window.innerHeight - ttRect.height - 10));
                
                // Final clamp horizontally
                tooltipLeft = Math.max(10, Math.min(tooltipLeft, window.innerWidth - ttRect.width - 10));

                tooltip.style.top = tooltipTop + "px";
                tooltip.style.left = tooltipLeft + "px";
            });

        }, 300);
    } else {
        // Element not visible — center tooltip
        // We add a class to the backdrop to dim the screen since there's no spotlight box-shadow to do it
        document.getElementById("tutorialBackdrop").classList.add("dimmed");
        tooltip.style.top = "50%";
        tooltip.style.left = "50%";
        tooltip.style.transform = "translate(-50%, -50%)";
    }
}

// ===== Portfolio Dashboard =====
function updateDashboard() {
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
                <span class="dash-icon">📦</span>
                <span class="dash-value"><span id="dashStockCount">0</span><span style="font-size: 0.6em; color: var(--text-muted); margin: 0 4px;">/</span><span id="dashLotCount">0</span></span>
                <span class="dash-label">Stocks / Lots</span>
            </div>
            <div class="dash-stat">
                <span class="dash-icon">💰</span>
                <span class="dash-value" id="dashTotalAssets">—</span>
                <div id="dashTotalAssetsUSD" style="font-size: 0.9rem; font-weight: 600; margin-top: -2px; margin-bottom: 4px; color: var(--accent);">$—</div>
                <span class="dash-label">Total Assets</span>
            </div>
            <div class="dash-stat">
                <span class="dash-icon">📈</span>
                <span class="dash-value" id="dashUnrealizedGain">—</span>
                <div id="dashUnrealizedUSD" style="font-size: 0.9rem; font-weight: 600; margin-top: -2px; margin-bottom: 4px; color: var(--accent);">$—</div>
                <div id="dashUnrealizedBreakdown" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; display: flex; gap: 8px; font-weight: 500;">
                    <span id="dashUnrealizedLTCG" title="Long Term Unrealized Gain/Loss">LT: —</span>
                    <span id="dashUnrealizedSTCG" title="Short Term Unrealized Gain/Loss">ST: —</span>
                </div>
                <span class="dash-label">Unrealized G/L</span>
            </div>
            <div class="dash-stat">
                <span class="dash-icon">💵</span>
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
        gainEl.textContent = (totalUnrealizedGain >= 0 ? "+" : "") + "\u20b9" + Math.round(totalUnrealizedGain).toLocaleString("en-IN");
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

// ===== Stock Filter =====
function filterStockCards() {
    const query = document.getElementById("stockFilterInput").value.toLowerCase().trim();
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

// ===== Theme Toggle =====
function toggleTheme() {
    const root = document.documentElement;
    const current = root.dataset.theme || "dark";
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("fa_desk_theme", next); } catch(e) {}
}

function restoreTheme() {
    try {
        const saved = localStorage.getItem("fa_desk_theme");
        if (saved) {
            document.documentElement.dataset.theme = saved;
        }
    } catch(e) {}
}

// ===== Auto-Save Draft to localStorage =====
function autoSaveDraft() {
    if (!state.isDirty || !state.username) return;
    try {
        const key = `fa_desk_draft_${state.username}_${state.portfolio.calendar_year}`;
        localStorage.setItem(key, JSON.stringify({
            portfolio: state.portfolio,
            timestamp: Date.now(),
        }));
    } catch(e) {}
}

function checkForDraft(username, year) {
    try {
        const key = `fa_desk_draft_${username}_${year}`;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data;
    } catch(e) { return null; }
}

function clearDraft(username, year) {
    try { localStorage.removeItem(`fa_desk_draft_${username}_${year}`); } catch(e) {}
}



// ===== Drag and Drop Stock Reordering =====
function initDragAndDrop(card, stock) {
    card.addEventListener("dragstart", (e) => {
        card.classList.add("dragging");
        e.dataTransfer.setData("text/plain", stock.id);
        e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        document.querySelectorAll(".stock-card.drag-over").forEach(c => c.classList.remove("drag-over"));
    });
    card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        card.classList.add("drag-over");
    });
    card.addEventListener("dragleave", () => {
        card.classList.remove("drag-over");
    });
    card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("drag-over");
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId === stock.id) return;

        pushUndoSnapshot("Reorder Stocks");
        const stocks = state.portfolio.stocks;
        const fromIdx = stocks.findIndex(s => s.id === draggedId);
        const toIdx = stocks.findIndex(s => s.id === stock.id);
        if (fromIdx < 0 || toIdx < 0) return;

        const [moved] = stocks.splice(fromIdx, 1);
        stocks.splice(toIdx, 0, moved);

        // Re-render DOM order
        const container = document.getElementById("stockCards");
        container.innerHTML = "";
        stocks.forEach(s => renderStockCard(s));
        showToast("Stock order updated", "info", 1500);
    });
}

// ===== CSV Lot Import =====
function initCsvLotImport(card, stock) {
    const btn = card.querySelector(".import-lots-csv-btn");
    const input = card.querySelector(".import-lots-csv-input");
    if (!btn || !input) return;

    btn.addEventListener("click", () => input.click());
    input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;
            const lines = text.trim().split("\n");
            if (lines.length < 2) { showToast("CSV has no data rows", "warning"); return; }

            pushUndoSnapshot(`Import CSV Lots (${stock.ticker})`);
            const header = lines[0].toLowerCase();
            let imported = 0, skipped = 0;

            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
                if (cols.length < 3) { skipped++; continue; }

                const buy_date = cols[0];
                const quantity = parseFloat(cols[1]);
                const buy_price = parseFloat(cols[2]);

                if (!buy_date || isNaN(quantity) || isNaN(buy_price) || quantity <= 0) {
                    skipped++; continue;
                }

                const lot = { id: generateId(), buy_date, quantity, buy_price };
                stock.lots.push(lot);
                renderLotRow(card, stock, lot);
                imported++;
            }
            showToast(`Imported ${imported} lot(s)${skipped ? `, skipped ${skipped}` : ""}`, imported > 0 ? "success" : "warning");
            updateDashboard();
        };
        reader.readAsText(file);
        input.value = ""; // reset
    });
}

// ===== Year-over-Year Comparison =====
function renderYoYComparison() {
    // Remove old section if exists
    const old = document.getElementById("yoySection");
    if (old) old.remove();

    if (!state.calculatedRows || state.calculatedRows.length === 0) return;

    const year = state.portfolio.calendar_year;
    const prevKey = `fa_desk_calc_${state.username}_${year - 1}`;
    let prevData;
    try { prevData = JSON.parse(localStorage.getItem(prevKey)); } catch(e) {}

    if (!prevData || !prevData.rows || prevData.rows.length === 0) return;

    const curAssets = state.calculatedRows.reduce((s, r) => s + (r.closing_balance || 0), 0);
    const curDivs = state.calculatedRows.reduce((s, r) => s + (r.total_dividends || 0), 0);
    const prevAssets = prevData.rows.reduce((s, r) => s + (r.closing_balance || 0), 0);
    const prevDivs = prevData.rows.reduce((s, r) => s + (r.total_dividends || 0), 0);

    const section = document.createElement("div");
    section.id = "yoySection";
    section.className = "yoy-section";

    const deltaAssets = curAssets - prevAssets;
    const deltaDivs = curDivs - prevDivs;
    const pctAssets = prevAssets ? ((deltaAssets / prevAssets) * 100).toFixed(1) : "N/A";
    const pctDivs = prevDivs ? ((deltaDivs / prevDivs) * 100).toFixed(1) : "N/A";

    section.innerHTML = `
        <h3>\ud83d\udcc8 Year-over-Year: CY${year-1} \u2192 CY${year}</h3>
        <div class="yoy-grid">
            <div class="yoy-card">
                <div class="yoy-label">Total Assets</div>
                <div class="yoy-value">\u20b9${Math.round(curAssets).toLocaleString("en-IN")}</div>
                <div class="yoy-delta ${deltaAssets >= 0 ? 'positive' : 'negative'}">${deltaAssets >= 0 ? '\u2191' : '\u2193'} ${pctAssets}%</div>
            </div>
            <div class="yoy-card">
                <div class="yoy-label">Total Dividends</div>
                <div class="yoy-value">\u20b9${Math.round(curDivs).toLocaleString("en-IN")}</div>
                <div class="yoy-delta ${deltaDivs >= 0 ? 'positive' : 'negative'}">${deltaDivs >= 0 ? '\u2191' : '\u2193'} ${pctDivs}%</div>
            </div>
            <div class="yoy-card">
                <div class="yoy-label">CY${year-1} Assets</div>
                <div class="yoy-value" style="color:var(--text-secondary)">\u20b9${Math.round(prevAssets).toLocaleString("en-IN")}</div>
                <div class="yoy-delta" style="color:var(--text-muted)">Previous year</div>
            </div>
        </div>
    `;

    const resultsSection = document.getElementById("resultsSection");
    if (resultsSection) resultsSection.appendChild(section);
}

// Save calculation results for YoY
function saveCalcResultsForYoY() {
    if (!state.username || !state.calculatedRows || state.calculatedRows.length === 0) return;
    try {
        const key = `fa_desk_calc_${state.username}_${state.portfolio.calendar_year}`;
        localStorage.setItem(key, JSON.stringify({ rows: state.calculatedRows }));
    } catch(e) {}
}

// ===== Year Change Guard =====
function addYearChangeGuard() {
    const mainSelect = document.getElementById("yearSelect");
    const originalHandler = mainSelect.onchange; // won't exist (addEventListener used)

    // We need to intercept — wrap in new listener
    // Remove old by re-attaching. Since we can't remove anonymous, we override with a capturing listener.
    mainSelect.addEventListener("change", function guardHandler(e) {
        if (state.isDirty) {
            if (!confirm("You have unsaved changes. Switch year and discard them?")) {
                e.stopImmediatePropagation();
                mainSelect.value = state.portfolio.calendar_year;
                return;
            }
        }
    }, true); // capturing phase = runs first
}

// ===== About Modal =====
let aboutGlobeAnimationId = null;

function startAboutGlobe() {
    const canvas = document.getElementById('aboutGlobeCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2, R = 42;
    let angle = 0;

    // Hub nodes on the globe surface (lat, lon in radians)
    const hubs = [
        { lat: 0.7, lon: 0.3 },
        { lat: -0.4, lon: 1.8 },
        { lat: 0.2, lon: -1.2 },
        { lat: -0.6, lon: 3.0 },
        { lat: 0.5, lon: -2.5 },
        { lat: -0.1, lon: 0.9 },
    ];

    function project(lat, lon) {
        const x = R * Math.cos(lat) * Math.sin(lon + angle);
        const y = R * Math.sin(lat);
        const z = R * Math.cos(lat) * Math.cos(lon + angle);
        return { x: cx + x, y: cy - y, z: z };
    }

    if (aboutGlobeAnimationId) {
        cancelAnimationFrame(aboutGlobeAnimationId);
    }

    function draw() {
        if (document.getElementById('aboutModal').classList.contains('hidden')) {
            aboutGlobeAnimationId = null;
            return;
        }
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
        for (let i = 0; i < lonSteps; i++) {
            const lon = (i / lonSteps) * Math.PI * 2;
            ctx.beginPath();
            for (let j = 0; j <= 40; j++) {
                const lat = (j / 40) * Math.PI - Math.PI / 2;
                const p = project(lat, lon);
                if (j === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            const midP = project(0, lon);
            const midDepth = (midP.z + R) / (2 * R);
            if (midDepth > 0.5) {
                ctx.strokeStyle = 'rgba(99, 102, 241, ' + (0.15 + midDepth * 0.55) + ')';
                ctx.lineWidth = 0.8;
            } else {
                ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
                ctx.lineWidth = 0.5;
            }
            ctx.stroke();
        }

        // Latitude lines
        const latSteps = 7;
        for (let i = 1; i < latSteps; i++) {
            const lat = (i / latSteps) * Math.PI - Math.PI / 2;
            ctx.beginPath();
            for (let j = 0; j <= 60; j++) {
                const lon = (j / 60) * Math.PI * 2;
                const p = project(lat, lon);
                if (j === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            const testP = project(lat, -angle);
            const depthL = (testP.z + R) / (2 * R);
            if (depthL > 0.5) {
                ctx.strokeStyle = 'rgba(99, 102, 241, ' + (0.12 + depthL * 0.45) + ')';
                ctx.lineWidth = 0.6;
            } else {
                ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
                ctx.lineWidth = 0.4;
            }
            ctx.stroke();
        }

        // Hub nodes
        hubs.forEach(function(hub) {
            const p = project(hub.lat, hub.lon);
            const depth = (p.z + R) / (2 * R);
            if (depth > 0.45) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(167, 139, 250, 0.3)';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = '#a78bfa';
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
                ctx.fill();
            }
        });

        angle += 0.012;
        aboutGlobeAnimationId = requestAnimationFrame(draw);
    }

    draw();
}

async function openAboutModal() {
    const modal = document.getElementById("aboutModal");
    const badge = document.getElementById("aboutVersionBadge");
    const resultEl = document.getElementById("updateResult");
    
    // Fetch current version
    try {
        const res = await fetch("/api/version");
        const data = await res.json();
        if (data.success) {
            badge.textContent = `v${data.version}`;
        }
    } catch (e) {
        badge.textContent = "v?";
    }
    
    // Reset update result
    resultEl.classList.add("hidden");
    resultEl.className = "about-update-result hidden";
    resultEl.innerHTML = "";
    
    modal.classList.remove("hidden");
    startAboutGlobe();
}

function closeAboutModal() {
    document.getElementById("aboutModal").classList.add("hidden");
    if (aboutGlobeAnimationId) {
        cancelAnimationFrame(aboutGlobeAnimationId);
        aboutGlobeAnimationId = null;
    }
}

async function checkForUpdate() {
    const btn = document.getElementById("checkUpdateBtn");
    const resultEl = document.getElementById("updateResult");
    
    btn.disabled = true;
    btn.textContent = "⏳ Checking...";
    resultEl.classList.add("hidden");
    
    try {
        const res = await fetch("/api/check-update");
        const data = await res.json();
        
        resultEl.classList.remove("hidden");
        
        if (!data.success) {
            resultEl.className = "about-update-result update-error";
            resultEl.textContent = `Could not check for updates: ${data.error}`;
        } else if (data.update_available) {
            resultEl.className = "about-update-result update-available";
            resultEl.innerHTML = `New version <strong>v${data.latest_version}</strong> is available! <a href="${data.release_url}" target="_blank" rel="noopener">Download →</a>`;
        } else {
            resultEl.className = "about-update-result up-to-date";
            resultEl.textContent = `✅ You're on the latest version (v${data.current_version})`;
        }
    } catch (e) {
        resultEl.classList.remove("hidden");
        resultEl.className = "about-update-result update-error";
        resultEl.textContent = `Update check failed: ${e.message}`;
    } finally {
        btn.disabled = false;
        btn.textContent = "🔄 Check for Updates";
    }
}

// ===== Validate A3 Cross-Link Jump Helpers =====
function jumpToSbiRate(rateDate) {
    const section = document.getElementById("sbiRatesSection");
    if (!section || section.classList.contains("hidden")) return;
    
    // Ensure section content is expanded
    const content = document.getElementById("sbiRatesContent");
    if (content && content.classList.contains("collapsed")) {
        toggleSection('sbiRatesContent');
    }
    
    // Find the row with matching rate date
    const rows = document.querySelectorAll("#sbiRatesTableBody tr[data-rate-date]");
    let targetRow = null;
    for (const row of rows) {
        if (row.dataset.rateDate === rateDate) {
            targetRow = row;
            break;
        }
    }
    
    if (targetRow) {
        // Scroll to it
        const header = document.getElementById("appHeader");
        const headerHeight = header ? header.offsetHeight : 0;
        const top = targetRow.getBoundingClientRect().top + window.scrollY - headerHeight - 120;
        window.scrollTo({ top, behavior: "smooth" });
        
        // Highlight pulse
        targetRow.classList.add("highlight-pulse");
        setTimeout(() => targetRow.classList.remove("highlight-pulse"), 2000);
    }
}

function jumpToStockSection(ticker, sectionClass, targetId) {
    // Find the stock card with this ticker
    const cards = document.querySelectorAll(".stock-card");
    let targetCard = null;

    if (!ticker) {
        // If no ticker provided (e.g. Total row), just take the first available card
        targetCard = cards[0];
    } else {
        for (const card of cards) {
            const tickerEl = card.querySelector(".stock-ticker");
            if (tickerEl && tickerEl.textContent.trim().toUpperCase() === ticker.toUpperCase()) {
                targetCard = card;
                break;
            }
        }
    }

    if (!targetCard) return;

    // Expand the card if collapsed
    const body = targetCard.querySelector(".stock-card-body");
    if (body && !body.classList.contains("expanded")) {
        const toggleBtn = targetCard.querySelector(".toggle-details-btn");
        if (toggleBtn) toggleBtn.click();
    }

    // Find the target section within the card
    const targetSection = targetCard.querySelector(`.${sectionClass}`);
    let scrollTarget = targetSection || targetCard;
    let highlightTarget = targetSection || targetCard;

    if (targetId) {
        // Try to find specific row by checking all ID types
        const row = targetCard.querySelector(`tr[data-lot-id="${targetId}"], tr[data-div-id="${targetId}"], tr[data-sell-id="${targetId}"]`);
        if (row) {
            scrollTarget = row;
            highlightTarget = row;
        }
    }

    // Scroll to it
    const header = document.getElementById("appHeader");
    const headerHeight = header ? header.offsetHeight : 0;
    const top = scrollTarget.getBoundingClientRect().top + window.scrollY - headerHeight - 120;
    window.scrollTo({ top, behavior: "smooth" });

    // Highlight pulse on the target
    highlightTarget.classList.add("highlight-pulse");
    setTimeout(() => highlightTarget.classList.remove("highlight-pulse"), 2000);
}

// ===== Date Helpers (Universal Format: DD/MM/YYYY) =====
function parseAppDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        if (parts.length === 3) {
            const [d, m, y] = parts;
            return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        }
    }
    // Fallback for YYYY-MM-DD
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    return null;
}

function formatAppDate(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return "";
    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const y = dateObj.getFullYear();
    return `${d}/${m}/${y}`;
}

function jumpToSection(sectionId, targetSelector = null) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    // Show section if hidden
    section.classList.remove("hidden");

    // Expand if collapsible
    const content = section.querySelector(".collapsible-content");
    if (content && content.classList.contains("collapsed")) {
        toggleSection(content.id);
    }

    let target = section;
    if (targetSelector) {
        const found = section.querySelector(targetSelector);
        if (found) target = found;
    }

    // Scroll to it
    const header = document.getElementById("appHeader");
    const headerHeight = header ? header.offsetHeight : 0;
    const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 120;
    window.scrollTo({ top, behavior: "smooth" });

    // Highlight
    target.classList.add("highlight-pulse");
    setTimeout(() => target.classList.remove("highlight-pulse"), 2000);
}

// ===== Global Search =====
function performGlobalSearch(query) {
    const resultsContainer = document.getElementById("searchResults");
    resultsContainer.innerHTML = "";
    if (!query || query.length < 2) return;

    const q = query.toLowerCase();
    const results = [];

    // 1. Search in stocks (Editor Tab)
    state.portfolio.stocks.forEach(stock => {
        const ticker = stock.ticker.toLowerCase();
        const name = (stock.company_info?.name || "").toLowerCase();

        if (ticker.includes(q) || name.includes(q)) {
            results.push({
                type: "Stock",
                title: `${stock.ticker} — ${stock.company_info?.name || "Unknown"}`,
                handler: () => { switchTab('a3'); jumpToStockSection(stock.ticker, 'stock-card'); }
            });
        }

        stock.lots.forEach(lot => {
            const formattedDate = lot.buy_date ? formatAppDate(parseAppDate(lot.buy_date)) : "";
            if (formattedDate.includes(query) || (lot.buy_price && lot.buy_price.toString().includes(query))) {
                results.push({
                    type: "Lot",
                    title: `Lot: ${stock.ticker} bought on ${formattedDate}`,
                    handler: () => { switchTab('a3'); jumpToStockSection(stock.ticker, 'lots-section', lot.id); }
                });
            }

            (lot.sells || []).forEach(sell => {
                const formattedDate = sell.sell_date ? formatAppDate(parseAppDate(sell.sell_date)) : "";
                if (formattedDate.includes(query) || (sell.sell_price && sell.sell_price.toString().includes(query))) {
                    results.push({
                        type: "Sell",
                        title: `Sell: ${stock.ticker} sold on ${formattedDate}`,
                        handler: () => { switchTab('a3'); jumpToStockSection(stock.ticker, 'sells-section', sell.id); }
                    });
                }
            });
        });

        (stock.dividends || []).forEach(div => {
            const formattedExDate = div.ex_date ? formatAppDate(parseAppDate(div.ex_date)) : "";
            const formattedPayDate = div.payment_date ? formatAppDate(parseAppDate(div.payment_date)) : "";
            if (formattedExDate.includes(query) || formattedPayDate.includes(query)) {
                results.push({
                    type: "Dividend",
                    title: `Dividend: ${stock.ticker} ex-date ${formattedExDate}`,
                    handler: () => { switchTab('a3'); jumpToStockSection(stock.ticker, 'dividends-section', div.id); }
                });
            }
        });
    });

    // 2. Search in FA Report (Calculated Rows)
    state.calculatedRows.forEach(row => {
        const ticker = (row.ticker || row.entity_name || "").toLowerCase();
        if (ticker.includes(q)) {
            results.push({
                type: "FA Report",
                title: `Report Row: ${row.entity_name} (${row.ticker || 'N/A'})`,
                handler: () => { switchTab('a3'); jumpToSection('resultsSection', `tr[data-lot-id="${row.lot_id}"]`); }
            });
        }
        // Search in validation breakdown
        const details = row.calculation_details || {};
        if (details.peak?.peak_date?.includes(query)) {
             results.push({
                type: "Validation",
                title: `Peak Date Match: ${row.entity_name} on ${formatAppDate(parseAppDate(details.peak.peak_date))}`,
                handler: () => { switchTab('a3'); jumpToSection('validateA3Section', `#val-${row.lot_id}-peak_value`); }
            });
        }
    });

    // 3. Search in SBI Rates Used
    state.sbiRatesUsed.forEach(entry => {
        const label = entry.label.toLowerCase();
        const formattedDate = entry.rateDate ? formatAppDate(parseAppDate(entry.rateDate)) : "";
        const rateStr = entry.rate ? entry.rate.toString() : "";
        if (q === "sbi" || q === "rate" || label.includes(q) || formattedDate.includes(query) || rateStr.includes(query)) {
            // Jump to the report row (Vice Versa)
            if (entry.origin) {
                results.push({
                    type: "SBI Rate",
                    title: `${entry.label} (Jump to Row)`,
                    handler: () => { switchTab('a3'); jumpToSection(entry.origin.section, entry.origin.selector); }
                });
            }
            // Also keep option to jump to SBI Rates table
            results.push({
                type: "SBI Rate",
                title: `${entry.label} (Jump to Rates Table)`,
                handler: () => { switchTab('a3'); jumpToSection('sbiRatesSection', `tr[data-rate-date="${entry.rateDate}"]`); }
            });
        }
    });

    // 4. Search in Tax Statement
    if (state.taxYears) {
        ["prev", "curr"].forEach(tyKey => {
            const ty = state.taxYears[tyKey];
            Object.keys(ty.stocks).forEach(ticker => {
                if (ticker.toLowerCase().includes(q)) {
                    results.push({
                        type: "Tax",
                        title: `Tax Summary: ${ticker} (${ty.label})`,
                        handler: () => { switchTab('a3'); jumpToSection('taxYearSection', `tr[data-ticker="${ticker}"]`); }
                    });
                }
            });
        });
    }

    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="hint" style="text-align:center;padding:12px;">No matches found</div>';
        return;
    }

    // Dedup and limit
    const seen = new Set();
    const uniqueResults = results.filter(r => {
        const key = `${r.type}:${r.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 20);

    uniqueResults.forEach(res => {
        const div = document.createElement("div");
        div.className = "search-result-item";
        div.style.cssText = "padding:10px; border-bottom:1px solid var(--border); cursor:pointer;";
        div.innerHTML = `
            <div style="font-size:0.75rem; color:var(--accent); font-weight:700; text-transform:uppercase;">${res.type}</div>
            <div style="font-weight:500;">${res.title}</div>
        `;
        div.onclick = () => {
            document.getElementById("searchModal").classList.add("hidden");
            res.handler();
        };
        resultsContainer.appendChild(div);
    });
}
