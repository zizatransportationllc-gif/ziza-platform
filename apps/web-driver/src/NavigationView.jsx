/**
 * NavigationView.jsx — in-app "follow" navigation for the driver.
 *
 * Shown once a trip is accepted: tracks the driver's live GPS, draws the
 * road-following route to the current target (pickup while accepted,
 * destination while in progress), keeps the map centred on the driver, and
 * shows the remaining distance + ETA. No third-party app, no voice guidance.
 *
 * NOT shared across frontends (isolation rule).
 */
import { useEffect, useRef, useState } from "react";
import Map, { Marker, Source, Layer, NavigationControl } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fetchRoute } from "./geo";

const TOKEN     = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";
const METERS_PER_MILE = 1609.344;

function lineFeature(coords) {
  return { type: "Feature", geometry: { type: "LineString", coordinates: coords } };
}

// Rough metres between two coords — used to decide when to refetch the route.
function metersBetween(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Props:
 *   target: { lat, lng }    where the driver is heading (required)
 *   label:  string          "Pickup" | "Destination"
 */
export default function NavigationView({ target, label }) {
  const mapRef = useRef(null);
  const [driver, setDriver] = useState(null);     // { lat, lng }
  const [route, setRoute] = useState(null);        // { coords, distanceM, durationS }
  const lastFetchPos = useRef(null);

  const hasTarget = target?.lat != null && target?.lng != null;

  // Watch the driver's live position (for following + the route origin).
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setDriver({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Keep the map centred on the driver (follow mode).
  useEffect(() => {
    if (driver && mapRef.current) {
      mapRef.current.easeTo({ center: [driver.lng, driver.lat], duration: 800 });
    }
  }, [driver?.lat, driver?.lng]);

  // (Re)fetch the route to the target when the driver first appears, the target
  // changes, or the driver has moved more than ~40 m since the last fetch.
  useEffect(() => {
    if (!driver || !hasTarget) return;
    const moved = metersBetween(lastFetchPos.current, driver);
    if (route && moved < 40) return;
    lastFetchPos.current = driver;
    let active = true;
    fetchRoute(driver.lng, driver.lat, target.lng, target.lat).then((r) => {
      if (active && r) setRoute(r);
    });
    return () => { active = false; };
  }, [driver?.lat, driver?.lng, target?.lat, target?.lng]);

  if (!hasTarget) return null;

  const routeLine = route?.coords ?? (driver ? [[driver.lng, driver.lat], [target.lng, target.lat]] : null);
  const miles = route?.distanceM != null ? route.distanceM / METERS_PER_MILE : null;
  const etaMin = route?.durationS != null ? Math.max(1, Math.round(route.durationS / 60)) : null;

  return (
    <div className="nav-view">
      <div className="nav-banner">
        <span className="nav-banner-label">🧭 To {label}</span>
        <span className="nav-banner-eta">
          {miles != null ? `${miles.toFixed(1)} mi` : "…"}
          {etaMin != null ? ` · ~${etaMin} min` : ""}
        </span>
      </div>
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: (driver?.lng ?? target.lng),
          latitude: (driver?.lat ?? target.lat),
          zoom: 14,
        }}
        style={{ width: "100%", height: "300px", borderRadius: "10px" }}
        mapStyle={MAP_STYLE}
        mapboxAccessToken={TOKEN}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />

        {routeLine && (
          <Source id="nav-route" type="geojson" data={lineFeature(routeLine)}>
            <Layer
              id="nav-route-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "#1D4ED8",
                "line-width": 5,
                "line-opacity": 0.85,
                ...(route ? {} : { "line-dasharray": [2, 1.5] }),
              }}
            />
          </Source>
        )}

        {driver && (
          <Marker longitude={driver.lng} latitude={driver.lat} anchor="center">
            <span title="You" style={{ fontSize: "26px" }}>🚗</span>
          </Marker>
        )}

        <Marker longitude={target.lng} latitude={target.lat} anchor="bottom">
          <span title={label} style={{ fontSize: "26px" }}>
            {label === "Destination" ? "🏁" : "📍"}
          </span>
        </Marker>
      </Map>
      {!driver && <p className="nav-hint">📍 Waiting for your GPS position…</p>}
    </div>
  );
}
