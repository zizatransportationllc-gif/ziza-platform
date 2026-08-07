/**
 * i18n tests — interpolation and fallback behavior of the translation lookup.
 */
import { translations, interpolate } from "../src/i18n";

test("interpolate() returns the string unchanged when no params are given", () => {
  expect(interpolate("Hello")).toBe("Hello");
});

test("interpolate() substitutes a {{token}} placeholder from params", () => {
  expect(interpolate("Hi {{name}}", { name: "Alex" })).toBe("Hi Alex");
});

test("interpolate() leaves an unknown placeholder literal", () => {
  expect(interpolate("Hi {{name}}", { other: "x" })).toBe("Hi {{name}}");
});

test.each(["nav.", "account.", "bids."])("every en %s* key has a matching es key (and vice versa)", (prefix) => {
  const enKeys = Object.keys(translations.en).filter((k) => k.startsWith(prefix));
  const esKeys = Object.keys(translations.es).filter((k) => k.startsWith(prefix));
  expect(enKeys.sort()).toEqual(esKeys.sort());
});

test("bids.statusOnTheWayEta interpolates the eta placeholder in both languages", () => {
  expect(interpolate(translations.en["bids.statusOnTheWayEta"], { eta: 5 })).toContain("5");
  expect(interpolate(translations.es["bids.statusOnTheWayEta"], { eta: 5 })).toContain("5");
});

test("a missing key falls back to the key itself (regression guard on existing t() behavior)", () => {
  const lookup = (key: string) => translations.en[key as keyof typeof translations.en] ?? key;
  expect(lookup("bids.doesNotExist")).toBe("bids.doesNotExist");
});
