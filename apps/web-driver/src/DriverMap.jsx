/**
 * DriverMap.jsx — Mapbox map for web-driver
 *
 * Shows:
 *  • Driver's current GPS position (green dot)
 *  • Click on the map to update driver's position
 *  • Customer pickup pin when a trip is active
 */
import { useCallback, useEffect, useRef } from "react";
import Map, { Marker, Source, Layer, NavigationControl } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN     = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";

// Default center: Downtown Newark
const DEFAULT_CENTER = { latitude: 40.7357, longitude: -74.1724, zoom: 12 };

const DRIVER_DOT = {
  background: "#22c55e",
  borderRadius: "50%",
  width: "38px",
  height: "38px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "20px",
  boxShadow: "0 2px 12px rgba(0,0,0,.35)",
  border: "3px solid #fff",
  cursor: "default",
};

const PICKUP_PIN = {
  fontSize: "26px",
  lineHeight: 1,
  filter: "drop-shadow(0 2px 4px rgba(0,0,0,.4))",
};

/**
 * Props:
 *   lat, lng         – driver current position (null if no GPS yet)
 *   onMapClick(lat, lng) – called when driver clicks the map to set position
 *   activeTrip       – trip object | null  (shows pickup pin when active)
 */
export default function DriverMap({ lat, lng, onMapClick, activeTrip }) {
  const mapRef = useRef(null);

  const hasPosition  = lat != null && lng != null;
  const hasPickup    = activeTrip?.origin_lat != null;

  // Re-center map when driver position is first set
  useEffect(() => {
    if (!hasPosition || !mapRef.current) return;
    mapRef.current.easeTo({ center: [lng, lat], duration: 600 });
  }, [lat, lng]);

  const handleClick = useCallback((evt) => {
    if (!onMapClick) return;
    onMapClick(evt.lngLat.lat, evt.lngLat.lng);
  }, [onMapClick]);

  // Route from driver to pickup
  const showRoute = hasPosition && hasPickup;
  const route = showRoute ? {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [[lng, lat], [activeTrip.origin_lng, activeTrip.origin_lat]],
    },
  } : null;

  return (
    <div className="driver-map-wrap">
      <div className="driver-map-hint">
        {onMapClick
          ? "📍 Tap the map to update your position"
          : "📍 Your current location"}
      </div>
      <Map
        ref={mapRef}
        initialViewState={
          hasPosition
            ? { longitude: lng, latitude: lat, zoom: 13 }
            : DEFAULT_CENTER
        }
        style={{ width: "100%", height: "280px" }}
        mapStyle={MAP_STYLE}
        mapboxAccessToken={TOKEN}
        attributionControl={false}
        cursor={onMapClick ? "crosshair" : "grab"}
        onClick={onMapClick ? handleClick : undefined}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />

        {/* Route driver → pickup */}
        {showRoute && (
          <Source id="drv-route" type="geojson" data={route}>
            <Layer
              id="drv-route-line"
              type="line"
              paint={{
                "line-color": "#f59e0b",
                "line-width": 4,
                "line-dasharray": [2, 1.5],
                "line-opacity": 0.85,
              }}
            />
          </Source>
        )}

        {/* Driver's position */}
        {hasPosition && (
          <Marker longitude={lng} latitude={lat} anchor="center">
            <div style={DRIVER_DOT} title="My position">🧑‍✈️</div>
          </Marker>
        )}

        {/* Customer pickup pin */}
        {hasPickup && (
          <Marker
            longitude={activeTrip.origin_lng}
            latitude={activeTrip.origin_lat}
            anchor="bottom"
          >
            <span style={PICKUP_PIN} title="Customer pickup">📍</span>
          </Marker>
        )}
      </Map>
    </div>
  );
}
