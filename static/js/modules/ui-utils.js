import { INFO_SVG } from './constants.js';
import { formatINR, formatAppDate, parseAppDate } from './utils.js';

// ===== Toast Notifications =====
export function showToast(message, type = "info", duration = 4000) {
    const container = document.getElementById("toastContainer");
    if (!container) return;
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

export function startSmoothProgress(text, estimatedSeconds = 8) {
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

export function stopSmoothProgress() {
    if (_progressInterval) {
        clearInterval(_progressInterval);
        _progressInterval = null;
    }
}

export function showLoading(text = "Loading...", percent = null) {
    const overlay = document.getElementById("loadingOverlay");
    const textEl = document.getElementById("loadingText");
    if (!overlay || !textEl) return;
    overlay.classList.remove("hidden");
    textEl.innerHTML = text.replace(/\n/g, "<br>");

    // Add progress bar if not present
    let fill = overlay.querySelector(".progress-bar-fill");
    if (!fill) {
        const bar = document.createElement("div");
        bar.className = "progress-bar-container";
        bar.innerHTML = '<div class="progress-bar-fill"></div>';
        const loader = overlay.querySelector(".loader");
        if (loader) loader.appendChild(bar);
        fill = bar.querySelector(".progress-bar-fill");
    }

    if (fill) {
        if (percent != null) {
            fill.style.animation = "none";
            fill.style.width = percent + "%";
        } else {
            fill.style.animation = "";
            fill.style.width = "";
        }
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

export async function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (!overlay) return;
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
    const bar = overlay.querySelector(".progress-bar-container");
    if (bar) bar.remove();
}

// ===== Collapsible Sections =====
export function toggleSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isCollapsed = el.classList.toggle("collapsed");
    const header = el.previousElementSibling;
    if (header) {
        const icon = header.querySelector(".toggle-icon");
        if (icon) icon.style.transform = isCollapsed ? "rotate(-90deg)" : "";
    }

    // Auto-hide Rates Editor card if collapsed and UNLOCKED
    if (id === "monthlyRatesContent" && isCollapsed) {
        const lockCheckbox = document.getElementById("lockRatesCardCheckbox");
        if (lockCheckbox && !lockCheckbox.checked) {
            const section = document.getElementById("monthlyRatesSection");
            if (section) {
                section.classList.add("hidden");
            }
        }
    }
}

// ===== Tooltip Helpers =====
let _tooltipTimeout;
const tooltipEl = document.createElement("div");
tooltipEl.className = "calc-tooltip hidden";
document.body.appendChild(tooltipEl);

export function showCalcTooltip(e, contentHTML) {
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

    tooltipEl.style.left = left + "px";
    tooltipEl.style.top = top + "px";

    const rect = tooltipEl.getBoundingClientRect();
    if (left + rect.width > window.innerWidth) {
        left = window.innerWidth - rect.width - padding;
    }
    if (top + rect.height > window.innerHeight) {
        top = y - rect.height - padding;
    }

    // Safety clamps
    left = Math.max(10, left);
    top = Math.max(10, top);

    tooltipEl.style.left = left + "px";
    tooltipEl.style.top = top + "px";
}

export function hideCalcTooltip() {
    _tooltipTimeout = setTimeout(() => {
        tooltipEl.classList.add("hidden");
    }, 150);
}

export function buildTooltipHTML(details, type) {
    if (!details) return "";
    
    const clickHint = `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:6px;border-top:1px dashed var(--border);padding-top:4px;text-align:center;font-weight:normal;">${INFO_SVG} Click to view breakdown</div>`;

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

export function mapCalcDetailsToTooltip(calculationDetails, fieldKey) {
    if (!calculationDetails) return null;

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

export async function saveFileRobustly(content, filename, fileTypeLabel, fileTypeMime, fileExtension) {
    const fileTypeSpec = `${fileTypeLabel} (*${fileExtension})`;
    
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
    } catch (err) {
        console.warn("Native bridge failed, trying Tier 3", err);
    }

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

// ===== Calc Button Visibility =====
export function updateCalcButtonVisibility(stocksCount) {
    const hasStocks = stocksCount > 0;
    const tabA3 = document.getElementById("tabA3");
    const isA3 = tabA3 ? tabA3.classList.contains("active") : false;

    // FAB + Quick Jump Nav: visible when stocks exist AND in A3 tab
    const fab = document.getElementById("calcFab");
    const qjNav = document.getElementById("quickJumpNav");
    if (fab) fab.classList.toggle("hidden", !hasStocks || !isA3);
    if (qjNav) qjNav.classList.toggle("hidden", !hasStocks || !isA3);

    // Filter bar: visible when ≥ 3 stocks AND in A3 tab
    const filterBar = document.getElementById("stockFilterBar");
    if (filterBar) filterBar.classList.toggle("hidden", stocksCount < 3 || !isA3);
}

// ===== Custom Confirm Dialog (Pywebview Safe) =====
export function showConfirm(message, confirmLabel = "OK") {
    return new Promise(resolve => {
        let resolved = false;
        const cleanup = (result) => {
            if (resolved) return;
            resolved = true;
            document.body.removeChild(overlay);
            resolve(result);
        };
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,0.5);
            z-index:9999;display:flex;align-items:center;justify-content:center;
            backdrop-filter: blur(2px);
        `;
        overlay.innerHTML = `
            <div id="sc-box" style="background:var(--bg-secondary);color:var(--text-primary);
                        border:1px solid var(--border);border-radius:12px;padding:24px 28px;max-width:360px;width:90%;
                        box-shadow:var(--shadow-lg);font-family:var(--font);">
                <p style="margin:0 0 20px;font-size:0.95rem;line-height:1.5">${message}</p>
                <div style="display:flex;justify-content:flex-end;gap:12px;">
                    <button id="sc-cancel"
                        style="padding:8px 16px;border-radius:8px;border:1px solid var(--border);
                               background:transparent;color:var(--text-secondary);cursor:pointer;font-size:0.875rem;font-weight:500;transition:var(--transition);">
                        Cancel
                    </button>
                    <button id="sc-ok"
                        style="padding:8px 16px;border-radius:8px;border:none;
                               background:var(--danger);color:#fff;cursor:pointer;font-size:0.875rem;font-weight:500;transition:var(--transition);">
                        ${confirmLabel}
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        const okBtn = overlay.querySelector('#sc-ok');
        const cancelBtn = overlay.querySelector('#sc-cancel');
        
        okBtn.onclick = (e) => { e.stopPropagation(); cleanup(true); };
        cancelBtn.onclick = (e) => { e.stopPropagation(); cleanup(false); };
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
        
        // Simple hover effects
        okBtn.onmouseenter = () => okBtn.style.opacity = '0.9';
        okBtn.onmouseleave = () => okBtn.style.opacity = '1';
        cancelBtn.onmouseenter = () => cancelBtn.style.background = 'var(--bg-hover)';
        cancelBtn.onmouseleave = () => cancelBtn.style.background = 'transparent';
    });
}


