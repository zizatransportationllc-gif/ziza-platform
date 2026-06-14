/**
 * Sprint 28 — Dispatch tests (5 tests)
 *
 * Covers: trip listing, trip acceptance, 409 conflict on concurrent accept,
 * trip card badge fields (category_id + price_cents), and proximity sorting
 * with calculateDistanceKm().
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  listAvailableTrips,
  acceptTrip,
  calculateDistanceKm,
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
    trip_id: "trip-001",
    status: "pending",
    customer_id: "cust-001",
    driver_id: null,
    origin_lat: 14.6928,
    origin_lng: -17.4467,
    dest_lat: 14.7028,
    dest_lng: -17.4367,
    price_cents: 2500,
    category_id: "comfort",
    eta_minutes: 5,
    created_at: "2026-05-26T10:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("listAvailableTrips() returns an array of pending trip offers", async () => {
  const trips = [
    makeTripResponse({ trip_id: "trip-001", price_cents: 2500 }),
    makeTripResponse({ trip_id: "trip-002", price_cents: 3000, category_id: "premium" }),
  ];

  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => trips,
  });

  const result = await listAvailableTrips("drv_tok_abc");
  expect(result).toHaveLength(2);
  expect(result[0].trip_id).toBe("trip-001");
  expect(result[1].category_id).toBe("premium");
});

test("acceptTrip() returns the trip with status 'accepted' and driver_id set", async () => {
  const accepted = makeTripResponse({
    trip_id: "trip-001",
    status: "accepted",
    driver_id: "drv-001",
  });

  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => accepted,
  });

  const result = await acceptTrip("drv_tok_abc", "trip-001");
  expect(result.status).toBe("accepted");
  expect(result.driver_id).toBe("drv-001");
});

test("acceptTrip() throws an error when the trip was already taken (HTTP 409)", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 409,
    json: async () => ({ detail: "Trip already accepted by another driver" }),
  });

  await expect(acceptTrip("drv_tok_abc", "trip-001")).rejects.toThrow(
    "Trip already accepted by another driver"
  );
});

test("trip dispatch card has category_id and price_cents fields for badge rendering", async () => {
  const trips = [
    makeTripResponse({ category_id: "economy", price_cents: 1500 }),
    makeTripResponse({ category_id: "comfort", price_cents: 2500 }),
    makeTripResponse({ category_id: "premium", price_cents: 4000 }),
  ];

  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => trips });

  const result = await listAvailableTrips("drv_tok_abc");
  expect(result[0].category_id).toBe("economy");
  expect(result[0].price_cents).toBe(1500);
  expect(result[2].category_id).toBe("premium");
  expect(result[2].price_cents).toBe(4000);
});

test("calculateDistanceKm() sorts trips by proximity to driver position", () => {
  // Driver at Dakar center
  const driverLat = 14.6928;
  const driverLng = -17.4467;

  // Two trip origins: one close (~1 km), one far (~10 km)
  const closeOrigin = { lat: 14.6985, lng: -17.4420 }; // ~0.8 km
  const farOrigin = { lat: 14.7800, lng: -17.3500 };   // ~12 km

  const distClose = calculateDistanceKm(driverLat, driverLng, closeOrigin.lat, closeOrigin.lng);
  const distFar = calculateDistanceKm(driverLat, driverLng, farOrigin.lat, farOrigin.lng);

  expect(distClose).toBeGreaterThan(0);
  expect(distFar).toBeGreaterThan(distClose);
  // Driver should prefer the closer trip
  expect(distClose).toBeLessThan(5);
  expect(distFar).toBeGreaterThan(5);
});
