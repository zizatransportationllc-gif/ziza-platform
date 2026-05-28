/**
 * TrackingMap — shows driver position and trip route on a map.
 * Sprint 44 — real road routing via OSRM (free, no API key required).
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { DriverPosition } from "../api";

interface Props {
  driverPosition: DriverPosition | null;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}

interface LatLng {
  latitude: number;
  longitude: number;
}

// ---------------------------------------------------------------------------
// Helper — fetch road-following geometry from OSRM public API (no key needed)
// Returns LatLng[] ready for <Polyline />, or null on error.
// ---------------------------------------------------------------------------

async function fetchRouteCoords(
  originLng: number,
  originLat: number,
  destLng: number,
  destLat: number,
): Promise<LatLng[] | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${originLng},${originLat};${destLng},${destLat}` +
      `?geometries=geojson&overview=full`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const coords: [number, number][] =
      data.routes?.[0]?.geometry?.coordinates ?? null;
    if (!coords) return null;
    // GeoJSON is [lng, lat] → convert to react-native-maps { latitude, longitude }
    return coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  } catch {
    return null;
  }
}

export default function TrackingMap({
  driverPosition,
  originLat,
  originLng,
  destLat,
  destLng,
}: Props): React.ReactElement {
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [routeError, setRouteError] = useState(false);

  useEffect(() => {
    setRouteError(false);
    fetchRouteCoords(originLng, originLat, destLng, destLat).then((coords) => {
      if (coords) {
        setRouteCoords(coords);
      } else {
        // Fallback: straight line between origin and destination
        setRouteCoords([
          { latitude: originLat, longitude: originLng },
          { latitude: destLat,   longitude: destLng  },
        ]);
        setRouteError(true);
      }
    });
  }, [originLat, originLng, destLat, destLng]);

  const centerLat = driverPosition?.lat ?? (originLat + destLat) / 2;
  const centerLng = driverPosition?.lng ?? (originLng + destLng) / 2;

  return (
    <View>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Road-following route polyline */}
        {routeCoords.length >= 2 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#6366f1"
            strokeWidth={4}
            lineDashPattern={routeError ? [8, 4] : undefined}
          />
        )}

        {/* Pickup marker */}
        <Marker
          coordinate={{ latitude: originLat, longitude: originLng }}
          title="Pickup"
          pinColor="green"
        />

        {/* Drop-off marker */}
        <Marker
          coordinate={{ latitude: destLat, longitude: destLng }}
          title="Drop-off"
          pinColor="red"
        />

        {/* Live driver position */}
        {driverPosition && (
          <Marker
            coordinate={{ latitude: driverPosition.lat, longitude: driverPosition.lng }}
            title="Driver"
            pinColor="blue"
          />
        )}
      </MapView>

      {routeError && (
        <Text style={styles.routeError}>
          Could not load road route — showing straight line.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 300 },
  routeError: {
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 2,
  },
});
