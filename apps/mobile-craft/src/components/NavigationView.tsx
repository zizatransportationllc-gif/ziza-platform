/**
 * NavigationView — in-app "follow" navigation for the professional (mobile).
 *
 * Tracks the pro's live GPS, draws the road route to the customer, keeps the
 * map centred on the pro, and shows remaining distance + ETA. react-native-maps
 * + OSRM (free, no key). No third-party app, no voice guidance.
 */
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";

interface Props {
  targetLat: number;
  targetLng: number;
  label?: string; // shown in the banner, e.g. "Customer"
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

export default function NavigationView({ targetLat, targetLng, label = "Customer" }: Props): React.ReactElement {
  const mapRef = useRef<MapView | null>(null);
  const [pro, setPro] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<{ coords: LatLng[]; distanceM: number; durationS: number } | null>(null);
  const lastFetchPos = useRef<LatLng | null>(null);

  // Watch the pro's live position (foreground) for following + route origin.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let active = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || !active) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 15 },
        (pos) => setPro({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      );
    })();
    return () => { active = false; sub?.remove(); };
  }, []);

  // Follow the pro.
  useEffect(() => {
    if (pro && mapRef.current) {
      mapRef.current.animateCamera({ center: pro, zoom: 15 }, { duration: 800 });
    }
  }, [pro?.latitude, pro?.longitude]);

  // (Re)fetch the route when the pro appears, the target changes, or the pro
  // has moved more than ~40 m since the last fetch.
  useEffect(() => {
    if (!pro) return;
    if (route && metersBetween(lastFetchPos.current, pro) < 40) return;
    lastFetchPos.current = pro;
    let active = true;
    fetchRoute(pro.longitude, pro.latitude, targetLng, targetLat).then((r) => {
      if (active && r) setRoute(r);
    });
    return () => { active = false; };
  }, [pro?.latitude, pro?.longitude, targetLat, targetLng]);

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
          latitude: pro?.latitude ?? targetLat,
          longitude: pro?.longitude ?? targetLng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation
      >
        {route && route.coords.length >= 2 && (
          <Polyline coordinates={route.coords} strokeColor="#1D4ED8" strokeWidth={5} />
        )}
        {pro && <Marker coordinate={pro} title="You" pinColor="green" />}
        <Marker
          coordinate={{ latitude: targetLat, longitude: targetLng }}
          title={label}
          pinColor="red"
        />
      </MapView>
      {!pro && <Text style={styles.hint}>📍 Waiting for your GPS position…</Text>}
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
