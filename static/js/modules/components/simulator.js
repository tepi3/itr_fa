import { state } from '../state.js';
import { parseAppDate, formatAppDate, formatINR, initDatePicker, calculateXIRR } from '../utils.js';
import { apiPost, apiGet } from '../api.js';
import { showToast, showLoading, hideLoading } from '../ui-utils.js';
import { LIVE_BTN_HTML, CROSS_SVG, FETCH_LOADING_HTML } from '../constants.js';
import { setSbiTTMode } from './dashboard.js';

// ===== Sell Simulator State =====
export const simState = {
    lots: [],       // [{ticker, yahoo_ticker, lot_id, buy_date, buy_price, available_qty, display}]
    sells: [],      // [{rowId, lotIdx, sell_date, sell_qty, sell_price}]
    nextRowId: 1,
    lastResults: null,
};

export function initSellHelper() {
    const addRowBtn = document.getElementById("shAddRowBtn");
    const refreshBtn = document.getElementById("shRefreshBtn");
    const simulateBtn = document.getElementById("shSimulateBtn");

    if (addRowBtn) addRowBtn.addEventListener("click", () => shAddRow());
    if (refreshBtn) refreshBtn.addEventListener("click", shImportLots);
    if (simulateBtn) simulateBtn.addEventListener("click", shRunSimulation);

    // Smart Allocator UI and event bindings
    const allocBtn = document.getElementById("shAllocBtn");
    if (allocBtn) {
        allocBtn.addEventListener("click", shExecuteAllocation);
    }

    const priceBtn = document.getElementById("shAllocPriceFetchBtn");
    if (priceBtn) {
        priceBtn.addEventListener("click", async () => {
            const ticker = document.getElementById("shAllocTicker").value;
            if (!ticker) return showToast("Select a stock first", "warning");
            const yahooTicker = simState.lots.find(l => l.ticker === ticker)?.yahoo_ticker || ticker;
            const priceInput = document.getElementById("shAllocPrice");
            priceBtn.disabled = true;
            priceBtn.innerHTML = "...";
            try {
                const res = await apiGet(`/api/live-price?ticker=${encodeURIComponent(yahooTicker)}`);
                if (res.price != null) {
                    priceInput.value = res.price;
                    showToast(`Live price for ${ticker}: $${res.price}`, "success");
                } else {
                    showToast("Could not fetch live price", "warning");
                }
            } catch (e) {
                showToast(`Fetch error: ${e.message}`, "error");
            } finally {
                priceBtn.disabled = false;
                priceBtn.innerHTML = "Live";
            }
        });
    }

    const toggleQty = document.getElementById("shAllocToggleQty");
    const toggleInr = document.getElementById("shAllocToggleInr");
    const toggleUsd = document.getElementById("shAllocToggleUsd");
    const allocValLabel = document.getElementById("shAllocValueLabel");
    const allocValueInput = document.getElementById("shAllocValue");

    if (toggleQty && toggleInr && toggleUsd) {
        toggleQty.addEventListener("click", () => {
            toggleQty.classList.add("active");
            toggleInr.classList.remove("active");
            toggleUsd.classList.remove("active");
            if (allocValLabel) allocValLabel.textContent = "Share Quantity";
            if (allocValueInput) {
                allocValueInput.placeholder = "e.g. 50";
                allocValueInput.setAttribute("step", "any");
            }
        });
        toggleInr.addEventListener("click", () => {
            toggleInr.classList.add("active");
            toggleQty.classList.remove("active");
            toggleUsd.classList.remove("active");
            if (allocValLabel) allocValLabel.textContent = "Target INR amount (₹)";
            if (allocValueInput) {
                allocValueInput.placeholder = "e.g. 100000";
                allocValueInput.setAttribute("step", "1");
            }
        });
        toggleUsd.addEventListener("click", () => {
            toggleUsd.classList.add("active");
            toggleQty.classList.remove("active");
            toggleInr.classList.remove("active");
            if (allocValLabel) allocValLabel.textContent = "Target USD amount ($)";
            if (allocValueInput) {
                allocValueInput.placeholder = "e.g. 1500";
                allocValueInput.setAttribute("step", "any");
            }
        });
    }

    const allocTickerSel = document.getElementById("shAllocTicker");
    const badge = document.getElementById("shAllocAvailableBadge");
    if (allocTickerSel) {
        allocTickerSel.addEventListener("change", async () => {
            const ticker = allocTickerSel.value;
            if (!ticker) {
                if (badge) badge.style.display = "none";
                return;
            }
            
            const totalAvail = simState.lots
                .filter(l => l.ticker === ticker)
                .reduce((sum, l) => sum + l.available_qty, 0);
            
            if (badge) {
                badge.textContent = `${totalAvail.toFixed(2)} units available`;
                badge.style.display = "inline-block";
            }
            
            const priceInput = document.getElementById("shAllocPrice");
            const priceBtn = document.getElementById("shAllocPriceFetchBtn");
            const yahooTicker = simState.lots.find(l => l.ticker === ticker)?.yahoo_ticker || ticker;
            
            if (priceInput && priceBtn) {
                priceBtn.disabled = true;
                priceBtn.innerHTML = "...";
                try {
                    const res = await apiGet(`/api/live-price?ticker=${encodeURIComponent(yahooTicker)}`);
                    if (res.price != null) {
                        priceInput.value = res.price;
                    }
                } catch (e) {
                    console.error("Failed to fetch price for allocator:", e);
                } finally {
                    priceBtn.disabled = false;
                    priceBtn.innerHTML = "Live";
                }
            }
        });
    }

    const allocDateInput = document.getElementById("shAllocDate");
    if (allocDateInput) {
        initDatePicker(allocDateInput);
        allocDateInput.value = formatAppDate(new Date());
    }

    initSimTaxRates();
}

export function shValidateAllSells() {
    let hasOverAllocation = false;
    
    // Group cumulative sells by lotIdx
    const lotUsage = {};
    simState.sells.forEach(s => {
        const lotIdx = parseInt(s.lotIdx);
        if (isNaN(lotIdx)) return;
        const qty = parseFloat(s.sell_qty) || 0;
        lotUsage[lotIdx] = (lotUsage[lotIdx] || 0) + qty;
    });

    // Go through each DOM row, check if its lot is overallocated
    document.querySelectorAll("#shSellsBody tr").forEach(tr => {
        const rowId = parseInt(tr.dataset.rowId);
        if (isNaN(rowId)) return;
        const sell = simState.sells.find(s => s.rowId === rowId);
        if (!sell) return;
        
        const lotIdx = parseInt(sell.lotIdx);
        const lot = simState.lots[lotIdx];
        const qtyInput = tr.querySelector(".sh-sell-qty");
        
        if (lot && qtyInput) {
            const cumulativeQty = lotUsage[lotIdx] || 0;
            const availableQty = lot.available_qty;
            
            if (cumulativeQty > availableQty) {
                qtyInput.classList.add("qty-over-limit");
                qtyInput.title = `Exceeds available lot quantity of ${availableQty}. Total simulated: ${cumulativeQty.toFixed(4)}.`;
                hasOverAllocation = true;
            } else {
                qtyInput.classList.remove("qty-over-limit");
                qtyInput.title = "";
            }
        }
    });

    // Disable/enable Simulate Tax Impact button
    const simBtn = document.getElementById("shSimulateBtn");
    if (simBtn) {
        if (hasOverAllocation) {
            simBtn.disabled = true;
            simBtn.setAttribute("title", "Please resolve over-allocated quantities before simulating.");
        } else {
            simBtn.disabled = false;
            simBtn.removeAttribute("title");
        }
    }
    
    return hasOverAllocation;
}

export function shRebuildSellsTable() {
    const tbody = document.getElementById("shSellsBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const sellsToRebuild = [...simState.sells];
    simState.sells = []; // Clear and let shAddRow re-populate
    
    if (sellsToRebuild.length === 0) {
        const emptyRow = document.getElementById("shEmptyRow");
        if (emptyRow) {
            tbody.appendChild(emptyRow);
            emptyRow.style.display = "";
        }
        const simBtn = document.getElementById("shSimulateBtn");
        if (simBtn) simBtn.style.display = "none";
        return;
    }
    
    sellsToRebuild.forEach(sell => {
        shAddRow(sell.lotIdx);
        const tr = tbody.lastElementChild;
        if (tr) {
            tr.querySelector(".sh-sell-date").value = sell.sell_date;
            tr.querySelector(".sh-sell-qty").value = sell.sell_qty;
            tr.querySelector(".sh-sell-price").value = sell.sell_price;
            
            const addedSell = simState.sells[simState.sells.length - 1];
            if (addedSell) {
                addedSell.sell_date = sell.sell_date;
                addedSell.sell_qty = sell.sell_qty;
                addedSell.sell_price = sell.sell_price;
            }
        }
    });
    
    // Force update badges and validate
    document.querySelectorAll("#shSellsBody tr").forEach(tr => {
        const lotSelect = tr.querySelector(".sh-lot-select");
        if (lotSelect) {
            const lotI = parseInt(lotSelect.value);
            const lot = simState.lots[lotI];
            const cell = tr.querySelector(".sh-sell-buy-price");
            if (lot && lot.buy_price) {
                cell.textContent = `$${parseFloat(lot.buy_price).toFixed(2)}`;
            }
            
            const rowId = parseInt(tr.dataset.rowId);
            const sell = simState.sells.find(s => s.rowId === rowId);
            const badge = tr.querySelector(".sh-holding-badge");
            if (sell && lot && badge) {
                const buyD = parseAppDate(lot.buy_date);
                const sellD = parseAppDate(sell.sell_date);
                if (!buyD || !sellD) {
                    badge.className = "sh-holding-badge neutral";
                    badge.textContent = "—";
                } else {
                    const days = Math.round((sellD - buyD) / 86400000);
                    const isLT = days >= 730;
                    const type = isLT ? "long-term" : "short-term";
                    const label = isLT ? "Long Term" : "Short Term";
                    badge.className = `sh-holding-badge ${type}`;
                    badge.textContent = `${label} · ${days}d`;
                }
            }
        }
    });
    
    shValidateAllSells();
}

export async function shExecuteAllocation() {
    const ticker = document.getElementById("shAllocTicker").value;
    const sellDate = document.getElementById("shAllocDate").value;
    const sellPriceVal = document.getElementById("shAllocPrice").value;
    const strategy = document.getElementById("shAllocStrategy").value;
    const wholeSharesOnly = document.getElementById("shAllocWholeShares").checked;
    const isTargetInr = document.getElementById("shAllocToggleInr").classList.contains("active");
    const isTargetUsd = document.getElementById("shAllocToggleUsd")?.classList.contains("active") || false;
    const allocValueVal = document.getElementById("shAllocValue").value;

    if (!ticker) return showToast("Select a stock first", "warning");
    if (!sellDate) return showToast("Enter a simulated sell date", "warning");
    if (!sellPriceVal || parseFloat(sellPriceVal) <= 0) return showToast("Enter a valid sell price (> 0)", "warning");
    if (!allocValueVal || parseFloat(allocValueVal) <= 0) return showToast("Enter a valid quantity or target amount (> 0)", "warning");

    const sellPrice = parseFloat(sellPriceVal);
    const allocValue = parseFloat(allocValueVal);

    const totalAvail = simState.lots
        .filter(l => l.ticker === ticker)
        .reduce((sum, l) => sum + l.available_qty, 0);

    let requiredQty = 0;
    let actualRate = null;
    let actualRateDate = "";

    showLoading("Calculating optimal lot allocation...");
    
    try {
        if (isTargetInr) {
            try {
                const res = await apiGet(`/api/sbi-rate?date=${encodeURIComponent(sellDate)}&use_event_date=true`);
                if (res.rate) {
                    actualRate = parseFloat(res.rate);
                    actualRateDate = res.rate_date;
                } else {
                    const resFallback = await apiGet(`/api/sbi-rate?date=${encodeURIComponent(sellDate)}`);
                    if (resFallback.rate) {
                        actualRate = parseFloat(resFallback.rate);
                        actualRateDate = resFallback.rate_date;
                    }
                }
            } catch (e) {
                console.error("SBI event rate API failed, checking fallback", e);
                const resFallback = await apiGet(`/api/sbi-rate?date=${encodeURIComponent(sellDate)}`);
                if (resFallback.rate) {
                    actualRate = parseFloat(resFallback.rate);
                    actualRateDate = resFallback.rate_date;
                }
            }

            if (!actualRate) {
                await hideLoading();
                return showToast("Could not determine SBI TT rate for this date. Check internet connection.", "error");
            }

            requiredQty = allocValue / (sellPrice * actualRate);

            const banner = document.getElementById("shAllocRateBanner");
            if (banner) {
                let qtyDisplayStr = `<strong>${requiredQty.toFixed(4)}</strong> shares`;
                if (wholeSharesOnly) {
                    qtyDisplayStr = `<strong>${Math.ceil(requiredQty)}</strong> shares (rounded up from ${requiredQty.toFixed(4)} to ensure target ₹${formatINR(allocValue)} is met with whole units)`;
                }
                banner.innerHTML = `Using actual SBI TT rate of <strong>₹${actualRate.toFixed(2)}</strong> (effective ${actualRateDate}) to calculate units required for target ₹${formatINR(allocValue)}. Required Qty: ${qtyDisplayStr}.`;
                banner.style.display = "block";
            }
        } else if (isTargetUsd) {
            requiredQty = allocValue / sellPrice;

            const banner = document.getElementById("shAllocRateBanner");
            if (banner) {
                let qtyDisplayStr = `<strong>${requiredQty.toFixed(4)}</strong> shares`;
                if (wholeSharesOnly) {
                    qtyDisplayStr = `<strong>${Math.ceil(requiredQty)}</strong> shares (rounded up from ${requiredQty.toFixed(4)} to ensure target $${allocValue.toFixed(2)} is met with whole units)`;
                }
                banner.innerHTML = `Calculating units required for target <strong>$${allocValue.toFixed(2)}</strong>. Required Qty: ${qtyDisplayStr}.`;
                banner.style.display = "block";
            }
        } else {
            requiredQty = allocValue;
            const banner = document.getElementById("shAllocRateBanner");
            if (banner) banner.style.display = "none";
        }

        let maxPossibleAlloc = 0;
        simState.lots.filter(l => l.ticker === ticker).forEach(l => {
            maxPossibleAlloc += wholeSharesOnly ? Math.floor(l.available_qty) : l.available_qty;
        });

        if (wholeSharesOnly) {
            requiredQty = Math.ceil(requiredQty);
        }

        if (requiredQty > maxPossibleAlloc) {
            await hideLoading();
            const unitStr = wholeSharesOnly ? "whole units" : "units";
            return showToast(`Requested target requires ${requiredQty.toFixed(4)} shares, which exceeds the maximum available ${unitStr} (${maxPossibleAlloc.toFixed(4)}) for ${ticker}.`, "error");
        }

        let activeLots = simState.lots
            .map((l, originalIdx) => ({ ...l, originalIdx }))
            .filter(l => l.ticker === ticker);

        if (strategy === "fifo") {
            activeLots.sort((a, b) => parseAppDate(a.buy_date).getTime() - parseAppDate(b.buy_date).getTime());
        } else if (strategy === "lifo") {
            activeLots.sort((a, b) => parseAppDate(b.buy_date).getTime() - parseAppDate(a.buy_date).getTime());
        } else if (strategy === "maxloss") {
            activeLots.sort((a, b) => (sellPrice - a.buy_price) - (sellPrice - b.buy_price));
        } else if (strategy === "mintax") {
            const stcgInput = document.getElementById("shStcgTaxRateInput");
            const ltcgInput = document.getElementById("shLtcgTaxRateInput");
            const stcgRate = parseFloat(stcgInput?.value) || 30;
            const ltcgRate = parseFloat(ltcgInput?.value) || 12.5;

            activeLots.forEach(lot => {
                const buyD = parseAppDate(lot.buy_date);
                const sellD = parseAppDate(sellDate);
                const days = Math.round((sellD - buyD) / 86400000);
                const isLT = days >= 730;
                
                const gainPerShare = sellPrice - lot.buy_price;
                const rate = isLT ? ltcgRate : stcgRate;
                const taxImpactPerShare = gainPerShare * (rate / 100);

                lot.taxImpactPerShare = taxImpactPerShare;
                lot.gainPerShare = gainPerShare;
                lot.isLT = isLT;
            });

            activeLots.sort((a, b) => {
                // Primary sort: by tax impact per share (lowest/most negative tax/shield first)
                if (Math.abs(a.taxImpactPerShare - b.taxImpactPerShare) > 0.000001) {
                    return a.taxImpactPerShare - b.taxImpactPerShare;
                }
                // Secondary sort fallback: if tax impact is identical, sort by higher holding duration (LT first)
                if (a.isLT !== b.isLT) {
                    return b.isLT ? -1 : 1; // choose LT first (prefer LTCG/LTCL if tax shield is equal)
                }
                return a.gainPerShare - b.gainPerShare;
            });
        }

        let remainingQtyToAllocate = requiredQty;
        const allocations = [];

        for (const lot of activeLots) {
            if (remainingQtyToAllocate <= 0.000001) break;

            let allocatedQty = 0;
            const lotAvail = lot.available_qty;

            if (wholeSharesOnly) {
                const effAvail = Math.floor(lotAvail);
                if (effAvail >= 1) {
                    const needed = Math.min(remainingQtyToAllocate, effAvail);
                    allocatedQty = Math.floor(needed);
                }
            } else {
                allocatedQty = Math.min(remainingQtyToAllocate, lotAvail);
            }

            if (allocatedQty > 0.000001) {
                remainingQtyToAllocate -= allocatedQty;
                allocations.push({
                    lotIdx: lot.originalIdx,
                    qty: allocatedQty
                });
            }
        }

        if (allocations.length === 0) {
            await hideLoading();
            return showToast("No shares allocated. Check lot available quantities or disable 'Whole units only'.", "warning");
        }

        simState.sells = simState.sells.filter(s => {
            const lot = simState.lots[parseInt(s.lotIdx)];
            return !lot || lot.ticker !== ticker;
        });

        allocations.forEach(alloc => {
            simState.sells.push({
                rowId: simState.nextRowId++,
                lotIdx: String(alloc.lotIdx),
                sell_date: sellDate,
                sell_qty: String(alloc.qty),
                sell_price: String(sellPrice)
            });
        });

        shRebuildSellsTable();
        await hideLoading();
        showToast(`Successfully allocated ${allocations.length} lot(s) for ${ticker}`, "success");

    } catch (err) {
        await hideLoading();
        showToast(`Allocation failed: ${err.message}`, "error");
    }
}

/** Build the flat lots list from current portfolio state */
export function shImportLots() {
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

    // Populate Allocator stock selection dropdown
    const allocTickerSel = document.getElementById("shAllocTicker");
    if (allocTickerSel) {
        const uniqueTickers = [...new Set(simState.lots.map(l => l.ticker))].sort();
        const prevSelected = allocTickerSel.value;
        allocTickerSel.innerHTML = '<option value="">— Select Stock —</option>' + 
            uniqueTickers.map(t => `<option value="${t}">${t}</option>`).join("");
        if (uniqueTickers.includes(prevSelected)) {
            allocTickerSel.value = prevSelected;
        } else {
            allocTickerSel.value = "";
            const badge = document.getElementById("shAllocAvailableBadge");
            if (badge) badge.style.display = "none";
        }
    }

    if (simState.lots.length === 0 && simState.sells.length === 0) {
        showToast("No available lots found in current portfolio", "warning");
    }
}

export function shLotOptions(selected = "") {
    if (simState.lots.length === 0)
        return `<option value="">— Load a portfolio first —</option>`;
    return simState.lots.map((l, i) =>
        `<option value="${i}" ${String(i) === String(selected) ? "selected" : ""}>${l.display}</option>`
    ).join("");
}

export function shAddRow(lotIdx = 0) {
    const rowId = simState.nextRowId++;
    simState.sells.push({ rowId, lotIdx: String(lotIdx), sell_date: "", sell_qty: "", sell_price: "" });

    // Hide empty placeholder
    const emptyRow = document.getElementById("shEmptyRow");
    if (emptyRow) emptyRow.style.display = "none";

    const tbody = document.getElementById("shSellsBody");
    if (!tbody) return;
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
                <button class="btn btn-sm btn-fetch-price sh-fetch-price-btn" title="Fetch current live price">${LIVE_BTN_HTML}</button>
            </div>
        </td>
        <td><span class="sh-holding-badge neutral">—</span></td>
        <td><button class="btn btn-sm btn-danger sh-remove-btn">${CROSS_SVG}</button></td>
    `;

    // Initialize date picker
    initDatePicker(tr.querySelector(".sh-sell-date"), {
        onChange: (selectedDates, dateStr) => {
            const row = simState.sells.find(s => s.rowId === rowId);
            if (row) {
                row.sell_date = dateStr;
                updateBadge();
            }
        }
    });

    // Update buy price helper
    const updateBuyPrice = () => {
        const lotSelect = tr.querySelector(".sh-lot-select");
        if (!lotSelect) return;
        const lotI = parseInt(lotSelect.value);
        const lot = simState.lots[lotI];
        const cell = tr.querySelector(".sh-sell-buy-price");
        if (cell) {
            if (lot && lot.buy_price) {
                cell.textContent = `$${parseFloat(lot.buy_price).toFixed(2)}`;
            } else {
                cell.textContent = "—";
            }
        }
    };
    updateBuyPrice();
    tr.querySelector(".sh-lot-select").addEventListener("change", updateBuyPrice);

    // Holding badge updater
    const updateBadge = () => {
        const sell = simState.sells.find(s => s.rowId === rowId);
        if (!sell) return;
        const lotSelect = tr.querySelector(".sh-lot-select");
        if (!lotSelect) return;
        const lotI = parseInt(lotSelect.value);
        const lot = simState.lots[lotI];
        const sellDateVal = tr.querySelector(".sh-sell-date").value;
        const badge = tr.querySelector(".sh-holding-badge");
        if (!badge) return;
        if (!lot || !sellDateVal) {
            badge.className = "sh-holding-badge neutral";
            badge.textContent = "—";
            return;
        }
        const buyD = parseAppDate(lot.buy_date);
        const sellD = parseAppDate(sellDateVal);
        if (!buyD || !sellD) {
            badge.className = "sh-holding-badge neutral";
            badge.textContent = "—";
            return;
        }
        const days = Math.round((sellD - buyD) / 86400000);
        const isLT = days >= 730;
        const type = isLT ? "long-term" : "short-term";
        const label = isLT ? "Long Term" : "Short Term";
        badge.className = `sh-holding-badge ${type}`;
        badge.textContent = `${label} · ${days}d`;
    };

    tr.querySelector(".sh-lot-select").addEventListener("change", e => {
        const sell = simState.sells.find(s => s.rowId === rowId);
        if (sell) sell.lotIdx = e.target.value;
        updateBadge();
        shValidateAllSells();
    });
    tr.querySelector(".sh-sell-date").addEventListener("change", e => {
        const sell = simState.sells.find(s => s.rowId === rowId);
        if (sell) sell.sell_date = e.target.value;
        updateBadge();
    });
    tr.querySelector(".sh-sell-qty").addEventListener("input", e => {
        const sell = simState.sells.find(s => s.rowId === rowId);
        if (sell) sell.sell_qty = e.target.value;
        shValidateAllSells();
    });
    tr.querySelector(".sh-sell-all-btn").addEventListener("click", () => {
        const lotSelect = tr.querySelector(".sh-lot-select");
        if (!lotSelect) return;
        const lotI = parseInt(lotSelect.value);
        const lot = simState.lots[lotI];
        if (lot) {
            const qtyInput = tr.querySelector(".sh-sell-qty");
            qtyInput.value = lot.available_qty;
            const sell = simState.sells.find(s => s.rowId === rowId);
            if (sell) sell.sell_qty = String(lot.available_qty);
            updateBadge();
            shValidateAllSells();
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
        const lotSelect = tr.querySelector(".sh-lot-select");
        if (!lotSelect) return;
        const lotI = parseInt(lotSelect.value);
        const lot = simState.lots[lotI];
        if (!lot) return showToast("Select a lot first", "warning");
        const btn = tr.querySelector(".sh-fetch-price-btn");
        btn.disabled = true;
        btn.innerHTML = FETCH_LOADING_HTML;
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
            btn.innerHTML = LIVE_BTN_HTML;
        }
    });

    tr.querySelector(".sh-remove-btn").addEventListener("click", () => {
        simState.sells = simState.sells.filter(s => s.rowId !== rowId);
        tr.remove();
        shValidateAllSells();
        if (simState.sells.length === 0) {
            const empty = document.getElementById("shEmptyRow");
            if (empty) empty.style.display = "";
            const simBtn = document.getElementById("shSimulateBtn");
            if (simBtn) simBtn.style.display = "none";
            const resultsSec = document.getElementById("shResultsSection");
            if (resultsSec) resultsSec.classList.add("hidden");
        }
    });

    tbody.appendChild(tr);
    updateBadge(); // set initial badge with today's date
    const simBtn = document.getElementById("shSimulateBtn");
    if (simBtn) simBtn.style.display = "";
    shValidateAllSells();
}

export async function shRunSimulation() {
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
            sbi_tt_mode: 'split'
        });
        await hideLoading();
        if (!result.success) return showToast(`Simulation error: ${result.error}`, "error");
        
        shRenderResults(result);
    } catch (e) {
        await hideLoading();
        showToast(`Error: ${e.message}`, "error");
    }
}

export function shRenderResults(data) {
    const section = document.getElementById("shResultsSection");
    if (!section) return;
    section.classList.remove("hidden");
    section.scrollIntoView({ behavior: "smooth" });

    // Store data in state
    simState.lastResults = data;

    // ── Update total proceeds cards ───────────────────────────────────────
    const totalProceedsTaxEl = document.getElementById("shTotalProceedsTax");
    const totalProceedsActualEl = document.getElementById("shTotalProceedsActual");
    if (totalProceedsTaxEl) {
        totalProceedsTaxEl.textContent = data.total_proceeds_tax_inr != null ? "₹" + formatINR(data.total_proceeds_tax_inr) : "—";
    }
    if (totalProceedsActualEl) {
        totalProceedsActualEl.textContent = data.total_proceeds_actual_inr != null ? "₹" + formatINR(data.total_proceeds_actual_inr) : "—";
    }

    // Calculate Overall XIRR (Actual) in INR
    const cashFlows = [];
    data.sells.forEach(s => {
        const buyD = parseAppDate(s.buy_date);
        const sellD = parseAppDate(s.sell_date);
        const buyRate = s.ttbr_buy_actual;
        const sellRate = s.ttbr_sell_actual;
        
        if (buyD && sellD && buyRate && sellRate && s.buy_price && s.sell_price) {
            const buyValInr = s.sell_qty * s.buy_price * buyRate;
            const sellValInr = s.sell_qty * s.sell_price * sellRate;
            if (buyValInr > 0 && sellValInr > 0) {
                cashFlows.push({ date: buyD, amount: -buyValInr });
                cashFlows.push({ date: sellD, amount: sellValInr });
            }
        }
    });

    const overallXirrEl = document.getElementById("shOverallXIRR");
    if (overallXirrEl) {
        const overallXirr = calculateXIRR(cashFlows);
        if (overallXirr !== null) {
            const pct = overallXirr * 100;
            const isProfit = pct >= 0;
            overallXirrEl.textContent = (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
            overallXirrEl.style.color = isProfit ? "var(--success)" : "var(--danger)";
        } else {
            overallXirrEl.textContent = "—";
            overallXirrEl.style.color = "var(--text-muted)";
        }
    }

    // ── Per-sell table ───────────────────────────────────────────────────
    const tbody = document.getElementById("shResultsBody");
    if (!tbody) return;
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

        const gainActualColor = s.gain_actual_inr == null ? "var(--text-muted)" :
            s.gain_actual_inr >= 0 ? "var(--success)" : "var(--danger)";
        const gainActualStr = s.gain_actual_inr == null ? "—" :
            (s.gain_actual_inr >= 0 ? "" : "−") + "₹" + formatINR(Math.abs(s.gain_actual_inr));

        // Per-sell XIRR Calculation
        const buyD = parseAppDate(s.buy_date);
        const sellD = parseAppDate(s.sell_date);
        const buyRate = s.ttbr_buy_actual;
        const sellRate = s.ttbr_sell_actual;
        let xirrText = "—";
        let xirrColor = "var(--text-muted)";
        
        if (buyD && sellD && buyRate && sellRate && s.buy_price && s.sell_price) {
            const days = Math.round((sellD - buyD) / 86400000);
            if (days > 0) {
                const buyValInr = s.sell_qty * s.buy_price * buyRate;
                const sellValInr = s.sell_qty * s.sell_price * sellRate;
                if (buyValInr > 0) {
                    const xirrVal = Math.pow(sellValInr / buyValInr, 365 / days) - 1;
                    const xirrPct = xirrVal * 100;
                    xirrColor = xirrPct >= 0 ? "var(--success)" : "var(--danger)";
                    xirrText = (xirrPct >= 0 ? "+" : "") + xirrPct.toFixed(2) + "%";
                }
            } else {
                xirrColor = "var(--danger)";
                xirrText = "0.00%";
            }
        }

        const cat = s.category ? catMeta[s.category] : null;
        const catBadge = cat
            ? `<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.71rem;font-weight:700;background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${cat.label}</span>`
            : `<span style="color:var(--text-muted);font-size:0.8rem;">${s.error || "—"}</span>`;

        tr.innerHTML = `
            <td style="font-weight:600;color:var(--accent);">${s.ticker}</td>
            <td style="color:var(--text-muted);font-size:0.8rem;">${s.buy_date}</td>
            <td style="color:var(--text-muted);font-size:0.8rem;">${s.sell_date}</td>
            <td>${s.sell_qty}</td>
            <td>${s.sell_proceeds_inr != null ? "₹" + formatINR(s.sell_proceeds_inr) : "—"}</td>
            <td>${s.sell_proceeds_actual_inr != null ? "₹" + formatINR(s.sell_proceeds_actual_inr) : "—"}</td>
            <td style="color:${gainColor};font-weight:700;">${gainStr}</td>
            <td style="color:${gainActualColor};font-weight:700;">${gainActualStr}</td>
            <td style="color:${xirrColor};font-weight:700;white-space:nowrap;">${xirrText}</td>
            <td>${catBadge}</td>
            <td style="color:var(--text-muted);font-size:0.8rem;">${s.ttbr_sell != null ? "₹" + s.ttbr_sell + "<br><span style='font-size:0.7rem;'>" + (s.ttbr_sell_date || "") + "</span>" : "—"}</td>
            <td style="color:var(--text-muted);font-size:0.8rem;">${s.ttbr_sell_actual != null ? "₹" + s.ttbr_sell_actual + "<br><span style='font-size:0.7rem;'>" + (s.ttbr_sell_actual_date || "") + "</span>" : "—"}</td>
        `;
        tbody.appendChild(tr);
    });

    // ── Offset card ──────────────────────────────────────────────────────
    const offCard = document.getElementById("shOffsetCard");
    if (!offCard) return;
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

    // Render Simulated Tax Liability Card
    shRenderTaxLiability();

    showToast(`Simulated ${data.sells.length} sell(s) successfully`, "success");
}

export function shRenderLotsReference() {
    const tbody = document.getElementById("shLotsRefBody");
    if (!tbody) return;
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

export function initSimTaxRates() {
    const stcgInput = document.getElementById("shStcgTaxRateInput");
    const ltcgInput = document.getElementById("shLtcgTaxRateInput");

    if (stcgInput) {
        const savedStcg = localStorage.getItem("fa_sim_stcg_tax_rate");
        if (savedStcg !== null) {
            stcgInput.value = savedStcg;
        } else {
            stcgInput.value = "30";
        }
        stcgInput.addEventListener("input", () => {
            localStorage.setItem("fa_sim_stcg_tax_rate", stcgInput.value);
            shRenderTaxLiability();
        });
    }

    if (ltcgInput) {
        const savedLtcg = localStorage.getItem("fa_sim_ltcg_tax_rate");
        if (savedLtcg !== null) {
            ltcgInput.value = savedLtcg;
        } else {
            ltcgInput.value = "12.5";
        }
        ltcgInput.addEventListener("input", () => {
            localStorage.setItem("fa_sim_ltcg_tax_rate", ltcgInput.value);
            shRenderTaxLiability();
        });
    }
}

export function shRenderTaxLiability() {
    const cardEl = document.getElementById("shTaxLiabilityCard");
    if (!cardEl) return;
    cardEl.innerHTML = "";

    const titleEl = document.getElementById("shTaxLiabilityTitle");
    const data = simState.lastResults;
    if (!data || !data.offset) {
        cardEl.style.display = "none";
        if (titleEl) titleEl.style.display = "none";
        return;
    }

    cardEl.style.display = "grid";
    if (titleEl) titleEl.style.display = "";

    const stcgRateInput = document.getElementById("shStcgTaxRateInput");
    const ltcgRateInput = document.getElementById("shLtcgTaxRateInput");
    const stcgRate = parseFloat(stcgRateInput?.value) || 0;
    const ltcgRate = parseFloat(ltcgRateInput?.value) || 0;

    localStorage.setItem("fa_sim_stcg_tax_rate", stcgRate);
    localStorage.setItem("fa_sim_ltcg_tax_rate", ltcgRate);

    const off = data.offset;
    const netStcg = Math.max(0, off.net_stcg || 0);
    const netLtcg = Math.max(0, off.net_ltcg || 0);

    const stcgTax = netStcg * (stcgRate / 100);
    const ltcgTax = netLtcg * (ltcgRate / 100);
    const totalTax = stcgTax + ltcgTax;

    cardEl.style.cssText = [
        "background:var(--bg-input);border-radius:10px;",
        "border:1px solid var(--border);padding:20px 24px;",
        "display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-bottom:16px;"
    ].join("");

    function buildTaxCol(title, netGains, rate, calculatedTax, color) {
        const col = document.createElement("div");
        col.style.cssText = "display:flex;flex-direction:column;justify-content:space-between;height:100%;";
        
        const topSection = document.createElement("div");
        const colTitle = document.createElement("div");
        colTitle.style.cssText = "font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;";
        colTitle.textContent = title;
        topSection.appendChild(colTitle);

        const list = document.createElement("div");
        list.style.cssText = "display:flex;flex-direction:column;gap:6px;";
        
        const gainRow = document.createElement("div");
        gainRow.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;";
        gainRow.innerHTML = `<span style="font-size:0.82rem;color:var(--text-main);">Net Taxable Gain:</span>` +
                            `<span style="font-size:0.85rem;font-weight:600;color:var(--text-main);font-variant-numeric:tabular-nums;">₹${formatINR(netGains)}</span>`;
        
        const rateRow = document.createElement("div");
        rateRow.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;";
        rateRow.innerHTML = `<span style="font-size:0.82rem;color:var(--text-muted);">Tax Rate:</span>` +
                            `<span style="font-size:0.85rem;font-weight:600;color:var(--text-muted);font-variant-numeric:tabular-nums;">${rate}%</span>`;
        
        list.appendChild(gainRow);
        list.appendChild(rateRow);
        topSection.appendChild(list);
        col.appendChild(topSection);

        const taxBox = document.createElement("div");
        taxBox.style.cssText = [
            "display:flex;justify-content:space-between;align-items:center;",
            "margin-top:14px;padding:10px 12px;border-radius:7px;",
            `background:${color}12;`,
            `border:1px solid ${color}33;`
        ].join("");
        taxBox.innerHTML =
            `<span style="font-size:0.82rem;font-weight:700;color:var(--text-main);">Calculated Tax</span>` +
            `<span style="font-size:0.95rem;font-weight:800;color:${color};font-variant-numeric:tabular-nums;">₹${formatINR(calculatedTax)}</span>`;
        
        col.appendChild(taxBox);
        return col;
    }

    cardEl.appendChild(buildTaxCol("Short-Term Tax (STCG)", netStcg, stcgRate, stcgTax, "#22c55e"));
    cardEl.appendChild(buildTaxCol("Long-Term Tax (LTCG)", netLtcg, ltcgRate, ltcgTax, "#10b981"));

    const grandRow = document.createElement("div");
    grandRow.style.cssText = [
        "grid-column:1/-1;margin-top:4px;padding:12px 16px;border-radius:8px;",
        "background:linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(168,85,247,0.15) 100%);",
        "border:1px solid rgba(99,102,241,0.3);",
        "display:flex;justify-content:space-between;align-items:center;box-shadow: 0 4px 12px rgba(99,102,241,0.05);"
    ].join("");
    
    grandRow.onmouseenter = () => { grandRow.style.boxShadow = "0 4px 16px rgba(99,102,241,0.15)"; grandRow.style.transform = "translateY(-1px)"; grandRow.style.transition = "all 0.2s ease"; };
    grandRow.onmouseleave = () => { grandRow.style.boxShadow = "0 4px 12px rgba(99,102,241,0.05)"; grandRow.style.transform = "none"; };

    grandRow.innerHTML = 
        `<div style="display:flex;align-items:center;gap:10px;">` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 8h12M6 3a6 6 0 0 1 6 6c0 3.3-2.7 6-6 6M9 15l6 6"/></svg>` +
            `<span style="font-size:0.9rem;font-weight:700;color:var(--text-main);">Total Estimated Tax Liability</span>` +
        `</div>` +
        `<span style="font-size:1.15rem;font-weight:800;color:var(--accent);font-variant-numeric:tabular-nums;text-shadow:0 0 8px rgba(99,102,241,0.2);">₹${formatINR(totalTax)}</span>`;
    
    cardEl.appendChild(grandRow);
}
