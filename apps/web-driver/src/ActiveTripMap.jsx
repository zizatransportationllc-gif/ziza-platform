/**
 * ActiveTripMap.jsx — Mapbox map shown to the driver for the accepted trip.
 *
 * Shows:
 *  • Pickup pin (origin)        📍
 *  • Destination pin (dest)     🏁
 *  • Road-following route pickup → destination (Mapbox Directions)
 *  • Driver's live position dot, when known                       🧑‍✈️
 *
 * NOT shared across frontends (isolation rule).
 */
import { useEffect, useRef, useState } from "react";
import Map, { Marker, Source, Layer, NavigationControl } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fetchRouteCoords } from "./geo";

const TOKEN     = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";

function lineFeature(coords) {
  return { type: "Feature", geometry: { type: "LineString", coordinates: coords } };
}

/**
 * Props:
 *   origin: { lat, lng }    pickup (required)
 *   dest:   { lat, lng }    destination (required)
 *   driver: { lat, lng } | null   driver's current position (optional)
 */
export default function ActiveTripMap({ origin, dest, driver }) {
  const mapRef = useRef(null);
  const [routeCoords, setRouteCoords] = useState(null);

  const hasOrigin = origin?.lat != null && origin?.lng != null;
  const hasDest   = dest?.lat != null && dest?.lng != null;
  const hasDriver = driver?.lat != null && driver?.lng != null;

  // Road-following route pickup → destination
  useEffect(() => {
    if (!hasOrigin || !hasDest) return;
    let active = true;
    fetchRouteCoords(origin.lng, origin.lat, dest.lng, dest.lat)
      .then((c) => { if (active) setRouteCoords(c); });
    return () => { active = false; };
  }, [origin?.lat, origin?.lng, dest?.lat, dest?.lng]);

  // Fit the map to all relevant points once they're known
  useEffect(() => {
    if (!mapRef.current || !hasOrigin || !hasDest) return;
    const lngs = [origin.lng, dest.lng];
    const lats = [origin.lat, dest.lat];
    if (hasDriver) { lngs.push(driver.lng); lats.push(driver.lat); }
    mapRef.current.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 50, duration: 600, maxZoom: 15 },
    );
  }, [origin?.lat, origin?.lng, dest?.lat, dest?.lng, driver?.lat, driver?.lng]);

  if (!hasOrigin || !hasDest) return null;

  const routeLine = routeCoords ?? [[origin.lng, origin.lat], [dest.lng, dest.lat]];
  const dashed = !routeCoords; // dashed straight line while the route loads

  return (
    <div className="active-trip-map">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: origin.lng, latitude: origin.lat, zoom: 12 }}
        style={{ width: "100%", height: "240px", borderRadius: "10px" }}
        mapStyle={MAP_STYLE}
        mapboxAccessToken={TOKEN}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />

        <Source id="trip-route" type="geojson" data={lineFeature(routeLine)}>
          <Layer
            id="trip-route-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": "#1D4ED8",
              "line-width": 4,
              "line-opacity": 0.85,
              ...(dashed ? { "line-dasharray": [2, 1.5] } : {}),
            }}
          />
        </Source>

        {hasDriver && (
          <Marker longitude={driver.lng} latitude={driver.lat} anchor="center">
            <span title="You" style={{ fontSize: "24px" }}>🧑‍✈️</span>
          </Marker>
        )}

        <Marker longitude={origin.lng} latitude={origin.lat} anchor="bottom">
          <span title="Pickup" style={{ fontSize: "26px" }}>📍</span>
        </Marker>

        <Marker longitude={dest.lng} latitude={dest.lat} anchor="bottom">
          <span title="Destination" style={{ fontSize: "24px" }}>🏁</span>
        </Marker>
      </Map>
    </div>
  );
}
