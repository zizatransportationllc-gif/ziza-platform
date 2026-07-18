/**
 * TripMap.jsx — Mapbox map components for web-customer
 * Sprint 44 — real road routing via Mapbox Directions API
 *
 * EstimateMap : shows origin + destination + road-following route polyline
 *               (displayed in the fare card, before booking)
 *
 * TripMap     : shows live driver position + road-following route
 *               (displayed in BookingSection while trip is active)
 */
import { useEffect, useRef, useState } from "react";
import Map, { Marker, Source, Layer, NavigationControl } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";

// Shared pin styles
const PIN = { fontSize: "22px", lineHeight: 1, cursor: "default" };
const DRIVER_DOT = {
  background: "#6366f1",
  borderRadius: "50%",
  width: "34px",
  height: "34px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "18px",
  boxShadow: "0 2px 10px rgba(0,0,0,.35)",
  border: "2px solid #fff",
};

// ---------------------------------------------------------------------------
// Helper — fetch road-following geometry from Mapbox Directions API
// Falls back to null on error (caller will use a straight-line fallback).
// ---------------------------------------------------------------------------

async function fetchRouteCoords(originLng, originLat, destLng, destLat) {
  if (!TOKEN) return null;
  try {
    const url = [
      "https://api.mapbox.com/directions/v5/mapbox/driving/",
      `${originLng},${originLat};${destLng},${destLat}`,
      `?geometries=geojson&overview=full&steps=false&access_token=${TOKEN}`,
    ].join("");
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.routes?.[0]?.geometry?.coordinates ?? null;
  } catch {
    return null;
  }
}

// Build a GeoJSON Feature from a coordinates array (or 2-point fallback).
function routeFeature(coords) {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
  };
}

// ─── EstimateMap ─────────────────────────────────────────────────────────────

/**
 * Props:
 *   originLat, originLng  – pickup coords
 *   destLat,   destLng    – drop-off coords
 */
export function EstimateMap({ originLat, originLng, destLat, destLng }) {
  const [routeCoords, setRouteCoords] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

  useEffect(() => {
    if (!originLat || !destLat) return;
    setRouteLoading(true);
    fetchRouteCoords(originLng, originLat, destLng, destLat)
      .then((coords) => setRouteCoords(coords))
      .finally(() => setRouteLoading(false));
  }, [originLat, originLng, destLat, destLng]);

  if (!originLat || !destLat) return null;

  const midLat = (originLat + destLat) / 2;
  const midLng = (originLng + destLng) / 2;

  const latSpan = Math.abs(destLat - originLat);
  const lngSpan = Math.abs(destLng - originLng);
  const span = Math.max(latSpan, lngSpan);
  const zoom = span < 0.05 ? 13 : span < 0.2 ? 11 : span < 0.8 ? 9 : 8;

  // Use road-following route if available, else straight line (while loading or on error)
  const coords = routeCoords ?? [[originLng, originLat], [destLng, destLat]];
  const isDashed = !routeCoords; // dashed = still loading / fallback

  return (
    <div className="trip-map-wrap">
      <Map
        initialViewState={{ longitude: midLng, latitude: midLat, zoom }}
        style={{ width: "100%", height: "200px" }}
        mapStyle={MAP_STYLE}
        mapboxAccessToken={TOKEN}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />

        {/* Route polyline */}
        <Source id="est-route" type="geojson" data={routeFeature(coords)}>
          <Layer
            id="est-route-casing"
            type="line"
            paint={{
              "line-color": "#fff",
              "line-width": 7,
              "line-opacity": 0.6,
            }}
          />
          <Layer
            id="est-route-line"
            type="line"
            paint={{
              "line-color": "#6366f1",
              "line-width": 4,
              ...(isDashed ? { "line-dasharray": [2, 1.5] } : {}),
              "line-opacity": 0.9,
            }}
          />
        </Source>

        {/* Pickup pin */}
        <Marker longitude={originLng} latitude={originLat} anchor="bottom">
          <span style={PIN} title="Pickup">📍</span>
        </Marker>

        {/* Drop-off pin */}
        <Marker longitude={destLng} latitude={destLat} anchor="bottom">
          <span style={PIN} title="Drop-off">🏁</span>
        </Marker>
      </Map>
      {routeLoading && (
        <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "#6b7280", textAlign: "center" }}>
          Loading route…
        </p>
      )}
    </div>
  );
}

// ─── TripMap ──────────────────────────────────────────────────────────────────

/**
 * Props:
 *   trip           – trip object (origin_lat/lng, dest_lat/lng, status)
 *   driverLocation – { driver_lat, driver_lng } | null  (from getTripTracking)
 */
export function TripMap({ trip, driverLocation }) {
  const mapRef = useRef(null);
  const [routeCoords, setRouteCoords] = useState(null);

  const hasOrigin = trip.origin_lat != null;
  const hasDest   = trip.dest_lat   != null;
  const hasDrv    = driverLocation?.driver_lat != null;

  // Fetch road-following route once (origin → destination)
  useEffect(() => {
    if (!hasOrigin || !hasDest) return;
    fetchRouteCoords(
      trip.origin_lng, trip.origin_lat,
      trip.dest_lng,   trip.dest_lat,
    ).then((coords) => setRouteCoords(coords));
  }, [trip.origin_lat, trip.origin_lng, trip.dest_lat, trip.dest_lng]);

  // Smoothly pan to driver when position updates
  useEffect(() => {
    if (!hasDrv || !mapRef.current) return;
    mapRef.current.easeTo({
      center: [driverLocation.driver_lng, driverLocation.driver_lat],
      duration: 800,
    });
  }, [driverLocation?.driver_lat, driverLocation?.driver_lng]);

  if (!hasOrigin) return null;

  const initLat = hasDrv ? driverLocation.driver_lat : trip.origin_lat;
  const initLng = hasDrv ? driverLocation.driver_lng : trip.origin_lng;

  const isActive = ["accepted", "in_progress"].includes(trip.status);
  const lineColor = isActive ? "#22c55e" : "#6366f1";

  // Road route if fetched, else straight line fallback
  const coords = routeCoords ?? [
    [trip.origin_lng, trip.origin_lat],
    ...(hasDest ? [[trip.dest_lng, trip.dest_lat]] : []),
  ];

  return (
    <div className="trip-map-wrap">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: initLng, latitude: initLat, zoom: 12 }}
        style={{ width: "100%", height: "260px" }}
        mapStyle={MAP_STYLE}
        mapboxAccessToken={TOKEN}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />

        {/* Road-following route line */}
        {coords.length >= 2 && (
          <Source id="trip-route" type="geojson" data={routeFeature(coords)}>
            <Layer
              id="trip-route-casing"
              type="line"
              paint={{ "line-color": "#fff", "line-width": 7, "line-opacity": 0.5 }}
            />
            <Layer
              id="trip-route-line"
              type="line"
              paint={{
                "line-color": lineColor,
                "line-width": 4,
                "line-opacity": 0.9,
              }}
            />
          </Source>
        )}

        {/* Pickup */}
        <Marker longitude={trip.origin_lng} latitude={trip.origin_lat} anchor="bottom">
          <span style={PIN} title="Pickup">📍</span>
        </Marker>

        {/* Drop-off */}
        {hasDest && (
          <Marker longitude={trip.dest_lng} latitude={trip.dest_lat} anchor="bottom">
            <span style={PIN} title="Drop-off">🏁</span>
          </Marker>
        )}

        {/* Live driver position */}
        {hasDrv && (
          <Marker
            longitude={driverLocation.driver_lng}
            latitude={driverLocation.driver_lat}
            anchor="center"
          >
            <div style={DRIVER_DOT} title="Driver">🚗</div>
          </Marker>
        )}
      </Map>
    </div>
  );
}

// ─── CraftTrackingMap ─────────────────────────────────────────────────────────

/**
 * Live map for an assistance job: the customer (fixed) + the assigned pro
 * moving toward them, with a road-following route between the two.
 *
 * Props:
 *   customerLat, customerLng – the request location (where help is needed)
 *   proLat, proLng           – the pro's live position | null (from tracking)
 */
export function CraftTrackingMap({ customerLat, customerLng, proLat, proLng }) {
  const mapRef = useRef(null);
  const [routeCoords, setRouteCoords] = useState(null);
  const hasPro = proLat != null && proLng != null;

  // (Re)fetch the road route pro → customer as the pro moves.
  useEffect(() => {
    if (!hasPro || customerLat == null) return;
    fetchRouteCoords(proLng, proLat, customerLng, customerLat)
      .then((coords) => setRouteCoords(coords));
  }, [proLat, proLng, customerLat, customerLng]);

  // Follow the pro.
  useEffect(() => {
    if (!hasPro || !mapRef.current) return;
    mapRef.current.easeTo({ center: [proLng, proLat], duration: 800 });
  }, [proLat, proLng]);

  if (customerLat == null) return null;

  const initLat = hasPro ? proLat : customerLat;
  const initLng = hasPro ? proLng : customerLng;
  const coords = routeCoords ?? (hasPro ? [[proLng, proLat], [customerLng, customerLat]] : null);
  const isDashed = !routeCoords;

  return (
    <div className="trip-map-wrap">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: initLng, latitude: initLat, zoom: 13 }}
        style={{ width: "100%", height: "260px" }}
        mapStyle={MAP_STYLE}
        mapboxAccessToken={TOKEN}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />

        {coords && coords.length >= 2 && (
          <Source id="craft-route" type="geojson" data={routeFeature(coords)}>
            <Layer
              id="craft-route-casing"
              type="line"
              paint={{ "line-color": "#fff", "line-width": 7, "line-opacity": 0.5 }}
            />
            <Layer
              id="craft-route-line"
              type="line"
              paint={{
                "line-color": "#1d4ed8",
                "line-width": 4,
                "line-opacity": 0.9,
                ...(isDashed ? { "line-dasharray": [2, 1.5] } : {}),
              }}
            />
          </Source>
        )}

        {/* Customer location (where help is needed) */}
        <Marker longitude={customerLng} latitude={customerLat} anchor="bottom">
          <span style={PIN} title="You">📍</span>
        </Marker>

        {/* Live pro position */}
        {hasPro && (
          <Marker longitude={proLng} latitude={proLat} anchor="center">
            <div style={DRIVER_DOT} title="Professional">🛠️</div>
          </Marker>
        )}
      </Map>
    </div>
  );
}
