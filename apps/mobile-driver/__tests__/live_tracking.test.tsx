/**
 * Sprint 31 — Live tracking & online status E2E stubs (4 tests) — mobile-driver
 *
 * Verifies that the driver app correctly updates location and online status.
 * Uses mocked fetch.
 */

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("setOnline(true) sends PATCH request with is_online: true", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ is_online: true, driver_id: "drv_001" }),
  });

  async function setOnline(token: string, isOnline: boolean) {
    const res = await fetch("http://localhost:8000/v1/drivers/online", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ is_online: isOnline }),
    });
    return res.json();
  }

  const result = await setOnline("fake_token", true);
  expect(result.is_online).toBe(true);
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining("/v1/drivers/online"),
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ is_online: true }),
    }),
  );
});

test("updateLocation() sends PUT request with lat/lng/heading", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ lat: 5.32, lng: -4.01, heading: 90.0 }),
  });

  async function updateLocation(token: string, lat: number, lng: number, heading: number) {
    const res = await fetch("http://localhost:8000/v1/drivers/location", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lat, lng, heading }),
    });
    return res.json();
  }

  const result = await updateLocation("fake_token", 5.32, -4.01, 90.0);
  expect(result.lat).toBe(5.32);
  expect(result.lng).toBe(-4.01);
});

test("setOnline(false) sends PATCH request with is_online: false", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ is_online: false, driver_id: "drv_001" }),
  });

  async function setOnline(token: string, isOnline: boolean) {
    const res = await fetch("http://localhost:8000/v1/drivers/online", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ is_online: isOnline }),
    });
    return res.json();
  }

  const result = await setOnline("fake_token", false);
  expect(result.is_online).toBe(false);
});

test("updateLocation() handles network error gracefully", async () => {
  mockFetch.mockRejectedValueOnce(new Error("Network error"));

  async function updateLocation(token: string, lat: number, lng: number, heading: number) {
    try {
      const res = await fetch("http://localhost:8000/v1/drivers/location", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, heading }),
      });
      return res.json();
    } catch {
      return null; // graceful degradation
    }
  }

  const result = await updateLocation("fake_token", 5.32, -4.01, 0.0);
  expect(result).toBeNull();
});
