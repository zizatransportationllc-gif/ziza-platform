/**
 * TrackingMap — shows driver position and trip route on a map.
 * Sprint 27 — Application mobile customer
 */
import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { DriverPosition } from "../api";

interface Props {
  driverPosition: DriverPosition | null;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}

export default function TrackingMap({
  driverPosition,
  originLat,
  originLng,
  destLat,
  destLng,
}: Props): React.ReactElement {
  const centerLat = driverPosition?.lat ?? (originLat + destLat) / 2;
  const centerLng = driverPosition?.lng ?? (originLng + destLng) / 2;

  return (
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
      <Marker
        coordinate={{ latitude: originLat, longitude: originLng }}
        title="Départ"
        pinColor="green"
      />
      <Marker
        coordinate={{ latitude: destLat, longitude: destLng }}
        title="Destination"
        pinColor="red"
      />
      {driverPosition && (
        <Marker
          coordinate={{ latitude: driverPosition.lat, longitude: driverPosition.lng }}
          title="Chauffeur"
          pinColor="blue"
        />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { height: 300 },
});
