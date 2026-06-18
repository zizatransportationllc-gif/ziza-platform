/**
 * Mapbox geo helpers for web-driver.
 * Reverse-geocoding (coords → readable address) and road-route geometry,
 * both via the public VITE_MAPBOX_TOKEN. NOT shared across frontends.
 */
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/** Reverse-geocode coordinates to a human-readable address. Returns null on error. */
export async function reverseGeocode(lng, lat) {
  if (!TOKEN || lng == null || lat == null) return null;
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
      `?access_token=${TOKEN}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.features?.[0]?.place_name ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the road-following geometry between two points via the Mapbox
 * Directions API. Returns a [lng,lat][] coordinates array, or null on error
 * (caller falls back to a straight line).
 */
export async function fetchRouteCoords(originLng, originLat, destLng, destLat) {
  if (!TOKEN || originLng == null || destLng == null) return null;
  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${originLng},${originLat};${destLng},${destLat}` +
      `?geometries=geojson&overview=full&steps=false&access_token=${TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.routes?.[0]?.geometry?.coordinates ?? null;
  } catch {
    return null;
  }
}
