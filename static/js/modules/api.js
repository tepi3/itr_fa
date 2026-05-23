/**
 * REST API wrapper calls for the backend
 */

export async function apiPost(url, data) {
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return resp.json();
}

export async function apiGet(url) {
    const resp = await fetch(url);
    return resp.json();
}
