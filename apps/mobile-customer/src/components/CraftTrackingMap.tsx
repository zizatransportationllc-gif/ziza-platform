/**
 * CraftTrackingMap — live map for an assistance job: the customer (fixed) and
 * the assigned professional moving toward them, with a road-following route.
 * Mirrors TrackingMap (rides) but for the craft flow. OSRM routing (no key).
 */
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

interface Props {
  customerLat: number;
  customerLng: number;
  proLat: number | null;
  proLng: number | null;
  onEta?: (etaMin: number) => void;
}

interface LatLng {
  latitude: number;
  longitude: number;
}

async function fetchRoute(
  originLng: number,
  originLat: number,
  destLng: number,
  destLat: number,
): Promise<{ coords: LatLng[]; durationS: number | null } | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${originLng},${originLat};${destLng},${destLat}` +
      `?geometries=geojson&overview=full`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data.routes?.[0];
    const coords: [number, number][] = route?.geometry?.coordinates ?? null;
    if (!coords) return null;
    return {
      coords: coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      durationS: route.duration ?? null,
    };
  } catch {
    return null;
  }
}

export default function CraftTrackingMap({
  customerLat,
  customerLng,
  proLat,
  proLng,
  onEta,
}: Props): React.ReactElement {
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const hasPro = proLat != null && proLng != null;
  const onEtaRef = useRef(onEta);
  onEtaRef.current = onEta;

  // (Re)fetch the road route pro → customer as the pro moves; surface the ETA.
  useEffect(() => {
    if (!hasPro) { setRouteCoords([]); return; }
    fetchRoute(proLng!, proLat!, customerLng, customerLat).then((r) => {
      setRouteCoords(
        r?.coords ?? [
          { latitude: proLat!, longitude: proLng! },
          { latitude: customerLat, longitude: customerLng },
        ],
      );
      if (r?.durationS != null && onEtaRef.current) {
        onEtaRef.current(Math.max(1, Math.round(r.durationS / 60)));
      }
    });
  }, [proLat, proLng, customerLat, customerLng]);

  const centerLat = hasPro ? proLat! : customerLat;
  const centerLng = hasPro ? proLng! : customerLng;

  return (
    <View>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        region={{
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {routeCoords.length >= 2 && (
          <Polyline coordinates={routeCoords} strokeColor="#1D4ED8" strokeWidth={4} />
        )}

        {/* Where help is needed */}
        <Marker
          coordinate={{ latitude: customerLat, longitude: customerLng }}
          title="You"
          pinColor="red"
        />

        {/* Live professional position */}
        {hasPro && (
          <Marker
            coordinate={{ latitude: proLat!, longitude: proLng! }}
            title="Professional"
            pinColor="blue"
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 260 },
});
