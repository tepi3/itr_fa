/**
 * Onboarding and Help Step-by-Step Tutorial System
 */

const tutorialStepsA3 = [
    { selector: "#portfolioMenu", title: "Portfolio Menu", desc: "This menu contains all file and data operations. Access Upload, Load, Import Prev Year, Open, and Save As options here." },
    { selector: "#toolsMenu", title: "Tools Menu", desc: "Access market data tools here, including SBI TT Rates download and the Batch Dividend Fetcher." },
    { selector: "#manageMenu", title: "Manage Menu", desc: "Maintenance tools for the app and portfolio. Includes clearing current year data, resetting SBI overrides, managing stock cache, or deleting all app data." },
    { selector: "#viewMenu", title: "View Menu", desc: "Customize your display by collapsing/expanding all stock cards, or view your session's Action History." },
    { selector: "#densityBtn", title: "Resolution / Density Scale", desc: "Adjust the user interface scaling and grid density to fit compact laptop displays or high-resolution 4K screens dynamically." },
    { selector: "#saveBtn", title: "Quick Save", desc: "Save your current work to the server. The pulsing blue dot indicates unsaved changes." },
    { selector: "#undoBtn", title: "Undo / Redo", desc: `Mistakes are easy to fix! Use the Undo button to revert any action (or Ctrl+Z) and Redo to repeat. We track up to 50 actions.` },
    { selector: "#tickerInput", title: "Add Stock / ETF", desc: "Enter a ticker symbol (e.g., AAPL, AMZN) and click Lookup to add it to your portfolio." },
    { selector: ".add-lot-btn", title: "Acquisition Lots", desc: `Each stock has acquisition lots representing your purchase transactions. Add the buy date, quantity, and price. Use the Fetch button to auto-fill the closing price.` },
    { selector: ".add-sell-btn", title: "Sell Transactions", desc: "Record any sell transactions against a specific lot. The tool uses FIFO matching and tracks partial sells." },
    { selector: ".fetch-dividends-btn", title: "Fetch Dividends", desc: "Fetch exact dividend data (including Payment Dates) from Nasdaq for the calendar year. This ensures accurate Rule 115 calculations without manual date entry." },
    { selector: "#calcFab", title: "Generate FA Report", desc: "Click the floating button to compute all 12 columns of Schedule FA Section A3, including initial value, peak value, closing balance, dividends, and sale proceeds — all in ₹ using SBI TT rates." },
];

const tutorialStepsSell = [
    { selector: "#shRefreshBtn", title: "Refresh Lots", desc: "Re-import the latest acquisition lots from your current portfolio." },
    { selector: "#shAllocBtn", title: "Allocate Sells", desc: "Automatically match and allocate simulated sells against your eligible acquisition lots using tax-optimized strategies (MinTax, MaxLoss, FIFO, LIFO)." },
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

export function initTutorial() {
    const closeBtn = document.getElementById("tutorialCloseBtn");
    const nextBtn = document.getElementById("tutorialNextBtn");
    const prevBtn = document.getElementById("tutorialPrevBtn");
    const backdrop = document.getElementById("tutorialBackdrop");

    if (closeBtn) closeBtn.addEventListener("click", endTutorial);
    if (nextBtn) nextBtn.addEventListener("click", nextTutorialStep);
    if (prevBtn) prevBtn.addEventListener("click", prevTutorialStep);
    if (backdrop) backdrop.addEventListener("click", endTutorial);
}

export function startTutorial() {
    currentTutorialStep = -1;
    const overlay = document.getElementById("tutorialOverlay");
    if (overlay) overlay.classList.remove("hidden");
    
    const tabSellHelper = document.getElementById("tabSellHelper");
    const tabTaxStatement = document.getElementById("tabTaxStatement");

    if (tabSellHelper && tabSellHelper.classList.contains("active")) {
        activeTutorialSteps = tutorialStepsSell;
    } else if (tabTaxStatement && tabTaxStatement.classList.contains("active")) {
        activeTutorialSteps = tutorialStepsTax;
    } else {
        activeTutorialSteps = tutorialStepsA3;
    }
    
    nextTutorialStep();
}

export function endTutorial() {
    const overlay = document.getElementById("tutorialOverlay");
    if (overlay) overlay.classList.add("hidden");
    // Remove any existing spotlight
    document.querySelectorAll(".tutorial-spotlight").forEach(el => el.remove());
    currentTutorialStep = -1;
}

export function nextTutorialStep() {
    currentTutorialStep++;
    if (currentTutorialStep >= activeTutorialSteps.length) { endTutorial(); return; }
    showTutorialStep(currentTutorialStep);
}

export function prevTutorialStep() {
    if (currentTutorialStep <= 0) return;
    currentTutorialStep--;
    showTutorialStep(currentTutorialStep);
}

export function showTutorialStep(index) {
    const step = activeTutorialSteps[index];
    const target = document.querySelector(step.selector);

    const stepCounter = document.getElementById("tutorialStepCounter");
    const title = document.getElementById("tutorialTitle");
    const desc = document.getElementById("tutorialDesc");
    const prevBtn = document.getElementById("tutorialPrevBtn");
    const nextBtn = document.getElementById("tutorialNextBtn");
    const backdrop = document.getElementById("tutorialBackdrop");

    if (stepCounter) stepCounter.textContent = `Step ${index + 1} of ${activeTutorialSteps.length}`;
    if (title) title.textContent = step.title;
    if (desc) desc.textContent = step.desc;
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.textContent = index === activeTutorialSteps.length - 1 ? "Finish ✓" : "Next →";

    // Remove old spotlight and dimmed class
    document.querySelectorAll(".tutorial-spotlight").forEach(el => el.remove());
    if (backdrop) backdrop.classList.remove("dimmed");

    const tooltip = document.getElementById("tutorialTooltip");
    if (tooltip) tooltip.style.transform = "none"; // clear any previous centering transform

    if (target && tooltip) {
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
            const overlay = document.getElementById("tutorialOverlay");
            if (overlay) overlay.appendChild(spotlight);

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
    } else if (tooltip && backdrop) {
        // Element not visible — center tooltip
        backdrop.classList.add("dimmed");
        tooltip.style.top = "50%";
        tooltip.style.left = "50%";
        tooltip.style.transform = "translate(-50%, -50%)";
    }
}

/**
 * Show a tutorial step by its title. Search across all sets of tutorial steps
 * (tutorialStepsA3, tutorialStepsSell, tutorialStepsTax) and custom inline steps.
 * 
 * @param {string} title The title of the tutorial step to display
 */
export function showTutorialStepByTitle(title) {
    const lowerTitle = title.toLowerCase();

    const searchSets = [
        { steps: tutorialStepsA3, name: "A3" },
        { steps: tutorialStepsSell, name: "Sell" },
        { steps: tutorialStepsTax, name: "Tax" }
    ];

    let foundStep = null;
    let foundIndex = -1;
    let foundStepsList = null;

    // 1. Exact match in standard steps
    for (const set of searchSets) {
        const idx = set.steps.findIndex(step => step.title.toLowerCase() === lowerTitle);
        if (idx !== -1) {
            foundStep = set.steps[idx];
            foundIndex = idx;
            foundStepsList = set.steps;
            break;
        }
    }

    // 2. Partial/fuzzy match in standard steps (e.g. "Add Stock" -> "Add Stock / ETF")
    if (!foundStep) {
        for (const set of searchSets) {
            const idx = set.steps.findIndex(step => step.title.toLowerCase().includes(lowerTitle) || lowerTitle.includes(step.title.toLowerCase()));
            if (idx !== -1) {
                foundStep = set.steps[idx];
                foundIndex = idx;
                foundStepsList = set.steps;
                break;
            }
        }
    }

    // 3. Fallback to custom/dynamic steps called by index.html buttons
    if (!foundStep) {
        const customSteps = {
            "user & year selection": { selector: "#userSelectionScreen", title: "User & Year Selection", desc: "Select your profile to continue, or create a new user. You can also select the Calendar Year to work on." },
            "portfolio summary": { selector: "#portfolioDashboard", title: "Portfolio Summary", desc: "View summary metrics of your portfolio, including total assets, unrealized gains/losses, dividend earnings, and tax impact." },
            "sbi tt rate modes": { selector: ".sbi-mode-selector", title: "SBI TT Rate Modes", desc: "Choose how foreign currency is converted to INR. Split Mode uses Rule 115 (preceding month-end) for tax and SBI TTBR (event date) for Section A3. Uniform Mode uses Rule 115 for everything. Check the Docs button for official regulatory PDFs." },
            "fa report breakdown": { selector: "#validateA3Section", title: "FA Report Breakdown", desc: "Review the mathematical breakdown for each column of Schedule FA A3 to verify the final INR values." },
            "dividends": { selector: "#stockSummarySection", title: "Dividends Summary", desc: "Per-Stock Dividend Summary displaying total dividends earned in INR for the calendar year." },
            "tax summary": { selector: "#taxYearSection", title: "ITR Tax Summary", desc: "Consolidated Capital Gains and Dividend summary mapped to Indian tax years and advance-tax quarterly buckets." },
            "tax calculation audit": { selector: "#validateTaxSection", title: "Tax Calculation Audit", desc: "Review the detailed mathematical breakdown for Capital Gains and Dividends across tax years." },
            "asset chart": { selector: "#assetPieChartSection", title: "Asset Chart", desc: "A visual breakdown of your portfolio assets by stock (INR) at the end of the year." },
            "peak value audit": { selector: "#validatePeakSection", title: "Peak Value Audit", desc: "Verify how peak dates and INR values were determined. Shows the winning peak day and runner-up candidates with full Stock Price × Qty × SBI TT Rate breakdowns." },
            "sbi rates used": { selector: "#sbiRatesSection", title: "SBI Rates Used", desc: "Review the specific SBI TT Buying rates applied to each calculation step." },
            "sell simulator": { selector: "#shResultsSection", title: "Sell Simulator", desc: "Use the Sell Simulator to add hypothetical sells and simulate tax impact without affecting your real portfolio." },
            "resolution / density scale": { selector: "#densityBtn", title: "Resolution / Density Scale", desc: "Adjust the user interface scaling and grid density to fit compact laptop displays or high-resolution 4K screens dynamically." },
            "allocate sells": { selector: "#shAllocBtn", title: "Allocate Sells", desc: "Automatically match and allocate simulated sells against your eligible acquisition lots using tax-optimized strategies (MinTax, MaxLoss, FIFO, LIFO)." }
        };

        const customStep = customSteps[lowerTitle];
        if (customStep) {
            foundStep = customStep;
            foundIndex = 0;
            foundStepsList = [customStep];
        }
    }

    if (!foundStep) {
        console.warn(`Tutorial step with title "${title}" not found.`);
        return;
    }

    // Unhide/Expand parents if they are collapsed/hidden
    const target = document.querySelector(foundStep.selector);
    if (target) {
        let parent = target;
        while (parent && parent !== document.body) {
            if (parent.classList.contains("hidden")) {
                parent.classList.remove("hidden");
            }
            if (parent.classList.contains("collapsible-content") && !parent.classList.contains("active")) {
                parent.classList.add("active");
                parent.style.maxHeight = parent.scrollHeight + "px";
            }
            parent = parent.parentElement;
        }
    }

    activeTutorialSteps = foundStepsList;
    currentTutorialStep = foundIndex;

    // Make sure overlay is visible
    const overlay = document.getElementById("tutorialOverlay");
    if (overlay) overlay.classList.remove("hidden");

    showTutorialStep(currentTutorialStep);
}

if (typeof window !== "undefined") {
    window.showTutorialStepByTitle = showTutorialStepByTitle;
}

