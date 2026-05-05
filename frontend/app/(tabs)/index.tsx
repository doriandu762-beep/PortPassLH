import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import MapView, { Marker, PROVIDER_DEFAULT } from "../../src/MapView";

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};
import { getWorks } from "../../src/api";
import { colors, normalizeStatus, radius, spacing, statusMeta } from "../../src/theme";
import {
  distanceMeters,
  requestLocationPermission,
  thresholdForMode,
  triggerProximityAlert,
} from "../../src/location";
import type { Work, VehicleMode } from "../../src/types";

const LE_HAVRE_REGION: Region = {
  latitude: 49.4875,
  longitude: 0.18,
  latitudeDelta: 0.12,
  longitudeDelta: 0.2,
};

// Dark map style for Apple/Google maps
const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#0C1522" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94A3B8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#050A11" }] },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#050A11" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#132135" }],
  },
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Work | null>(null);
  const [mode, setMode] = useState<VehicleMode>("voiture");
  const [userLoc, setUserLoc] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const mapRef = useRef<MapView>(null);
  const alerted = useRef<Set<string>>(new Set());

  const refreshWorks = useCallback(async () => {
    try {
      const data = await getWorks();
      setWorks(data);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Failed to load works", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWorks();
    const id = setInterval(refreshWorks, 60_000);
    return () => clearInterval(id);
  }, [refreshWorks]);

  // Location tracking
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      const ok = await requestLocationPermission();
      if (!ok) return;
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 25,
          timeInterval: 5000,
        },
        (pos) => {
          setUserLoc({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
      );
    })();
    return () => {
      subscription?.remove();
    };
  }, []);

  // Proximity alerts
  useEffect(() => {
    if (!userLoc || works.length === 0) return;
    const threshold = thresholdForMode(mode);
    works.forEach((w) => {
      const status = normalizeStatus(w.status);
      if (status === "ouvert") {
        alerted.current.delete(w.id);
        return;
      }
      const d = distanceMeters(userLoc, { latitude: w.lat, longitude: w.lng });
      if (d <= threshold) {
        if (!alerted.current.has(w.id)) {
          alerted.current.add(w.id);
          triggerProximityAlert(w, d);
        }
      } else if (d > threshold * 1.5) {
        // Reset when user moves well away
        alerted.current.delete(w.id);
      }
    });
  }, [userLoc, works, mode]);

  const centerOnUser = useCallback(() => {
    if (userLoc && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          ...userLoc,
          latitudeDelta: 0.05,
          longitudeDelta: 0.08,
        },
        500,
      );
    }
  }, [userLoc]);

  const counts = useMemo(() => {
    const c = { ouvert: 0, fermeture: 0, bientot: 0, ferme: 0 } as Record<
      string,
      number
    >;
    works.forEach((w) => {
      c[normalizeStatus(w.status)]++;
    });
    return c;
  }, [works]);

  return (
    <View style={styles.root} testID="map-screen">
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={LE_HAVRE_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        customMapStyle={darkMapStyle}
        testID="map-view"
      >
        {works.map((w) => {
          const status = normalizeStatus(w.status);
          const meta = statusMeta[status];
          return (
            <Marker
              key={w.id}
              coordinate={{ latitude: w.lat, longitude: w.lng }}
              onPress={() => setSelected(w)}
              testID={`marker-${w.id}`}
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.marker,
                  { backgroundColor: meta.color, borderColor: "#FFFFFF" },
                ]}
              >
                <Ionicons
                  name={w.type === "Écluse" ? "boat" : "git-commit"}
                  size={14}
                  color="#050A11"
                />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Top bar */}
      <SafeAreaView edges={["top"]} style={styles.topBarWrap} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <View style={styles.logoMini}>
              <Ionicons name="boat" size={16} color={colors.accent} />
            </View>
            <View>
              <Text style={styles.title}>PortPassLH</Text>
              <Text style={styles.subtitle}>
                {works.length} ouvrages · {counts.ouvert} ouverts ·{" "}
                {counts.ferme} fermés
              </Text>
            </View>
          </View>
          <View style={styles.iconBtn}>
            <Ionicons name="radio" size={18} color={colors.accent} />
          </View>
        </View>

        {/* Vehicle mode */}
        <View style={styles.modeBar}>
          <Text style={styles.overline}>ALERTE PROXIMITÉ</Text>
          <View style={styles.segmented}>
            <TouchableOpacity
              style={[
                styles.segBtn,
                mode === "voiture" && styles.segBtnActive,
              ]}
              onPress={() => setMode("voiture")}
              testID="mode-voiture"
            >
              <Ionicons
                name="car"
                size={14}
                color={mode === "voiture" ? "#FFFFFF" : colors.textSecondary}
              />
              <Text
                style={[
                  styles.segText,
                  mode === "voiture" && styles.segTextActive,
                ]}
              >
                Voiture · 1000 m
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segBtn, mode === "camion" && styles.segBtnActive]}
              onPress={() => setMode("camion")}
              testID="mode-camion"
            >
              <Ionicons
                name="bus"
                size={14}
                color={mode === "camion" ? "#FFFFFF" : colors.textSecondary}
              />
              <Text
                style={[
                  styles.segText,
                  mode === "camion" && styles.segTextActive,
                ]}
              >
                Camion · 2000 m
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: (selected ? 260 : 28) + insets.bottom }]}
        onPress={centerOnUser}
        testID="locate-btn"
      >
        <Ionicons name="locate" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : null}

      {/* Bottom sheet */}
      {selected ? (
        <WorkSheet
          work={selected}
          userLoc={userLoc}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </View>
  );
}

function WorkSheet({
  work,
  userLoc,
  onClose,
}: {
  work: Work;
  userLoc: { latitude: number; longitude: number } | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const status = normalizeStatus(work.status);
  const meta = statusMeta[status];
  const dist = userLoc
    ? distanceMeters(userLoc, { latitude: work.lat, longitude: work.lng })
    : null;
  const updated = new Date(work.updated_at);

  return (
    <View style={[sheetStyles.wrap, { paddingBottom: 16 + insets.bottom }]} testID="work-sheet">
      <View style={sheetStyles.handle} />
      <View style={sheetStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={sheetStyles.type}>{work.type.toUpperCase()}</Text>
          <Text style={sheetStyles.name} numberOfLines={2}>
            {work.name}
          </Text>
        </View>
        <TouchableOpacity style={sheetStyles.closeBtn} onPress={onClose} testID="sheet-close">
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View
        style={[
          sheetStyles.statusPill,
          { backgroundColor: meta.bg, borderColor: meta.color },
        ]}
      >
        <View style={[sheetStyles.dot, { backgroundColor: meta.color }]} />
        <Text style={[sheetStyles.statusText, { color: meta.color }]}>
          {meta.label}
        </Text>
      </View>

      <View style={sheetStyles.metaRow}>
        <View style={sheetStyles.metaItem}>
          <Text style={sheetStyles.metaLabel}>Distance</Text>
          <Text style={sheetStyles.metaValue}>
            {dist !== null ? `${Math.round(dist)} m` : "—"}
          </Text>
        </View>
        <View style={sheetStyles.metaItem}>
          <Text style={sheetStyles.metaLabel}>Mis à jour</Text>
          <Text style={sheetStyles.metaValue}>
            {updated.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        <View style={sheetStyles.metaItem}>
          <Text style={sheetStyles.metaLabel}>Source</Text>
          <Text style={sheetStyles.metaValue}>{work.source}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBarWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
  },
  topBar: {
    marginTop: Platform.OS === "android" ? 8 : 4,
    backgroundColor: "rgba(12,21,34,0.94)",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  logoMini: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  modeBar: {
    marginTop: spacing.sm,
    backgroundColor: "rgba(12,21,34,0.94)",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  overline: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 6,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: radius.sm,
    gap: 6,
  },
  segBtnActive: { backgroundColor: colors.brand },
  segText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  segTextActive: { color: "#FFFFFF" },
  marker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5,10,17,0.5)",
  },
});

const sheetStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  type: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  name: { color: colors.textPrimary, fontSize: 22, fontWeight: "800", marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  metaRow: { flexDirection: "row", gap: spacing.sm },
  metaItem: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  metaValue: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
});
