import { state, pushUndoSnapshot, markDirty, dispatchStateChange } from '../state.js';
import { apiGet, apiPost } from '../api.js';
import { formatINR, formatAppDate, parseAppDate } from '../utils.js';
import {
    showToast, showLoading, hideLoading, toggleSection,
    showCalcTooltip, hideCalcTooltip, buildTooltipHTML, mapCalcDetailsToTooltip,
    saveFileRobustly, showConfirm, showSectionIfVisible
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
            { key: "initial_value", val: row.initial_value, detailKey: "initial" },
            { key: "peak_value", val: row.peak_value, detailKey: "peak" },
            { key: "closing_balance", val: row.closing_balance, detailKey: "closing" },
            { key: "total_dividends", val: row.total_dividends, detailKey: "dividends" },
            { key: "sale_proceeds", val: row.sale_proceeds, detailKey: "sales" },
        ];

        numFields.forEach(field => {
            const td = document.createElement("td");
            td.className = "editable-cell";
            if (row.is_overridden && row.is_overridden[field.key]) {
                td.classList.add("overridden");
            }
            
            const detail = row.calculation_details?.[field.detailKey];
            if (detail?.is_lookback) {
                td.classList.add("lookback-warning-cell");
            }
            if (detail?.error) {
                td.classList.add("error-cell");
            }
            
            const val = field.val != null ? Math.round(field.val) : 0;
            const textVal = val > 0 ? formatINR(val) : "0";
            
            const warningIcon = detail?.is_lookback ? `<span class="lookback-icon" title="Lookback rate used for this calculation">⚠</span>` : "";
            const errorIcon = detail?.error ? `<span class="error-icon" title="${detail.error}">✖</span>` : "";
            
            td.innerHTML = `<span class="val-link">${textVal}</span>${warningIcon}${errorIcon}<span class="edit-icon" title="Click to manually override value">${EDIT_PENCIL_SVG}</span>`;
            
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

    showSectionIfVisible("resultsSection");
    document.getElementById("resultsContent").classList.remove("collapsed");

    // Also render validation tables
    renderValidationTable(rows);
    renderPeakValidationTable(rows);
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
    showSectionIfVisible(section.id);

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
                const peakPriceStr = c.peak_price != null ? c.peak_price.toFixed(2) : "0.00";
                const mathText = `(${c.qty_on_peak_date}×$${peakPriceStr})`;
                const peakDateDisplay = formatAppDate(parseAppDate(col.detail.peak_date));
                const peakDateLink = `<span class="validate-crosslink" data-jump-peak-lot="${lotId}" title="Jump to peak validation for this lot">Peak: ${peakDateDisplay}</span>`;
                breakdown = `<div class="b-math" style="font-size:0.65rem;opacity:0.7;">${peakDateLink}</div>
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
            td.querySelectorAll(".validate-crosslink[data-jump-peak-lot]").forEach(el => {
                el.addEventListener("click", (e) => {
                    e.stopPropagation();
                    jumpToPeakValidation(el.dataset.jumpPeakLot, el, `A3 Row ${row.sl_no}`);
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

// ===== Render Peak Validation Table =====
export function renderPeakValidationTable(rows) {
    const tbody = document.getElementById("validatePeakTableBody");
    const section = document.getElementById("validatePeakSection");
    if (!tbody || !section) return;

    tbody.innerHTML = "";

    let hasAnyData = false;

    rows.forEach(row => {
        const details = row.calculation_details || {};
        const peak = details.peak;
        if (!peak || !peak.top_candidates || peak.top_candidates.length === 0) return;

        hasAnyData = true;
        const ticker = row.ticker;
        const lotId = row.lot_id;

        peak.top_candidates.forEach((candidate, idx) => {
            const isWinner = idx === 0;
            const tr = document.createElement("tr");
            tr.id = isWinner ? `val-peak-${lotId}` : `val-peak-${lotId}-${idx}`;
            tr.className = isWinner ? "peak-winner-row" : "peak-runner-row";
            if (isWinner) tr.dataset.lotId = lotId;

            const dateDisplay = formatAppDate(parseAppDate(candidate.date));
            const rateDateDisplay = candidate.rate_date ? formatAppDate(parseAppDate(candidate.rate_date)) : '—';

            // Cross-link: rate links to SBI Rates section
            const rateLinkHtml = rateLink(candidate.ttbr, candidate.rate_date);

            // Cross-link: ticker/lot links to stock card
            const tickerLinkHtml = isWinner
                ? `<span class="validate-crosslink" data-jump-stock="${ticker}" data-jump-section="lots-section" data-jump-id="${lotId}" title="Jump to lot in ${ticker}"><strong>${ticker}</strong></span>`
                : `<span style="opacity:0.5;">↳</span>`;

            // Rate date cross-links to SBI Rates section
            const rateDateLinkHtml = candidate.rate_date
                ? `<span class="validate-crosslink" data-jump-rate="${candidate.rate_date}" title="Jump to SBI rate for ${rateDateDisplay}">${rateDateDisplay}</span>`
                : '—';

            // Source badge
            let sourceBadge = '';
            if (candidate.source === 'override') {
                sourceBadge = '<span class="rate-status override">override</span>';
            } else if (candidate.source === 'rbi') {
                sourceBadge = '<span class="rate-status rbi">RBI</span>';
            } else {
                sourceBadge = '<span class="rate-status cached">SBI TT</span>';
            }

            // Lookback warning
            let lookbackBadge = '';
            if (candidate.is_lookback) {
                lookbackBadge = ' <span class="rate-status warning" title="Lookback rate used">lookback</span>';
            }

            // Status column
            let statusHtml = '';
            if (isWinner) {
                statusHtml = '<span style="color:var(--accent); font-weight:700;">★ Peak</span>';
            } else {
                const diff = peak.top_candidates[0].value_inr - candidate.value_inr;
                statusHtml = `<span style="color:var(--text-muted); font-size:0.8rem;">-₹${formatINR(diff)}</span>`;
            }

            tr.innerHTML = `
                <td>${isWinner ? row.sl_no : ''}</td>
                <td>${tickerLinkHtml}</td>
                <td style="text-align:center; font-weight:${isWinner ? '700' : '400'};">#${idx + 1}</td>
                <td>${dateDisplay}</td>
                <td style="text-align:right;">$${candidate.close_price.toFixed(2)}</td>
                <td style="text-align:right;">${candidate.qty}</td>
                <td style="text-align:right;">${rateLinkHtml}</td>
                <td>${rateDateLinkHtml}</td>
                <td style="text-align:right; font-weight:${isWinner ? '700' : '400'};">₹${formatINR(candidate.value_inr)}</td>
                <td>${statusHtml}${sourceBadge}${lookbackBadge}</td>
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
    });

    if (hasAnyData) {
        showSectionIfVisible(section.id);
    } else {
        section.classList.add("hidden");
    }
}

/** Jump to a specific lot's peak validation row */
export function jumpToPeakValidation(lotId, sourceEl = null, label = "") {
    const section = document.getElementById("validatePeakSection");
    if (!section || section.classList.contains("hidden")) return;

    // Ensure content is expanded
    const content = document.getElementById("validatePeakContent");
    if (content && content.classList.contains("collapsed")) {
        toggleSection('validatePeakContent');
    }

    const targetId = `val-peak-${lotId}`;
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
    showSectionIfVisible(section.id);

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
export function updateSbiModeHints() {
    // Update Editor hint text based on mode
    const editorHint = document.querySelector("#monthlyRatesSection .hint");
    if (editorHint) {
        if (state.sbi_tt_mode === 'split') {
            editorHint.innerHTML = `Manage the database of daily SBI TT buying rates from year 2010. <strong>A3 calculations</strong> use the rate on date of event, with a fallback window extending back to the last 5 days of the preceding month. <strong>Tax calculations</strong> use the rate of the last working day of the preceding month.`;
        } else {
            editorHint.innerHTML = `Manage the database of daily SBI TT buying rates from year 2010. In Uniform mode, <strong>all calculations (A3 and Tax)</strong> use the SBI TT buying rate of the last working day of the preceding month.`;
        }
    }

    // Update Section hint text based on mode
    const sectionHint = document.querySelector("#sbiRatesSection .hint");
    if (sectionHint) {
        if (state.sbi_tt_mode === 'split') {
            sectionHint.innerHTML = `These are the specific SBI TT Buying rates applied to each calculation step. A3 columns use event-date rates (with lookback), while Tax Summary columns use preceding month-end rates.`;
        } else {
            sectionHint.innerHTML = `In Uniform mode, all calculations (A3 and Tax) use the SBI TT Buying rate of the last working day of the preceding month.`;
        }
    }
}

export async function collectSbiRates(rows, taxYears = null) {
    updateSbiModeHints();

    if (taxYears) {
        state.lastTaxYears = taxYears;
    }
    const tbody = document.getElementById("sbiRatesTableBody");
    if (!tbody) return;
    
    // Fetch fresh rate cache to ensure UI is in sync with latest manual edits
    let freshRates = { rates: { USD: {} }, manual_USD: [] };
    try {
        const res = await apiGet("/api/get-all-rates");
        if (res.success) freshRates = res;
    } catch (e) {
        console.warn("Failed to fetch fresh rates for UI sync:", e);
    }
    const manualSet = new Set(freshRates.manual_USD || []);
    const usdCache = freshRates.rates?.USD || {};

    tbody.innerHTML = "";
    const seenRates = new Set();
    const allEntries = [];

    // 1. From A3 Rows (result.rows)
    if (rows) {
        rows.forEach(row => {
            const details = row.calculation_details || {};
            const ticker = row.ticker || row.entity_name || '';
            const a3Cols = [
                { label: `${ticker} — Buy (${formatAppDate(parseAppDate(row.acquire_date))})`, data: details.initial, field: 'initial_value', eventDate: row.acquire_date_raw || row.acquire_date },
                { label: `${ticker} — Peak Value (${details.peak && details.peak.peak_date ? formatAppDate(parseAppDate(details.peak.peak_date)) : '?'})`, data: details.peak, field: 'peak_value', eventDate: details.peak?.peak_date },
                { label: `${ticker} — Closing (Dec 31)`, data: details.closing, field: 'closing_balance', eventDate: details.closing?.components?.event_date || `${state.portfolio.calendar_year}-12-31` },
            ];
            a3Cols.forEach(entry => {
                if (!entry.data) return;
                const rateDate = entry.data.rate_date || (entry.data.components && entry.data.components.rate_date);
                if (rateDate) {
                    // Look up fresh value and source
                    const freshRate = usdCache[rateDate];
                    const isManual = manualSet.has(rateDate);
                    
                    allEntries.push({
                        label: entry.label,
                        rate: freshRate || entry.data.rate || entry.data.ttbr || (entry.data.components && entry.data.components.ttbr),
                        rateDate,
                        eventDate: entry.eventDate,
                        source: isManual ? "override" : (entry.data.source || "cache"),
                        is_lookback: entry.data.is_lookback,
                        origin: { section: 'resultsSection', selector: `tr[data-lot-id="${row.lot_id}"]` }
                    });
                }
            });
            if (details.dividends && details.dividends.dividend_entries) {
                details.dividends.dividend_entries.forEach(de => {
                    const payDate = de.payment_date || de.ex_date;
                    const rateDate = de.rate_date;
                    if (rateDate) {
                        const isManual = manualSet.has(rateDate);
                        allEntries.push({
                            label: `${ticker} — Dividend A3 (${formatAppDate(parseAppDate(payDate))})`,
                            rate: usdCache[rateDate] || de.ttbr,
                            rateDate,
                            eventDate: payDate,
                            source: isManual ? "override" : (de.source || "cache"),
                            is_lookback: de.is_lookback,
                            origin: { section: 'resultsSection', selector: `tr[data-lot-id="${row.lot_id}"]` }
                        });
                    }
                });
            }
            if (details.sales && details.sales.sale_entries) {
                details.sales.sale_entries.forEach(se => {
                    const rateDate = se.rate_date;
                    if (rateDate) {
                        const isManual = manualSet.has(rateDate);
                        allEntries.push({
                            label: `${ticker} — Sale A3 (${formatAppDate(parseAppDate(se.sell_date))})`,
                            rate: usdCache[rateDate] || se.ttbr,
                            rateDate,
                            eventDate: se.sell_date,
                            source: isManual ? "override" : (se.source || "cache"),
                            is_lookback: se.is_lookback,
                            origin: { section: 'resultsSection', selector: `tr[data-lot-id="${row.lot_id}"]` }
                        });
                    }
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
                                const rateDate = d.rate_date;
                                if (rateDate) {
                                    const isManual = manualSet.has(rateDate);
                                    allEntries.push({
                                        label: `${ticker} — Dividend Tax (${formatAppDate(parseAppDate(d.date))})`,
                                        rate: usdCache[rateDate] || d.ttbr,
                                        rateDate,
                                        eventDate: d.date,
                                        source: isManual ? "override" : (d.source || "cache"),
                                        origin: { section: 'taxYearSection', selector: `tr[data-ticker="${ticker}"]` }
                                    });
                                }
                            } else {
                                if (d.sell_ttbr && d.sell_rate_date) {
                                    const sellSource = d.sell_source || d.source || "cache";
                                    const isManual = manualSet.has(d.sell_rate_date) || sellSource === 'override';
                                    allEntries.push({
                                        label: `${ticker} — Sale Tax (${formatAppDate(parseAppDate(d.date))})`,
                                        rate: usdCache[d.sell_rate_date] || d.sell_ttbr,
                                        rateDate: d.sell_rate_date,
                                        eventDate: d.date,
                                        source: isManual ? "override" : sellSource,
                                        is_lookback: d.sell_is_lookback,
                                        origin: { section: 'taxYearSection', selector: `tr[data-ticker="${ticker}"]` }
                                    });
                                }
                                if (d.buy_ttbr && d.buy_rate_date) {
                                    const buySource = d.buy_source || d.source || "cache";
                                    const isManual = manualSet.has(d.buy_rate_date) || buySource === 'override';
                                    allEntries.push({
                                        label: `${ticker} — Buy Tax (Lot ${formatAppDate(parseAppDate(d.buy_date || d.buy_rate_date))})`,
                                        rate: usdCache[d.buy_rate_date] || d.buy_ttbr,
                                        rateDate: d.buy_rate_date,
                                        eventDate: d.buy_date || d.date,
                                        source: isManual ? "override" : buySource,
                                        is_lookback: d.buy_is_lookback,
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
        const { label, rate, rateDate, source, eventDate } = entry;
        if (!rateDate) return;
        const key = `${label}_${rateDate}`;
        if (seenRates.has(key)) return;
        seenRates.add(key);
        state.sbiRatesUsed.push(entry);

        const isTax = label.includes("Tax");
        const isManual = source === 'override';
        const isRBI = source === 'rbi';
        const isMissing = !rate;
        // Only show lookback if backend says so AND we are in split mode AND it's not a tax entry
        const isLookback = !isTax && (state.sbi_tt_mode === 'split' && entry.is_lookback);
        
        let badgesHtml = "";
        let highlightStyle = "";
        let warningSuffix = "";

        if (isMissing) {
            badgesHtml += `<span class="rate-status missing">missing</span>`;
            highlightStyle = "background: rgba(239, 68, 68, 0.08); border-left: 3px solid var(--danger);";
        } else if (isManual) {
            badgesHtml += `<span class="rate-status override">override</span>`;
        } else if (isRBI) {
            badgesHtml += `<span class="rate-status rbi">RBI Rate</span>`;
        } else {
            badgesHtml += `<span class="rate-status cached">SBI TT</span>`;
        }

        if (isLookback && !isMissing) {
            highlightStyle = "background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b;";
            if (eventDate) {
                const ev = parseAppDate(eventDate);
                const rt = parseAppDate(rateDate);
                if (ev && rt) {
                    const diffTime = Math.abs(ev - rt);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    warningSuffix = ` (${diffDays}d)`;
                }
            }
            badgesHtml += `<span class="rate-status warning" title="Rate lookup fell back to nearest date older than event date">lookback${warningSuffix}</span>`;
        }
        
        const tr = document.createElement("tr");
        tr.dataset.rateDate = rateDate;
        if (highlightStyle) {
            tr.setAttribute("style", highlightStyle);
        }
        tr.innerHTML = `
            <td style="display:flex; justify-content:space-between; align-items:center;">
                <span>${label}</span>
                ${entry.origin ? `<button class="btn-link jump-back-btn" title="Jump to where this was used" style="padding:2px 6px; font-size:0.9rem;">↗</button>` : ''}
            </td>
            <td>${formatAppDate(parseAppDate(rateDate))}</td>
            <td class="editable-rate" data-date="${rateDate}" title="Click to edit rate">
                <span class="rate-val">${rate ? '₹' + rate.toFixed(4) : '<span style="color:var(--danger); font-weight:700;">Missing</span>'}</span>
                <span class="edit-icon"> ${EDIT_PENCIL_SVG}</span>
            </td>
            <td style="display: flex; align-items: center; gap: 8px;">
                ${badgesHtml}
            </td>
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
                            showToast(`Saved rate for ${rateDate}: ₹${newVal}`, "success");
                            
                            // Reload calendar rates if it is visible to sync 'override' status
                            const ratesSection = document.getElementById("monthlyRatesSection");
                            if (ratesSection && !ratesSection.classList.contains("hidden")) {
                                if (typeof loadMonthlyRates === "function") {
                                    await loadMonthlyRates();
                                }
                            }

                            // Refresh this table too (to update the 'source' badge etc)
                            // We can use state.calculatedRows if available
                            if (state.calculatedRows) {
                                await collectSbiRates(state.calculatedRows, state.lastTaxYears);
                            }
                        } else {
                            showToast("Failed to save rate: " + data.error, "error");
                            rateCell.innerHTML = originalContent;
                        }
                    } catch (err) {
                        showToast("Error saving rate: " + err, "error");
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

// ===== SBI TT Rates Calendar Editor =====
export async function showMonthlyRates() {
    const section = document.getElementById("monthlyRatesSection");
    if (!section.classList.contains("hidden")) {
        section.classList.add("hidden");
        return;
    }
    section.classList.remove("hidden");

    // Initialize Year and Month Select elements if not already done
    const yearSelect = document.getElementById("ratesYearSelect");
    const monthSelect = document.getElementById("ratesMonthSelect");

    if (yearSelect && yearSelect.options.length === 0) {
        // Populate years 2010 to current year
        const currentYear = new Date().getFullYear();
        yearSelect.innerHTML = "";
        for (let y = currentYear; y >= 2010; y--) {
            const opt = document.createElement("option");
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        }

        // Default to active year
        yearSelect.value = state.portfolio.calendar_year || currentYear;

        // Default month to current month (or January)
        monthSelect.value = new Date().getMonth() + 1;

        // Listeners for changes to trigger reloading
        yearSelect.addEventListener("change", () => loadMonthlyRates());
        monthSelect.addEventListener("change", () => loadMonthlyRates());
    }

    await loadMonthlyRates();
    section.scrollIntoView({ behavior: "smooth" });
}

export async function loadMonthlyRates() {
    const yearSelect = document.getElementById("ratesYearSelect");
    const monthSelect = document.getElementById("ratesMonthSelect");
    if (!yearSelect || !monthSelect) return;

    const year = parseInt(yearSelect.value);
    const month = parseInt(monthSelect.value);
    const grid = document.getElementById("calendarDaysGrid");
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted);">Loading calendar rates...</div>';

    try {
        const data = await apiGet(`/api/daily-rates?year=${year}&month=${month}`);
        grid.innerHTML = "";

        if (!data.success) {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--danger);">Error loading rates</div>';
            return;
        }



        // Generate calendar days
        // Get weekday of the 1st day of the month (0 = Sunday, ..., 6 = Saturday)
        const firstDay = new Date(year, month - 1, 1);
        const startDayOfWeek = firstDay.getDay(); // 0-6

        // Get total days in this month
        const totalDays = new Date(year, month, 0).getDate();

        // Render padding cells for empty days before the 1st of the month
        for (let i = 0; i < startDayOfWeek; i++) {
            const cell = document.createElement("div");
            cell.className = "calendar-day empty-day";
            cell.innerHTML = '<div class="calendar-day-num"></div>';
            grid.appendChild(cell);
        }

        // Render each day of the month
        for (let day = 1; day <= totalDays; day++) {
            const d = new Date(year, month - 1, day);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;

            // Format to YYYY-MM-DD
            const yyyy = year;
            const mm = String(month).padStart(2, "0");
            const dd = String(day).padStart(2, "0");
            const dateStr = `${yyyy}-${mm}-${dd}`;

            const rInfo = data.rates[dateStr] || { rate: null, source: "not_found" };

            const cell = document.createElement("div");
            cell.className = `calendar-day${isWeekend ? ' weekend-day' : ''}`;
            cell.dataset.date = dateStr;

            const hasRate = rInfo.rate !== null;
            const rateText = hasRate ? `₹${rInfo.rate.toFixed(2)}` : "—";
            
            // Normalize source for display: shipped/cache -> cached (Green), override -> override (Yellow), rbi -> rbi (Yellow)
            let statusLabel = rInfo.source === "not_found" ? "missing" : rInfo.source;
            let displayLabel = statusLabel;
            if (statusLabel === "shipped" || statusLabel === "cache") {
                statusLabel = "cached";
                displayLabel = "SBI TT";
            } else if (statusLabel === "rbi") {
                statusLabel = "rbi";
                displayLabel = "RBI Rate";
            } else if (statusLabel === "override") {
                displayLabel = "override";
            }
            const isLocked = data.locked;

            cell.innerHTML = `
                <div class="calendar-day-num">${day}</div>
                <div class="calendar-day-rate-container">
                    <div class="calendar-day-rate">${rateText}</div>
                    <span class="calendar-day-status ${statusLabel}">${displayLabel}</span>
                </div>
            `;

            // Edit listener if not locked
            if (!isLocked) {
                cell.addEventListener("click", () => {
                    if (cell.querySelector("input")) return; // Already editing

                    const container = cell.querySelector(".calendar-day-rate-container");
                    const originalHTML = container.innerHTML;

                    const input = document.createElement("input");
                    input.type = "number";
                    input.className = "calendar-day-editor-input";
                    input.step = "0.01";
                    input.value = rInfo.rate !== null ? rInfo.rate : "";
                    input.placeholder = "0.00";

                    container.innerHTML = "";
                    container.appendChild(input);
                    input.focus();
                    input.select();

                    let finished = false;
                    const save = async () => {
                        if (finished) return;
                        finished = true;

                        const newVal = parseFloat(input.value);
                        if (!isNaN(newVal) && newVal > 0 && newVal !== rInfo.rate) {
                            try {
                                const saveRes = await apiPost("/api/save-manual-rate", { rate_date: dateStr, rate: newVal });
                                if (saveRes.success) {
                                    showToast(`Saved rate for ${dateStr}: ₹${newVal}`, "success");

                                    // Trigger a full calendar reload to get correct status labels (cache vs override)
                                    // since we don't know the baseline here
                                    await loadMonthlyRates();
                                    
                                    cell.classList.add("rate-updated");
                                    setTimeout(() => cell.classList.remove("rate-updated"), 800);
                                } else {
                                    showToast("Failed to save rate: " + saveRes.error, "error");
                                    container.innerHTML = originalHTML;
                                }
                            } catch (err) {
                                showToast("Error saving rate: " + err.message, "error");
                                container.innerHTML = originalHTML;
                            }
                        } else {
                            container.innerHTML = originalHTML;
                        }
                    };

                    input.addEventListener("blur", save);
                    input.addEventListener("keypress", (e) => { if (e.key === "Enter") input.blur(); });
                    input.addEventListener("keydown", (e) => {
                        if (e.key === "Escape") {
                            finished = true;
                            container.innerHTML = originalHTML;
                        }
                    });
                });
            }

            grid.appendChild(cell);
        }

        // Fill ending cells of last week with empty padding
        const totalCells = startDayOfWeek + totalDays;
        const remainingPadding = (7 - (totalCells % 7)) % 7;
        for (let i = 0; i < remainingPadding; i++) {
            const cell = document.createElement("div");
            cell.className = "calendar-day empty-day";
            cell.innerHTML = '<div class="calendar-day-num"></div>';
            grid.appendChild(cell);
        }

    } catch (e) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--danger);">Error: ${e.message}</div>`;
    }
}



// ===== ITR Tax Year Capital Gains & Dividend Summary =====
export async function fetchTaxYearSummary() {
    try {
        const payload = { ...state.portfolio, sbi_tt_mode: state.sbi_tt_mode };
        const result = await apiPost("/api/tax-year-summary", payload);
        if (result.success && result.tax_years) {
            if (result.errors && result.errors.length > 0) {
                result.errors.forEach(err => showToast(err, "error"));
                
                // Abort rendering tables
                await collectSbiRates(state.calculatedRows, result.tax_years);
                document.getElementById("sbiRatesSection").classList.remove("hidden");
                
                const ratesEditor = document.getElementById("monthlyRatesSection");
                ratesEditor.classList.remove("hidden");
                ratesEditor.scrollIntoView({ behavior: "smooth" });
                
                return showToast("Tax Summary blocked due to missing SBI rates. Please check the Rates Editor.", "warning");
            }
            state.taxYears = result.tax_years;
            renderTaxYearSummary(result.tax_years);
            renderTaxValidationTable(result.tax_years);
            await collectSbiRates(state.calculatedRows, result.tax_years);
            showSectionIfVisible("taxYearSection");
        } else {
            console.warn("Tax year summary failed:", result.error);
        }
    } catch (e) {
        console.warn("Failed to fetch tax year summary:", e);
    }
}

/**
 * Render the Estimated Advance Tax Installment Schedule section.
 * Shows the 15/45/75/100% cumulative advance tax schedule on net capital gains.
 *
 * @param {HTMLElement} block - Container element to append the section into.
 * @param {Object} offset - The offset object containing net_stcg_quarters & net_ltcg_quarters.
 * @param {string} sectionNum - Section number label (e.g. "③" or empty).
 * @param {Function|null} makeCopyBtnFn - Optional copy-button factory. If null, no copy buttons.
 */
function renderAdvanceTaxSchedule(block, offset, sectionNum, makeCopyBtnFn) {
    if (!offset || !offset.net_stcg_quarters || !offset.net_ltcg_quarters) return;

    const stcgQ = offset.net_stcg_quarters;
    const ltcgQ = offset.net_ltcg_quarters;

    // Check if there are any taxable gains at all (Q1-Q5)
    const quarterKeys = ["q1", "q2", "q3", "q4", "q5"];
    const hasAnyGains = quarterKeys.some(q => (stcgQ[q] || 0) > 0 || (ltcgQ[q] || 0) > 0);
    if (!hasAnyGains) return;

    // Section header
    const secHeader = document.createElement("div");
    secHeader.style.cssText = "font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin:24px 0 10px;padding:0 4px;";
    secHeader.textContent = (sectionNum ? sectionNum + " " : "") + "Estimated Advance Tax Installment Schedule (§234B/234C)";
    block.appendChild(secHeader);

    // Container card
    const card = document.createElement("div");
    card.style.cssText = "background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:20px 24px;margin-bottom:16px;";

    // Info note
    const infoNote = document.createElement("div");
    infoNote.style.cssText = "font-size:0.76rem;color:var(--text-muted);line-height:1.5;margin-bottom:14px;padding:10px 12px;border-radius:7px;background:var(--bg-card);border:1px solid var(--border);";
    infoNote.innerHTML = `<strong style="color:var(--accent);">ℹ Note:</strong> Advance tax on capital gains follows the standard 15/45/75/100% cumulative schedule. Per <strong>proviso to §234C</strong>, shortfalls in earlier quarters due to unpredictable capital gains won't attract interest if the tax is paid in the remaining installments. Amounts shown are <strong>base tax only</strong> (excluding surcharge & cess), and LTCG is fixed at 12.5%.`;
    card.appendChild(infoNote);

    // Table container
    const tableContainer = document.createElement("div");
    tableContainer.style.cssText = "overflow-x:auto;";
    card.appendChild(tableContainer);

    const slabInput = document.getElementById("taxSlabRateInput");

    const redrawTable = () => {
        const slabRate = parseFloat(slabInput.value || "30") || 0;
        const ltcgRate = 12.5;

        const installments = [
            { key: "q1", label: "Q1", dates: "Up to 15/6", dueDate: "15 Jun", pct: 15 },
            { key: "q2", label: "Q2", dates: "16/6 – 15/9", dueDate: "15 Sep", pct: 45 },
            { key: "q3", label: "Q3", dates: "16/9 – 15/12", dueDate: "15 Dec", pct: 75 },
            { key: "q4", label: "Q4", dates: "16/12 – 15/3", dueDate: "15 Mar", pct: 100 },
        ];

        // Compute per-quarter gains and total (Q1-Q4 only for advance tax)
        let totalStcg = 0, totalLtcg = 0;
        installments.forEach(inst => {
            totalStcg += (stcgQ[inst.key] || 0);
            totalLtcg += (ltcgQ[inst.key] || 0);
        });

        const totalStcgTax = Math.round(totalStcg * (slabRate / 100));
        const totalLtcgTax = Math.round(totalLtcg * (ltcgRate / 100));
        const totalAdvanceTax = totalStcgTax + totalLtcgTax;

        // Q5 separately
        const q5Stcg = stcgQ["q5"] || 0;
        const q5Ltcg = ltcgQ["q5"] || 0;
        const q5StcgTax = Math.round(q5Stcg * (slabRate / 100));
        const q5LtcgTax = Math.round(q5Ltcg * (ltcgRate / 100));
        const q5Tax = q5StcgTax + q5LtcgTax;

        const grandTotalTax = totalAdvanceTax + q5Tax;

        // Build copy button HTML
        const copyBtn = (val) => {
            if (!makeCopyBtnFn || val === 0) return "";
            return `<button type="button" class="adv-tax-copy-btn" data-value="${Math.round(val)}" title="Copy ${Math.round(val)}" style="background:none;border:none;cursor:pointer;padding:2px;margin-left:4px;opacity:0.4;transition:opacity 0.15s;vertical-align:middle;line-height:1;display:inline-flex;align-items:center;">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>`;
        };

        const thStyle = `padding:8px 10px;background:var(--bg-card);color:var(--text-muted);font-weight:600;font-size:0.74rem;border-bottom:2px solid var(--border);white-space:nowrap;`;
        const tdStyle = `padding:8px 10px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums;white-space:nowrap;`;
        const tdRight = `${tdStyle}text-align:right;`;
        const tdCenter = `${tdStyle}text-align:center;`;

        const fmtVal = (v) => v > 0 ? "₹" + formatINR(v) : "—";
        const fmtTax = (v) => v > 0 ? "₹" + formatINR(v) : "₹0";

        let html = `<table style="width:100%;border-collapse:collapse;font-size:0.84rem;">
            <thead>
                <tr>
                    <th style="${thStyle}text-align:left;">Installment</th>
                    <th style="${thStyle}text-align:center;">Due Date</th>
                    <th style="${thStyle}text-align:right;">Net STCG (Qtr)</th>
                    <th style="${thStyle}text-align:right;">Net LTCG (Qtr)</th>
                    <th style="${thStyle}text-align:right;">STCG Tax (Qtr)</th>
                    <th style="${thStyle}text-align:right;">LTCG Tax (Qtr)</th>
                    <th style="${thStyle}text-align:center;">Cumul. %</th>
                    <th style="${thStyle}text-align:right;color:var(--accent);font-weight:700;">Advance Tax Due</th>
                </tr>
            </thead>
            <tbody>`;

        installments.forEach(inst => {
            const qStcg = stcgQ[inst.key] || 0;
            const qLtcg = ltcgQ[inst.key] || 0;
            const qStcgTax = Math.round(qStcg * (slabRate / 100));
            const qLtcgTax = Math.round(qLtcg * (ltcgRate / 100));
            const advTaxDue = Math.round(totalAdvanceTax * (inst.pct / 100));

            html += `<tr>
                <td style="${tdStyle}font-weight:600;color:var(--text-main);">${inst.label} <span style="font-size:0.72rem;color:var(--text-muted);font-weight:normal;">(${inst.dates})</span></td>
                <td style="${tdCenter}font-weight:600;">${inst.dueDate}</td>
                <td style="${tdRight}color:${qStcg > 0 ? '#22c55e' : 'var(--text-muted)'};">${fmtVal(qStcg)}</td>
                <td style="${tdRight}color:${qLtcg > 0 ? '#10b981' : 'var(--text-muted)'};">${fmtVal(qLtcg)}</td>
                <td style="${tdRight}color:${qStcgTax > 0 ? '#22c55e' : 'var(--text-muted)'};">${fmtTax(qStcgTax)}</td>
                <td style="${tdRight}color:${qLtcgTax > 0 ? '#10b981' : 'var(--text-muted)'};">${fmtTax(qLtcgTax)}</td>
                <td style="${tdCenter}font-weight:700;color:var(--accent);">${inst.pct}%</td>
                <td style="${tdRight}font-weight:700;color:var(--text-main);">${fmtTax(advTaxDue)}${copyBtn(advTaxDue)}</td>
            </tr>`;
        });

        // Q5 row (self-assessment) — amber styled
        if (q5Stcg > 0 || q5Ltcg > 0) {
            html += `<tr style="background:#f9731612;">
                <td style="${tdStyle}font-weight:600;color:#f97316;">Q5 <span style="font-size:0.72rem;font-weight:normal;">(16/3 – 31/3)</span></td>
                <td style="${tdCenter}font-weight:600;color:#f97316;">31 Mar</td>
                <td style="${tdRight}color:${q5Stcg > 0 ? '#22c55e' : 'var(--text-muted)'};">${fmtVal(q5Stcg)}</td>
                <td style="${tdRight}color:${q5Ltcg > 0 ? '#10b981' : 'var(--text-muted)'};">${fmtVal(q5Ltcg)}</td>
                <td style="${tdRight}color:${q5StcgTax > 0 ? '#22c55e' : 'var(--text-muted)'};">${fmtTax(q5StcgTax)}</td>
                <td style="${tdRight}color:${q5LtcgTax > 0 ? '#10b981' : 'var(--text-muted)'};">${fmtTax(q5LtcgTax)}</td>
                <td style="${tdCenter}font-size:0.72rem;color:#f97316;font-weight:600;">Self-Asmt</td>
                <td style="${tdRight}font-weight:700;color:#f97316;">${fmtTax(q5Tax)}${copyBtn(q5Tax)}</td>
            </tr>`;
        }

        // Separator + Total row
        html += `<tr>
            <td colspan="8" style="padding:0;border-top:2px solid var(--accent);"></td>
        </tr>
        <tr style="background:var(--bg-card);">
            <td style="${tdStyle}font-weight:700;color:var(--text-main);" colspan="2">Total</td>
            <td style="${tdRight}font-weight:700;color:#22c55e;">${fmtVal(totalStcg + q5Stcg)}</td>
            <td style="${tdRight}font-weight:700;color:#10b981;">${fmtVal(totalLtcg + q5Ltcg)}</td>
            <td style="${tdRight}font-weight:700;color:#22c55e;">${fmtTax(totalStcgTax + q5StcgTax)}</td>
            <td style="${tdRight}font-weight:700;color:#10b981;">${fmtTax(totalLtcgTax + q5LtcgTax)}</td>
            <td style="${tdCenter}"></td>
            <td style="${tdRight}font-weight:800;font-size:0.95rem;color:var(--accent);border-left:1px solid var(--border);background:var(--accent)11;">${fmtTax(grandTotalTax)}${copyBtn(grandTotalTax)}</td>
        </tr>`;

        html += `</tbody></table>`;
        tableContainer.innerHTML = html;

        // Attach copy listeners
        tableContainer.querySelectorAll(".adv-tax-copy-btn").forEach(btn => {
            btn.addEventListener("mouseenter", () => btn.style.opacity = "1");
            btn.addEventListener("mouseleave", () => btn.style.opacity = "0.4");
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const text = String(btn.dataset.value);
                navigator.clipboard.writeText(text).then(() => {
                    showToast(`Copied ${text}`, "success");
                    btn.style.opacity = "1";
                    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    setTimeout(() => {
                        btn.style.opacity = "0.4";
                        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                    }, 1500);
                });
            });
        });
    };

    if (window._advTaxSlabListener) {
        slabInput.removeEventListener("input", window._advTaxSlabListener);
    }
    window._advTaxSlabListener = redrawTable;
    slabInput.addEventListener("input", redrawTable);
    redrawTable();

    block.appendChild(card);
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
            let hint = "";
            if (cat === "dividends") {
                hint = "(Fill Total in Schedule OS 1ai and Quarterly in 10 3a)";
            } else if (cat === "ltcg") {
                hint = "(Refer B(I)8 below and fill quarterly in Schedule CG F5)";
            } else if (cat === "stcg") {
                hint = "(Refer A(I)5 below and fill quarterly in Schedule CG F3)";
            }

            if (hint) {
                labelTd.innerHTML =
                    "<span style=\"color:var(--text-muted);font-size:0.72rem;margin-right:5px;\">TOTAL</span>" +
                    "<span style=\"color:" + meta.color + ";font-weight:800;\">" + meta.label + "</span> " +
                    "<span style=\"font-size:0.72rem;color:var(--text-muted);font-weight:normal;opacity:0.85;\">" + hint + "</span>";
            } else {
                labelTd.innerHTML =
                    "<span style=\"color:var(--text-muted);font-size:0.72rem;margin-right:5px;\">TOTAL</span>" +
                    "<span style=\"color:" + meta.color + ";font-weight:800;\">" + meta.label + "</span>";
            }
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
            current_portfolio: state.portfolio,
            sbi_tt_mode: state.sbi_tt_mode
        });
        await hideLoading();
        if (!result.success) return showToast(result.error || "Failed", "error");

        if (result.consolidated && result.consolidated.errors && result.consolidated.errors.length > 0) {
            result.consolidated.errors.forEach(err => showToast(err, "error"));

            // Abort rendering consolidated view
            await collectSbiRates(state.calculatedRows, result.consolidated);
            document.getElementById("sbiRatesSection").classList.remove("hidden");

            const ratesEditor = document.getElementById("monthlyRatesSection");
            ratesEditor.classList.remove("hidden");
            ratesEditor.scrollIntoView({ behavior: "smooth" });

            return showToast("Consolidated Tax Summary blocked due to missing SBI rates. Please check the Rates Editor.", "warning");
        }

        renderConsolidatedTaxSummary(result.consolidated);

        document.getElementById("consolidatedFYBlocks").scrollIntoView({ behavior: "smooth" });
    } catch (e) {
        await hideLoading();
        showToast(`Error: ${e.message}`, "error");
    }
}

export function renderConsolidatedTaxSummary(data) {
    // Reset/clear FSI overrides for a fresh generation
    window._fsiTaxPaidOverrides = {};
    window._fsiDTAAArticles = {};

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
        let hint = "";
        if (cat === "dividends") {
            hint = "(Fill Total in Schedule OS 1ai and Quarterly in 10 3a)";
        }

        if (hint) {
            labelTd.innerHTML = `<span style="color:var(--text-muted);font-size:0.72rem;margin-right:5px;">TOTAL</span><span style="color:${meta.color};font-weight:800;">${meta.label}</span> <span style="font-size:0.72rem;color:var(--text-muted);font-weight:normal;opacity:0.85;">${hint}</span>`;
        } else {
            labelTd.innerHTML = `<span style="color:var(--text-muted);font-size:0.72rem;margin-right:5px;">TOTAL</span><span style="color:${meta.color};font-weight:800;">${meta.label}</span>`;
        }
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

        // Estimated Advance Tax Installment Schedule (right after net CG)
        renderAdvanceTaxSchedule(block, data.offset, "", null);
    }

    // ITR Schedule CG Summaries — Short Term (A(I)5) & Long Term (B(I)8)
    function makeCopyBtn(rawValue) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = "Copy value";
        btn.style.cssText = "background:none;border:none;cursor:pointer;padding:2px 4px;margin-left:6px;opacity:0.4;transition:opacity 0.15s;vertical-align:middle;line-height:1;";
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        btn.addEventListener("mouseenter", () => btn.style.opacity = "1");
        btn.addEventListener("mouseleave", () => btn.style.opacity = "0.4");
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const text = String(Math.abs(rawValue));
            navigator.clipboard.writeText(text).then(() => {
                showToast(`Copied ${text}`, "success");
                btn.style.opacity = "1";
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                setTimeout(() => {
                    btn.style.opacity = "0.4";
                    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                }, 1500);
            });
        });
        return btn;
    }

    function renderItrSummaryCard(title, rowsData, balanceVal) {
        const itrHeader = document.createElement("div");
        itrHeader.style.cssText = "font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 10px;";
        itrHeader.textContent = title;
        block.appendChild(itrHeader);

        const itrCard = document.createElement("div");
        itrCard.style.cssText = "background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:20px 24px;display:flex;flex-direction:column;gap:10px;margin-bottom:8px;";

        rowsData.forEach(r => {
            const row = document.createElement("div");
            row.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:${r.bold ? '10px 12px' : '4px 12px'};${r.bold ? 'border-radius:7px;background:' + (balanceVal >= 0 ? 'var(--success)' : 'var(--danger)') + '18;border:1px solid ' + (balanceVal >= 0 ? 'var(--success)' : 'var(--danger)') + '44;margin-top:6px;' : ''}`;
            const lbl = document.createElement("span");
            lbl.style.cssText = `font-size:0.84rem;color:${r.bold ? 'var(--text-main)' : 'var(--text-muted)'};font-weight:${r.bold ? '700' : '500'};`;
            lbl.innerHTML = `<span style="display:inline-block;width:45px;font-weight:700;color:var(--accent);margin-right:8px;font-size:0.72rem;opacity:0.7;">${r.code}</span>${r.label}${r.sublabel ? ` <span style="opacity:0.5;font-size:0.75rem;">${r.sublabel}</span>` : ''}`;
            const valWrap = document.createElement("span");
            valWrap.style.cssText = "display:flex;align-items:center;gap:0;";
            const val = document.createElement("span");
            val.style.cssText = `font-size:${r.bold ? '1rem' : '0.88rem'};font-weight:${r.bold ? '800' : '600'};color:${r.color};font-variant-numeric:tabular-nums;white-space:nowrap;`;
            val.textContent = r.value === 0 ? "₹0" : (r.value < 0 ? "−₹" + formatINR(Math.abs(r.value)) : "₹" + formatINR(r.value));
            valWrap.appendChild(val);
            valWrap.appendChild(makeCopyBtn(r.value));
            row.appendChild(lbl);
            row.appendChild(valWrap);
            itrCard.appendChild(row);
        });

        block.appendChild(itrCard);
    }

    const stProceeds = data.st_proceeds_inr || 0;
    const stCost = data.st_cost_inr || 0;
    const stBalance = stProceeds - stCost;
    if (stProceeds > 0 || stCost > 0) {
        const stRows = [
            { code: "ia", label: "Full value of consideration received in respect of unquoted shares", sublabel: null, value: stProceeds, color: "var(--text-main)" },
            { code: "ib", label: "Fair market value of unquoted shares", sublabel: null, value: stProceeds, color: "var(--text-main)" },
            { code: "bi", label: "Cost of acquisition without indexation", sublabel: null, value: stCost, color: "var(--text-main)" },
            { code: "c", label: "Balance", sublabel: null, value: stBalance, color: stBalance >= 0 ? "var(--success)" : "var(--danger)", bold: true },
        ];
        renderItrSummaryCard("ITR Schedule CG — A(I)5 Summary - Short Term", stRows, stBalance);
    }

    const ltProceeds = data.lt_proceeds_inr || 0;
    const ltCost = data.lt_cost_inr || 0;
    const ltBalance = ltProceeds - ltCost;
    if (ltProceeds > 0 || ltCost > 0) {
        const ltRows = [
            { code: "a(i)a", label: "Full value of consideration received in respect of unquoted shares", sublabel: null, value: ltProceeds, color: "var(--text-main)" },
            { code: "a(i)b", label: "Fair market value of unquoted shares", sublabel: null, value: ltProceeds, color: "var(--text-main)" },
            { code: "bi", label: "Cost of acquisition without indexation", sublabel: null, value: ltCost, color: "var(--text-main)" },
            { code: "c", label: "Balance", sublabel: null, value: ltBalance, color: ltBalance >= 0 ? "var(--success)" : "var(--danger)", bold: true },
        ];
        renderItrSummaryCard("ITR Schedule CG — B(I)8 Summary - Long Term", ltRows, ltBalance);
    }

    function renderHorizontalSectionFTable(stcgData, ltcgData) {
        if (!stcgData && !ltcgData) return;

        const header = document.createElement("div");
        header.style.cssText = "font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin:24px 0 10px;";
        header.textContent = "ITR Schedule CG — Section F (Information about accrual/receipt of capital gain)";
        block.appendChild(header);

        const card = document.createElement("div");
        card.style.cssText = "background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px 20px;margin-bottom:16px;overflow-x:auto;";

        const table = document.createElement("table");
        table.style.cssText = "width:100%;border-collapse:collapse;font-size:0.84rem;";

        const thead = document.createElement("thead");
        const hrow = document.createElement("tr");
        
        const headers = [
            "Type of Capital Gain",
            "Upto 15/6 (i)",
            "16/6 – 15/9 (ii)",
            "16/9 – 15/12 (iii)",
            "16/12 – 15/3 (iv)",
            "16/3 – 31/3 (v)",
            "Total"
        ];
        
        headers.forEach((h, idx) => {
            const th = document.createElement("th");
            th.textContent = h;
            th.style.cssText = `padding:8px 10px;background:var(--bg-card);color:var(--text-muted);font-weight:600;font-size:0.75rem;text-align:${idx === 0 ? "left" : "right"};border-bottom:2px solid var(--border);white-space:nowrap;`;
            hrow.appendChild(th);
        });
        thead.appendChild(hrow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        const quarters = ["q1", "q2", "q3", "q4", "q5", "total"];

        function appendRow(label, quartersData, color) {
            if (!quartersData) return;
            const tr = document.createElement("tr");
            tr.addEventListener("mouseenter", () => tr.style.background = "var(--bg-card)");
            tr.addEventListener("mouseleave", () => tr.style.background = "");

            const lblTd = document.createElement("td");
            lblTd.style.cssText = "padding:8px 10px;border-bottom:1px solid var(--border);font-weight:600;color:var(--text-main);white-space:nowrap;";
            lblTd.textContent = label;
            tr.appendChild(lblTd);

            quarters.forEach(qk => {
                const val = quartersData[qk] || 0;
                const td = document.createElement("td");
                td.style.cssText = `padding:8px 10px;text-align:right;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums;white-space:nowrap;color:${val > 0 ? color : "var(--text-muted)"};`;
                if (qk === "total") {
                    td.style.fontWeight = "700";
                    td.style.borderLeft = "1px solid var(--border)";
                    td.style.background = color + "11";
                }
                
                // Container for value and copy button
                const content = document.createElement("div");
                content.style.cssText = "display:inline-flex;align-items:center;justify-content:flex-end;width:100%;gap:2px;";
                
                const valSpan = document.createElement("span");
                valSpan.textContent = val > 0 ? "₹" + formatINR(val) : "—";
                content.appendChild(valSpan);
                
                if (val > 0) {
                    content.appendChild(makeCopyBtn(val));
                }
                
                td.appendChild(content);
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        }

        appendRow("STCG Taxable at Applicable Rate", stcgData, "#22c55e");
        appendRow("LTCG Taxable at 12.5%", ltcgData, "#10b981");

        table.appendChild(tbody);
        card.appendChild(table);
        block.appendChild(card);
    }

    if (data.offset) {
        renderHorizontalSectionFTable(
            data.offset.net_stcg_quarters,
            data.offset.net_ltcg_quarters
        );
    }

    // Schedule FSI Section — Details of Income from Outside India and Tax Relief
    const tickerToCountry = {};
    if (state.portfolio && state.portfolio.stocks) {
        state.portfolio.stocks.forEach(stock => {
            if (stock.ticker && stock.company_info && stock.company_info.country_code) {
                tickerToCountry[stock.ticker.toUpperCase()] = stock.company_info.country_code;
            }
        });
    }

    const countryGroups = {};
    Object.keys(data.stocks).forEach(ticker => {
        const tUpper = ticker.toUpperCase();
        let country = tickerToCountry[tUpper];
        if (!country) {
            if (tUpper.endsWith(".L")) {
                country = "3-UNITED KINGDOM";
            } else {
                country = "2-UNITED STATES OF AMERICA";
            }
        }
        if (!countryGroups[country]) {
            countryGroups[country] = { ltcg: 0, ltcl: 0, stcg: 0, stcl: 0, dividends: 0 };
        }
        const sdata = data.stocks[ticker];
        countryGroups[country].ltcg += (sdata.ltcg?.total || 0);
        countryGroups[country].ltcl += (sdata.ltcl?.total || 0);
        countryGroups[country].stcg += (sdata.stcg?.total || 0);
        countryGroups[country].stcl += (sdata.stcl?.total || 0);
        countryGroups[country].dividends += (sdata.dividends?.total || 0);
    });

    const activeCountries = Object.keys(countryGroups).filter(c => {
        const g = countryGroups[c];
        return (g.ltcg > 0 || g.ltcl > 0 || g.stcg > 0 || g.stcl > 0 || g.dividends > 0);
    }).sort();

    if (activeCountries.length > 0) {
        const fsiHeader = document.createElement("div");
        fsiHeader.style.cssText = "font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin:25px 0 10px;";
        fsiHeader.textContent = "ITR SCHEDULE FSI - INCOME FROM OUTSIDE INDIA & TAX RELIEF";
        block.appendChild(fsiHeader);

        const fsiCard = document.createElement("div");
        fsiCard.style.cssText = "background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:24px;display:flex;flex-direction:column;gap:16px;margin-bottom:8px;overflow-x:auto;";

        const tableContainer = document.createElement("div");
        tableContainer.style.cssText = "width:100%;overflow-x:auto;overflow-y:hidden;";
        fsiCard.appendChild(tableContainer);

        if (window._fsiTaxPaidOverrides === undefined) window._fsiTaxPaidOverrides = {};
        if (window._fsiDTAAArticles === undefined) window._fsiDTAAArticles = {};

        const slabInput = document.getElementById("taxSlabRateInput");

        const redrawFSITable = () => {
            const slabRate = parseFloat(slabInput.value || "30") || 0;
            
            const copyBtn = (val) => `
                <button type="button" class="fsi-copy-btn" data-value="${val}" title="Copy ${val}" style="background:none;border:none;cursor:pointer;padding:2px;margin-left:4px;opacity:0.4;transition:opacity 0.15s;vertical-align:middle;line-height:1;display:inline-flex;align-items:center;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
            `;

            let html = `
                <table class="fsi-table" style="width:100%;border-collapse:collapse;font-size:0.8rem;text-align:left;min-width:900px;">
                    <thead>
                        <tr style="background:var(--bg-card);border-bottom:1px solid var(--border);">
                            <th style="padding:10px;font-weight:700;color:var(--text-muted);border:1px solid var(--border);width:50px;">Sl. No.</th>
                            <th style="padding:10px;font-weight:700;color:var(--text-muted);border:1px solid var(--border);width:250px;">Country Code</th>
                            <th style="padding:10px;font-weight:700;color:var(--text-muted);border:1px solid var(--border);width:50px;">Sl. No.</th>
                            <th style="padding:10px;font-weight:700;color:var(--text-muted);border:1px solid var(--border);width:150px;">Head of Income</th>
                            <th style="padding:10px;font-weight:700;color:var(--text-muted);border:1px solid var(--border);text-align:right;width:130px;">Income Outside India (b)</th>
                            <th style="padding:10px;font-weight:700;color:var(--text-muted);border:1px solid var(--border);text-align:right;width:150px;">Tax Paid Outside India (c)</th>
                            <th style="padding:10px;font-weight:700;color:var(--text-muted);border:1px solid var(--border);text-align:right;width:150px;">Tax Payable in India (d)</th>
                            <th style="padding:10px;font-weight:700;color:var(--text-muted);border:1px solid var(--border);text-align:right;width:180px;">Tax Relief Available (e) = min(c,d)</th>
                            <th style="padding:10px;font-weight:700;color:var(--text-muted);border:1px solid var(--border);text-align:center;width:120px;">Relevant DTAA Article (f)</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            activeCountries.forEach((country, cIdx) => {
                const g = countryGroups[country];
                
                const gross_stcg = g.stcg;
                const gross_stcl = g.stcl;
                const gross_ltcg = g.ltcg;
                const gross_ltcl = g.ltcl;
                
                const stcl_vs_stcg = Math.min(gross_stcl, gross_stcg);
                const residual_stcl = gross_stcl - stcl_vs_stcg;
                const net_stcg = gross_stcg - stcl_vs_stcg;
                
                const stcl_vs_ltcg = Math.min(residual_stcl, gross_ltcg);
                const ltcg_after_stcl = gross_ltcg - stcl_vs_ltcg;
                const ltcl_vs_ltcg = Math.min(gross_ltcl, ltcg_after_stcl);
                const net_ltcg = ltcg_after_stcl - ltcl_vs_ltcg;
                
                const net_capital_gains = net_stcg + net_ltcg;
                
                const cg_income = Math.max(0, net_capital_gains);
                const os_income = Math.max(0, g.dividends);

                const cg_tax_payable = Math.round((net_ltcg * 0.125) + (net_stcg * (slabRate / 100)));
                const os_tax_payable = Math.round(os_income * (slabRate / 100));

                const cg_default_tax_paid = 0;
                let os_default_tax_paid = 0;
                const isUS = (country.includes("UNITED STATES") || country.startsWith("2-"));
                if (isUS) {
                    os_default_tax_paid = Math.round(os_income * 0.25);
                }

                const cg_override_key = `${country}_cg`;
                const os_override_key = `${country}_os`;

                const cg_tax_paid = (cg_override_key in window._fsiTaxPaidOverrides) ? window._fsiTaxPaidOverrides[cg_override_key] : cg_default_tax_paid;
                const os_tax_paid = (os_override_key in window._fsiTaxPaidOverrides) ? window._fsiTaxPaidOverrides[os_override_key] : os_default_tax_paid;

                const cg_art_key = `${country}_cg_art`;
                const os_art_key = `${country}_os_art`;
                const cg_art = (cg_art_key in window._fsiDTAAArticles) ? window._fsiDTAAArticles[cg_art_key] : "";
                const os_art = (os_art_key in window._fsiDTAAArticles) ? window._fsiDTAAArticles[os_art_key] : "90";

                const cg_relief = Math.min(cg_tax_paid, cg_tax_payable);
                const os_relief = Math.min(os_tax_paid, os_tax_payable);

                const total_income = cg_income + os_income;
                const total_tax_paid = cg_tax_paid + os_tax_paid;
                const total_tax_payable = cg_tax_payable + os_tax_payable;
                const total_relief = cg_relief + os_relief;

                const inputStyle = `width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-main);font-size:0.78rem;font-variant-numeric:tabular-nums;box-sizing:border-box;`;

                html += `
                    <tr style="border-top:1px solid var(--border);">
                        <td rowspan="3" style="padding:10px;font-weight:700;border:1px solid var(--border);vertical-align:middle;text-align:center;background:var(--bg-input);">${cIdx + 1}</td>
                        <td rowspan="3" style="padding:10px;font-weight:700;border:1px solid var(--border);vertical-align:middle;font-size:0.76rem;line-height:1.2;background:var(--bg-input);">${country}</td>
                        
                        <td style="padding:6px 10px;border:1px solid var(--border);text-align:center;font-weight:600;">iii</td>
                        <td style="padding:6px 10px;border:1px solid var(--border);font-weight:600;">Capital Gain</td>
                        <td style="padding:6px 10px;border:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap;">₹${formatINR(cg_income)}${copyBtn(cg_income)}</td>
                        <td style="padding:4px 6px;border:1px solid var(--border);text-align:right;white-space:nowrap;">
                            <div style="display:inline-flex;align-items:center;justify-content:flex-end;width:100%;">
                                <input type="number" class="fsi-paid-input" data-key="${cg_override_key}" value="${cg_tax_paid}" style="${inputStyle}text-align:right;width:80px;margin-right:2px;">
                                ${copyBtn(cg_tax_paid)}
                            </div>
                        </td>
                        <td style="padding:6px 10px;border:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;color:var(--text-main);white-space:nowrap;">₹${formatINR(cg_tax_payable)}${copyBtn(cg_tax_payable)}</td>
                        <td style="padding:6px 10px;border:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:var(--success);white-space:nowrap;">₹${formatINR(cg_relief)}${copyBtn(cg_relief)}</td>
                        <td style="padding:4px 6px;border:1px solid var(--border);text-align:center;">
                            <input type="text" class="fsi-art-input" data-key="${cg_art_key}" value="${cg_art}" style="${inputStyle}text-align:center;">
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:6px 10px;border:1px solid var(--border);text-align:center;font-weight:600;">iv</td>
                        <td style="padding:6px 10px;border:1px solid var(--border);font-weight:600;">Other Sources</td>
                        <td style="padding:6px 10px;border:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap;">₹${formatINR(os_income)}${copyBtn(os_income)}</td>
                        <td style="padding:4px 6px;border:1px solid var(--border);text-align:right;white-space:nowrap;">
                            <div style="display:inline-flex;align-items:center;justify-content:flex-end;width:100%;">
                                <input type="number" class="fsi-paid-input" data-key="${os_override_key}" value="${os_tax_paid}" style="${inputStyle}text-align:right;width:80px;margin-right:2px;">
                                ${copyBtn(os_tax_paid)}
                            </div>
                        </td>
                        <td style="padding:6px 10px;border:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;color:var(--text-main);white-space:nowrap;">₹${formatINR(os_tax_payable)}${copyBtn(os_tax_payable)}</td>
                        <td style="padding:6px 10px;border:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:var(--success);white-space:nowrap;">₹${formatINR(os_relief)}${copyBtn(os_relief)}</td>
                        <td style="padding:4px 6px;border:1px solid var(--border);text-align:center;">
                            <input type="text" class="fsi-art-input" data-key="${os_art_key}" value="${os_art}" style="${inputStyle}text-align:center;">
                        </td>
                    </tr>
                    <tr style="font-weight:700;">
                        <td style="padding:8px 10px;border:1px solid var(--border);text-align:center;background:rgba(99, 102, 241, 0.08);">v</td>
                        <td style="padding:8px 10px;border:1px solid var(--border);background:rgba(99, 102, 241, 0.08);">Total</td>
                        <td style="padding:8px 10px;border:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;background:rgba(99, 102, 241, 0.08);">₹${formatINR(total_income)}${copyBtn(total_income)}</td>
                        <td style="padding:8px 10px;border:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;background:rgba(99, 102, 241, 0.08);">₹${formatINR(total_tax_paid)}${copyBtn(total_tax_paid)}</td>
                        <td style="padding:8px 10px;border:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;background:rgba(99, 102, 241, 0.08);">₹${formatINR(total_tax_payable)}${copyBtn(total_tax_payable)}</td>
                        <td style="padding:8px 10px;border:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;color:var(--success);white-space:nowrap;background:rgba(99, 102, 241, 0.08);">₹${formatINR(total_relief)}${copyBtn(total_relief)}</td>
                        <td style="padding:8px 10px;border:1px solid var(--border);text-align:center;color:var(--text-muted);background:rgba(99, 102, 241, 0.08);">-</td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
            `;
            tableContainer.innerHTML = html;

            // Attach copy listeners
            tableContainer.querySelectorAll(".fsi-copy-btn").forEach(btn => {
                btn.addEventListener("mouseenter", () => btn.style.opacity = "1");
                btn.addEventListener("mouseleave", () => btn.style.opacity = "0.4");
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const text = String(btn.dataset.value);
                    navigator.clipboard.writeText(text).then(() => {
                        showToast(`Copied ${text}`, "success");
                        btn.style.opacity = "1";
                        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                        setTimeout(() => {
                            btn.style.opacity = "0.4";
                            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                        }, 1500);
                    });
                });
            });

            tableContainer.querySelectorAll(".fsi-paid-input").forEach(el => {
                el.addEventListener("input", (e) => {
                    const key = e.target.dataset.key;
                    window._fsiTaxPaidOverrides[key] = parseFloat(e.target.value) || 0;
                    redrawFSITable();
                });
            });

            tableContainer.querySelectorAll(".fsi-art-input").forEach(el => {
                el.addEventListener("input", (e) => {
                    const key = e.target.dataset.key;
                    window._fsiDTAAArticles[key] = e.target.value;
                });
            });
        };

        if (window._fsiSlabListener) {
            slabInput.removeEventListener("input", window._fsiSlabListener);
        }
        window._fsiSlabListener = redrawFSITable;
        slabInput.addEventListener("input", redrawFSITable);
        redrawFSITable();
        block.appendChild(fsiCard);

        // ===== Form 67 Section — Foreign Tax Credit Claimed =====
        const form67Header = document.createElement("div");
        form67Header.style.cssText = "font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin:25px 0 10px;";
        form67Header.textContent = "DOUBLE TAXATION RELIEF (FORM 67) — FOREIGN TAX CREDIT CLAIMED";
        block.appendChild(form67Header);

        const form67Card = document.createElement("div");
        form67Card.style.cssText = "background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:24px;display:flex;flex-direction:column;gap:16px;margin-bottom:8px;overflow-x:auto;";

        const form67TableContainer = document.createElement("div");
        form67TableContainer.style.cssText = "width:100%;overflow-x:auto;overflow-y:hidden;";
        form67Card.appendChild(form67TableContainer);

        const redrawForm67Table = () => {
            const slabRate = parseFloat(slabInput.value || "30") || 0;

            const copyBtn = (val) => `
                <button type="button" class="fsi-copy-btn" data-value="${val}" title="Copy ${val}" style="background:none;border:none;cursor:pointer;padding:2px;margin-left:4px;opacity:0.4;transition:opacity 0.15s;vertical-align:middle;line-height:1;display:inline-flex;align-items:center;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
            `;

            const thStyle = "padding:8px 6px;font-weight:700;color:var(--text-muted);border:1px solid var(--border);text-align:center;font-size:0.72rem;line-height:1.25;";
            const tdStyle = "padding:6px 8px;border:1px solid var(--border);font-size:0.78rem;";
            const tdRight = `${tdStyle}text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;`;
            const tdCenter = `${tdStyle}text-align:center;`;

            let html = `
                <table class="fsi-table" style="width:100%;border-collapse:collapse;font-size:0.78rem;text-align:left;min-width:1100px;">
                    <thead>
                        <tr style="background:var(--bg-card);border-bottom:1px solid var(--border);">
                            <th rowspan="2" style="${thStyle}width:40px;">Sl.<br>No.</th>
                            <th rowspan="2" style="${thStyle}width:120px;">Name of Country</th>
                            <th rowspan="2" style="${thStyle}width:90px;">Source of Income</th>
                            <th rowspan="2" style="${thStyle}width:110px;">Income from Outside India</th>
                            <th colspan="2" style="${thStyle}">Tax Paid Outside India</th>
                            <th rowspan="2" style="${thStyle}width:110px;">Tax Payable under Normal Provisions in India</th>
                            <th rowspan="2" style="${thStyle}width:70px;">Tax Payable u/s 115JB/JC</th>
                            <th colspan="3" style="${thStyle}">Credit Claimed u/s 90/90A</th>
                            <th rowspan="2" style="${thStyle}width:80px;">Credit u/s 91</th>
                            <th rowspan="2" style="${thStyle}width:100px;">Total FTC Claimed</th>
                        </tr>
                        <tr style="background:var(--bg-card);border-bottom:1px solid var(--border);">
                            <th style="${thStyle}width:90px;">Amount</th>
                            <th style="${thStyle}width:55px;">Rate (%)</th>
                            <th style="${thStyle}width:80px;">DTAA Article</th>
                            <th style="${thStyle}width:65px;">DTAA Rate (%)</th>
                            <th style="${thStyle}width:90px;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            let globalSlNo = 0;

            activeCountries.forEach((country) => {
                const g = countryGroups[country];
                const os_income = Math.max(0, g.dividends);
                if (os_income <= 0) return;

                const slabRate = parseFloat(slabInput.value || "30") || 0;
                const os_tax_payable = Math.round(os_income * (slabRate / 100));

                const os_override_key = `${country}_os`;
                let os_default_tax_paid = 0;
                const isUS = (country.includes("UNITED STATES") || country.startsWith("2-"));
                if (isUS) {
                    os_default_tax_paid = Math.round(os_income * 0.25);
                }
                const os_tax_paid = (os_override_key in window._fsiTaxPaidOverrides) ? window._fsiTaxPaidOverrides[os_override_key] : os_default_tax_paid;

                const f67_art_key = `${country}_f67_art`;
                const os_art = (f67_art_key in window._fsiDTAAArticles) ? window._fsiDTAAArticles[f67_art_key] : "10,25";

                const os_relief = Math.min(os_tax_paid, os_tax_payable);
                const os_paid_rate = os_income > 0 ? Math.round((os_tax_paid / os_income) * 100) : 0;
                const os_dtaa_rate = os_art ? os_paid_rate : 0;
                const os_dtaa_amount = os_art ? os_relief : 0;
                const os_s91 = os_art ? 0 : os_relief;
                const os_total_ftc = os_dtaa_amount + os_s91;

                // Clean country name for display (remove code prefix like "2-")
                const countryDisplay = country.replace(/^\d+-/, "").split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");

                globalSlNo++;
                html += `
                    <tr style="border-top:1px solid var(--border);">
                        <td style="${tdCenter}font-weight:700;">${globalSlNo}</td>
                        <td style="${tdStyle}font-weight:600;font-size:0.76rem;line-height:1.2;">${countryDisplay}</td>
                        <td style="${tdCenter}font-weight:600;">Dividend</td>
                        <td style="${tdRight}font-weight:600;">₹${formatINR(os_income)}${copyBtn(os_income)}</td>
                        <td style="${tdRight}">₹${formatINR(os_tax_paid)}${copyBtn(os_tax_paid)}</td>
                        <td style="${tdCenter}">${os_paid_rate}</td>
                        <td style="${tdRight}">₹${formatINR(os_tax_payable)}${copyBtn(os_tax_payable)}</td>
                        <td style="${tdCenter}color:var(--text-muted);">-</td>
                        <td style="${tdCenter}">${os_art || "-"}</td>
                        <td style="${tdCenter}">${os_art ? os_dtaa_rate : "-"}</td>
                        <td style="${tdRight}font-weight:600;">₹${formatINR(os_dtaa_amount)}${copyBtn(os_dtaa_amount)}</td>
                        <td style="${tdRight}">₹${formatINR(os_s91)}${copyBtn(os_s91)}</td>
                        <td style="${tdRight}font-weight:700;color:var(--success);">₹${formatINR(os_total_ftc)}${copyBtn(os_total_ftc)}</td>
                    </tr>`;
            });

            html += `
                    </tbody>
                </table>
            `;
            form67TableContainer.innerHTML = html;

            // Attach copy listeners (reuse same pattern as FSI)
            form67TableContainer.querySelectorAll(".fsi-copy-btn").forEach(btn => {
                btn.addEventListener("mouseenter", () => btn.style.opacity = "1");
                btn.addEventListener("mouseleave", () => btn.style.opacity = "0.4");
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const text = String(btn.dataset.value);
                    navigator.clipboard.writeText(text).then(() => {
                        showToast(`Copied ${text}`, "success");
                        btn.style.opacity = "1";
                        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                        setTimeout(() => {
                            btn.style.opacity = "0.4";
                            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                        }, 1500);
                    });
                });
            });
        };

        // Redraw Form 67 whenever global slab rate input changes
        if (window._f67SlabListener) {
            slabInput.removeEventListener("input", window._f67SlabListener);
        }
        window._f67SlabListener = redrawForm67Table;
        slabInput.addEventListener("input", redrawForm67Table);
        redrawForm67Table();
        block.appendChild(form67Card);
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

export async function clearSbiOverrides() {
    const confirmed = await showConfirm("Are you sure you want to reset the SBI TT rates database? This will clear all manual overrides and RBI fallback rates. Only official SBI TT rates will be retained.", "Reset Rates");
    if (!confirmed) return;
    
    try {
        pushUndoSnapshot("Reset SBI TT Rates");
        showLoading("Resetting SBI TT rates database...");
        const res = await apiPost("/api/clear-sbi-rates");
        await hideLoading();
        
        if (res.success) {
            state.portfolio.sbi_rate_overrides = {};
            // Also clear calculated overrides as they likely depend on rates
            state.portfolio.overrides = {}; 
            
            showToast("SBI TT rates restored to default state", "success");
            
            // Reload calendar rates if it is visible
            const ratesSection = document.getElementById("monthlyRatesSection");
            if (ratesSection && !ratesSection.classList.contains("hidden")) {
                await loadMonthlyRates();
            }
            
            // Refresh UI
            dispatchStateChange("portfolio-restored");
            dispatchStateChange("clear-calculated");
        } else {
            showToast("Failed to clear rates: " + res.error, "error");
        }
    } catch (e) {
        showToast("Error clearing rates: " + e.message, "error");
    }
}

/**
 * Export the FA Schedule A3 results to a CSV file.
 */
export async function exportCSV() {
    if (!state.calculatedRows || !state.calculatedRows.length) {
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
