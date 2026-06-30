/**
 * Mapbox geo helpers for web-craft.
 * Road-route geometry via the public VITE_MAPBOX_TOKEN, used by the in-app
 * navigation view (professional → customer). NOT shared across frontends.
 */
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Fetch the road-following route between two points via the Mapbox Directions
 * API. Returns { coords: [lng,lat][], distanceM, durationS } or null on error
 * (caller falls back to a straight line).
 */
export async function fetchRoute(originLng, originLat, destLng, destLat) {
  if (!TOKEN || originLng == null || destLng == null) return null;
  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${originLng},${originLat};${destLng},${destLat}` +
      `?geometries=geojson&overview=full&steps=false&access_token=${TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates) return null;
    return {
      coords: route.geometry.coordinates,
      distanceM: route.distance ?? null,
      durationS: route.duration ?? null,
    };
  } catch {
    return null;
  }
}
