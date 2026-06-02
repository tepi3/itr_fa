import { state, pushUndoSnapshot, markDirty, dispatchStateChange } from '../state.js';
import { apiGet, apiPost } from '../api.js';
import { generateId, parseAppDate, formatAppDate, initDatePicker } from '../utils.js';
import { 
    showToast, showLoading, hideLoading, startSmoothProgress, stopSmoothProgress, updateCalcButtonVisibility 
} from '../ui-utils.js';
import { updateDashboard } from './dashboard.js';
import {
    CHEVRON_DOWN_SVG, CHEVRON_RIGHT_SVG, CROSS_SVG, FETCH_BTN_HTML,
    FETCH_LOADING_HTML, FETCH_DIVS_BTN_HTML, FETCH_DETAILS_BTN_HTML
} from '../constants.js';

// ===== Sparklines Cache & Hover =====
let _sparklineCache = {};

export function initTickerHover(el, ticker) {
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

export function drawSparkline(canvas, data, isPositive = true) {
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

// ===== Skeleton Loaders =====
export function renderStockCardSkeletons(count = 3) {
    const container = document.getElementById("stockCards");
    if (!container) return;
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

// ===== Stock Lookup =====
export async function lookupStock() {
    const tickerInput = document.getElementById("tickerInput");
    if (!tickerInput) return;
    const ticker = tickerInput.value.trim().toUpperCase();
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
        updateCalcButtonVisibility(state.portfolio.stocks.length);
        tickerInput.value = "";
        showToast(`Added ${info.display_name}`, "success");
    } catch (e) {
        await hideLoading();
        showToast(`Error looking up ${ticker}: ${e.message}`, "error");
    }
}

// ===== Render Stock Card =====
export function setCardLoading(stockId, isLoading) {
    const card = document.querySelector(`.stock-card[data-stock-id="${stockId}"]`);
    if (!card) return;
    if (isLoading) {
        card.classList.add("loading-skeleton");
    } else {
        card.classList.remove("loading-skeleton");
    }
}

export function renderStockCard(stock) {
    const template = document.getElementById("stockCardTemplate");
    if (!template) return;
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
    if (lotTable) lotTable.closest(".lots-section")?.classList.add("lots-section");
    const sellTable = card.querySelector(".sells-table");
    if (sellTable) sellTable.closest(".sells-section")?.classList.add("sells-section");
    const divTable = card.querySelector(".dividends-table");
    if (divTable) divTable.closest(".dividends-section")?.classList.add("dividends-section");

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
        updateCalcButtonVisibility(state.portfolio.stocks.length);
        showToast(`Removed ${stock.ticker}`, "info");
    });

    // Add lot button
    card.querySelector(".add-lot-btn").addEventListener("click", () => addLotRow(card, stock));

    // Add sell button
    card.querySelector(".add-sell-btn").addEventListener("click", () => addSellRow(card, stock));

    // Add div button
    card.querySelector(".add-div-btn").addEventListener("click", () => addDividendRow(card, stock));

    // Setup and restore sells view mode buttons (Taxable vs Actual) per stock
    const isActual = (stock.sell_view_mode === "actual");
    const toggleTax = card.querySelector(".stock-sell-view-toggle .toggle-tax");
    const toggleActual = card.querySelector(".stock-sell-view-toggle .toggle-actual");
    if (toggleTax && toggleActual) {
        if (isActual) {
            toggleActual.classList.add("active");
            toggleTax.classList.remove("active");
        } else {
            toggleTax.classList.add("active");
            toggleActual.classList.remove("active");
        }

        toggleTax.addEventListener("click", () => {
            if (stock.sell_view_mode !== "taxable") {
                toggleTax.classList.add("active");
                toggleActual.classList.remove("active");
                stock.sell_view_mode = "taxable";
                dispatchStateChange("sell-view-mode-change");
            }
        });

        toggleActual.addEventListener("click", () => {
            if (stock.sell_view_mode !== "actual") {
                toggleActual.classList.add("active");
                toggleTax.classList.remove("active");
                stock.sell_view_mode = "actual";
                dispatchStateChange("sell-view-mode-change");
            }
        });
    }

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

export function syncStockFromCard(card) {
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
export function addLotRow(card, stock, lotData = null) {
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

export function renderLotRow(card, stock, lot) {
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

    // Initialize date picker
    initDatePicker(tr.querySelector(".lot-date"), {
        onChange: (selectedDates, dateStr) => {
            pushUndoSnapshot("Edit Lot Date");
            lot.buy_date = dateStr;
            updateSellLotOptions(card, stock);
            validateSellQuantities(stock, lot);
        }
    });

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
export function validateSellQuantities(stock, lot) {
    if (!lot) return true;
    const totalSold = (lot.sells || []).reduce((sum, s) => sum + (parseFloat(s.quantity) || 0), 0);
    // Use a small epsilon for float comparison to avoid issues with floating point precision
    if (totalSold > parseFloat(lot.quantity) + 0.000001) {
        showToast(`Warning for ${stock.ticker}: Total sold (${totalSold.toFixed(4).replace(/\.?0+$/, "")}) from lot bought on ${formatAppDate(parseAppDate(lot.buy_date))} exceeds its quantity (${lot.quantity})`, "warning");
        return false;
    }
    return true;
}

export function addSellRow(card, stock, lotId = null, sellData = null) {
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

export function renderSellRow(card, stock, lot, sell) {
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
        <td class="sell-xirr-container">—</td>
        <td><button class="btn btn-sm btn-danger remove-sell-btn">${CROSS_SVG}</button></td>
    `;

    // Initialize date picker
    initDatePicker(tr.querySelector(".sell-date"), {
        onChange: (selectedDates, dateStr) => {
            pushUndoSnapshot(`Edit Sell Date (${stock.ticker})`);
            sell.sell_date = dateStr;
            validateSellQuantities(stock, lot);
        }
    });

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
            const xirrContainer = tr.querySelector(".sell-xirr-container");
            if (xirrContainer) xirrContainer.innerHTML = "—";

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

export function updateSellLotOptions(card, stock) {
    card.querySelectorAll(".sell-lot-select").forEach(select => {
        const currentValue = select.value;
        select.innerHTML = stock.lots.map(l =>
            `<option value="${l.id}" ${l.id === currentValue ? "selected" : ""}>${l.buy_date ? formatAppDate(parseAppDate(l.buy_date)) : "No date"} (qty: ${l.quantity || 0})</option>`
        ).join("");
    });
}

// ===== Peak Price Badge =====
export function showPeakPriceBadge(card, maxPrice, maxDate) {
    const badge = card.querySelector(".stock-peak-badge");
    const label = card.querySelector(".peak-price-label");
    if (!badge || !label) return;
    const displayDate = maxDate ? formatAppDate(parseAppDate(maxDate)) : "?";
    label.textContent = `Peak Price: $${maxPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} on ${displayDate}`;
    badge.classList.remove("hidden");
}

// ===== Dividends =====
export function addDividendRow(card, stock, divData = null) {
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

export function renderDividendRow(card, stock, div) {
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

    // Initialize date pickers
    initDatePicker(exDateInput, {
        onChange: (selectedDates, dateStr) => {
            pushUndoSnapshot("Edit Dividend Ex-Date");
            div.ex_date = dateStr;
            // Auto-fill payment date if it's empty
            if (!payDateInput.value) {
                payDateInput._flatpickr.setDate(dateStr);
                div.payment_date = dateStr;
            }
        }
    });
    initDatePicker(payDateInput, {
        onChange: (selectedDates, dateStr) => {
            pushUndoSnapshot("Edit Dividend Payment Date");
            div.payment_date = dateStr;
        }
    });

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

// ===== Fetch Dividends (Per-Stock & All) =====
export async function fetchDividendsForStock(card, stock) {
    const ticker = stock.yahoo_ticker || stock.ticker;
    const year = state.portfolio.calendar_year;
    const btn = card.querySelector(".fetch-dividends-btn");
    btn.disabled = true;
    btn.innerHTML = FETCH_LOADING_HTML;
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
        btn.innerHTML = FETCH_DIVS_BTN_HTML;
    }
}

export async function fetchCompanyDetailsForStock(card, stock) {
    const ticker = stock.ticker;
    const btn = card.querySelector(".fetch-company-details-btn");
    btn.disabled = true;
    btn.innerHTML = FETCH_LOADING_HTML;
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
        btn.innerHTML = FETCH_DETAILS_BTN_HTML;
    }
}

export async function fetchAllDividends() {
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

// ===== Runtime Data Fetcher =====
export async function fetchRuntimeDataForAllStocks() {
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

// ===== Drag and Drop Stock Reordering =====
export function initDragAndDrop(card, stock) {
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
export function initCsvLotImport(card, stock) {
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
