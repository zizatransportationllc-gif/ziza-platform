/**
 * Sprint 27 — Auth tests (3 tests)
 *
 * Covers: token storage on login, token retrieval on app launch,
 * and token removal on logout.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { login, storeToken, getStoredToken, clearToken } from "../src/api";

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("login() stores access token in AsyncStorage after successful response", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      access_token: "tok_abc123",
      refresh_token: "ref_abc123",
      token_type: "bearer",
      expires_in: 3600,
    }),
  });

  await login("customer@ziza.dev", "ziza2024");

  // login() calls storeTokenPair() which uses multiSet (Sprint 40)
  expect(AsyncStorage.multiSet).toHaveBeenCalledWith(
    expect.arrayContaining([["ziza_access_token", "tok_abc123"]])
  );
});

test("getStoredToken() returns null when no token has been stored", async () => {
  const token = await getStoredToken();
  expect(token).toBeNull();
});

test("clearToken() removes the stored token from AsyncStorage on logout", async () => {
  await storeToken("tok_xyz789");
  await clearToken();

  expect(AsyncStorage.removeItem).toHaveBeenCalledWith("ziza_access_token");
  const stored = await getStoredToken();
  expect(stored).toBeNull();
});
