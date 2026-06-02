/**
 * Utility functions for date parsing, formatting, unique IDs, and currency
 */

export function generateId() {
    return "id_" + Math.random().toString(36).substr(2, 9);
}

export function parseAppDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        if (parts.length === 3) {
            const [d, m, y] = parts;
            return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        }
    }
    // Fallback for YYYY-MM-DD
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    return null;
}

export function formatAppDate(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return "";
    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const y = dateObj.getFullYear();
    return `${d}/${m}/${y}`;
}

export function initDatePicker(element, options = {}) {
    if (!window.flatpickr) return;
    return flatpickr(element, {
        dateFormat: "d/m/Y",
        allowInput: true,
        ...options
    });
}

export function formatINR(value) {
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

/**
 * Calculates Extended Internal Rate of Return (XIRR)
 * @param {Array<{date: Date, amount: number}>} cashFlows
 * @returns {number|null} XIRR rate (as decimal, e.g. 0.123 for 12.3%) or null if invalid
 */
export function calculateXIRR(cashFlows) {
    if (cashFlows.length < 2) return null;
    
    // Sort cash flows by date ascending
    cashFlows = [...cashFlows].sort((a, b) => a.date - b.date);
    
    // Check if we have at least one negative and one positive cash flow
    let hasNegative = false;
    let hasPositive = false;
    for (const cf of cashFlows) {
        if (cf.amount < 0) hasNegative = true;
        if (cf.amount > 0) hasPositive = true;
    }
    if (!hasNegative || !hasPositive) return null;
    
    // Check for exact two-point cash flow (analytical solution is faster and exact)
    if (cashFlows.length === 2) {
        const outflow = Math.abs(cashFlows[0].amount);
        const inflow = cashFlows[1].amount;
        const buyD = cashFlows[0].date;
        const sellD = cashFlows[1].date;
        
        const days = Math.round((sellD - buyD) / 86400000);
        if (days <= 0) return 0;
        if (outflow > 0 && inflow > 0) {
            return Math.pow(inflow / outflow, 365 / days) - 1;
        }
        return null;
    }
    
    const d0 = cashFlows[0].date;
    
    // XIRR equation: f(r) = sum( C_i / (1 + r)^((d_i - d_0) / 365) )
    function f(r) {
        let sum = 0;
        for (const cf of cashFlows) {
            const t = (cf.date - d0) / (1000 * 60 * 60 * 24 * 365);
            sum += cf.amount / Math.pow(1 + r, t);
        }
        return sum;
    }
    
    // Derivative: f'(r) = sum( -t * C_i / (1 + r)^(t + 1) )
    function df(r) {
        let sum = 0;
        for (const cf of cashFlows) {
            const t = (cf.date - d0) / (1000 * 60 * 60 * 24 * 365);
            sum += -t * cf.amount / Math.pow(1 + r, t + 1);
        }
        return sum;
    }
    
    // Newton-Raphson method
    let r = 0.1; // initial guess: 10%
    const maxIterations = 100;
    const precision = 1e-6;
    
    for (let i = 0; i < maxIterations; i++) {
        const fr = f(r);
        const dfr = df(r);
        if (Math.abs(dfr) < 1e-12) break; // Avoid division by zero
        const nextR = r - fr / dfr;
        if (Math.abs(nextR - r) < precision) {
            // Validate bounds
            if (nextR > -0.999 && nextR < 100) {
                return nextR;
            }
        }
        r = nextR;
    }
    
    // Fallback to Bisection method if Newton-Raphson fails/diverges
    let low = -0.99;
    let high = 10.0;
    let fLow = f(low);
    let fHigh = f(high);
    
    if (fLow * fHigh > 0) {
        // Try wider bounds
        high = 100.0;
        fHigh = f(high);
        if (fLow * fHigh > 0) {
            return null; // Bisection cannot be initialized
        }
    }
    
    for (let i = 0; i < maxIterations; i++) {
        const mid = (low + high) / 2;
        const fMid = f(mid);
        if (Math.abs(fMid) < precision || (high - low) / 2 < precision) {
            return mid;
        }
        if (fMid * fLow < 0) {
            high = mid;
            fHigh = fMid;
        } else {
            low = mid;
            fLow = fMid;
        }
    }
    
    return (r > -0.999 && r < 100) ? r : null;
}
