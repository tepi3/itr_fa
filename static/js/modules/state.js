import { showToast, showConfirm } from './ui-utils.js';

/**
 * Single source of truth for the application state.
 * Emits custom DOM events on state change to decouple state modifications from UI rendering.
 */

export const state = {
    username: null,
    portfolio: {
        calendar_year: new Date().getFullYear() - 1,
        stocks: [],
        overrides: {},
        sbi_rate_overrides: {},
    },
    calculatedRows: [],
    sbiRatesUsed: [],
    taxYears: null,
    isDirty: false, // Track unsaved changes
};

const undoStack = [];
const redoStack = [];
const MAX_UNDO = 50;

export function getUndoStack() {
    return undoStack;
}

export function getRedoStack() {
    return redoStack;
}

export function dispatchStateChange(type, detail = {}) {
    const event = new CustomEvent("portfolio-state-change", {
        detail: { type, ...detail }
    });
    window.dispatchEvent(event);
}

export function pushUndoSnapshot(label = "Action") {
    undoStack.push({
        portfolio: JSON.parse(JSON.stringify(state.portfolio)),
        label: label,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0; // clear redo on new action
    
    markDirty();
    dispatchStateChange("history-change");
}

export function undo() {
    if (undoStack.length === 0) return;
    redoStack.push({
        portfolio: JSON.parse(JSON.stringify(state.portfolio)),
        label: "Redo state",
        timestamp: new Date().toLocaleTimeString()
    });
    const snapshot = undoStack.pop();
    state.portfolio = snapshot.portfolio;
    
    dispatchStateChange("portfolio-restored");
    dispatchStateChange("history-change");
    showToast(`Undo: ${snapshot.label}`, "info", 1500);
}

export function redo() {
    if (redoStack.length === 0) return;
    undoStack.push({
        portfolio: JSON.parse(JSON.stringify(state.portfolio)),
        label: "Undo state",
        timestamp: new Date().toLocaleTimeString()
    });
    const snapshot = redoStack.pop();
    state.portfolio = snapshot.portfolio;
    
    dispatchStateChange("portfolio-restored");
    dispatchStateChange("history-change");
    showToast("Redo successful", "info", 1500);
}

export async function revertToHistoryItem(index) {
    if (index < 0 || index >= undoStack.length) return;

    const snapshot = undoStack[index];
    const confirmed = await showConfirm(`Revert to state before "${snapshot.label}"?`, "Confirm Reversion");
    if (!confirmed) return;

    // Save current state to redo stack
    redoStack.push({
        portfolio: JSON.parse(JSON.stringify(state.portfolio)),
        label: "Manual Revert",
        timestamp: new Date().toLocaleTimeString()
    });

    // Any items in undoStack *after* the target index should also go to redoStack
    while (undoStack.length > index + 1) {
        redoStack.push(undoStack.pop());
    }

    // The item at index is the one we want to restore
    const targetSnapshot = undoStack.pop();
    state.portfolio = targetSnapshot.portfolio;

    dispatchStateChange("portfolio-restored");
    dispatchStateChange("history-change");
    showToast(`Reverted to: ${targetSnapshot.label}`, "success");
}


export function markDirty() {
    state.isDirty = true;
    dispatchStateChange("dirty-change", { isDirty: true });
}

export function markClean() {
    state.isDirty = false;
    dispatchStateChange("dirty-change", { isDirty: false });
}

export function clearCalculatedSections() {
    state.calculatedRows = [];
    state.sbiRatesUsed = [];
    // Dispatch event to let other components clear their calculated sections
    dispatchStateChange("clear-calculated");
}
