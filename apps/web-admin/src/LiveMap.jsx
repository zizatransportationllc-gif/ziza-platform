/**
 * LiveMap.jsx — Mapbox live driver map for web-admin
 *
 * Renders all online drivers as pins on a Mapbox map.
 * Each pin shows the driver email on hover (tooltip via title).
 * Auto-refreshes every 30 s (controlled by parent LiveMapPanel).
 */
import Map, { Marker, Popup, NavigationControl } from "react-map-gl";
import { useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN     = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";

// Center on New Jersey by default
const DEFAULT_VIEW = { longitude: -74.4, latitude: 40.6, zoom: 9 };

const DRIVER_PIN = {
  background: "#22c55e",
  borderRadius: "50%",
  width: "36px",
  height: "36px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "18px",
  boxShadow: "0 2px 8px rgba(0,0,0,.35)",
  border: "3px solid #fff",
  cursor: "pointer",
};

const POPUP_STYLE = {
  padding: "6px 10px",
  fontSize: "12px",
  fontWeight: 600,
  borderRadius: "6px",
  whiteSpace: "nowrap",
};

/**
 * Props:
 *   drivers – array of { driver_id, email, lat, lng, heading?, last_updated? }
 */
export default function LiveMap({ drivers = [] }) {
  const [popup, setPopup] = useState(null); // { driver_id, email, lng, lat }

  // Only drivers with valid coordinates
  const positioned = drivers.filter(
    (d) => d.lat != null && d.lng != null
  );

  return (
    <div className="live-map-container">
      <Map
        initialViewState={DEFAULT_VIEW}
        style={{ width: "100%", height: "420px" }}
        mapStyle={MAP_STYLE}
        mapboxAccessToken={TOKEN}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />

        {/* Driver pins */}
        {positioned.map((d) => (
          <Marker
            key={d.driver_id}
            longitude={d.lng}
            latitude={d.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setPopup(popup?.driver_id === d.driver_id ? null : d);
            }}
          >
            <div style={DRIVER_PIN}>🧑‍✈️</div>
          </Marker>
        ))}

        {/* Popup for selected driver */}
        {popup && (
          <Popup
            longitude={popup.lng}
            latitude={popup.lat}
            anchor="top"
            onClose={() => setPopup(null)}
            closeButton={false}
            offset={20}
          >
            <div style={POPUP_STYLE}>
              <div>{popup.email}</div>
              {popup.last_updated && (
                <div style={{ fontWeight: 400, color: "#64748b", marginTop: "2px" }}>
                  ⏱️ {new Date(popup.last_updated).toLocaleTimeString("en-US")}
                </div>
              )}
            </div>
          </Popup>
        )}
      </Map>

      {/* Legend */}
      <div className="live-map-legend">
        <span className="live-badge">
          🟢 {positioned.length} driver{positioned.length !== 1 ? "s" : ""} on map
          {drivers.length > positioned.length && (
            <span style={{ color: "#94a3b8", marginLeft: "6px" }}>
              ({drivers.length - positioned.length} without GPS)
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
