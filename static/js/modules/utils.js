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
