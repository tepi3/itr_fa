import { 
    state, 
    undo, 
    redo, 
    pushUndoSnapshot, 
    revertToHistoryItem, 
    getUndoStack, 
    getRedoStack, 
    markDirty, 
    markClean, 
    clearCalculatedSections 
} from './modules/state.js';

import { apiPost, apiGet } from './modules/api.js';

import { 
    formatINR, 
    formatAppDate, 
    parseAppDate, 
    initDatePicker
} from './modules/utils.js';

import { 
    showToast, 
    showLoading, 
    hideLoading, 
    toggleSection, 
    updateCalcButtonVisibility, 
    saveFileRobustly,
    startSmoothProgress, 
    stopSmoothProgress 
} from './modules/ui-utils.js';

import { 
    renderStockCard, 
    syncStockFromCard, 
    addLotRow, 
    renderLotRow, 
    addSellRow, 
    renderSellRow, 
    addDividendRow, 
    renderDividendRow, 
    fetchDividendsForStock, 
    fetchCompanyDetailsForStock, 
    fetchAllDividends, 
    fetchRuntimeDataForAllStocks, 
    lookupStock,
    showPeakPriceBadge
} from './modules/components/stockCard.js';

import { 
    renderResultsTable, 
    collectSbiRates, 
    showMonthlyRates, 
    loadMonthlyRates, 
    toggleLockRates, 
    clearSbiOverrides, 
    fetchConsolidatedTaxSummary,
    initFYYearSelector,
    fetchTaxYearSummary
} from './modules/components/resultsTable.js';

import { initSellHelper, shImportLots } from './modules/components/simulator.js';

import { 
    updateDashboard, 
    filterStockCards, 
    toggleTheme, 
    restoreTheme, 
    setDensity, 
    restoreDensity, 
    autoSaveDraft, 
    checkForDraft, 
    clearDraft,
    renderAssetPieChart
} from './modules/components/dashboard.js';

import { initTutorial, startTutorial, endTutorial } from './modules/components/tutorial.js';

import { 
    USER_ICON_SVG, 
    EDIT_PENCIL_SVG, 
    TRASH_SVG, 
    BADGE_CHECK_SVG, 
    CHECK_UPDATE_BTN_HTML, 
    CHECK_LOADING_HTML,
    CHEVRON_RIGHT_SVG,
    CHEVRON_DOWN_SVG
} from './modules/constants.js';

// Global state / references
let aboutGlobeAnimationId = null;

// ===== Disclaimer Check =====
async function checkDisclaimer() {
    return new Promise(async (resolve) => {
        try {
            const res = await fetch("/api/disclaimer");
            const data = await res.json();
            if (data.success && data.accepted) {
                document.getElementById("disclaimerModal").classList.add("hidden");
                resolve();
                return;
            }
        } catch (e) {
            if (localStorage.getItem("disclaimerAccepted")) {
                document.getElementById("disclaimerModal").classList.add("hidden");
                resolve();
                return;
            }
        }

        const modal = document.getElementById("disclaimerModal");
        if (!modal) {
            resolve();
            return;
        }
        
        modal.classList.remove("hidden");
        
        document.getElementById("acceptDisclaimerBtn").addEventListener("click", async () => {
            try {
                await fetch("/api/disclaimer/accept", { method: "POST" });
            } catch (e) {
                console.error("Failed to save disclaimer acceptance to server:", e);
            }
            localStorage.setItem("disclaimerAccepted", "true");
            
            // Switch to success state
            document.getElementById("disclaimerInitialState").classList.add("hidden");
            document.getElementById("disclaimerSuccessState").classList.remove("hidden");
        });

        document.getElementById("getStartedBtn").addEventListener("click", () => {
            modal.classList.add("hidden");
            resolve();
        });
        
        document.getElementById("declineDisclaimerBtn").addEventListener("click", async () => {
            try {
                await fetch("/api/shutdown", { method: "POST" });
            } catch (e) {
                // Expected to fail as server terminates
            }
            document.body.innerHTML = `
                <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;background-color:var(--bg-primary);color:var(--text-primary);font-family:'Inter', sans-serif;padding:20px;text-align:center;">
                    <h1 style="font-size:2rem;margin-bottom:16px;">🛑 Access Denied</h1>
                    <p style="font-size:1.1rem;color:var(--text-secondary);">You must accept the disclaimer to use this application.</p>
                    <p style="font-size:1.1rem;color:var(--text-muted);margin-top:8px;">The application session has ended.</p>
                </div>`;
            try { window.close(); } catch(e) {}
        });
    });
}

// ===== Year Selectors =====
function initYearSelectors() {
    const mainSelect = document.getElementById("yearSelect");
    const rateYearSelect = document.getElementById("ratesYearSelect");
    const initialSelect = document.getElementById("initialYearSelect");
    
    if (!mainSelect || !rateYearSelect || !initialSelect) return;

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
        
        const activeTab = document.querySelector(".tab-btn.active")?.id;
        if (activeTab === "tabSellHelper") {
            showToast("Changing calendar year returned you to the main Portfolio view.", "info");
            switchTab("a3");
        }
        
        if (state.username) await autoLoadForYear(state.portfolio.calendar_year);
    });
    
    initialSelect.addEventListener("change", (e) => {
        state.portfolio.calendar_year = parseInt(e.target.value);
    });
}

// ===== Save/Load Helper =====
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
        updateCalcButtonVisibility(state.portfolio.stocks.length);
        updateDashboard();

        showToast(`Loaded portfolio for CY${year}`, "success");
        if (state.portfolio.stocks.length > 0) await fetchRuntimeDataForAllStocks();
    } catch (e) {
        await hideLoading();
        showToast(`Load error: ${e.message}`, "error");
    }
}

async function savePortfolioAs() {
    document.querySelectorAll(".stock-card").forEach(card => syncStockFromCard(card));

    const portfolioToSave = JSON.parse(JSON.stringify(state.portfolio));
    portfolioToSave.stocks.forEach(stock => {
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
            updateCalcButtonVisibility(state.portfolio.stocks.length);
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
            updateCalcButtonVisibility(state.portfolio.stocks.length);
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
                updateCalcButtonVisibility(state.portfolio.stocks.length);
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
        updateCalcButtonVisibility(0);
        clearCalculatedSections();
        updateDashboard();
        await hideLoading();
        showToast(`No data found for CY${year}. Starting fresh.`, "info");
    } catch (e) {
        await hideLoading();
        showToast(`Error: ${e.message}`, "error");
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

        document.getElementById("stockCards").innerHTML = "";
        state.portfolio.stocks.forEach(stock => renderStockCard(stock));
        updateCalcButtonVisibility(state.portfolio.stocks.length);

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
    updateCalcButtonVisibility(0);
    showToast(`Cleared all data for CY${state.portfolio.calendar_year}`, "success");
}

// ===== SBI Rates & Cache Tools =====
async function fetchSbiRates() {
    const year = state.portfolio.calendar_year;
    showLoading(`Fetching SBI TT buying rates for CY${year}...`);
    try {
        const result = await apiPost("/api/fetch-sbi-rates", { year });
        await hideLoading();
        if (result.success) {
            let msg = `Loaded SBI TT Rates for ${year}.`;
            if (result.missing && result.missing.length > 0) {
                msg += ` Note: Rates missing/approximated for: ${result.missing.join(", ")}`;
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

async function deleteAllData() {
    const msg = "DANGER: This will delete ALL application data, including all saved portfolios, profiles, cached SBI rates, and settings. This action cannot be undone.\n\nAre you sure you want to proceed?";
    if (!confirm(msg)) return;

    const confirm2 = "Final confirmation: Delete EVERYTHING in ~/.fa_desk_data?";
    if (!confirm(confirm2)) return;

    showLoading("Deleting all app data...");
    try {
        const res = await apiPost("/api/tools/delete-all-data");
        if (res.success) {
            showToast("All data deleted. The app will now reload.", "success");
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            showToast("Failed to delete all data: " + (res.error || "Unknown error"), "error");
        }
    } catch (e) {
        console.error("Failed to delete all data", e);
        showToast("Error deleting all data", "error");
    } finally {
        await hideLoading();
    }
}

// ===== User Management UI =====
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
                document.getElementById("initialYearSelect").value = "2025";
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
                <div style="font-size:2rem;margin-bottom:8px;">${USER_ICON_SVG}</div>
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
        
        item.addEventListener("click", async (e) => {
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

// ===== Skeletons =====
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

function setCardLoading(stockId, isLoading) {
    const card = document.querySelector(`.stock-card[data-stock-id="${stockId}"]`);
    if (!card) return;
    if (isLoading) {
        card.classList.add("loading-skeleton");
    } else {
        card.classList.remove("loading-skeleton");
    }
}

// ===== Calculate all driving code =====
async function calculateAll() {
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
        const stockPeakMap = {};
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

        await renderAssetPieChart(result.rows);

        document.getElementById("resultsSection").classList.remove("hidden");
        document.getElementById("sbiRatesSection").classList.remove("hidden");

        const sbiContent = document.getElementById("sbiRatesContent");
        if (sbiContent && !sbiContent.classList.contains("collapsed")) {
            sbiContent.classList.add("collapsed");
            const sbiIcon = sbiContent.previousElementSibling.querySelector(".toggle-icon");
            if (sbiIcon) sbiIcon.style.transform = "rotate(-90deg)";
        }

        await fetchTaxYearSummary();

        document.getElementById("resultsSection").scrollIntoView({ behavior: "smooth" });
        showToast(`FA Report generated — ${result.rows.length} row(s)`, "success");

        state.portfolio.stocks.forEach(s => setCardLoading(s.id, false));
        updateDashboard();

        saveCalcResultsForYoY();
        renderYoYComparison();
    } catch (e) {
        await hideLoading();
        showToast(`Error: ${e.message}`, "error");
    }
}

// ===== Quick Jump =====
function initQuickJump() {
    const nav = document.getElementById("quickJumpNav");
    if (!nav) return;

    const btns = nav.querySelectorAll(".qj-btn");

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

    const sectionIds = Array.from(btns).map(b => b.dataset.target);
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const btn = nav.querySelector(`.qj-btn[data-target="${entry.target.id}"]`);
            if (!btn) return;

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

    setInterval(() => {
        btns.forEach(btn => {
            const el = document.getElementById(btn.dataset.target);
            const isHidden = !el || el.classList.contains("hidden") || el.offsetParent === null;
            btn.classList.toggle("qj-hidden", isHidden);
        });
    }, 1000);
}

// ===== Year-over-Year =====
function renderYoYComparison() {
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
        <h3>📈 Year-over-Year: CY${year-1} → CY${year}</h3>
        <div class="yoy-grid">
            <div class="yoy-card">
                <div class="yoy-label">Total Assets</div>
                <div class="yoy-value">₹${Math.round(curAssets).toLocaleString("en-IN")}</div>
                <div class="yoy-delta ${deltaAssets >= 0 ? 'positive' : 'negative'}">${deltaAssets >= 0 ? '↑' : '↓'} ${pctAssets}%</div>
            </div>
            <div class="yoy-card">
                <div class="yoy-label">Total Dividends</div>
                <div class="yoy-value">₹${Math.round(curDivs).toLocaleString("en-IN")}</div>
                <div class="yoy-delta ${deltaDivs >= 0 ? 'positive' : 'negative'}">${deltaDivs >= 0 ? '↑' : '↓'} ${pctDivs}%</div>
            </div>
            <div class="yoy-card">
                <div class="yoy-label">CY${year-1} Assets</div>
                <div class="yoy-value" style="color:var(--text-secondary)">₹${Math.round(prevAssets).toLocaleString("en-IN")}</div>
                <div class="yoy-delta" style="color:var(--text-muted)">Previous year</div>
            </div>
        </div>
    `;

    const resultsSection = document.getElementById("resultsSection");
    if (resultsSection) resultsSection.appendChild(section);
}

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
    if (!mainSelect) return;
    mainSelect.addEventListener("change", function guardHandler(e) {
        if (state.isDirty) {
            if (!confirm("You have unsaved changes. Switch year and discard them?")) {
                e.stopImmediatePropagation();
                mainSelect.value = state.portfolio.calendar_year;
                return;
            }
        }
    }, true);
}

// ===== About Globe Animation =====
function startAboutGlobe() {
    const canvas = document.getElementById('aboutGlobeCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2, R = 42;
    let angle = 0;

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
    const thankYouEl = document.getElementById("aboutThankYou");

    try {
        const res = await fetch("/api/disclaimer");
        const data = await res.json();
        if (data.success && data.accepted) {
            thankYouEl.classList.remove("hidden");
        } else {
            thankYouEl.classList.add("hidden");
        }
    } catch (e) {
        thankYouEl.classList.add("hidden");
    }

    try {
        const res = await fetch("/api/version");
        const data = await res.json();
        if (data.success) {
            badge.textContent = `v${data.version}`;
        }
    } catch (e) {
        badge.textContent = "v?";
    }
    
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
    btn.innerHTML = CHECK_LOADING_HTML;
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
            resultEl.innerHTML = `<span style="color:var(--success); vertical-align:middle; display:inline-flex; align-items:center; gap:4px;">${BADGE_CHECK_SVG} You're on the latest version (v${data.current_version})</span>`;
        }
    } catch (e) {
        resultEl.classList.remove("hidden");
        resultEl.className = "about-update-result update-error";
        resultEl.textContent = `Update check failed: ${e.message}`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = CHECK_UPDATE_BTN_HTML;
    }
}

// ===== Native Heartbeat & Auto-Save Draft =====
async function sendHeartbeat() {
    try {
        await fetch("/api/heartbeat", { method: "POST" });
    } catch (e) {
        console.warn("Heartbeat failed. Server might be down.");
    }
}

// ===== Tab Switcher =====
async function switchTab(tab) {
    const isA3 = tab === "a3";
    const isSellHelper = tab === "sellHelper";
    const isTaxStatement = tab === "taxStatement";

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

    if (isA3) {
        const alwaysVisible = ["addStockSection", "stockCards", "portfolioDashboard", "stockFilterBar"];
        alwaysVisible.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove("hidden");
        });

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

    if (isSellHelper) {
        const runningYear = new Date().getFullYear();
        const mainSelect = document.getElementById("yearSelect");
        const openedYear = state.portfolio?.calendar_year || 2025;
        let targetYear = openedYear;
        let hasCurrentYearLots = false;
        let currentYearLoaded = false;

        const isRunningYearInDropdown = Array.from(mainSelect?.options || []).some(opt => parseInt(opt.value) === runningYear);

        showLoading("Checking current year lots...");

        if (isRunningYearInDropdown && state.username) {
            try {
                if (state.portfolio && state.portfolio.calendar_year === runningYear) {
                    hasCurrentYearLots = state.portfolio.stocks && state.portfolio.stocks.length > 0;
                    currentYearLoaded = true;
                } else {
                    const resp = await fetch(`/api/load?year=${runningYear}&username=${encodeURIComponent(state.username)}`);
                    const data = await resp.json();
                    if (data.success && data.portfolio && data.portfolio.stocks && data.portfolio.stocks.length > 0) {
                        hasCurrentYearLots = true;
                    }
                }
            } catch (e) {
                console.error("Failed to check if running year has lots:", e);
            }
        }

        if (isRunningYearInDropdown && hasCurrentYearLots) {
            targetYear = runningYear;
        } else {
            targetYear = openedYear;
        }

        const bannerYearEl = document.getElementById("shBannerYear");
        if (bannerYearEl) bannerYearEl.textContent = `CY${targetYear}`;

        let infoMsg = "";
        if (targetYear === runningYear) {
            infoMsg = `Sell Simulator only works for the active running calendar year. Loaded lots from the current calendar year (${runningYear}).`;
        } else {
            infoMsg = `Sell Simulator only works for the active running calendar year. No lots available in current calendar year (${runningYear}), showing ${targetYear} lots instead.`;
        }
        showToast(infoMsg, "info");

        const bannerSpan = document.querySelector("#shRunningYearBanner span");
        if (bannerSpan) {
            bannerSpan.innerHTML = `The Sell Simulator works exclusively for the active running calendar year (<strong id="shBannerYear">CY${targetYear}</strong>). Previous years are not editable. <span style="opacity:0.85; display:block; margin-top:2px;">${infoMsg}</span>`;
        }

        if (state.portfolio.calendar_year !== targetYear) {
            state.portfolio.calendar_year = targetYear;
            if (mainSelect) mainSelect.value = targetYear;
            const rateYearSelect = document.getElementById("ratesYearSelect");
            if (rateYearSelect) rateYearSelect.value = targetYear;

            if (state.username) {
                try {
                    await autoLoadForYear(targetYear);
                } catch (err) {
                    console.error("Auto load failed", err);
                }
            }
        } else if (state.username && !currentYearLoaded && targetYear === runningYear) {
            try {
                await autoLoadForYear(targetYear);
            } catch (err) {
                console.error("Auto load failed", err);
            }
        }

        shImportLots();
        await hideLoading();
    }

    const qjNav = document.getElementById("quickJumpNav");
    const calcFab = document.getElementById("calcFab");
    const hasStocks = state.portfolio.stocks.length > 0;
    if (calcFab) calcFab.classList.toggle("hidden", !isA3 || !hasStocks);
    if (qjNav) qjNav.classList.toggle("hidden", !isA3 || !hasStocks);
}

// ===== Interactive Handlers & Modals exposed globally =====
function selectPlatform(platform) {
    closePlatformModal();
    if (platform === "etrade") {
        document.getElementById("etradeUploadModal").classList.remove("hidden");
    } else if (platform === "ibkr") {
        document.getElementById("ibkrUploadModal").classList.remove("hidden");
    }
}

function openPlatformModal() {
    document.getElementById("platformModal").classList.remove("hidden");
}

function closePlatformModal() {
    document.getElementById("platformModal").classList.add("hidden");
}

function closeEtradeModal() {
    document.getElementById("etradeUploadModal").classList.add("hidden");
    document.getElementById("etradeFileInput").value = "";
    document.getElementById("sellDetailsFileInput").value = "";
    document.getElementById("etradeFileName").textContent = "No file chosen";
    document.getElementById("sellDetailsFileName").textContent = "No files chosen";
}

function closeIbkrModal() {
    document.getElementById("ibkrUploadModal").classList.add("hidden");
    document.getElementById("ibkrFileInput").value = "";
    document.getElementById("ibkrFileName").textContent = "No file chosen";
}

function closeImportReview() {
    document.getElementById("importReviewModal").classList.add("hidden");
    proposedTransactions = [];
}

let proposedTransactions = [];

function renderPortfolio() {
    document.getElementById("stockCards").innerHTML = "";
    state.portfolio.stocks.forEach(stock => renderStockCard(stock));
    updateCalcButtonVisibility(state.portfolio.stocks.length);
    updateDashboard();
}

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
                tr.style.backgroundColor = "rgba(245, 158, 11, 0.1)";
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
                    await fetchRuntimeDataForAllStocks().then(hideLoading).catch(() => hideLoading());
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

    const undoStack = getUndoStack();
    if (undoStack.length === 0) {
        list.innerHTML = '<p class="hint" style="text-align:center;padding:20px;">No actions recorded yet</p>';
        return;
    }

    for (let i = undoStack.length - 1; i >= 0; i--) {
        const item = undoStack[i];
        const div = document.createElement("div");
        div.className = "history-item";
        div.title = "Click to revert to this state";
        div.dataset.index = i;
        div.innerHTML = `
            <span class="history-label">${item.label}</span>
            <span class="history-time">${item.timestamp}</span>
        `;
        list.appendChild(div);
    }

    list.querySelectorAll(".history-item").forEach(item => {
        item.addEventListener("click", () => {
            const idx = parseInt(item.dataset.index);
            revertToHistoryItem(idx);
        });
    });

}

export function updateUndoRedoButtons() {
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");
    if (undoBtn) undoBtn.disabled = getUndoStack().length === 0;
    if (redoBtn) redoBtn.disabled = getRedoStack().length === 0;
}

// ===== Quick Help / Tutorial Helpers mapping titles to steps =====
export function showTutorialStepByTitle(title) {
    const steps = [
        { title: "User & Year Selection", selector: "#userSelectionScreen", desc: "Select or create a user profile and choose a calendar year to load/initialize your portfolio." },
        { title: "Tools Menu", selector: "#toolsMenu", desc: "Access market data tools here, including SBI TT Rates download and the Batch Dividend Fetcher." },
        { title: "Portfolio Summary", selector: "#portfolioDashboard", desc: "View a summary of your portfolio: total assets, unrealized gain/loss, total dividends, and count of stocks/lots." },
        { title: "Add Stock", selector: "#tickerInput", desc: "Enter a ticker symbol and lookup/add stocks to your portfolio." },
        { title: "Generate FA Report", selector: "#calcFab", desc: "Click the floating action button to calculate Schedule FA Section A3 values for all stocks in the portfolio." },
        { title: "FA Report Breakdown", selector: "#resultsSection", desc: "Inspect computed initial value, peak value, closing balance, dividends, and sales proceeds for each lot." },
        { title: "Dividends", selector: "#stockSummarySection", desc: "View detailed dividend calculations and rules applied for each stock." },
        { title: "Tax Summary", selector: "#taxYearSection", desc: "Check the consolidated financial year-wise tax summary for Indian Income Tax filing." },
        { title: "Tax Calculation Audit", selector: "#validateTaxSection", desc: "Audit the exact capital gains and dividend tax computations." },
        { title: "Asset Chart", selector: "#assetPieChartSection", desc: "Visualize the asset allocation by stock value in a doughnut chart." },
        { title: "SBI Rates Used", selector: "#sbiRatesSection", desc: "See all SBI TT rates referenced during calculation, with the option to manually override them." },
        { title: "Generate Tax Statement", selector: "#generateFYBtn", desc: "Generate a consolidated tax summary across financial years." },
        { title: "Sell Simulator", selector: "#tabSellHelper", desc: "Switch to the Sell Simulator tab to simulate hypothetical sales and estimate tax impacts." }
    ];

    const step = steps.find(s => s.title.toLowerCase() === title.toLowerCase());
    if (step) {
        const overlay = document.getElementById("tutorialOverlay");
        const ttTitle = document.getElementById("tutorialTitle");
        const ttDesc = document.getElementById("tutorialDesc");
        const ttCounter = document.getElementById("tutorialStepCounter");
        const ttPrevBtn = document.getElementById("tutorialPrevBtn");
        const ttNextBtn = document.getElementById("tutorialNextBtn");
        const backdrop = document.getElementById("tutorialBackdrop");
        const tooltip = document.getElementById("tutorialTooltip");

        if (overlay) overlay.classList.remove("hidden");
        if (ttTitle) ttTitle.textContent = step.title;
        if (ttDesc) ttDesc.textContent = step.desc;
        if (ttCounter) ttCounter.textContent = "Quick Help";
        if (ttPrevBtn) ttPrevBtn.style.display = "none";
        
        if (ttNextBtn) {
            ttNextBtn.textContent = "Close ✓";
            const closeTut = () => {
                if (overlay) overlay.classList.add("hidden");
                document.querySelectorAll(".tutorial-spotlight").forEach(el => el.remove());
                ttNextBtn.removeEventListener("click", closeTut);
            };
            ttNextBtn.addEventListener("click", closeTut);
        }

        document.querySelectorAll(".tutorial-spotlight").forEach(el => el.remove());
        if (backdrop) backdrop.classList.remove("dimmed");
        if (tooltip) tooltip.style.transform = "none";

        const target = document.querySelector(step.selector);
        if (target && tooltip) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => {
                const rect = target.getBoundingClientRect();
                const pad = 8;

                const spotlight = document.createElement("div");
                spotlight.className = "tutorial-spotlight";
                spotlight.style.top = (rect.top - pad) + "px";
                spotlight.style.left = (rect.left - pad) + "px";
                spotlight.style.width = (rect.width + pad * 2) + "px";
                spotlight.style.height = (rect.height + pad * 2) + "px";
                if (overlay) overlay.appendChild(spotlight);

                let tooltipTop = rect.bottom + 16;
                let tooltipLeft = rect.left;

                requestAnimationFrame(() => {
                    const ttRect = tooltip.getBoundingClientRect();
                    if (tooltipTop + ttRect.height > window.innerHeight - 10) {
                        tooltipTop = rect.top - ttRect.height - 16;
                    }
                    tooltipTop = Math.max(10, Math.min(tooltipTop, window.innerHeight - ttRect.height - 10));
                    tooltipLeft = Math.max(10, Math.min(tooltipLeft, window.innerWidth - ttRect.width - 10));

                    tooltip.style.top = tooltipTop + "px";
                    tooltip.style.left = tooltipLeft + "px";
                });
            }, 300);
        } else if (tooltip && backdrop) {
            backdrop.classList.add("dimmed");
            tooltip.style.top = "50%";
            tooltip.style.left = "50%";
            tooltip.style.transform = "translate(-50%, -50%)";
        }
    }
}

// ===== Wire Up DOM Event Listeners on DOMContentLoaded =====
document.addEventListener("DOMContentLoaded", async () => {
    startSmoothProgress("Initialising FA Desk...", 1.5);
    
    initYearSelectors();
    initFYYearSelector();
    
    // Bind programmatic button listeners
    document.getElementById("lookupBtn").addEventListener("click", lookupStock);
    document.getElementById("tickerInput").addEventListener("keypress", (e) => {
        if (e.key === "Enter") lookupStock();
    });
    
    document.getElementById("calcFab").addEventListener("click", calculateAll);
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
    document.getElementById("deleteAllDataBtn").addEventListener("click", deleteAllData);
    document.getElementById("undoBtn").addEventListener("click", undo);
    document.getElementById("redoBtn").addEventListener("click", redo);
    document.getElementById("helpBtn").addEventListener("click", startTutorial);
    document.getElementById("aboutBtn").addEventListener("click", openAboutModal);
    document.getElementById("generateFYBtn").addEventListener("click", fetchConsolidatedTaxSummary);
    document.getElementById("uploadDocsBtn").addEventListener("click", openPlatformModal);
    document.getElementById("etradeImportBtn").addEventListener("click", importEtradeDocs);
    document.getElementById("ibkrImportBtn").addEventListener("click", importIbkrDocs);
    document.getElementById("historyBtn").addEventListener("click", toggleHistoryPanel);
    
    document.getElementById("switchUserBtn").addEventListener("click", () => {
        document.getElementById("appHeader").classList.add("hidden");
        document.getElementById("appMain").classList.add("hidden");
        document.getElementById("tabNav").classList.add("hidden");
        document.getElementById("userSelectionScreen").classList.remove("hidden");
        state.username = null;
        fetchUsers();
    });

    document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme);

    document.querySelectorAll(".density-option").forEach(btn => {
        btn.addEventListener("click", () => {
            setDensity(btn.dataset.density);
        });
    });

    document.getElementById("quitAppBtn").addEventListener("click", async () => {
        if (!confirm("Are you sure you want to quit the application? Any unsaved changes will be lost.")) return;
        try {
            await fetch("/api/shutdown", { method: "POST" });
        } catch (e) {}
        document.body.innerHTML = `
            <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;background-color:var(--bg-main);color:var(--text-main);font-family:'Inter', sans-serif;">
                <h1 style="font-size:2rem;margin-bottom:16px;">🛑 App will shut down</h1>
                <p style="font-size:1.1rem;color:var(--text-muted);">The application session has ended.</p>
                <p style="font-size:1.1rem;color:var(--text-muted);margin-top:8px;">You can now safely close this window.</p>
            </div>`;
        try { window.close(); } catch(e) {}
    });

    // Keyboard Shortcuts
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

    // E-Trade and IBKR File Chosen Labels
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

    document.getElementById("ibkrFileInput").addEventListener("change", e => {
        const f = e.target.files[0];
        document.getElementById("ibkrFileName").textContent = f ? f.name : "No file chosen";
    });

    // Native open file input reader
    const fileInput = document.getElementById("openFileInput");
    if (fileInput) {
        fileInput.addEventListener("change", function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data.calendar_year || !data.stocks) {
                        throw new Error("Invalid portfolio format");
                    }
                    state.portfolio = data;
                    document.getElementById("yearSelect").value = state.portfolio.calendar_year;

                    document.getElementById("stockCards").innerHTML = "";
                    state.portfolio.stocks.forEach(stock => renderStockCard(stock));
                    updateCalcButtonVisibility(state.portfolio.stocks.length);
                    
                    showToast("Portfolio loaded from file", "success");
                    if (state.portfolio.stocks.length > 0) {
                        fetchRuntimeDataForAllStocks().then(hideLoading).catch(() => hideLoading());
                    }
                } catch (err) {
                    showToast(`Failed to read file: ${err.message}`, "error");
                }
            };
            reader.readAsText(file);
            e.target.value = "";
        });
    }

    // Initialize core components & managers
    await checkDisclaimer();
    await initUserSelection();
    initSellHelper();
    initTutorial();
    initQuickJump();
    restoreTheme();
    restoreDensity();
    addYearChangeGuard();

    // Heartbeat to keep server alive (native desktop mode)
    setInterval(sendHeartbeat, 15000);
    sendHeartbeat();

    // Auto-save draft every 30 seconds
    setInterval(autoSaveDraft, 30000);

    // Search panel auto filtering
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            const items = document.querySelectorAll(".stock-card");
            items.forEach(card => {
                const ticker = card.querySelector(".stock-ticker")?.textContent.toLowerCase() || "";
                const name = card.querySelector(".stock-name")?.textContent.toLowerCase() || "";
                card.style.border = (query && (ticker.includes(query) || name.includes(query))) ? "2px solid var(--accent)" : "";
            });
        });
    }

    // Stock Filter Bar
    const filterInput = document.getElementById("stockFilterInput");
    if (filterInput) {
        filterInput.addEventListener("input", filterStockCards);
    }

    // Collapse All / Expand All
    document.getElementById("collapseAllBtn").addEventListener("click", () => {
        // 1. Collapse all stock cards
        document.querySelectorAll(".stock-card-body").forEach(body => {
            body.classList.remove("expanded");
            const btn = body.closest(".stock-card").querySelector(".toggle-details-btn");
            if (btn) btn.innerHTML = CHEVRON_RIGHT_SVG;
        });
        // 2. Collapse all collapsible report sections
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
        // 1. Expand all stock cards
        document.querySelectorAll(".stock-card-body").forEach(body => {
            body.classList.add("expanded");
            const btn = body.closest(".stock-card").querySelector(".toggle-details-btn");
            if (btn) btn.innerHTML = CHEVRON_DOWN_SVG;
        });
        // 2. Expand all collapsible report sections
        document.querySelectorAll(".collapsible-content").forEach(el => {
            el.classList.remove("collapsed");
            const header = el.previousElementSibling;
            if (header) {
                const icon = header.querySelector(".toggle-icon");
                if (icon) icon.style.transform = "";
            }
        });
    });


    await hideLoading();
});

// ===== Subscription to portfolio-state-change event =====
window.addEventListener("portfolio-state-change", (e) => {
    const { type, isDirty } = e.detail;

    if (type === "portfolio-restored") {
        const container = document.getElementById("stockCards");
        if (container) {
            container.innerHTML = "";
            state.portfolio.stocks.forEach(stock => renderStockCard(stock));
        }
        updateCalcButtonVisibility(state.portfolio.stocks.length);
        updateDashboard();
    } else if (type === "history-change") {
        updateUndoRedoButtons();
        const panel = document.getElementById("historyPanel");
        if (panel && !panel.classList.contains("hidden")) {
            renderHistoryList();
        }
    } else if (type === "dirty-change") {
        const dot = document.getElementById("unsavedDot");
        if (dot) {
            dot.classList.toggle("hidden", !isDirty);
        }
    } else if (type === "clear-calculated") {
        const calculatedEls = [
            "resultsSection", "stockSummarySection", "sbiRatesSection", "taxYearSection",
            "assetPieChartSection", "validateA3Section", "validateTaxSection"
        ];
        calculatedEls.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add("hidden");
        });
        
        const a3Body = document.getElementById("a3TableBody");
        if (a3Body) a3Body.innerHTML = "";
        
        const sbiRatesBody = document.getElementById("sbiRatesTableBody");
        if (sbiRatesBody) sbiRatesBody.innerHTML = "";
        
        const divContainer = document.getElementById("stockSummaryTableBody");
        if (divContainer) divContainer.innerHTML = "";
        
        const taxYearBody = document.getElementById("taxYearTableBody");
        if (taxYearBody) taxYearBody.innerHTML = "";
        
        const validateA3Body = document.getElementById("validateA3TableBody");
        if (validateA3Body) validateA3Body.innerHTML = "";
        
        const validateTaxBody = document.getElementById("validateTaxTableBody");
        if (validateTaxBody) validateTaxBody.innerHTML = "";
        
        const calcFab = document.getElementById("calcFab");
        const hasStocks = state.portfolio.stocks.length > 0;
        if (calcFab) calcFab.classList.toggle("hidden", !hasStocks);
    }
});

// ===== Bind interactive functions to window object for inline HTML onclick handlers =====
window.switchTab = switchTab;
window.toggleSection = toggleSection;
window.showTutorialStepByTitle = showTutorialStepByTitle;
window.closePlatformModal = closePlatformModal;
window.selectPlatform = selectPlatform;
window.closeEtradeModal = closeEtradeModal;
window.closeIbkrModal = closeIbkrModal;
window.closeImportReview = closeImportReview;
window.closeAboutModal = closeAboutModal;
window.checkForUpdate = checkForUpdate;
window.toggleHistoryPanel = toggleHistoryPanel;
window.calculateAll = calculateAll;
window.savePortfolio = savePortfolio;
window.savePortfolioAs = savePortfolioAs;
window.loadPortfolio = loadPortfolio;
window.openPortfolioFile = openPortfolioFile;
window.fetchSbiRates = fetchSbiRates;
window.clearSbiOverrides = clearSbiOverrides;
window.clearStockCache = clearStockCache;
window.deleteAllData = deleteAllData;
window.undo = undo;
window.redo = redo;
window.startTutorial = startTutorial;
window.selectUser = selectUser;
window.openPlatformModal = openPlatformModal;
window.importEtradeDocs = importEtradeDocs;
window.importIbkrDocs = importIbkrDocs;
window.showImportReview = showImportReview;
window.renderPortfolio = renderPortfolio;
