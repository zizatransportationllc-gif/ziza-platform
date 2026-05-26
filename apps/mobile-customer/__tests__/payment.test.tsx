/**
 * Sprint 27 — Payment tests (2 tests)
 *
 * Covers: payment intent creation returning a checkout_url
 * (the URL loaded in the WebView), and graceful failure on a 400 response.
 */
import { createPaymentIntent } from "../src/api";

const TOKEN = "test_bearer_token";
const TRIP_ID = "trip_abc";

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("createPaymentIntent() returns checkout_url used to open the payment WebView", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      payment_id: "pay_001",
      trip_id: TRIP_ID,
      amount_xof: 1500,
      provider_ref: "cinetpay_ref_xyz",
      checkout_url: "https://pay.ziza.ci/checkout/trip_abc",
      status: "pending",
    }),
  });

  const intent = await createPaymentIntent(TOKEN, TRIP_ID);

  expect(intent.checkout_url).toBe("https://pay.ziza.ci/checkout/trip_abc");
  expect(intent.provider_ref).toBe("cinetpay_ref_xyz");
  expect(intent.amount_xof).toBe(1500);
});

test("createPaymentIntent() throws an error when the API returns 400", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 400,
    json: async () => ({ detail: "Le trajet n'est pas encore terminé." }),
  });

  await expect(createPaymentIntent(TOKEN, TRIP_ID)).rejects.toThrow(
    "Le trajet n'est pas encore terminé."
  );
});
