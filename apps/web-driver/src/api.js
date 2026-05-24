/**
 * Local API client for web-customer.
 * Intentionally NOT shared across frontends - each app has its own copy.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function fetchDemo() {
  const res = await fetch(`${API_BASE_URL}/v1/demo`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}
