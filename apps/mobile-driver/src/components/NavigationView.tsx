/**
 * NavigationView — in-app "follow" navigation for the driver (mobile).
 *
 * Tracks the driver's live GPS, draws the road route to the current target
 * (pickup while accepted, destination while in progress), keeps the map
 * centred on the driver, and shows remaining distance + ETA. react-native-maps
 * + OSRM (free, no key). No third-party app, no voice guidance.
 */
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";

interface Props {
  targetLat: number;
  targetLng: number;
  label: string; // "Pickup" | "Destination"
}

interface LatLng {
  latitude: number;
  longitude: number;
}

const METERS_PER_MILE = 1609.344;

function metersBetween(a: LatLng | null, b: LatLng | null): number {
  if (!a || !b) return Infinity;
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLng = rad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// OSRM route with distance (m) + duration (s) and a LatLng[] polyline.
async function fetchRoute(
  oLng: number, oLat: number, dLng: number, dLat: number,
): Promise<{ coords: LatLng[]; distanceM: number; durationS: number } | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${oLng},${oLat};${dLng},${dLat}?geometries=geojson&overview=full`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data.routes?.[0];
    const coords: [number, number][] | undefined = route?.geometry?.coordinates;
    if (!coords) return null;
    return {
      coords: coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      distanceM: route.distance ?? 0,
      durationS: route.duration ?? 0,
    };
  } catch {
    return null;
  }
}

export default function NavigationView({ targetLat, targetLng, label }: Props): React.ReactElement {
  const mapRef = useRef<MapView | null>(null);
  const [driver, setDriver] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<{ coords: LatLng[]; distanceM: number; durationS: number } | null>(null);
  const lastFetchPos = useRef<LatLng | null>(null);

  // Watch the driver's live position (foreground) for following + route origin.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let active = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || !active) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 15 },
        (pos) => setDriver({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      );
    })();
    return () => { active = false; sub?.remove(); };
  }, []);

  // Follow the driver.
  useEffect(() => {
    if (driver && mapRef.current) {
      mapRef.current.animateCamera({ center: driver, zoom: 15 }, { duration: 800 });
    }
  }, [driver?.latitude, driver?.longitude]);

  // (Re)fetch the route when the driver appears, the target changes, or the
  // driver has moved more than ~40 m since the last fetch.
  useEffect(() => {
    if (!driver) return;
    if (route && metersBetween(lastFetchPos.current, driver) < 40) return;
    lastFetchPos.current = driver;
    let active = true;
    fetchRoute(driver.longitude, driver.latitude, targetLng, targetLat).then((r) => {
      if (active && r) setRoute(r);
    });
    return () => { active = false; };
  }, [driver?.latitude, driver?.longitude, targetLat, targetLng]);

  const miles = route ? route.distanceM / METERS_PER_MILE : null;
  const etaMin = route ? Math.max(1, Math.round(route.durationS / 60)) : null;

  return (
    <View>
      <View style={styles.banner}>
        <Text style={styles.bannerLabel}>🧭 To {label}</Text>
        <Text style={styles.bannerEta}>
          {miles != null ? `${miles.toFixed(1)} mi` : "…"}
          {etaMin != null ? ` · ~${etaMin} min` : ""}
        </Text>
      </View>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: driver?.latitude ?? targetLat,
          longitude: driver?.longitude ?? targetLng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation
      >
        {route && route.coords.length >= 2 && (
          <Polyline coordinates={route.coords} strokeColor="#1D4ED8" strokeWidth={5} />
        )}
        {driver && <Marker coordinate={driver} title="You" pinColor="blue" />}
        <Marker
          coordinate={{ latitude: targetLat, longitude: targetLng }}
          title={label}
          pinColor={label === "Destination" ? "red" : "green"}
        />
      </MapView>
      {!driver && <Text style={styles.hint}>📍 Waiting for your GPS position…</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1D4ED8",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  bannerLabel: { color: "#fff", fontWeight: "700", fontSize: 14 },
  bannerEta: { color: "#fff", fontWeight: "600", fontSize: 14 },
  map: { height: 300, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  hint: { color: "#9CA3AF", fontSize: 12, textAlign: "center", marginTop: 6 },
});
