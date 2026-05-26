/**
 * Sprint 28 — Location tests (3 tests)
 *
 * Covers: updateDriverLocation() PUT body format, response parsing,
 * and getDriverLocation() returning null on 404.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { updateDriverLocation, getDriverLocation } from "../src/api";

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("updateDriverLocation() sends a PUT request with lat/lng in the body", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      driver_id: "drv-001",
      lat: 14.6928,
      lng: -17.4467,
      updated_at: "2026-05-26T10:05:00Z",
    }),
  });

  await updateDriverLocation("drv_tok_abc", 14.6928, -17.4467);

  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, options] = mockFetch.mock.calls[0];
  expect(url).toContain("/v1/drivers/me/location");
  expect(options.method).toBe("PUT");
  const body = JSON.parse(options.body);
  expect(body.lat).toBe(14.6928);
  expect(body.lng).toBe(-17.4467);
});

test("updateDriverLocation() returns the location response with driver_id and timestamp", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      driver_id: "drv-001",
      lat: 14.6928,
      lng: -17.4467,
      updated_at: "2026-05-26T10:05:00Z",
    }),
  });

  const loc = await updateDriverLocation("drv_tok_abc", 14.6928, -17.4467);
  expect(loc.driver_id).toBe("drv-001");
  expect(loc.lat).toBe(14.6928);
  expect(loc.lng).toBe(-17.4467);
  expect(loc.updated_at).toBeTruthy();
});

test("getDriverLocation() returns null when driver has no stored location (404)", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 404,
    json: async () => ({ detail: "Location not found" }),
  });

  const loc = await getDriverLocation("drv_tok_abc");
  expect(loc).toBeNull();
});
