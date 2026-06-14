/**
 * Sprint 28 — Trip lifecycle tests (4 tests)
 *
 * Covers: startTrip (accepted→in_progress), completeTrip (in_progress→completed),
 * sequential accept→start→complete state machine, and buildNavigationUrl() URL format.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  acceptTrip,
  startTrip,
  completeTrip,
  buildNavigationUrl,
  TripResponse,
} from "../src/api";

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTripResponse(overrides: Partial<TripResponse> = {}): TripResponse {
  return {
    trip_id: "trip-999",
    status: "pending",
    customer_id: "cust-001",
    driver_id: null,
    origin_lat: 14.6928,
    origin_lng: -17.4467,
    dest_lat: 14.7128,
    dest_lng: -17.4267,
    price_cents: 3500,
    category_id: "comfort",
    eta_minutes: 8,
    created_at: "2026-05-26T10:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("startTrip() transitions trip status from 'accepted' to 'in_progress'", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () =>
      makeTripResponse({ status: "in_progress", driver_id: "drv-001" }),
  });

  const result = await startTrip("drv_tok_abc", "trip-999");
  expect(result.status).toBe("in_progress");
  expect(result.driver_id).toBe("drv-001");
});

test("completeTrip() transitions trip status from 'in_progress' to 'completed'", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () =>
      makeTripResponse({ status: "completed", driver_id: "drv-001" }),
  });

  const result = await completeTrip("drv_tok_abc", "trip-999");
  expect(result.status).toBe("completed");
});

test("sequential accept→start→complete returns correct statuses at each step", async () => {
  // Step 1: accept
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () =>
      makeTripResponse({ status: "accepted", driver_id: "drv-001" }),
  });
  // Step 2: start
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () =>
      makeTripResponse({ status: "in_progress", driver_id: "drv-001" }),
  });
  // Step 3: complete
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () =>
      makeTripResponse({ status: "completed", driver_id: "drv-001" }),
  });

  const accepted = await acceptTrip("drv_tok_abc", "trip-999");
  expect(accepted.status).toBe("accepted");

  const started = await startTrip("drv_tok_abc", "trip-999");
  expect(started.status).toBe("in_progress");

  const completed = await completeTrip("drv_tok_abc", "trip-999");
  expect(completed.status).toBe("completed");

  // Verify the 3 PATCH calls were made in order
  expect(mockFetch).toHaveBeenCalledTimes(3);
  const [callAccept, callStart, callComplete] = mockFetch.mock.calls;
  expect(callAccept[0]).toContain("/accept");
  expect(callStart[0]).toContain("/start");
  expect(callComplete[0]).toContain("/complete");
});

test("buildNavigationUrl() generates a valid Google Maps deep-link for the destination", () => {
  const url = buildNavigationUrl(14.7128, -17.4267);

  expect(url).toContain("google.com/maps");
  expect(url).toContain("14.7128");
  expect(url).toContain("-17.4267");
  expect(url).toContain("travelmode=driving");
  // Must be a valid URL
  expect(() => new URL(url)).not.toThrow();
});
