/**
 * Sprint 27 — Booking tests (7 tests)
 *
 * Covers the full booking flow: estimate → category selection → promo code →
 * trip creation → cancel → status polling → status transitions.
 */
import {
  getEstimate,
  listCategories,
  applyPromo,
  createTrip,
  cancelTrip,
  getTripStatus,
} from "../src/api";

const TOKEN = "test_bearer_token";
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

test("getEstimate() returns price_xof and estimate_id from API", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      estimate_id: "est_001",
      price_xof: 1500,
      distance_km: 4.2,
      duration_min: 12,
      category_id: "economy",
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    }),
  });

  const result = await getEstimate(TOKEN, 5.32, -4.02, 5.36, -3.98);

  expect(result.estimate_id).toBe("est_001");
  expect(result.price_xof).toBe(1500);
  expect(result.distance_km).toBe(4.2);
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

test("listCategories() returns an array of vehicle categories", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => [
      {
        category_id: "economy",
        name: "Économie",
        description: "Berlines standard",
        base_fare_xof: 500,
        per_km_xof: 200,
      },
      {
        category_id: "comfort",
        name: "Confort",
        description: "Berlines premium",
        base_fare_xof: 800,
        per_km_xof: 300,
      },
    ],
  });

  const categories = await listCategories(TOKEN);

  expect(Array.isArray(categories)).toBe(true);
  expect(categories.length).toBe(2);
  expect(categories[0].name).toBe("Économie");
});

// ---------------------------------------------------------------------------
// Promo code
// ---------------------------------------------------------------------------

test("applyPromo() returns discounted price when code is valid", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      promo_code: "ZIZA10",
      discount_xof: 150,
      final_price_xof: 1350,
    }),
  });

  const promo = await applyPromo(TOKEN, "ZIZA10", "est_001");

  expect(promo.discount_xof).toBe(150);
  expect(promo.final_price_xof).toBe(1350);
});

// ---------------------------------------------------------------------------
// Trip creation
// ---------------------------------------------------------------------------

test("createTrip() returns trip_id with pending status", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      trip_id: "trip_abc",
      status: "pending",
      driver_id: null,
      origin_lat: 5.32,
      origin_lng: -4.02,
      dest_lat: 5.36,
      dest_lng: -3.98,
      price_xof: 1350,
      eta_minutes: null,
      created_at: new Date().toISOString(),
    }),
  });

  const trip = await createTrip(TOKEN, "est_001");

  expect(trip.trip_id).toBe("trip_abc");
  expect(trip.status).toBe("pending");
  expect(trip.driver_id).toBeNull();
});

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

test("cancelTrip() calls the correct PATCH endpoint", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ trip_id: "trip_abc", status: "cancelled" }),
  });

  await cancelTrip(TOKEN, "trip_abc");

  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining("/v1/trips/trip_abc/cancel"),
    expect.objectContaining({ method: "PATCH" })
  );
});

// ---------------------------------------------------------------------------
// Status polling
// ---------------------------------------------------------------------------

test("getTripStatus() returns trip with status field", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      trip_id: "trip_abc",
      status: "accepted",
      driver_id: "drv_001",
      origin_lat: 5.32,
      origin_lng: -4.02,
      dest_lat: 5.36,
      dest_lng: -3.98,
      price_xof: 1350,
      eta_minutes: 8,
      created_at: new Date().toISOString(),
    }),
  });

  const trip = await getTripStatus(TOKEN, "trip_abc");

  expect(trip.status).toBe("accepted");
  expect(trip).toHaveProperty("trip_id");
});

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

test("getTripStatus() reflects driver_id once trip is accepted", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      trip_id: "trip_abc",
      status: "accepted",
      driver_id: "drv_007",
      origin_lat: 5.32,
      origin_lng: -4.02,
      dest_lat: 5.36,
      dest_lng: -3.98,
      price_xof: 1350,
      eta_minutes: 5,
      created_at: new Date().toISOString(),
    }),
  });

  const trip = await getTripStatus(TOKEN, "trip_abc");

  expect(trip.driver_id).toBe("drv_007");
  expect(trip.eta_minutes).toBe(5);
});
