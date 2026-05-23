import { state, pushUndoSnapshot, markDirty, dispatchStateChange } from '../state.js';
import { apiGet, apiPost } from '../api.js';
import { formatINR, formatAppDate, parseAppDate } from '../utils.js';
import {
    showToast, showLoading, hideLoading, toggleSection,
    showCalcTooltip, hideCalcTooltip, buildTooltipHTML, mapCalcDetailsToTooltip
} from '../ui-utils.js';
import {
    EDIT_PENCIL_SVG, UNLOCK_SVG, LOCK_SVG, SAVE_BTN_HTML,
    BADGE_LOCK_SVG, SEARCH_ICON_SVG
} from '../constants.js';

let _navSource = null;
let _backToSourceTimeout = null;

/**
 * Highlight a source element and show a "Back to source" pill.
 */
export function showBackToSource(sourceEl, label) {
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

// Wire up the Back to Source pill listener once
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
        });
    }
});

// ===== Render Results Table =====
export function renderResultsTable(rows) {
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
}

// ===== Validation Tables Helpers =====

/** Helper to wrap TTBR rate in a clickable cross-link span */
const rateLink = (rateVal, rateDate) => {
    if (!rateVal || !rateDate) return `₹${rateVal ? rateVal.toFixed(4) : '?'}`;
    const displayDate = formatAppDate(parseAppDate(rateDate));
    return `<span class="validate-crosslink" data-jump-rate="${rateDate}" title="Jump to SBI rate for ${displayDate}">₹${rateVal.toFixed(4)}</span>`;
};

// ===== Render Validation Table =====
export function renderValidationTable(rows) {
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
export function renderTaxValidationTable(taxYears) {
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

export function jumpToTaxSummaryBreakdown(ticker, category, quarter, tyLabel, sourceEl = null, label = "") {
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

    const tyFilter = tyLabel;

    allRows.forEach(row => {
        const isTickerMatch = !ticker || row.dataset.ticker === ticker;
        const isCatMatch = row.dataset.category === category;
        const isQkMatch = quarter === "total" || row.dataset.quarter === quarter;
        const isTyMatch = !tyFilter || row.dataset.ty === tyFilter;

        if (isTickerMatch && isCatMatch && isQkMatch && isTyMatch) {
            row.classList.add("highlight-pulse");
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

export function jumpToTaxValidation(ticker, type, eventDate) {
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
        el.classList.add("highlight-pulse");
        setTimeout(() => el.classList.remove("highlight-pulse"), 2000);
        
        const header = document.getElementById("appHeader");
        const headerHeight = header ? header.offsetHeight : 0;
        const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 120;
        window.scrollTo({ top, behavior: "smooth" });
    }
}

export function jumpToValidation(lotId, fieldKey, sourceEl = null, label = "") {
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
        el.classList.add("highlight-pulse");
        setTimeout(() => el.classList.remove("highlight-pulse"), 2000);

        const header = document.getElementById("appHeader");
        const headerHeight = header ? header.offsetHeight : 0;
        const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 120;
        window.scrollTo({ top, behavior: "smooth" });
    }
}

export function enableCellEdit(td, row, fieldKey) {
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
            if (!state.portfolio.overrides[row.lot_id]) {
                state.portfolio.overrides[row.lot_id] = {};
            }
            state.portfolio.overrides[row.lot_id][fieldKey] = newVal;
            row[fieldKey] = newVal;
            row.is_overridden[fieldKey] = true;
            td.classList.add("overridden");
        } else {
            if (state.portfolio.overrides[row.lot_id]) {
                delete state.portfolio.overrides[row.lot_id][fieldKey];
            }
            row.is_overridden[fieldKey] = false;
            td.classList.remove("overridden");
        }

        const displayVal = formatINR(row[fieldKey]);
        td.innerHTML = `<span class="val-link" title="Click to view calculation breakdown">${displayVal}</span><span class="edit-icon" title="Click to manually override value">${EDIT_PENCIL_SVG}</span>`;
        
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
            td.innerHTML = `${formatINR(row[fieldKey])}<span class="edit-icon"> ${EDIT_PENCIL_SVG}</span>`;
        }
    });
}

// ===== SBI Rates Used in Calculation =====
export function collectSbiRates(rows, taxYears = null) {
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
                <span class="edit-icon"> ${EDIT_PENCIL_SVG}</span>
            </td>
            <td><span class="rate-status ${statusClass}">${src}</span></td>
        `;

        if (entry.origin) {
            tr.querySelector(".jump-back-btn").addEventListener("click", () => {
                document.dispatchEvent(new CustomEvent('switch-tab', { detail: 'a3' }));
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
                        const data = await apiPost("/api/save-manual-rate", { rate_date: rateDate, rate: newVal });
                        if (data.success) {
                            showToast(`Saved rate for ${rateDate}: ₹${newVal}`);
                            document.dispatchEvent(new CustomEvent('calculate-all'));
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

// ===== Monthly Rates Manager =====
export async function showMonthlyRates() {
    const section = document.getElementById("monthlyRatesSection");
    if (!section.classList.contains("hidden")) {
        section.classList.add("hidden");
        return;
    }
    section.classList.remove("hidden");
    await loadMonthlyRates();
    section.scrollIntoView({ behavior: "smooth" });
}

export async function loadMonthlyRates() {
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
            lockBtn.innerHTML = UNLOCK_SVG;
            lockBtn.classList.add("locked");
        } else {
            lockBtn.innerHTML = LOCK_SVG;
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
                <td><span class="rate-status ${statusClass}">${statusLabel}${isLocked ? BADGE_LOCK_SVG : ''}</span></td>
                <td><button class="btn btn-sm btn-primary save-rate-btn" data-rate-date="${r.rate_date}"
                    ${isLocked ? 'disabled' : ''}>${SAVE_BTN_HTML}</button></td>
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
export async function toggleLockRates() {
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

// ===== ITR Tax Year Capital Gains & Dividend Summary =====
export async function fetchTaxYearSummary() {
    try {
        const result = await apiPost("/api/tax-year-summary", state.portfolio);
        if (result.success && result.tax_years) {
            state.taxYears = result.tax_years;
            renderTaxYearSummary(result.tax_years);
            renderTaxValidationTable(result.tax_years);
            collectSbiRates(state.calculatedRows, result.tax_years);
            document.getElementById("taxYearSection").classList.remove("hidden");
        } else {
            console.warn("Tax year summary failed:", result.error);
        }
    } catch (e) {
        console.warn("Failed to fetch tax year summary:", e);
    }
}

export function renderTaxYearSummary(taxYears) {
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

        const sec1Header = document.createElement("div");
        sec1Header.style.cssText = "font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;padding:0 4px;";
        sec1Header.textContent = "① Gross Breakdown — Per Stock (Before Set-Off)";
        block.appendChild(sec1Header);

        const wrapper = document.createElement("div");
        wrapper.style.cssText = "overflow-x:auto;margin-bottom:24px;";

        const table = document.createElement("table");
        table.style.cssText = "width:100%;border-collapse:collapse;font-size:0.84rem;";

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
            sHeaderTd.innerHTML = `<span style="opacity:0.4;margin-right:6px;">◆</span>${ticker} <span class="validate-crosslink jump-to-tax-val" style="font-size:0.75rem;margin-left:8px;" title="Jump to ${ticker} calculation breakdown">${SEARCH_ICON_SVG}</span>`;
            sHeaderTd.querySelector(".jump-to-tax-val").addEventListener("click", () => jumpToSection('validateTaxSection'));
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
                labelTd.innerHTML = `<span class="validate-crosslink jump-to-tax-val" style="` +
                    "display:inline-block;padding:2px 7px;border-radius:4px;" +
                    "font-size:0.71rem;font-weight:700;letter-spacing:0.04em;" +
                    "background:" + meta.color + "22;color:" + meta.color + ";" +
                    "border:1px solid " + meta.color + "44;" +
                    `" title="Click to view breakdown for ${meta.label}">${meta.label}</span>`;
                labelTd.querySelector(".jump-to-tax-val").addEventListener("click", () => jumpToSection('validateTaxSection'));
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
                            td.textContent = formatINR(val);
                        } else {
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

            const stcgCol = buildOffsetColumn("Short-Term Capital Gains", [
                { label: "Gross STCG",               val: off.gross_stcg, color: "#22c55e", alwaysShow: true },
                { label: "STCL set off vs STCG",      val: off.stcl_vs_stcg, color: "var(--danger)", negative: true, prefix: "−", prefixColor: "var(--danger)", dimLabel: true },
                off.stcl_vs_ltcg > 0
                    ? { label: "Residual STCL → offsets LTCG", val: off.stcl_vs_ltcg, color: "#f97316", negative: false, dimLabel: true, isSeparator: false }
                    : null,
            ].filter(Boolean), "Net STCG (Taxable)", off.net_stcg);

            const ltcgCol = buildOffsetColumn("Long-Term Capital Gains", [
                { label: "Gross LTCG",                val: off.gross_ltcg, color: "var(--success)", alwaysShow: true },
                { label: "LTCL set off vs LTCG",      val: off.ltcl_vs_ltcg, color: "var(--danger)", negative: true, prefix: "−", prefixColor: "var(--danger)", dimLabel: true },
                off.stcl_vs_ltcg > 0
                    ? { label: "Residual STCL set off vs LTCG", val: off.stcl_vs_ltcg, color: "#f97316", negative: true, prefix: "−", prefixColor: "#f97316", dimLabel: true }
                    : null,
            ].filter(Boolean), "Net LTCG (Taxable)", off.net_ltcg);

            offCard.appendChild(stcgCol);
            offCard.appendChild(ltcgCol);

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

// ===== FY Year Selector =====
export function initFYYearSelector() {
    const select = document.getElementById("fyYearSelect");
    if (!select) return;
    select.innerHTML = "";
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
export async function fetchConsolidatedTaxSummary() {
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

export function renderConsolidatedTaxSummary(data) {
    const container = document.getElementById("consolidatedFYBlocks");
    container.innerHTML = "";

    const sourceDiv = document.createElement("div");
    sourceDiv.style.cssText = "margin-bottom:16px;";
    sourceDiv.innerHTML = `
        <span class="fy-source-note ${data.has_cy_start ? 'available' : 'missing'}">${data.has_cy_start ? '✓' : '⚠'} CY${data.fy_start_year} ${data.has_cy_start ? 'loaded' : 'missing (treated as 0)'}</span>
        <span class="fy-source-note ${data.has_cy_end ? 'available' : 'missing'}">${data.has_cy_end ? '✓' : '⚠'} CY${data.fy_end_year} ${data.has_cy_end ? 'loaded' : 'missing (treated as 0)'}</span>
    `;
    container.appendChild(sourceDiv);

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
        });
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    block.appendChild(wrapper);

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

// ===== Cross-Link Jump Helpers =====
export function jumpToSbiRate(rateDate) {
    const section = document.getElementById("sbiRatesSection");
    if (!section || section.classList.contains("hidden")) return;
    
    const content = document.getElementById("sbiRatesContent");
    if (content && content.classList.contains("collapsed")) {
        toggleSection('sbiRatesContent');
    }
    
    const rows = document.querySelectorAll("#sbiRatesTableBody tr[data-rate-date]");
    let targetRow = null;
    for (const row of rows) {
        if (row.dataset.rateDate === rateDate) {
            targetRow = row;
            break;
        }
    }
    
    if (targetRow) {
        const header = document.getElementById("appHeader");
        const headerHeight = header ? header.offsetHeight : 0;
        const top = targetRow.getBoundingClientRect().top + window.scrollY - headerHeight - 120;
        window.scrollTo({ top, behavior: "smooth" });
        
        targetRow.classList.add("highlight-pulse");
        setTimeout(() => targetRow.classList.remove("highlight-pulse"), 2000);
    }
}

export function jumpToStockSection(ticker, sectionClass, targetId) {
    const cards = document.querySelectorAll(".stock-card");
    let targetCard = null;

    if (!ticker) {
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

    const body = targetCard.querySelector(".stock-card-body");
    if (body && !body.classList.contains("expanded")) {
        const toggleBtn = targetCard.querySelector(".toggle-details-btn");
        if (toggleBtn) toggleBtn.click();
    }

    const targetSection = targetCard.querySelector(`.${sectionClass}`);
    let scrollTarget = targetSection || targetCard;
    let highlightTarget = targetSection || targetCard;

    if (targetId) {
        const row = targetCard.querySelector(`tr[data-lot-id="${targetId}"], tr[data-div-id="${targetId}"], tr[data-sell-id="${targetId}"]`);
        if (row) {
            scrollTarget = row;
            highlightTarget = row;
        }
    }

    const header = document.getElementById("appHeader");
    const headerHeight = header ? header.offsetHeight : 0;
    const top = scrollTarget.getBoundingClientRect().top + window.scrollY - headerHeight - 120;
    window.scrollTo({ top, behavior: "smooth" });

    highlightTarget.classList.add("highlight-pulse");
    setTimeout(() => highlightTarget.classList.remove("highlight-pulse"), 2000);
}

export function jumpToSection(sectionId, targetSelector = null) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    section.classList.remove("hidden");

    const content = section.querySelector(".collapsible-content");
    if (content && content.classList.contains("collapsed")) {
        toggleSection(content.id);
    }

    let target = section;
    if (targetSelector) {
        const found = section.querySelector(targetSelector);
        if (found) target = found;
    }

    const header = document.getElementById("appHeader");
    const headerHeight = header ? header.offsetHeight : 0;
    const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 120;
    window.scrollTo({ top, behavior: "smooth" });

    target.classList.add("highlight-pulse");
    setTimeout(() => target.classList.remove("highlight-pulse"), 2000);
}

export function clearSbiOverrides() {
    if (!confirm("Are you sure you want to clear all manual SBI TT rate overrides? This will revert them to auto-fetched values.")) return;
    
    pushUndoSnapshot("Clear SBI Overrides");
    state.portfolio.sbi_rate_overrides = {};
    // Also clear calculated overrides as they likely depend on rates
    state.portfolio.overrides = {}; 
    
    markDirty();
    showToast("SBI TT overrides cleared", "success");
    
    // Refresh UI
    if (state.calculatedRows && state.calculatedRows.length > 0) {
        if (typeof window.calculateAll === "function") {
            window.calculateAll();
        } else {
            console.warn("calculateAll not found on window");
        }
    } else {
        dispatchStateChange("portfolio-restored");
        dispatchStateChange("clear-calculated");
    }
}
