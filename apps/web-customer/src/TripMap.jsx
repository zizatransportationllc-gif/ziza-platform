/**
 * TripMap.jsx — Mapbox map components for web-customer
 *
 * EstimateMap : shows origin + destination + dashed route line
 *               (displayed in the fare card, before booking)
 *
 * TripMap     : shows live driver position + origin + destination
 *               (displayed in BookingSection while trip is active)
 */
import { useEffect, useRef } from "react";
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

// ─── EstimateMap ─────────────────────────────────────────────────────────────

/**
 * Props:
 *   originLat, originLng  – pickup coords
 *   destLat,   destLng    – drop-off coords
 */
export function EstimateMap({ originLat, originLng, destLat, destLng }) {
  if (!originLat || !destLat) return null;

  const midLat = (originLat + destLat) / 2;
  const midLng = (originLng + destLng) / 2;

  // Bounding-box zoom: rough approach via lat/lng span
  const latSpan = Math.abs(destLat - originLat);
  const lngSpan = Math.abs(destLng - originLng);
  const span = Math.max(latSpan, lngSpan);
  const zoom = span < 0.05 ? 13 : span < 0.2 ? 11 : span < 0.8 ? 9 : 8;

  const route = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [[originLng, originLat], [destLng, destLat]],
    },
  };

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

        {/* Dashed route line */}
        <Source id="est-route" type="geojson" data={route}>
          <Layer
            id="est-route-line"
            type="line"
            paint={{
              "line-color": "#6366f1",
              "line-width": 4,
              "line-dasharray": [2, 1.5],
              "line-opacity": 0.85,
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

  const hasOrigin = trip.origin_lat != null;
  const hasDest   = trip.dest_lat   != null;
  const hasDrv    = driverLocation?.driver_lat != null;

  // Smoothly pan to driver when position updates
  useEffect(() => {
    if (!hasDrv || !mapRef.current) return;
    mapRef.current.easeTo({
      center: [driverLocation.driver_lng, driverLocation.driver_lat],
      duration: 800,
    });
  }, [driverLocation?.driver_lat, driverLocation?.driver_lng]);

  if (!hasOrigin) return null;

  // Initial center: driver position if available, else origin
  const initLat = hasDrv ? driverLocation.driver_lat : trip.origin_lat;
  const initLng = hasDrv ? driverLocation.driver_lng : trip.origin_lng;

  // Route: origin → driver → destination
  const coords = [
    [trip.origin_lng, trip.origin_lat],
    ...(hasDrv ? [[driverLocation.driver_lng, driverLocation.driver_lat]] : []),
    ...(hasDest ? [[trip.dest_lng, trip.dest_lat]] : []),
  ];

  const route = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
  };

  const isActive = ["accepted", "in_progress"].includes(trip.status);

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

        {/* Route line */}
        {coords.length >= 2 && (
          <Source id="trip-route" type="geojson" data={route}>
            <Layer
              id="trip-route-line"
              type="line"
              paint={{
                "line-color": isActive ? "#22c55e" : "#6366f1",
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
