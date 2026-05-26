/**
 * Sprint 27 — Tracking tests (4 tests)
 *
 * Covers: driver position fetching (used when trip is accepted),
 * repeated polling simulating the 5 s interval, coordinate updates,
 * and ETA availability via getTripStatus.
 */
import { getDriverPosition, getTripStatus } from "../src/api";

const TOKEN = "test_bearer_token";
const DRIVER_ID = "drv_007";

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("getDriverPosition() returns lat/lng coordinates — used when trip is accepted", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      driver_id: DRIVER_ID,
      lat: 5.335,
      lng: -4.018,
      updated_at: new Date().toISOString(),
    }),
  });

  const position = await getDriverPosition(TOKEN, DRIVER_ID);

  expect(position).not.toBeNull();
  expect(position!.lat).toBe(5.335);
  expect(position!.lng).toBe(-4.018);
  expect(position!.driver_id).toBe(DRIVER_ID);
});

test("repeated calls to getDriverPosition() simulate the polling interval updating coordinates", async () => {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        driver_id: DRIVER_ID,
        lat: 5.330,
        lng: -4.020,
        updated_at: new Date().toISOString(),
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        driver_id: DRIVER_ID,
        lat: 5.332,
        lng: -4.019,
        updated_at: new Date().toISOString(),
      }),
    });

  const pos1 = await getDriverPosition(TOKEN, DRIVER_ID);
  const pos2 = await getDriverPosition(TOKEN, DRIVER_ID);

  // Coordinates updated between polls
  expect(pos1!.lat).not.toBe(pos2!.lat);
  expect(pos2!.lat).toBeGreaterThan(pos1!.lat);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test("getDriverPosition() returns null when driver is offline (404)", async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

  const position = await getDriverPosition(TOKEN, DRIVER_ID);

  expect(position).toBeNull();
});

test("getTripStatus() exposes eta_minutes once trip is in_progress", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      trip_id: "trip_abc",
      status: "in_progress",
      driver_id: DRIVER_ID,
      origin_lat: 5.32,
      origin_lng: -4.02,
      dest_lat: 5.36,
      dest_lng: -3.98,
      price_xof: 1500,
      eta_minutes: 4,
      created_at: new Date().toISOString(),
    }),
  });

  const trip = await getTripStatus(TOKEN, "trip_abc");

  expect(trip.status).toBe("in_progress");
  expect(trip.eta_minutes).toBe(4);
  expect(trip.driver_id).toBe(DRIVER_ID);
});
