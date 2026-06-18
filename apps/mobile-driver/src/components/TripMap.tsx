/**
 * TripMap — shows the accepted trip's pickup + destination and the road route.
 * Mirrors mobile-customer's TrackingMap: react-native-maps + OSRM (free, no key).
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

interface Props {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}

interface LatLng {
  latitude: number;
  longitude: number;
}

// Road-following geometry from the free OSRM public API (no key required).
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
    const coords: [number, number][] | null = data.routes?.[0]?.geometry?.coordinates ?? null;
    if (!coords) return null;
    return coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  } catch {
    return null;
  }
}

export default function TripMap({
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
        setRouteCoords([
          { latitude: originLat, longitude: originLng },
          { latitude: destLat, longitude: destLng },
        ]);
        setRouteError(true);
      }
    });
  }, [originLat, originLng, destLat, destLng]);

  return (
    <View>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: (originLat + destLat) / 2,
          longitude: (originLng + destLng) / 2,
          latitudeDelta: Math.max(0.04, Math.abs(originLat - destLat) * 2.2),
          longitudeDelta: Math.max(0.04, Math.abs(originLng - destLng) * 2.2),
        }}
      >
        {routeCoords.length >= 2 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#1D4ED8"
            strokeWidth={4}
            lineDashPattern={routeError ? [8, 4] : undefined}
          />
        )}
        <Marker coordinate={{ latitude: originLat, longitude: originLng }} title="Pickup" pinColor="green" />
        <Marker coordinate={{ latitude: destLat, longitude: destLng }} title="Destination" pinColor="red" />
      </MapView>
      {routeError && (
        <Text style={styles.routeError}>Could not load road route — showing straight line.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 260, borderRadius: 10 },
  routeError: { fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 2 },
});
