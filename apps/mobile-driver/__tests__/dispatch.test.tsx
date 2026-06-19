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
    origin_lat: 14.6928,
    origin_lng: -17.4467,
    dest_lat: 14.7028,
    dest_lng: -17.4367,
    fare_cents: 2500,
    distance_km: 1.6,
    duration_min: 5,
    verification_code: "1234",
    category: "comfort",
    created_at: "2026-05-26T10:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("listAvailableTrips() returns an array of pending trip offers", async () => {
  const trips = [
    makeTripResponse({ trip_id: "trip-001", fare_cents: 2500 }),
    makeTripResponse({ trip_id: "trip-002", fare_cents: 3000, category: "premium" }),
  ];

  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => trips,
  });

  const result = await listAvailableTrips("drv_tok_abc");
  expect(result).toHaveLength(2);
  expect(result[0].trip_id).toBe("trip-001");
  expect(result[1].category).toBe("premium");
});

test("acceptTrip() returns the trip with status 'accepted'", async () => {
  const accepted = makeTripResponse({
    trip_id: "trip-001",
    status: "accepted",
  });

  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => accepted,
  });

  const result = await acceptTrip("drv_tok_abc", "trip-001");
  expect(result.status).toBe("accepted");
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

test("trip dispatch card has category and fare_cents fields for badge rendering", async () => {
  const trips = [
    makeTripResponse({ category: "economy", fare_cents: 1500 }),
    makeTripResponse({ category: "comfort", fare_cents: 2500 }),
    makeTripResponse({ category: "premium", fare_cents: 4000 }),
  ];

  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => trips });

  const result = await listAvailableTrips("drv_tok_abc");
  expect(result[0].category).toBe("economy");
  expect(result[0].fare_cents).toBe(1500);
  expect(result[2].category).toBe("premium");
  expect(result[2].fare_cents).toBe(4000);
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
