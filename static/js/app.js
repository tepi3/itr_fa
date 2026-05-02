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
};

// ===== Initialization =====
document.addEventListener("DOMContentLoaded", () => {
    initYearSelectors();
    bindEvents();
    initUserSelection();
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
    
    mainSelect.addEventListener("change", (e) => {
        state.portfolio.calendar_year = parseInt(e.target.value);
        rateYearSelect.value = state.portfolio.calendar_year;
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
    document.getElementById("exportExcelBtn").addEventListener("click", exportExcel);
    document.getElementById("saveBtn").addEventListener("click", savePortfolio);
    document.getElementById("loadBtn").addEventListener("click", loadPortfolio);
    document.getElementById("fetchRatesBtn").addEventListener("click", fetchSbiRates);
    document.getElementById("importPrevBtn").addEventListener("click", importPreviousYear);
    document.getElementById("viewRatesBtn").addEventListener("click", showMonthlyRates);
    document.getElementById("refreshMonthlyRatesBtn").addEventListener("click", loadMonthlyRates);
    document.getElementById("ratesYearSelect").addEventListener("change", loadMonthlyRates);
    
    document.getElementById("switchUserBtn").addEventListener("click", () => {
        document.getElementById("appHeader").classList.add("hidden");
        document.getElementById("appMain").classList.add("hidden");
        document.getElementById("userSelectionScreen").classList.remove("hidden");
        state.username = null;
        fetchUsers();
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
                selectUser(resp.username);
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
        list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:10px;">No users found</div>`;
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
        item.addEventListener("click", (e) => {
            // If we clicked a button or something inside it, don't select the user
            if (e.target.closest(".user-actions")) return;
            selectUser(username);
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

function selectUser(username) {
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
    
    // Clear current portfolio state
    state.portfolio.stocks = [];
    state.portfolio.overrides = {};
    state.portfolio.sbi_rate_overrides = {};
    document.getElementById("stockCards").innerHTML = "";
    document.getElementById("resultsSection").classList.add("hidden");
    
    checkSavedData();
}

async function checkSavedData() {
    if (!state.username) return;
    try {
        const resp = await fetch(`/api/list-saves?username=${encodeURIComponent(state.username)}`);
        const data = await resp.json();
        if (data.saves && data.saves.length > 0) {
            showToast(`Found ${data.saves.length} saved portfolio(s) for ${state.username}`, "info");
        }
    } catch (e) { /* ignore */ }
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

    showLoading(`Looking up ${ticker}...`);
    try {
        const info = await apiPost("/api/lookup-stock", { ticker });
        hideLoading();

        if (!info.success) {
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

        // Try to fetch dividends for current calendar year
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
    const sym = "$";
    const buyHeader = card.querySelector(".buy-price-header");
    if (buyHeader) buyHeader.textContent = `Buy Price (${sym})`;
    const sellHeader = card.querySelector(".sell-price-header");
    if (sellHeader) sellHeader.textContent = `Sell Price (${sym})`;
    const divHeader = card.querySelector(".div-amount-header");
    if (divHeader) divHeader.textContent = `Dividend Per Share (${sym})`;

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

    // Render existing lots, sells, and dividends
    stock.lots.forEach(lot => renderLotRow(card, stock, lot));
    stock.lots.forEach(lot => {
        (lot.sells || []).forEach(sell => renderSellRow(card, stock, lot, sell));
    });
    (stock.dividends || []).forEach(div => renderDividendRow(card, stock, div));

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

    if (!lotData) stock.lots.push(lot);

    renderLotRow(card, stock, lot);
}

function renderLotRow(card, stock, lot) {
    const tbody = card.querySelector(".lots-tbody");
    const tr = document.createElement("tr");
    tr.dataset.lotId = lot.id;

    tr.innerHTML = `
        <td><input type="date" class="lot-date" value="${lot.buy_date}"></td>
        <td><input type="number" class="lot-qty" value="${lot.quantity}" step="any" min="0" placeholder="0"></td>
        <td><input type="number" class="lot-price" value="${lot.buy_price}" step="any" min="0" placeholder="0.00"></td>
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

    // Remove
    tr.querySelector(".remove-lot-btn").addEventListener("click", () => {
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

    tr.innerHTML = `
        <td><select class="sell-lot-select">${lotOptions}</select></td>
        <td><input type="date" class="sell-date" value="${sell.sell_date}"></td>
        <td><input type="number" class="sell-qty" value="${sell.quantity}" step="any" min="0" placeholder="0"></td>
        <td><input type="number" class="sell-price" value="${sell.sell_price}" step="any" min="0" placeholder="0.00"></td>
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
        }
    });

    // Remove
    tr.querySelector(".remove-sell-btn").addEventListener("click", () => {
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

// ===== Dividends =====
function addDividendRow(card, stock, divData = null) {
    const div = divData || {
        id: generateId(),
        ex_date: "",
        amount: "",
    };
    if (!divData) {
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

    showLoading("Calculating A3 values...\nThis may take a moment (fetching prices & rates)");

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

        document.getElementById("resultsSection").classList.remove("hidden");
        document.getElementById("sbiRatesSection").classList.remove("hidden");

        // Scroll to results
        document.getElementById("resultsSection").scrollIntoView({ behavior: "smooth" });
        showToast(`Calculated ${result.rows.length} row(s) successfully`, "success");
    } catch (e) {
        hideLoading();
        showToast(`Error: ${e.message}`, "error");
    }
}

// ===== Render Results Table =====
function renderResultsTable(rows) {
    const tbody = document.getElementById("a3TableBody");
    tbody.innerHTML = "";

    rows.forEach((row, idx) => {
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
            { label: `${ticker} — Peak Value`, data: details.peak },
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
    } catch (e) {
        hideLoading();
        showToast(`Load error: ${e.message}`, "error");
    }
}

// ===== Fetch SBI Rates =====
async function fetchSbiRates() {
    showLoading("Fetching SBI USD Rates...");
    try {
        const resp = await apiPost("/api/fetch-sbi-rates");
        if (resp.success) {
            showToast(`Fetched ${resp.entries} rates for USD`);
        } else {
            showToast(resp.error || "Failed to fetch rates", "error");
        }
    } catch (e) {
        showToast("Error fetching rates", "error");
    }
    hideLoading();
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
    } catch (e) {
        hideLoading();
        showToast(`Import error: ${e.message}`, "error");
    }
}

// ===== Export Excel =====
async function exportExcel() {
    if (!state.calculatedRows.length) {
        return showToast("Calculate first, then export", "warning");
    }

    showLoading("Generating Excel...");
    try {
        const resp = await fetch("/api/export-excel", {
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
        a.download = `Schedule_FA_A3_CY${state.portfolio.calendar_year}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        hideLoading();
        showToast("Excel downloaded!", "success");
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
        section.classList.remove("hidden");
        return;
    }
    section.classList.remove("hidden");
    await loadMonthlyRates();
    section.scrollIntoView({ behavior: "smooth" });
}

async function loadMonthlyRates() {
    const year = document.getElementById("ratesYearSelect").value;
    const tbody = document.getElementById("monthlyRatesTableBody");
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';
    
    try {
        const data = await apiGet(`/api/monthly-rates?year=${year}`);
        tbody.innerHTML = "";
        if (!data.success) {
            tbody.innerHTML = '<tr><td colspan="5" style="color:var(--danger)">Error loading rates</td></tr>';
            return;
        }
        data.rates.forEach(r => {
            const statusClass = r.source === 'override' ? 'override' : r.source === 'cache' ? 'cached' : 'missing';
            const statusLabel = r.source === 'not_found' ? 'Missing — enter manually' : r.source;
            const rateVal = r.rate !== null ? r.rate : '';
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${r.month_name}</strong> ${year}</td>
                <td>${r.rate_date || '—'}</td>
                <td>
                    <input type="number" class="monthly-rate-input" step="0.01" value="${rateVal}"
                           placeholder="Enter ₹ rate" data-rate-date="${r.rate_date}">
                </td>
                <td><span class="rate-status ${statusClass}">${statusLabel}</span></td>
                <td><button class="btn btn-sm btn-primary save-rate-btn" data-rate-date="${r.rate_date}">💾 Save</button></td>
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
                    // Update status badge
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
