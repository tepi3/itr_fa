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
    initDatePicker,
    calculateXIRR
} from './modules/utils.js';

import { 
    showToast, 
    showLoading, 
    hideLoading, 
    toggleSection, 
    updateCalcButtonVisibility, 
    saveFileRobustly,
    startSmoothProgress, 
    stopSmoothProgress,
    showSectionIfVisible,
    toggleSectionVisibility,
    getSectionVisibilityPrefs
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
    clearSbiOverrides, 
    fetchConsolidatedTaxSummary,
    initFYYearSelector,
    fetchTaxYearSummary,
    exportCSV
} from './modules/components/resultsTable.js';

import { initSellHelper, shImportLots } from './modules/components/simulator.js';

import { 
    updateDashboard, 
    filterStockCards, 
    toggleTheme, 
    restoreTheme, 
    setDensity, 
    restoreDensity, 
    setSbiTTMode,
    restoreSbiTTMode,
    autoSaveDraft, 
    checkForDraft, 
    clearDraft,
    renderAssetPieChart,
    renderNavFlowSankey
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

function showConfirm(message, confirmLabel = "OK") {
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
        
        okBtn.onmouseenter = () => okBtn.style.opacity = '0.9';
        okBtn.onmouseleave = () => okBtn.style.opacity = '1';
        cancelBtn.onmouseenter = () => cancelBtn.style.background = 'var(--bg-hover)';
        cancelBtn.onmouseleave = () => cancelBtn.style.background = 'transparent';
    });
}

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

        const iOpt = document.createElement("option");
        iOpt.value = y;
        iOpt.textContent = y;
        if (y === state.portfolio.calendar_year) iOpt.selected = true;
        initialSelect.appendChild(iOpt);
    }

    for (let y = currentYear; y >= 2010; y--) {
        const rOpt = document.createElement("option");
        rOpt.value = y;
        rOpt.textContent = y;
        if (y === state.portfolio.calendar_year) rOpt.selected = true;
        rateYearSelect.appendChild(rOpt);
    }

    const monthSelect = document.getElementById("ratesMonthSelect");
    if (monthSelect) {
        monthSelect.value = new Date().getMonth() + 1;
    }

    // Initialize RBI Import Modal Date Selectors
    const importRbiYearSelect = document.getElementById("importRbiYearSelect");
    const importRbiMonthSelect = document.getElementById("importRbiMonthSelect");
    if (importRbiYearSelect && importRbiMonthSelect) {
        for (let y = currentYear; y >= 2010; y--) {
            const opt = document.createElement("option");
            opt.value = y;
            opt.textContent = y;
            if (y === state.portfolio.calendar_year) opt.selected = true;
            importRbiYearSelect.appendChild(opt);
        }
        importRbiMonthSelect.value = new Date().getMonth() + 1;
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
            const confirmedRestore = await showConfirm(`Found unsaved draft from ${ago} min ago with ${draft.portfolio.stocks.length} stock(s). Restore it?`, "Restore Draft");
            if (confirmedRestore) {
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

async function clearCurrentYear() {
    const confirmed = await showConfirm(`Are you sure you want to clear all data for CY${state.portfolio.calendar_year}? This will remove all stocks and overrides currently loaded on screen.`, "Clear Data");
    if (!confirmed) return;
    pushUndoSnapshot("Clear Year Data");
    state.portfolio.stocks = [];
    state.portfolio.overrides = {};
    document.getElementById("stockCards").innerHTML = "";
    clearCalculatedSections();
    updateCalcButtonVisibility(0);
    showToast(`Cleared all data for CY${state.portfolio.calendar_year}`, "success");
}

// ===== SBI Rates & Cache Tools =====
function showFetchOptionsDialog() {
    return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.className = "modal-backdrop";
        backdrop.style.zIndex = "11000"; // Ensure it stacks above other modals
        
        const box = document.createElement("div");
        box.className = "modal-box";
        box.style.maxWidth = "450px";
        box.style.borderRadius = "12px";
        box.style.padding = "24px 28px";
        
        box.innerHTML = `
            <div class="modal-header" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 1.15rem; font-weight: 600; color: var(--text-primary);">Fetch SBI TT Rates</h3>
            </div>

            <div class="modal-body" style="margin-bottom: 20px; color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; text-align: left;">
                <p style="margin-top: 0; margin-bottom: 14px;">You are fetching fresh SBI TT Buying Rates from GitHub. How would you like to handle rates in the active database?</p>
                <ul style="padding-left: 20px; margin: 0 0 14px 0;">
                    <li style="margin-bottom: 8px;"><strong>Overwrite All</strong>: Replaces all active rates including any rates that you manually edited/overrode.</li>
                    <li><strong>Only Add Missing</strong>: Only downloads new/missing rates from GitHub and preserves all of your manual overrides and edits.</li>
                </ul>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 12px; flex-wrap: wrap;">
                <button class="btn btn-outline cancel-btn" style="padding: 6px 14px; border-radius: 6px;">Cancel</button>
                <button class="btn btn-outline missing-btn" style="padding: 6px 14px; border-radius: 6px; border-color: var(--primary); color: var(--primary);">Only Add Missing</button>
                <button class="btn confirm-btn" style="padding: 6px 14px; border-radius: 6px; background: var(--primary); border-color: var(--primary); color: white;">Overwrite All</button>
            </div>
        `;
        
        backdrop.appendChild(box);
        document.body.appendChild(backdrop);
        
        const cleanup = (value) => {
            backdrop.remove();
            resolve(value);
        };
        
        box.querySelector(".cancel-btn").addEventListener("click", () => cleanup(null));
        box.querySelector(".missing-btn").addEventListener("click", () => cleanup("missing"));
        box.querySelector(".confirm-btn").addEventListener("click", () => cleanup("overwrite"));
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) cleanup(null);
        });
    });
}

async function fetchSbiRates(overwriteChoice = null) {
    let choice = overwriteChoice;
    // If called via event listener (e.g. click), overwriteChoice will be the Event object
    if (choice instanceof Event) {
        choice = null;
    }
    
    if (choice === null) {
        choice = await showFetchOptionsDialog();
    }
    if (!choice) return; // User cancelled
    
    const overwrite = choice === "overwrite";
    const year = state.portfolio.calendar_year;
    showLoading(`Fetching SBI TT buying rates for CY${year}...`);
    try {
        const result = await apiPost("/api/fetch-sbi-rates", { year, overwrite });
        await hideLoading();
        if (result.success) {
            showToast("SBI TT Rates fetched", "success");
            
            // Reload calendar if it is currently visible
            const ratesSection = document.getElementById("monthlyRatesSection");
            if (ratesSection && !ratesSection.classList.contains("hidden")) {
                if (typeof loadMonthlyRates === "function") {
                    await loadMonthlyRates();
                }
            }
        } else {
            showToast(result.error || "Failed to fetch rates", "error");
        }
    } catch (e) {
        await hideLoading();
        showToast(`Error fetching SBI rates: ${e.message}`, "error");
    }
}

async function importRbiRates() {
    const yearSelect = document.getElementById("importRbiYearSelect");
    const monthSelect = document.getElementById("importRbiMonthSelect");
    const year = yearSelect ? parseInt(yearSelect.value) : null;
    const month = monthSelect ? parseInt(monthSelect.value) : null;

    document.getElementById("rbiRatesModal").classList.add("hidden");
    showLoading(`Normalizing & Importing RBI Reference Rates up to ${month}/${year}...`);
    try {
        const res = await apiPost("/api/import-rbi-rates", { year, month });
        if (res.success) {
            showToast(`Successfully normalized and imported RBI Reference rates up to ${month}/${year}! Filled ${res.imported} missing rate entries.`, "success");
            
            // Sync Rates Editor if visible
            const ratesSection = document.getElementById("monthlyRatesSection");
            if (ratesSection && !ratesSection.classList.contains("hidden")) {
                if (typeof loadMonthlyRates === "function") {
                    await loadMonthlyRates();
                }
            }
            
            pushUndoSnapshot("Import RBI Reference Rates");
        } else {
            showToast("Import failed: " + res.error, "error");
        }
    } catch (err) {
        showToast("Error importing RBI Reference Rates: " + err.message, "error");
    } finally {
        await hideLoading();
    }
}

async function exportSbiRates() {
    showLoading("Preparing SBI rates export...");
    try {
        const res = await apiGet("/api/export-sbi-rates");
        await hideLoading();
        if (res.success) {
            const filename = `sbi_rates_cache.json`;
            const jsonContent = JSON.stringify(res.data, null, 2);
            const saveResult = await saveFileRobustly(
                jsonContent, 
                filename, 
                'JSON File', 
                'application/json', 
                '.json'
            );
            if (saveResult.success) {
                const msg = saveResult.method === 'browser-download' ? "SBI Rates cache downloaded to your computer." : "SBI Rates cache exported successfully!";
                showToast(msg, "success");
            } else if (saveResult.error !== 'Cancelled') {
                showToast(`Export error: ${saveResult.error}`, "error");
            }
        } else {
            showToast(res.error || "Failed to export rates", "error");
        }
    } catch (e) {
        await hideLoading();
        showToast(`Error exporting SBI rates: ${e.message}`, "error");
    }
}

function openSbiImportFile() {
    document.getElementById("importSbiFileInput").click();
}

async function handleSbiImportFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Reset value so same file can be imported again if needed
    e.target.value = "";
    
    showLoading("Importing SBI rates...");
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target.result);
            const res = await apiPost("/api/import-sbi-rates", data);
            await hideLoading();
            if (res.success) {
                showToast("SBI TT Rates database imported successfully!", "success");
                
                // Reload calendar rates if it is visible
                const ratesSection = document.getElementById("monthlyRatesSection");
                if (ratesSection && !ratesSection.classList.contains("hidden")) {
                    if (typeof loadMonthlyRates === "function") {
                        await loadMonthlyRates();
                    }
                }
            } else {
                showToast(res.error || "Failed to import rates", "error");
            }
        } catch (err) {
            await hideLoading();
            showToast(`Failed to parse file: ${err.message}`, "error");
        }
    };
    reader.readAsText(file);
}


async function clearStockCache() {
    const confirmed = await showConfirm("Are you sure you want to clear the local stock data cache? All historical stock info and dividend data will be cleared, forcing fresh queries from Yahoo Finance on your next live fetch.", "Clear Cache");
    if (!confirmed) return;

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
    const confirmed1 = await showConfirm(msg, "Proceed with Deletion");
    if (!confirmed1) return;

    const confirm2 = "Final confirmation: Delete EVERYTHING in ~/.fa_desk_data?";
    const confirmed2 = await showConfirm(confirm2, "Delete Everything");
    if (!confirmed2) return;

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
            const confirmed = await showConfirm(`Are you sure you want to delete user '${username}' AND all their saved data? This cannot be undone.`, "Delete User");
            if (confirmed) {
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

    // Check if the SBI rates cache is empty (first-time start check)
    try {
        const cacheStatus = await apiGet("/api/sbi-cache-status");
        if (cacheStatus.success && cacheStatus.empty) {
            // Silently fetch initial rates from GitHub without prompting the user
            showToast("Initializing SBI TT rates database for the first time...", "info");
            setTimeout(() => {
                fetchSbiRates("overwrite");
            }, 800);
        }
    } catch (err) {
        console.warn("Failed to check SBI cache status:", err);
    }

    // Silently check for version update in the background after login
    checkUpdateSilently();
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

/**
 * Update all sell rows in the portfolio tab to show taxable or actual G&L and XIRR.
 */
function updateAllSellViews() {
    // 1. Update table headers across all stock cards based on their local view preference
    state.portfolio.stocks.forEach(stock => {
        const card = document.querySelector(`.stock-card[data-stock-id="${stock.id}"]`);
        if (card) {
            const isCardActual = (stock.sell_view_mode === "actual");
            const glHeader = card.querySelector(".sell-gl-header");
            if (glHeader) glHeader.textContent = isCardActual ? "G&L (Actual)" : "G&L (Taxable)";
            const xirrHeader = card.querySelector(".sell-xirr-header");
            if (xirrHeader) xirrHeader.textContent = isCardActual ? "XIRR (Actual)" : "XIRR (Taxable)";
        }
    });

    if (!state.calculatedRows || state.calculatedRows.length === 0) {
        document.querySelectorAll(".sells-tfoot").forEach(f => f.classList.add("hidden"));
        return;
    }

    // 2. Apply G&L & XIRR badges to sell rows based on each stock's selected view mode
    state.calculatedRows.forEach(row => {
        const stock = state.portfolio.stocks.find(s => s.lots && s.lots.some(l => l.id === row.lot_id));
        const isActual = (stock && stock.sell_view_mode === "actual");

        if (row.calculation_details && row.calculation_details.sales && row.calculation_details.sales.sale_entries) {
            row.calculation_details.sales.sale_entries.forEach(sellEntry => {
                if (sellEntry.sell_id) {
                    const tr = document.querySelector(`tr[data-sell-id="${sellEntry.sell_id}"]`);
                    if (tr) {
                        // Determine buyValInr for percentage calculation
                        const buyValInrForPct = isActual
                            ? (sellEntry.quantity * sellEntry.buy_price * sellEntry.buy_ttbr_actual)
                            : (sellEntry.buy_cost_inr);

                        // 1. Update G&L Badge
                        const glContainer = tr.querySelector(".sell-gl-container");
                        if (glContainer) {
                            const usdVal = sellEntry.gain_loss_usd || 0;
                            const inrVal = isActual ? (sellEntry.gain_loss_actual_inr || 0) : (sellEntry.gain_loss_inr || 0);
                            const isProfit = inrVal >= 0;
                            const cls = isProfit ? "profit" : "loss";
                            
                            // Calculate USD percentage increase
                            const buyValUsd = sellEntry.quantity * sellEntry.buy_price;
                            let pctTextUsd = "";
                            if (buyValUsd > 0) {
                                const pctValUsd = (usdVal / buyValUsd) * 100;
                                pctTextUsd = ` (${pctValUsd >= 0 ? "+" : ""}${pctValUsd.toFixed(1)}%)`;
                            }
                            const usdText = (usdVal >= 0 ? "+$" : "-$") + Math.abs(usdVal).toFixed(2) + pctTextUsd;
                            
                            // Calculate INR percentage increase
                            let pctTextInr = "";
                            if (buyValInrForPct && buyValInrForPct > 0) {
                                const pctValInr = (inrVal / buyValInrForPct) * 100;
                                pctTextInr = ` (${pctValInr >= 0 ? "+" : ""}${pctValInr.toFixed(1)}%)`;
                            }
                            
                            const inrText = (inrVal >= 0 ? "+₹" : "-₹") + Math.abs(inrVal).toLocaleString("en-IN") + pctTextInr;
                            
                            glContainer.innerHTML = `
                                <div class="sell-gl-badge ${cls}" title="INR G&L: ${inrText} | USD G&L: ${usdText}" style="display:inline-flex; flex-direction:column; align-items:flex-start;">
                                    <span>${inrText}</span>
                                    <span style="font-size:0.65rem;opacity:0.8;">${usdText}</span>
                                </div>
                            `;
                        }

                        // 2. Calculate and update XIRR Badge in INR
                        const xirrContainer = tr.querySelector(".sell-xirr-container");
                        if (xirrContainer) {
                            const buyD = parseAppDate(row.acquire_date_raw);
                            const sellD = parseAppDate(sellEntry.sell_date);
                            
                            const buyValInr = isActual
                                ? (sellEntry.quantity * sellEntry.buy_price * sellEntry.buy_ttbr_actual)
                                : (sellEntry.buy_cost_inr);
                            const sellValInr = isActual
                                ? (sellEntry.proceeds_inr || (sellEntry.quantity * sellEntry.sell_price * sellEntry.ttbr))
                                : ((sellEntry.buy_cost_inr || 0) + (sellEntry.gain_loss_inr || 0));

                            if (buyD && sellD && buyValInr > 0 && sellValInr > 0) {
                                const days = Math.round((sellD - buyD) / 86400000);
                                if (days > 0) {
                                    const xirrVal = Math.pow(sellValInr / buyValInr, 365 / days) - 1;
                                    const xirrPct = xirrVal * 100;
                                    const isProfit = xirrPct >= 0;
                                    const cls = isProfit ? "profit" : "loss";
                                    const text = (xirrPct >= 0 ? "+" : "") + xirrPct.toFixed(2) + "%";
                                    xirrContainer.innerHTML = `<div class="sell-gl-badge ${cls}">${text}</div>`;
                                } else {
                                    xirrContainer.innerHTML = `<div class="sell-gl-badge loss">0.00%</div>`;
                                }
                            } else {
                                xirrContainer.innerHTML = "—";
                            }
                        }
                    }
                }
            });
        }
    });

    // 3. Compute and populate overall G&L and XIRR footers for each stock
    state.portfolio.stocks.forEach(stock => {
        const card = document.querySelector(`.stock-card[data-stock-id="${stock.id}"]`);
        if (!card) return;
        const tfoot = card.querySelector(".sells-tfoot");
        if (!tfoot) return;

        const stockRows = state.calculatedRows.filter(row =>
            stock.lots.some(l => l.id === row.lot_id)
        );

        let hasSells = false;
        let totalQty = 0;
        let totalUsdGL = 0;
        let totalTaxableInrGL = 0;
        let totalActualInrGL = 0;
        let totalBuyCostUsd = 0;
        let totalTaxableBuyCostInr = 0;
        let totalActualBuyCostInr = 0;
        let taxableCashFlows = [];
        let actualCashFlows = [];

        stockRows.forEach(row => {
            const details = row.calculation_details;
            if (details && details.sales && details.sales.sale_entries && details.sales.sale_entries.length > 0) {
                hasSells = true;
                const buyD = parseAppDate(row.acquire_date_raw);
                details.sales.sale_entries.forEach(sellEntry => {
                    const qty = sellEntry.quantity || 0;
                    totalQty += qty;
                    totalUsdGL += sellEntry.gain_loss_usd || 0;
                    totalTaxableInrGL += sellEntry.gain_loss_inr || 0;
                    totalActualInrGL += sellEntry.gain_loss_actual_inr || 0;
                    
                    const buyCostUsd = qty * (sellEntry.buy_price || 0);
                    totalBuyCostUsd += buyCostUsd;

                    const sellD = parseAppDate(sellEntry.sell_date);
                    if (buyD && sellD) {
                        // Taxable Cash Flows
                        const taxableBuyCost = sellEntry.buy_cost_inr || 0;
                        const taxableSellProceeds = (sellEntry.buy_cost_inr || 0) + (sellEntry.gain_loss_inr || 0);
                        totalTaxableBuyCostInr += taxableBuyCost;
                        if (taxableBuyCost > 0) {
                            taxableCashFlows.push({ date: buyD, amount: -taxableBuyCost });
                            taxableCashFlows.push({ date: sellD, amount: taxableSellProceeds });
                        }

                        // Actual Cash Flows
                        const actualBuyCost = qty * sellEntry.buy_price * (sellEntry.buy_ttbr_actual || 0);
                        const actualSellProceeds = sellEntry.proceeds_inr || (qty * sellEntry.sell_price * (sellEntry.ttbr_actual || 0));
                        totalActualBuyCostInr += actualBuyCost;
                        if (actualBuyCost > 0) {
                            actualCashFlows.push({ date: buyD, amount: -actualBuyCost });
                            actualCashFlows.push({ date: sellD, amount: actualSellProceeds });
                        }
                    }
                });
            }
        });

        if (!hasSells) {
            tfoot.classList.add("hidden");
            return;
        }

        tfoot.classList.remove("hidden");

        // Format Quantity
        tfoot.querySelector(".total-sell-qty").textContent = totalQty % 1 === 0
            ? totalQty
            : totalQty.toFixed(4).replace(/\.?0+$/, "");

        const isActual = (stock.sell_view_mode === "actual");

        // Calculate USD percentage increase
        let pctTextUsd = "";
        if (totalBuyCostUsd > 0) {
            const pctUsd = (totalUsdGL / totalBuyCostUsd) * 100;
            pctTextUsd = ` (${pctUsd >= 0 ? "+" : ""}${pctUsd.toFixed(1)}%)`;
        }
        const usdTextOverall = (totalUsdGL >= 0 ? "+$" : "-$") + Math.abs(totalUsdGL).toFixed(2) + pctTextUsd;

        // Calculate INR value and percentage increase based on active view mode
        const overallInrGL = isActual ? totalActualInrGL : totalTaxableInrGL;
        const overallBuyCostInr = isActual ? totalActualBuyCostInr : totalTaxableBuyCostInr;
        let pctTextInr = "";
        if (overallBuyCostInr > 0) {
            const pctInr = (overallInrGL / overallBuyCostInr) * 100;
            pctTextInr = ` (${pctInr >= 0 ? "+" : ""}${pctInr.toFixed(1)}%)`;
        }
        const inrTextOverall = (overallInrGL >= 0 ? "+₹" : "-₹") + formatINR(Math.abs(overallInrGL)) + pctTextInr;

        tfoot.querySelector(".total-sell-gl").innerHTML = `
            <div class="sell-gl-badge ${overallInrGL >= 0 ? 'profit' : 'loss'}" style="display:inline-flex; flex-direction:column; align-items:flex-start; padding:3px 8px; border-radius:6px;">
                <span>${inrTextOverall}</span>
                <span style="font-size:0.65rem; opacity:0.8;">${usdTextOverall}</span>
            </div>
        `;

        // Format XIRR cell based on active view mode
        const overallXirr = isActual ? calculateXIRR(actualCashFlows) : calculateXIRR(taxableCashFlows);
        const xirrTextOverall = overallXirr !== null
            ? (overallXirr >= 0 ? "+" : "") + (overallXirr * 100).toFixed(2) + "%"
            : "—";

        tfoot.querySelector(".total-sell-xirr").innerHTML = `
            <div class="sell-gl-badge ${overallXirr >= 0 ? 'profit' : 'loss'}" style="padding:3px 8px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center;">
                <span>${xirrTextOverall}</span>
            </div>
        `;
    });
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
        const payload = { ...state.portfolio, sbi_tt_mode: state.sbi_tt_mode };
        const result = await apiPost("/api/calculate", payload);
        stopSmoothProgress();
        showLoading("Generating FA Report...\nThis may take a moment (fetching prices & rates)", 100);
        setTimeout(() => hideLoading(), 200);

        if (!result.success) {
            state.portfolio.stocks.forEach(s => setCardLoading(s.id, false));
            updateDashboard();
            return showToast(`Calculation error: ${result.error}`, "error");
        }

        if (result.errors && result.errors.length > 0) {
            result.errors.forEach(err => showToast(err, "error"));
            
            // Abort full report generation
            state.portfolio.stocks.forEach(s => setCardLoading(s.id, false));
            updateDashboard();
            
            // Still populate Used Rates so user knows what's missing
            await collectSbiRates(result.rows);
            document.getElementById("sbiRatesSection").classList.remove("hidden");
            
            // Scroll to the Rates Editor to prompt fix
            const ratesEditor = document.getElementById("monthlyRatesSection");
            ratesEditor.classList.remove("hidden");
            ratesEditor.scrollIntoView({ behavior: "smooth" });
            
            return showToast("Report generation blocked due to missing SBI rates. Please check the Rates Editor.", "warning");
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
                showSectionIfVisible(summarySection.id);
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

        await collectSbiRates(result.rows);

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

        // Apply G&L and XIRR badges to sell rows
        updateAllSellViews();

        await renderAssetPieChart(result.rows);
        await renderNavFlowSankey(result.rows);

        showSectionIfVisible("resultsSection");
        showSectionIfVisible("sbiRatesSection");

        // Collapse auxiliary audit sections by default
        ["sbiRatesContent", "validateA3Content", "validateTaxContent", "validatePeakContent"].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.classList.contains("collapsed")) {
                el.classList.add("collapsed");
                const icon = el.previousElementSibling?.querySelector(".toggle-icon");
                if (icon) icon.style.transform = "rotate(-90deg)";
            }
        });

        await fetchTaxYearSummary();

        document.getElementById("resultsSection").scrollIntoView({ behavior: "smooth" });
        showToast(`FA Report generated — ${result.rows.length} row(s)`, "success");

        // Check for SBI lookback warnings and notify user
        if (state.sbi_tt_mode !== 'uniform' && state.sbiRatesUsed && state.sbiRatesUsed.length > 0) {
            const hasWarnings = state.sbiRatesUsed.some(entry => {
                if (entry.eventDate && entry.rateDate && !entry.label.includes("Tax")) {
                    const ev = parseAppDate(entry.eventDate);
                    const rt = parseAppDate(entry.rateDate);
                    if (ev && rt) {
                        const diffTime = Math.abs(ev - rt);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        return diffDays > 5; // 5-day lookback window without warning
                    }
                }
                return false;
            });
            if (hasWarnings) {
                setTimeout(() => {
                    showToast("Lookback warnings found in SBI TT rates. Please review 'SBI TT Rates Used' at the bottom of the report.", "warning");
                }, 800);
            }
        }

        state.portfolio.stocks.forEach(s => setCardLoading(s.id, false));
        updateDashboard();

        saveCalcResultsForYoY();
        renderYoYComparison();
    } catch (e) {
        await hideLoading();
        state.portfolio.stocks.forEach(s => setCardLoading(s.id, false));
        updateDashboard();
        showToast(`Error: ${e.message}`, "error");
    }
}

// ===== Section Visibility Toggles =====
function initSectionToggles() {
    const dropdown = document.getElementById("viewMenuContent");
    if (!dropdown) return;

    // Sync checkboxes from prefs each time the dropdown is about to show
    const viewMenuBtn = dropdown.closest(".dropdown");
    if (viewMenuBtn) {
        viewMenuBtn.addEventListener("mouseenter", () => {
            const prefs = getSectionVisibilityPrefs();
            dropdown.querySelectorAll(".section-toggle-item input[type=checkbox]").forEach(cb => {
                const sectionId = cb.dataset.section;
                cb.checked = prefs[sectionId] !== false; // default = visible
            });
        });
    }

    dropdown.querySelectorAll(".section-toggle-item input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", () => {
            toggleSectionVisibility(cb.dataset.section, cb.checked);
        });
    });
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
    mainSelect.addEventListener("change", async function guardHandler(e) {
        if (state.isDirty) {
            const confirmed = await showConfirm("You have unsaved changes. Switch year and discard them?", "Discard Changes");
            if (!confirmed) {
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

    // Hide the notification dot immediately when the user opens the About modal
    const dot = document.getElementById("aboutUpdateDot");
    if (dot) {
        dot.classList.add("hidden");
    }

    // Persist dismissal for this specific version in localStorage so it never triggers again
    if (state.silentUpdateInfo && state.silentUpdateInfo.latest_version) {
        localStorage.setItem("fa_desk_dismissed_update_version", state.silentUpdateInfo.latest_version);
    }

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
    
    // If the silent check already found update info, display it instantly!
    if (state.silentUpdateInfo) {
        const data = state.silentUpdateInfo;
        resultEl.classList.remove("hidden");
        if (data.update_available) {
            resultEl.className = "about-update-result update-available";
            resultEl.innerHTML = `New version <strong>v${data.latest_version}</strong> is available! <a href="${data.release_url}" target="_blank" rel="noopener">Download →</a>`;
        } else {
            resultEl.className = "about-update-result up-to-date";
            resultEl.innerHTML = `<span style="color:var(--success); vertical-align:middle; display:inline-flex; align-items:center; gap:4px;">${BADGE_CHECK_SVG} You're on the latest version (v${data.current_version})</span>`;
        }
    } else {
        resultEl.classList.add("hidden");
        resultEl.className = "about-update-result hidden";
        resultEl.innerHTML = "";
    }
    
    modal.classList.remove("hidden");
    startAboutGlobe();
}

function toggleSearchModal() {
    const modal = document.getElementById("searchModal");
    const input = document.getElementById("searchInput");
    if (modal && input) {
        modal.classList.toggle("hidden");
        if (!modal.classList.contains("hidden")) {
            input.value = "";
            input.focus();
        }
    }
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
        } else {
            // Keep our cache updated
            state.silentUpdateInfo = data;
            
            if (data.update_available) {
                resultEl.className = "about-update-result update-available";
                resultEl.innerHTML = `New version <strong>v${data.latest_version}</strong> is available! <a href="${data.release_url}" target="_blank" rel="noopener">Download →</a>`;
                
                // Hide badge and store in localStorage since they manually initiated and viewed the check
                const dot = document.getElementById("aboutUpdateDot");
                if (dot) {
                    dot.classList.add("hidden");
                }
                localStorage.setItem("fa_desk_dismissed_update_version", data.latest_version);
            } else {
                resultEl.className = "about-update-result up-to-date";
                resultEl.innerHTML = `<span style="color:var(--success); vertical-align:middle; display:inline-flex; align-items:center; gap:4px;">${BADGE_CHECK_SVG} You're on the latest version (v${data.current_version})</span>`;
            }
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

async function checkUpdateSilently() {
    try {
        const res = await fetch("/api/check-update");
        const data = await res.json();
        if (data.success && data.update_available && data.latest_version && data.latest_version !== data.current_version) {
            state.silentUpdateInfo = data;
            
            // Check if the user has already dismissed this specific version
            const dismissedVer = localStorage.getItem("fa_desk_dismissed_update_version");
            if (dismissedVer !== data.latest_version) {
                const dot = document.getElementById("aboutUpdateDot");
                if (dot) {
                    dot.classList.remove("hidden");
                }
            }
        }
    } catch (e) {
        console.warn("Silent update check failed:", e);
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
// ===== Jump & Scroll Helpers (Ported) =====
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

// ===== Global Search (Ported) =====
function performGlobalSearch(query) {
    const resultsContainer = document.getElementById("searchResults");
    if (!resultsContainer) return;
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
                title: `${stock.ticker} \u2014 ${stock.company_info?.name || "Unknown"}`,
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

async function switchTab(tab) {
    const isA3 = tab === "a3";
    const isSellHelper = tab === "sellHelper";
    const isTaxStatement = tab === "taxStatement";

    const allA3Els = [
        "addStockSection", "stockCards", "portfolioDashboard", "stockFilterBar",
        "resultsSection", "stockSummarySection", "sbiRatesSection", "taxYearSection",
        "monthlyRatesSection", "assetPieChartSection", "validateA3Section", "validateTaxSection",
        "validatePeakSection", "navFlowSection"
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
                "assetPieChartSection", "validateA3Section", "validateTaxSection",
                "validatePeakSection", "navFlowSection"
            ];
            calculatedEls.forEach(id => showSectionIfVisible(id));
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

        const bannerSpan = document.getElementById("shBannerContent");
        if (bannerSpan) {
            bannerSpan.innerHTML = `<strong>CY${targetYear}</strong>: ${infoMsg}`;
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
    } else if (platform === "ms") {
        document.getElementById("msUploadModal").classList.remove("hidden");
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

function closeMSModal() {
    document.getElementById("msUploadModal").classList.add("hidden");
    document.getElementById("msFileInput").value = "";
    document.getElementById("msFileName").textContent = "No file chosen";
    document.getElementById("msTickerInput").value = "";
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
                closeMSModal();
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

    showLoading("Parsing IBKR Activity Statement...");
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

async function importMSDocs() {
    const msFile = document.getElementById("msFileInput").files[0];
    const ticker = document.getElementById("msTickerInput").value.trim().toUpperCase();

    if (!msFile) {
        showToast("Please choose the Morgan Stanley report file to import", "warning");
        return;
    }
    if (!ticker) {
        showToast("Please enter the ticker symbol (e.g. MU)", "warning");
        return;
    }

    showLoading("Parsing Morgan Stanley Equity Plan Report...");
    try {
        const fd = new FormData();
        fd.append("file", msFile);
        fd.append("ticker", ticker);
        fd.append("portfolio", JSON.stringify(state.portfolio));
        const resp = await fetch("/api/upload-morgan-stanley", { method: "POST", body: fd });
        const result = await resp.json();

        await hideLoading();
        if (result.success) {
            const totalSkipped = result.skipped_count || 0;
            const cy = result.calendar_year || "";

            if (totalSkipped > 0) {
                showToast(
                    `⚠ ${totalSkipped} transaction${totalSkipped > 1 ? "s" : ""} skipped — outside CY${cy} scope`,
                    "warning"
                );
            }
            closeMSModal();
            showImportReview(result.transactions || [], `Morgan Stanley (${ticker})`);
        } else {
            showToast("Morgan Stanley import error: " + result.error, "error");
        }
    } catch (err) {
        await hideLoading();
        showToast("Morgan Stanley upload failed: " + err.message, "error");
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
        { title: "SBI TT Rate Modes", selector: ".sbi-mode-selector", desc: "Choose how foreign currency is converted to INR. Split Mode uses Rule 115 (preceding month-end) for tax and SBI TTBR (event date) for Section A3. Uniform Mode uses Rule 115 for everything. Check the Docs button for official regulatory PDFs." },
        { title: "Add Stock", selector: "#tickerInput", desc: "Enter a ticker symbol and lookup/add stocks to your portfolio." },
        { title: "Generate FA Report", selector: "#calcFab", desc: "Click the floating action button to calculate Schedule FA Section A3 values for all stocks in the portfolio." },
        { title: "FA Report Breakdown", selector: "#resultsSection", desc: "Inspect computed initial value, peak value, closing balance, dividends, and sales proceeds for each lot." },
        { title: "Dividends", selector: "#stockSummarySection", desc: "View detailed dividend calculations and rules applied for each stock." },
        { title: "Tax Summary", selector: "#taxYearSection", desc: "Check the consolidated financial year-wise tax summary for Indian Income Tax filing." },
        { title: "Tax Calculation Audit", selector: "#validateTaxSection", desc: "Audit the exact capital gains and dividend tax computations." },
        { title: "Asset Chart", selector: "#assetPieChartSection", desc: "Visualize the asset allocation by stock value in a doughnut chart." },
        { title: "Peak Value Audit", selector: "#validatePeakSection", desc: "Verify how peak dates and INR values were determined. Shows the winning day and runner-up candidates with full price × qty × rate breakdowns." },
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
    
    const safeAddListener = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(event, handler);
        } else {
            console.warn(`Element with ID '${id}' not found. Skipping listener.`);
        }
    };
    


    // Bind programmatic button listeners
    safeAddListener("lookupBtn", "click", lookupStock);
    const tickerInput = document.getElementById("tickerInput");
    if (tickerInput) {
        tickerInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") lookupStock();
        });
    }
    
    safeAddListener("calcFab", "click", calculateAll);
    safeAddListener("saveBtn", "click", savePortfolio);
    safeAddListener("saveAsBtn", "click", savePortfolioAs);
    safeAddListener("loadBtn", "click", loadPortfolio);
    safeAddListener("openFileBtn", "click", openPortfolioFile);
    safeAddListener("fetchRatesBtn", "click", fetchSbiRates);
    safeAddListener("importSbiRatesBtn", "click", openSbiImportFile);
    safeAddListener("importRbiRatesBtn", "click", () => {
        document.getElementById("rbiRatesModal").classList.remove("hidden");
    });
    safeAddListener("confirmRbiRatesBtn", "click", importRbiRates);
    safeAddListener("exportSbiRatesBtn", "click", exportSbiRates);
    safeAddListener("exportCsvBtn", "click", exportCSV);
    safeAddListener("importSbiFileInput", "change", handleSbiImportFileSelect);
    safeAddListener("fetchAllDividendsBtn", "click", fetchAllDividends);
    safeAddListener("importPrevBtn", "click", importPreviousYear);
    safeAddListener("clearYearBtn", "click", clearCurrentYear);
    safeAddListener("viewRatesBtn", "click", showMonthlyRates);
    safeAddListener("ratesYearSelect", "change", loadMonthlyRates);
    safeAddListener("ratesMonthSelect", "change", loadMonthlyRates);

    safeAddListener("clearSbiBtn", "click", clearSbiOverrides);
    safeAddListener("clearCacheBtn", "click", clearStockCache);
    safeAddListener("deleteAllDataBtn", "click", deleteAllData);
    safeAddListener("undoBtn", "click", undo);
    safeAddListener("redoBtn", "click", redo);
    safeAddListener("helpBtn", "click", startTutorial);
    safeAddListener("aboutBtn", "click", openAboutModal);
    safeAddListener("findBtn", "click", toggleSearchModal);
    safeAddListener("generateFYBtn", "click", fetchConsolidatedTaxSummary);
    safeAddListener("uploadDocsBtn", "click", openPlatformModal);
    safeAddListener("etradeImportBtn", "click", importEtradeDocs);
    safeAddListener("ibkrImportBtn", "click", importIbkrDocs);
    safeAddListener("msImportBtn", "click", importMSDocs);
    safeAddListener("historyBtn", "click", toggleHistoryPanel);
    
    const switchUserBtn = document.getElementById("switchUserBtn");
    if (switchUserBtn) {
        switchUserBtn.addEventListener("click", () => {
            document.getElementById("appHeader").classList.add("hidden");
            document.getElementById("appMain").classList.add("hidden");
            document.getElementById("tabNav").classList.add("hidden");
            document.getElementById("userSelectionScreen").classList.remove("hidden");
            state.username = null;
            fetchUsers();
        });
    }

    safeAddListener("themeToggleBtn", "click", toggleTheme);

    const netFlowsCb = document.getElementById("sankeyNetFlowsCheckbox");
    if (netFlowsCb) {
        netFlowsCb.checked = localStorage.getItem("fa_desk_sankey_net_flows") === "true";
        netFlowsCb.addEventListener("change", (e) => {
            localStorage.setItem("fa_desk_sankey_net_flows", e.target.checked ? "true" : "false");
            if (state.calculatedRows && state.calculatedRows.length > 0) {
                renderNavFlowSankey(state.calculatedRows);
            }
        });
    }

    const sankeyBasisSelect = document.getElementById("sankeyValuationBasis");
    if (sankeyBasisSelect) {
        let savedBasis = localStorage.getItem("fa_desk_sankey_valuation_basis");
        if (!savedBasis) {
            savedBasis = "market";
            localStorage.setItem("fa_desk_sankey_valuation_basis", "market");
        }
        sankeyBasisSelect.value = savedBasis;
        sankeyBasisSelect.addEventListener("change", (e) => {
            localStorage.setItem("fa_desk_sankey_valuation_basis", e.target.value);
            if (state.calculatedRows && state.calculatedRows.length > 0) {
                renderNavFlowSankey(state.calculatedRows);
            }
        });
    }

    document.querySelectorAll(".density-option").forEach(btn => {
        btn.addEventListener("click", () => {
            setDensity(btn.dataset.density);
        });
    });

    const quitAppBtn = document.getElementById("quitAppBtn");
    if (quitAppBtn) {
        quitAppBtn.addEventListener("click", async () => {
            const confirmed = await showConfirm("Are you sure you want to quit the application? Any unsaved changes will be lost.", "Quit Application");
            if (!confirmed) return;
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
    }

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
            toggleSearchModal();
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

    document.getElementById("msFileInput").addEventListener("change", e => {
        const f = e.target.files[0];
        document.getElementById("msFileName").textContent = f ? f.name : "No file chosen";
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

    // Hide the initial loading overlay so the disclaimer / user selection modals are fully visible and clickable!
    await hideLoading();

    // Initialize core components & managers
    await checkDisclaimer();
    await initUserSelection();
    initSellHelper();
    initTutorial();
    initQuickJump();
    initSectionToggles();
    restoreTheme();
    restoreDensity();
    restoreSbiTTMode();
    addYearChangeGuard();

    // SBI TT Mode Toggles
    document.querySelectorAll(".sbi-mode-option").forEach(btn => {
        btn.addEventListener("click", async () => {
            const mode = btn.dataset.mode;
            if (state.sbi_tt_mode === mode) return;

            if (mode === 'uniform') {
                const confirmed = await showConfirm("I have read the attached documents and want to switch to Uniform mode", "Switch to Uniform");
                if (!confirmed) return;
            }

            setSbiTTMode(mode);
            showToast(`SBI TT Mode set to: ${mode === 'split' ? 'Split' : 'Uniform'}`, "info");
            
            // Highlight that re-calculation is needed without marking portfolio as dirty
            const calcFab = document.getElementById("calcFab");
            if (calcFab) {
                calcFab.classList.add("highlight-pulse");
                setTimeout(() => calcFab.classList.remove("highlight-pulse"), 5000);
            }
        });
    });

    // SBI Reference Docs Dropdown
    const sbiRefBtn = document.getElementById("sbiRefDocsBtn");
    const sbiRefMenu = document.getElementById("sbiRefDocsMenu");
    if (sbiRefBtn && sbiRefMenu) {
        sbiRefBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            sbiRefMenu.classList.toggle("hidden");
        });
        document.addEventListener("click", () => sbiRefMenu.classList.add("hidden"));
    }

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
            performGlobalSearch(query);
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
        updateAllSellViews();
    } else if (type === "sell-view-mode-change") {
        updateAllSellViews();
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
            "assetPieChartSection", "validateA3Section", "validateTaxSection",
            "validatePeakSection", "navFlowSection"
        ];
        calculatedEls.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add("hidden");
        });
        updateAllSellViews();
        
        const navFlowBody = document.getElementById("navFlowSankey");
        if (navFlowBody) navFlowBody.innerHTML = "";
        
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
        
        const validatePeakBody = document.getElementById("validatePeakTableBody");
        if (validatePeakBody) validatePeakBody.innerHTML = "";
        
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
window.closeMSModal = closeMSModal;
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
window.importRbiRates = importRbiRates;
window.exportSbiRates = exportSbiRates;
window.exportCSV = exportCSV;
window.openSbiImportFile = openSbiImportFile;
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
window.importMSDocs = importMSDocs;
window.showImportReview = showImportReview;
window.renderPortfolio = renderPortfolio;
