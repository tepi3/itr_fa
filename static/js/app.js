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
    isDirty: false, // Track unsaved changes
};

// ===== Undo/Redo =====
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 50;

function pushUndoSnapshot() {
    undoStack.push(JSON.parse(JSON.stringify(state.portfolio)));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0; // clear redo on new action
    updateUndoRedoButtons();
    markDirty();
}

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.parse(JSON.stringify(state.portfolio)));
    state.portfolio = undoStack.pop();
    restorePortfolioUI();
    updateUndoRedoButtons();
    showToast("Undone", "info", 1500);
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.parse(JSON.stringify(state.portfolio)));
    state.portfolio = redoStack.pop();
    restorePortfolioUI();
    updateUndoRedoButtons();
    showToast("Redone", "info", 1500);
}

function restorePortfolioUI() {
    document.getElementById("stockCards").innerHTML = "";
    state.portfolio.stocks.forEach(stock => renderStockCard(stock));
    updateCalcButtonVisibility();
    clearCalculatedSections();
}

function updateUndoRedoButtons() {
    document.getElementById("undoBtn").disabled = undoStack.length === 0;
    document.getElementById("redoBtn").disabled = redoStack.length === 0;
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
    // Hide and clear tax year summary section
    document.getElementById("taxYearSection").classList.add("hidden");
    document.getElementById("taxYearBlocks").innerHTML = "";
    // Clear per-stock summary and pie chart
    const summaryBody = document.getElementById("stockSummaryTableBody");
    if (summaryBody) summaryBody.innerHTML = "";
    const pieCanvas = document.getElementById("assetPieChart");
    if (pieCanvas) {
        const ctx = pieCanvas.getContext("2d");
        ctx.clearRect(0, 0, pieCanvas.width, pieCanvas.height);
    }
    const pieLegend = document.getElementById("assetPieChartLegend");
    if (pieLegend) pieLegend.innerHTML = "";
}

// ===== Initialization =====
document.addEventListener("DOMContentLoaded", () => {
    initYearSelectors();
    initFYYearSelector();
    bindEvents();
    initUserSelection();
    initSellHelper();
    initTutorial();
});

function initYearSelectors() {
    const mainSelect = document.getElementById("yearSelect");
    const rateYearSelect = document.getElementById("ratesYearSelect");
    const initialSelect = document.getElementById("initialYearSelect");
    
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 2000; y--) {
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
    document.getElementById("calculateBtn").addEventListener("click", calculateAll);
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
    document.getElementById("undoBtn").addEventListener("click", undo);
    document.getElementById("redoBtn").addEventListener("click", redo);
    document.getElementById("helpBtn").addEventListener("click", startTutorial);
    document.getElementById("generateFYBtn").addEventListener("click", fetchConsolidatedTaxSummary);
    
    document.getElementById("uploadEtradeBtn").addEventListener("click", openEtradeModal);
    document.getElementById("switchUserBtn").addEventListener("click", () => {
        document.getElementById("appHeader").classList.add("hidden");
        document.getElementById("appMain").classList.add("hidden");
        document.getElementById("userSelectionScreen").classList.remove("hidden");
        state.username = null;
        fetchUsers();
    });

    // Keyboard shortcuts for undo/redo
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "Z" || (e.key === "z" && e.shiftKey))) {
            e.preventDefault();
            redo();
        }
    });

    // ===== Floating Calculate A3 Button (IntersectionObserver) =====
    const calcSection = document.getElementById("calcSection");
    const calcFab = document.getElementById("calcFab");
    if (calcSection && calcFab && typeof IntersectionObserver !== "undefined") {
        const calcObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // Show FAB only when calcSection is NOT visible AND has stocks
                if (!entry.isIntersecting && !calcSection.classList.contains("hidden")) {
                    calcFab.classList.remove("hidden");
                } else {
                    calcFab.classList.add("hidden");
                }
            });
        }, { threshold: 0.1 });
        calcObserver.observe(calcSection);
    }
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
        hideLoading();
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
                <button type="button" class="btn btn-sm btn-outline rename-user-btn" title="Rename" style="padding:4px 8px;">✏️</button>
                <button type="button" class="btn btn-sm btn-outline delete-user-btn" title="Delete" style="padding:4px 8px; border-color:var(--danger); color:var(--danger);">🗑️</button>
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
                hideLoading();
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
                hideLoading();
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
    const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };
    toast.innerHTML = `<span>${icons[type] || ""}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = "slideOut 0.3s ease forwards";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ===== Loading Overlay =====
function showLoading(text = "Loading...") {
    document.getElementById("loadingText").textContent = text;
    document.getElementById("loadingOverlay").classList.remove("hidden");
}

function hideLoading() {
    document.getElementById("loadingOverlay").classList.add("hidden");
}

// ===== Collapsible Sections =====
function toggleSection(id) {
    const el = document.getElementById(id);
    el.classList.toggle("collapsed");
    const icon = el.previousElementSibling.querySelector(".toggle-icon");
    if (icon) icon.style.transform = el.classList.contains("collapsed") ? "rotate(-90deg)" : "";
}



// ===== Stock Lookup =====
async function lookupStock() {
    const ticker = document.getElementById("tickerInput").value.trim().toUpperCase();
    if (!ticker) return showToast("Enter a ticker symbol", "warning");

    // Check if already added
    if (state.portfolio.stocks.find(s => s.ticker === ticker)) {
        return showToast(`${ticker} is already added`, "warning");
    }

    pushUndoSnapshot();
    showLoading(`Looking up ${ticker}...`);
    try {
        const info = await apiPost("/api/lookup-stock", { ticker });

        if (!info.success) {
            hideLoading();
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
                    amount: d.amount
                }));
            }
        } catch (e) { console.warn("Failed to fetch dividends", e); }

        hideLoading();
        state.portfolio.stocks.push(stock);
        renderStockCard(stock);
        updateCalcButtonVisibility();
        document.getElementById("tickerInput").value = "";
        showToast(`Added ${info.display_name}`, "success");
    } catch (e) {
        hideLoading();
        showToast(`Error looking up ${ticker}: ${e.message}`, "error");
    }
}

// ===== Render Stock Card =====
function renderStockCard(stock) {
    const template = document.getElementById("stockCardTemplate");
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector(".stock-card");

    card.dataset.stockId = stock.id;
    card.querySelector(".stock-ticker").textContent = stock.ticker;
    card.querySelector(".stock-name").textContent = stock.company_info.name;

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

    // Bind company info changes
    card.querySelectorAll(".company-info-section input, .company-info-section select").forEach(el => {
        el.addEventListener("change", () => syncStockFromCard(card));
    });

    card.querySelector(".skip-dividends-check").addEventListener("change", () => syncStockFromCard(card));

    // Toggle details
    card.querySelector(".toggle-details-btn").addEventListener("click", (e) => {
        const body = card.querySelector(".stock-card-body");
        body.classList.toggle("collapsed");
        e.target.textContent = body.classList.contains("collapsed") ? "▶ Details" : "▼ Details";
    });

    // Remove stock
    card.querySelector(".remove-stock-btn").addEventListener("click", () => {
        pushUndoSnapshot();
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

    // Render existing lots, sells, and dividends
    stock.lots.forEach(lot => renderLotRow(card, stock, lot));
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
        pushUndoSnapshot();
        stock.lots.push(lot);
    }

    renderLotRow(card, stock, lot);
}

function renderLotRow(card, stock, lot) {
    const tbody = card.querySelector(".lots-tbody");
    const tr = document.createElement("tr");
    tr.dataset.lotId = lot.id;

    tr.innerHTML = `
        <td><input type="date" class="lot-date" value="${lot.buy_date}"></td>
        <td><input type="number" class="lot-qty" value="${lot.quantity}" step="any" min="0" placeholder="0"></td>
        <td>
            <div class="price-input-group">
                <input type="number" class="lot-price" value="${lot.buy_price}" step="any" min="0" placeholder="0.00">
                <button class="btn btn-sm btn-fetch-price fetch-close-price-btn" title="Fetch closing price for this date">📈 Fetch</button>
            </div>
        </td>
        <td><button class="btn btn-sm btn-danger remove-lot-btn">✕</button></td>
    `;

    // Bind changes
    tr.querySelectorAll("input").forEach(input => {
        input.addEventListener("change", () => {
            lot.buy_date = tr.querySelector(".lot-date").value;
            lot.quantity = parseFloat(tr.querySelector(".lot-qty").value) || 0;
            lot.buy_price = parseFloat(tr.querySelector(".lot-price").value) || 0;
            updateSellLotOptions(card, stock);
        });
    });

    // Fetch closing price
    tr.querySelector(".fetch-close-price-btn").addEventListener("click", async () => {
        const dateVal = tr.querySelector(".lot-date").value;
        if (!dateVal) return showToast("Set a buy date first before fetching price", "warning");

        const ticker = stock.yahoo_ticker || stock.ticker;
        const btn = tr.querySelector(".fetch-close-price-btn");
        btn.disabled = true;
        btn.textContent = "⏳ Fetching…";

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
            btn.textContent = "📈 Fetch";
        }
    });

    // Remove
    tr.querySelector(".remove-lot-btn").addEventListener("click", () => {
        pushUndoSnapshot();
        stock.lots = stock.lots.filter(l => l.id !== lot.id);
        tr.remove();
        updateSellLotOptions(card, stock);
    });

    tbody.appendChild(tr);
    updateSellLotOptions(card, stock);
}

// ===== Sells =====
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
        pushUndoSnapshot();
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
        `<option value="${l.id}" ${l.id === lot.id ? "selected" : ""}>${l.buy_date || "No date"} (qty: ${l.quantity || 0})</option>`
    ).join("");

    const buyPrice = lot.buy_price ? `$${parseFloat(lot.buy_price).toFixed(2)}` : "—";

    tr.innerHTML = `
        <td><select class="sell-lot-select">${lotOptions}</select></td>
        <td class="sell-buy-price">${buyPrice}</td>
        <td><input type="date" class="sell-date" value="${sell.sell_date}"></td>
        <td><input type="number" class="sell-qty" value="${sell.quantity}" step="any" min="0" placeholder="0"></td>
        <td><input type="number" class="sell-price" value="${sell.sell_price}" step="any" min="0" placeholder="0.00"></td>
        <td class="sell-pl-container"></td>
        <td><button class="btn btn-sm btn-danger remove-sell-btn">✕</button></td>
    `;

    // Bind changes
    tr.querySelectorAll("input").forEach(input => {
        input.addEventListener("change", () => {
            sell.sell_date = tr.querySelector(".sell-date").value;
            sell.quantity = parseFloat(tr.querySelector(".sell-qty").value) || 0;
            sell.sell_price = parseFloat(tr.querySelector(".sell-price").value) || 0;
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
            // Clear P&L as it needs recalculation
            const plContainer = tr.querySelector(".sell-pl-container");
            if (plContainer) plContainer.innerHTML = "";
        }
    });

    // Remove
    tr.querySelector(".remove-sell-btn").addEventListener("click", () => {
        pushUndoSnapshot();
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
            `<option value="${l.id}" ${l.id === currentValue ? "selected" : ""}>${l.buy_date || "No date"} (qty: ${l.quantity || 0})</option>`
        ).join("");
    });
}

// ===== Peak Price Badge =====
function showPeakPriceBadge(card, maxPrice, maxDate) {
    const badge = card.querySelector(".stock-peak-badge");
    const label = card.querySelector(".peak-price-label");
    if (!badge || !label) return;
    label.textContent = `Peak Price: $${maxPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} on ${maxDate}`;
    badge.classList.remove("hidden");
}

// ===== Dividends =====
function addDividendRow(card, stock, divData = null) {
    const div = divData || {
        id: generateId(),
        ex_date: "",
        amount: "",
    };
    if (!divData) {
        pushUndoSnapshot();
        if (!stock.dividends) stock.dividends = [];
        stock.dividends.push(div);
    }
    renderDividendRow(card, stock, div);
}

function renderDividendRow(card, stock, div) {
    const tbody = card.querySelector(".dividends-tbody");
    const tr = document.createElement("tr");
    tr.dataset.divId = div.id;

    tr.innerHTML = `
        <td><input type="date" class="div-date" value="${div.ex_date}"></td>
        <td><input type="number" class="div-amount" value="${div.amount}" step="any" min="0" placeholder="0.00"></td>
        <td><button class="btn btn-sm btn-danger remove-div-btn">✕</button></td>
    `;

    tr.querySelectorAll("input").forEach(input => {
        input.addEventListener("change", () => {
            div.ex_date = tr.querySelector(".div-date").value;
            div.amount = parseFloat(tr.querySelector(".div-amount").value) || 0;
        });
    });

    tr.querySelector(".remove-div-btn").addEventListener("click", () => {
        pushUndoSnapshot();
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

    showLoading("Generating FA Report...\nThis may take a moment (fetching prices & rates)");

    try {
        const result = await apiPost("/api/calculate", state.portfolio);
        hideLoading();

        if (!result.success) {
            return showToast(`Calculation error: ${result.error}`, "error");
        }

        state.calculatedRows = result.rows;
        renderResultsTable(result.rows);
        
        // Populate Per-Stock Dividend Summary
        const summaryTbody = document.getElementById("stockSummaryTableBody");
        if (summaryTbody) {
            summaryTbody.innerHTML = "";
            const stockTotals = {};

            result.rows.forEach(row => {
                const entity = row.entity_name;
                if (!stockTotals[entity]) stockTotals[entity] = 0;
                stockTotals[entity] += row.total_dividends || 0;
            });

            Object.entries(stockTotals).forEach(([entity, total]) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><strong>${entity}</strong></td>
                    <td style="color:var(--success); font-weight:600;">₹${total}</td>
                `;
                summaryTbody.appendChild(tr);
            });
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

        // Apply P&L badges to sell rows
        result.rows.forEach(row => {
            if (row.calculation_details && row.calculation_details.sales && row.calculation_details.sales.sale_entries) {
                row.calculation_details.sales.sale_entries.forEach(sellEntry => {
                    if (sellEntry.sell_id) {
                        const tr = document.querySelector(`tr[data-sell-id="${sellEntry.sell_id}"]`);
                        if (tr) {
                            const plContainer = tr.querySelector(".sell-pl-container");
                            if (plContainer) {
                                const usdVal = sellEntry.profit_loss_usd || 0;
                                const inrVal = sellEntry.profit_loss_inr || 0;
                                const isProfit = usdVal >= 0;
                                const cls = isProfit ? "profit" : "loss";
                                const usdText = (isProfit ? "+$" : "-$") + Math.abs(usdVal).toFixed(2);
                                const inrText = (inrVal >= 0 ? "+₹" : "-₹") + Math.abs(inrVal).toLocaleString("en-IN");
                                
                                plContainer.innerHTML = `
                                    <div class="sell-pl-badge ${cls}" title="USD P&L: ${usdText} | INR P&L: ${inrText}">
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
    } catch (e) {
        hideLoading();
        showToast(`Error: ${e.message}`, "error");
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
    document.getElementById("sellDetailsFileName").textContent = "No file chosen";
}

// Wire file-chosen labels once DOM is ready (called from initSellHelper since DOMContentLoaded already ran)
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("etradeFileInput").addEventListener("change", e => {
        const f = e.target.files[0];
        document.getElementById("etradeFileName").textContent = f ? f.name : "No file chosen";
    });
    document.getElementById("sellDetailsFileInput").addEventListener("change", e => {
        const f = e.target.files[0];
        document.getElementById("sellDetailsFileName").textContent = f ? f.name : "No file chosen";
    });
    document.getElementById("etradeImportBtn").addEventListener("click", importEtradeDocs);
});

async function importEtradeDocs() {
    const etradeFile = document.getElementById("etradeFileInput").files[0];
    const sellFile   = document.getElementById("sellDetailsFileInput").files[0];

    if (!etradeFile && !sellFile) {
        showToast("Please choose at least one file to import", "warning");
        return;
    }

    let portfolio = state.portfolio;
    let totalSkipped = 0;

    // ── Step 1: Upload Etrade positions/transactions (if provided) ──────
    if (etradeFile) {
        showLoading("Step 1/2 — Parsing Positions / Transactions file...");
        try {
            const fd = new FormData();
            fd.append("file", etradeFile);
            fd.append("portfolio", JSON.stringify(portfolio));
            const resp = await fetch("/api/upload-etrade", { method: "POST", body: fd });
            const result = await resp.json();
            if (result.success) {
                portfolio = result.portfolio;
                totalSkipped += result.skipped_count || 0;
            } else {
                hideLoading();
                showToast("Positions file error: " + result.error, "error");
                return;
            }
        } catch (err) {
            hideLoading();
            showToast("Positions upload failed: " + err.message, "error");
            return;
        }
    }

    // ── Step 2: Upload G&L Expanded (if provided) ───────────────────────
    if (sellFile) {
        showLoading(etradeFile ? "Step 2/2 — Parsing G&L Expanded file..." : "Parsing G&L Expanded file...");
        try {
            const fd = new FormData();
            fd.append("file", sellFile);
            fd.append("portfolio", JSON.stringify(portfolio));
            const resp = await fetch("/api/upload-sell-details", { method: "POST", body: fd });
            const result = await resp.json();
            if (result.success) {
                portfolio = result.portfolio;
                totalSkipped += result.skipped_count || 0;
            } else {
                hideLoading();
                showToast("G&L file error: " + result.error, "error");
                return;
            }
        } catch (err) {
            hideLoading();
            showToast("G&L upload failed: " + err.message, "error");
            return;
        }
    }

    // ── Done — apply consolidated portfolio ─────────────────────────────
    hideLoading();
    state.portfolio = portfolio;
    document.getElementById("stockCards").innerHTML = "";
    state.portfolio.stocks.forEach(stock => renderStockCard(stock));
    updateCalcButtonVisibility();

    const cy = portfolio.calendar_year || "";
    const parts = [];
    if (etradeFile) parts.push("positions");
    if (sellFile)   parts.push("G&L sell details");
    showToast(`Portfolio imported successfully (${parts.join(" + ")})`, "success");

    if (totalSkipped > 0) {
        showToast(
            `⚠ ${totalSkipped} transaction${totalSkipped > 1 ? "s" : ""} skipped — dated after CY${cy}`,
            "warning"
        );
    }

    closeEtradeModal();
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

        textCols.forEach(val => {
            const td = document.createElement("td");
            td.textContent = val || "";
            tr.appendChild(td);
        });

        // Columns 8-12 (numeric, editable)
        const numFields = [
            { key: "initial_value", val: row.initial_value },
            { key: "peak_value", val: row.peak_value },
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
            td.innerHTML = `${formatINR(field.val)}<span class="edit-icon">✏️</span>`;
            td.dataset.lotId = row.lot_id;
            td.dataset.field = field.key;
            td.dataset.originalValue = field.val;

            td.addEventListener("click", () => enableCellEdit(td, row, field.key));
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    flushSubtotal(); // Flush last stock
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

        td.innerHTML = `${formatINR(row[fieldKey])}<span class="edit-icon">✏️</span>`;
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
function collectSbiRates(rows) {
    const tbody = document.getElementById("sbiRatesTableBody");
    tbody.innerHTML = "";
    const seenRates = new Set();

    rows.forEach(row => {
        const details = row.calculation_details || {};
        const ticker = row.entity_name || '';
        const entries = [
            { label: `${ticker} — Buy (${row.acquire_date})`, data: details.initial },
            { label: `${ticker} — Peak Value (${(details.peak && details.peak.peak_date) || '?'})`, data: details.peak },
            { label: `${ticker} — Closing (Dec 31)`, data: details.closing },
        ];
        if (details.dividends && details.dividends.dividend_entries) {
            details.dividends.dividend_entries.forEach(de => {
                entries.push({ label: `${ticker} — Dividend (${de.ex_date})`, data: de });
            });
        }
        if (details.sales && details.sales.sale_entries) {
            details.sales.sale_entries.forEach(se => {
                entries.push({ label: `${ticker} — Sale (${se.sell_date})`, data: se });
            });
        }

        entries.forEach(entry => {
            if (!entry.data) return;
            const rate = entry.data.rate || (entry.data.components && entry.data.components.ttbr);
            const rateDate = entry.data.rate_date || (entry.data.components && entry.data.components.rate_date);
            if (!rate || !rateDate) return;
            const key = `${entry.label}_${rateDate}`;
            if (seenRates.has(key)) return;
            seenRates.add(key);
            const src = entry.data.source || 'cache';
            const statusClass = src === 'override' ? 'override' : src === 'cache' ? 'cached' : 'missing';
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${entry.label}</td>
                <td>${rateDate}</td>
                <td>₹${rate}</td>
                <td><span class="rate-status ${statusClass}">${src}</span></td>
            `;
            tbody.appendChild(tr);
        });
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
        
        hideLoading();

        if (result.success) {
            markClean();
            showToast(`Saved for CY${state.portfolio.calendar_year}`, "success");
        } else {
            showToast(`Save failed: ${result.error}`, "error");
        }
    } catch (e) {
        hideLoading();
        showToast(`Save error: ${e.message}`, "error");
    }
}

async function loadPortfolio() {
    const year = state.portfolio.calendar_year;
    showLoading(`Loading CY${year}...`);

    try {
        const resp = await fetch(`/api/load?year=${year}&username=${encodeURIComponent(state.username)}`);
        const data = await resp.json();
        hideLoading();

        if (!data.success) {
            return showToast(data.error || `No saved data for CY${year}`, "warning");
        }

        state.portfolio = data.portfolio;
        document.getElementById("yearSelect").value = state.portfolio.calendar_year;

        // Re-render all stock cards
        document.getElementById("stockCards").innerHTML = "";
        state.portfolio.stocks.forEach(stock => renderStockCard(stock));
        updateCalcButtonVisibility();

        showToast(`Loaded portfolio for CY${year}`, "success");
        if (state.portfolio.stocks.length > 0) await fetchRuntimeDataForAllStocks();
        hideLoading();
    } catch (e) {
        hideLoading();
        showToast(`Load error: ${e.message}`, "error");
    }
}

function savePortfolioAs() {
    // Sync all cards
    document.querySelectorAll(".stock-card").forEach(card => syncStockFromCard(card));

    // Deep clone and strip runtime-only fields before downloading
    const portfolioToSave = JSON.parse(JSON.stringify(state.portfolio));
    portfolioToSave.stocks.forEach(stock => {
        delete stock.dividends;
        delete stock.yearly_max_price;
        delete stock.yearly_max_price_date;
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(portfolioToSave, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `portfolio_CY${state.portfolio.calendar_year}_${state.username}.json`);
    dlAnchorElem.click();
    
    markClean();
    showToast("Portfolio downloaded to your computer.", "success");
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
        showLoading(`Fetching live data (${idx}/${total}): ${stock.ticker}…`);
        const card = document.querySelector(`.stock-card[data-stock-id="${stock.id}"]`);

        // Fetch dividends
        if (!stock.skip_dividends) {
            try {
                const divData = await apiGet(`/api/dividends?ticker=${encodeURIComponent(ticker)}&year=${year}`);
                stock.dividends = (divData.dividends || []).map(d => ({
                    id: generateId(), ex_date: d.ex_date, amount: d.amount,
                }));
                if (card) {
                    const tbody = card.querySelector(".dividends-tbody");
                    tbody.innerHTML = "";
                    stock.dividends.forEach(div => renderDividendRow(card, stock, div));
                }
            } catch (e) { console.warn(`Dividend fetch failed for ${ticker}`, e); }
        }

        // Fetch peak price (for badge display)
        try {
            const peakInfo = await apiGet(`/api/yearly-max-price?ticker=${encodeURIComponent(ticker)}&year=${year}`);
            if (peakInfo.max_price != null) {
                stock.yearly_max_price = peakInfo.max_price;
                stock.yearly_max_price_date = peakInfo.max_price_date;
                if (card) showPeakPriceBadge(card, peakInfo.max_price, peakInfo.max_price_date);
            }
        } catch (e) { console.warn(`Peak price fetch failed for ${ticker}`, e); }
    }
}

async function fetchSbiRates() {
    showLoading("Downloading SBI USD rates from GitHub...");
    try {
        const result = await apiPost("/api/fetch-sbi-rates");
        hideLoading();
        if (result.success) {
            let msg = `Fetched ${result.entries} USD rates`;
            if (result.locked_years && result.locked_years.length > 0) {
                msg += ` (locked years ${result.locked_years.join(", ")} preserved)`;
            }
            showToast(msg, "success");
        } else {
            showToast(result.error || "Failed to fetch rates", "error");
        }
    } catch (e) {
        hideLoading();
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
        hideLoading();

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
        hideLoading();
    }
}

function clearCurrentYear() {
    if (!confirm(`Are you sure you want to clear all data for CY${state.portfolio.calendar_year}? This will remove all stocks and overrides currently loaded on screen.`)) return;
    pushUndoSnapshot();
    state.portfolio.stocks = [];
    state.portfolio.overrides = {};
    document.getElementById("stockCards").innerHTML = "";
    clearCalculatedSections();
    updateCalcButtonVisibility();
    showToast(`Cleared all data for CY${state.portfolio.calendar_year}`, "success");
}

// ===== Export CSV =====
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

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Schedule_FA_A3_CY${state.portfolio.calendar_year}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        hideLoading();
        showToast("CSV downloaded!", "success");
    } catch (e) {
        hideLoading();
        showToast(`Export error: ${e.message}`, "error");
    }
}

// ===== Utilities =====
function generateId() {
    return "id_" + Math.random().toString(36).substr(2, 9);
}

function updateCalcButtonVisibility() {
    const section = document.getElementById("calcSection");
    if (state.portfolio.stocks.length > 0) {
        section.classList.remove("hidden");
    } else {
        section.classList.add("hidden");
    }
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
            showToast(`Loaded saved portfolio for CY${year}`, "success");
            if (state.portfolio.stocks.length > 0) await fetchRuntimeDataForAllStocks();
            hideLoading();
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
            showToast(`Imported ${state.portfolio.stocks.length} stock(s) from CY${sourceYear}`, "info");
            if (state.portfolio.stocks.length > 0) await fetchRuntimeDataForAllStocks();
            hideLoading();
            return;
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
        hideLoading();
        showToast(`No data found for CY${year}. Starting fresh.`, "info");
    } catch (e) {
        hideLoading();
        showToast(`Error: ${e.message}`, "error");
    }
}

// ===== ITR Tax Year Capital Gains & Dividend Summary =====

async function fetchTaxYearSummary() {
    try {
        const result = await apiPost("/api/tax-year-summary", state.portfolio);
        if (result.success && result.tax_years) {
            renderTaxYearSummary(result.tax_years);
            document.getElementById("taxYearSection").classList.remove("hidden");
        } else {
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
        ltcg:      { label: "LTCG", color: "var(--success)", title: "Long-Term Capital Gain (held ≥ 2 yrs)" },
        ltcl:      { label: "LTCL", color: "var(--danger)",  title: "Long-Term Capital Loss (held ≥ 2 yrs)" },
        stcg:      { label: "STCG", color: "#22c55e",        title: "Short-Term Capital Gain (held < 2 yrs)" },
        stcl:      { label: "STCL", color: "#f97316",        title: "Short-Term Capital Loss (held < 2 yrs)" },
        dividends: { label: "Div",  color: "var(--accent)",  title: "Dividend Income" },
    };
    const categoryOrder = ["ltcg", "ltcl", "stcg", "stcl", "dividends"];

    ["prev", "curr"].forEach(tyKey => {
        const ty = taxYears[tyKey];
        const hasData = Object.values(ty.totals).some(b => b.total > 0);

        const block = document.createElement("div");
        block.className = "ty-block";
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
            const sHeaderTd = document.createElement("td");
            sHeaderTd.colSpan = 7;
            sHeaderTd.style.cssText = [
                "padding:10px 10px 4px;",
                "font-weight:700;color:var(--text-main);font-size:0.88rem;",
                "border-top:" + (sIdx > 0 ? "2px solid var(--border)" : "none") + ";"
            ].join("");
            sHeaderTd.innerHTML = "<span style=\"opacity:0.4;margin-right:6px;\">◆</span>" + ticker;
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
                labelTd.innerHTML = "<span style=\"" +
                    "display:inline-block;padding:2px 7px;border-radius:4px;" +
                    "font-size:0.71rem;font-weight:700;letter-spacing:0.04em;" +
                    "background:" + meta.color + "22;color:" + meta.color + ";" +
                    "border:1px solid " + meta.color + "44;" +
                    "\" title=\"" + meta.title + "\">" + meta.label + "</span>";
                tr.appendChild(labelTd);

                quarters.concat(["total"]).forEach(qk => {
                    const td = document.createElement("td");
                    const val = bucket[qk] || 0;
                    td.style.cssText = [
                        "padding:5px 10px;text-align:right;",
                        "color:" + (val > 0 ? meta.color : "var(--text-muted)") + ";",
                        "font-variant-numeric:tabular-nums;"
                    ].join("");
                    td.textContent = val > 0 ? formatINR(val) : "—";
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
                td.textContent = val > 0 ? formatINR(val) : "—";
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
    const a3Els = [
        "addStockSection", "stockCards", "calcSection",
        "resultsSection", "sbiRatesSection", "taxYearSection",
        "monthlyRatesSection",
    ];
    const isA3 = tab === "a3";
    const isSellHelper = tab === "sellHelper";
    const isTaxStatement = tab === "taxStatement";

    a3Els.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        // monthlyRatesSection has its own hidden logic
        if (id === "monthlyRatesSection") {
            if (!isA3) el.classList.add("hidden");
            return;
        }
        el.classList.toggle("hidden", !isA3);
    });

    document.getElementById("sellHelperPanel").classList.toggle("hidden", !isSellHelper);
    document.getElementById("taxStatementPanel").classList.toggle("hidden", !isTaxStatement);

    document.getElementById("tabA3").classList.toggle("active", isA3);
    document.getElementById("tabSellHelper").classList.toggle("active", isSellHelper);
    document.getElementById("tabTaxStatement").classList.toggle("active", isTaxStatement);

    if (isSellHelper) shImportLots(); // auto-refresh lots when switching to helper
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

    const today = new Date().toISOString().split("T")[0];

    tr.innerHTML = `
        <td>
            <select class="sh-lot-select">${shLotOptions(lotIdx)}</select>
        </td>
        <td class="sh-sell-buy-price" style="font-size:0.8rem;color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap;"></td>
        <td><input type="date" class="sh-sell-date" value="${today}"></td>
        <td><input type="number" class="sh-sell-qty" placeholder="0" step="any" min="0" style="width:80px;"></td>
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
        const buyD = new Date(lot.buy_date);
        const sellD = new Date(sellDateVal);
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
                const mktLabel = res.market_state !== "REGULAR" ? ` (${res.market_state})` : "";
                showToast(`Live price: $${res.price}${mktLabel}`, "success");
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
        if (qty > lot.available_qty) {
            showToast(`Row ${sell.rowId}: qty ${qty} exceeds available ${lot.available_qty}`, "warning"); return;
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
        hideLoading();
        if (!result.success) return showToast(`Simulation error: ${result.error}`, "error");
        shRenderResults(result);
    } catch (e) {
        hideLoading();
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
        ltcg: { label: "LTCG", color: "var(--success)" },
        ltcl: { label: "LTCL", color: "var(--danger)" },
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
        pushUndoSnapshot();
        stock.dividends = (data.dividends || []).map(d => ({
            id: generateId(), ex_date: d.ex_date, amount: d.amount,
        }));
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
        pushUndoSnapshot();
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
    pushUndoSnapshot();
    showLoading("Fetching dividends for all stocks…");
    let total = 0;
    for (const stock of state.portfolio.stocks) {
        if (stock.skip_dividends) continue;
        const ticker = stock.yahoo_ticker || stock.ticker;
        try {
            const data = await apiGet(`/api/dividends?ticker=${encodeURIComponent(ticker)}&year=${state.portfolio.calendar_year}`);
            stock.dividends = (data.dividends || []).map(d => ({
                id: generateId(), ex_date: d.ex_date, amount: d.amount,
            }));
            total += stock.dividends.length;
            const card = document.querySelector(`.stock-card[data-stock-id="${stock.id}"]`);
            if (card) {
                const tbody = card.querySelector(".dividends-tbody");
                tbody.innerHTML = "";
                stock.dividends.forEach(div => renderDividendRow(card, stock, div));
            }
        } catch (e) { console.warn(`Dividend fetch failed for ${ticker}`, e); }
    }
    hideLoading();
    showToast(`Fetched ${total} total dividend(s) across all stocks`, "success");
}

// ===== FY Year Selector =====
function initFYYearSelector() {
    const select = document.getElementById("fyYearSelect");
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 2000; y--) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = `FY ${y}-${String(y + 1).slice(-2)} (Apr ${y} – Mar ${y + 1})`;
        if (y === state.portfolio.calendar_year) opt.selected = true;
        select.appendChild(opt);
    }
}

// ===== Consolidated FY Tax Summary =====
async function fetchConsolidatedTaxSummary() {
    const fyStart = parseInt(document.getElementById("fyYearSelect").value);
    if (!fyStart || !state.username) return showToast("Select a tax year", "warning");
    showLoading(`Generating consolidated statement for FY ${fyStart}-${String(fyStart + 1).slice(-2)}…`);
    try {
        const result = await apiPost("/api/consolidated-tax-summary", {
            fy_start_year: fyStart, username: state.username,
        });
        hideLoading();
        if (!result.success) return showToast(result.error || "Failed", "error");
        renderConsolidatedTaxSummary(result.consolidated);
        document.getElementById("consolidatedFYBlocks").scrollIntoView({ behavior: "smooth" });
    } catch (e) {
        hideLoading();
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
        ltcg: { label: "LTCG", color: "var(--success)", title: "Long-Term Capital Gain" },
        ltcl: { label: "LTCL", color: "var(--danger)", title: "Long-Term Capital Loss" },
        stcg: { label: "STCG", color: "#22c55e", title: "Short-Term Capital Gain" },
        stcl: { label: "STCL", color: "#f97316", title: "Short-Term Capital Loss" },
        dividends: { label: "Div", color: "var(--accent)", title: "Dividend Income" },
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
const tutorialSteps = [
    { selector: "#tickerInput", title: "Add Stock / ETF", desc: "Enter a ticker symbol (e.g., QCOM, NVDA, VWRA) and click Lookup to add it to your portfolio. Tickers for non-US exchanges are auto-resolved." },
    { selector: ".add-lot-btn", title: "Acquisition Lots", desc: "Each stock has acquisition lots representing your purchase transactions. Add the buy date, quantity, and price. Use the 📈 Fetch button to auto-fill the closing price." },
    { selector: ".add-sell-btn", title: "Sell Transactions", desc: "Record any sell transactions against a specific lot. The tool uses FIFO matching and tracks partial sells." },
    { selector: ".fetch-dividends-btn", title: "Fetch Dividends", desc: "Click to re-fetch dividend data from Yahoo Finance for the current calendar year. Dividends are also auto-fetched when adding a stock." },
    { selector: "#fetchAllDividendsBtn", title: "Fetch All Dividends", desc: "Batch-fetch dividend data for all stocks at once. Useful when starting a new year or refreshing data." },
    { selector: "#calculateBtn", title: "Calculate A3 Values", desc: "Computes all 12 columns of Schedule FA Section A3, including initial value, peak value, closing balance, dividends, and sale proceeds — all in ₹ using SBI TT rates." },
    { selector: "#fetchRatesBtn", title: "SBI TT Rates", desc: "Downloads SBI TT Buying rates from the cloud. These rates are used to convert USD values to ₹ for ITR filing." },
    { selector: "#viewRatesBtn", title: "Monthly Rates Manager", desc: "View, edit, and lock SBI TT rates per month. Locked years are preserved during rate refreshes." },
    { selector: "#undoBtn", title: "Undo / Redo", desc: "Made a mistake? Undo any portfolio change with ↩ Undo or Ctrl+Z. Redo with ↪ Redo or Ctrl+Shift+Z. Supports up to 50 levels." },
    { selector: "#generateFYBtn", title: "Consolidated Tax Statement", desc: "Generate a unified tax view for a complete Tax Year (Apr–Mar) by combining two calendar year reports. Includes LTCG/STCG netting with ITR §70/74 set-off." },
    { selector: "#tabSellHelper", title: "Sell Simulator", desc: "Switch to the Sell Simulator tab to simulate hypothetical sells and preview their STCG/LTCG tax impact — without modifying your portfolio." },
    { selector: "#saveBtn", title: "Save & Load (Server)", desc: "Save your portfolio to the server. The pulsing dot indicates unsaved changes. Use Load to restore previously saved data." },
    { selector: "#saveAsBtn", title: "Save As / Open...", desc: "Use Save As to download the portfolio JSON to any folder on your computer. Use Open... to load a portfolio from any folder." },
];

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
    if (currentTutorialStep >= tutorialSteps.length) { endTutorial(); return; }
    showTutorialStep(currentTutorialStep);
}

function prevTutorialStep() {
    if (currentTutorialStep <= 0) return;
    currentTutorialStep--;
    showTutorialStep(currentTutorialStep);
}

function showTutorialStep(index) {
    const step = tutorialSteps[index];
    const target = document.querySelector(step.selector);

    document.getElementById("tutorialStepCounter").textContent = `Step ${index + 1} of ${tutorialSteps.length}`;
    document.getElementById("tutorialTitle").textContent = step.title;
    document.getElementById("tutorialDesc").textContent = step.desc;
    document.getElementById("tutorialPrevBtn").disabled = index === 0;
    document.getElementById("tutorialNextBtn").textContent = index === tutorialSteps.length - 1 ? "Finish ✓" : "Next →";

    // Remove old spotlight and dimmed class
    document.querySelectorAll(".tutorial-spotlight").forEach(el => el.remove());
    document.getElementById("tutorialBackdrop").classList.remove("dimmed");

    const tooltip = document.getElementById("tutorialTooltip");
    tooltip.style.transform = "none"; // clear any previous centering transform

    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
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

// ===== Tab Switching — updated to show consolidated FY section =====
// Override switchTab to also control consolidated FY section visibility
const _origSwitchTab = typeof switchTab === "function" ? null : null; // placeholder
