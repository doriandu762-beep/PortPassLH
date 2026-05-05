import React, { forwardRef } from "react";
import { View, Text, StyleSheet, ScrollView, Linking } from "react-native";
import { colors, radius, spacing } from "./theme";

// Try to load react-native-maps. In Expo Go on iOS the native module
// `RNMapsAirModule` is NOT bundled, so the require fails. We fall back
// to a friendly placeholder so the app keeps working until the user
// runs a development build (or uses Android Expo Go where it works).
let RNMaps: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RNMaps = require("react-native-maps");
} catch {
  RNMaps = null;
}

export const PROVIDER_DEFAULT = RNMaps?.PROVIDER_DEFAULT;

type MarkerProps = {
  coordinate: { latitude: number; longitude: number };
  onPress?: () => void;
  children?: React.ReactNode;
  testID?: string;
  tracksViewChanges?: boolean;
};

export const Marker: React.FC<MarkerProps> = (props) => {
  if (RNMaps?.Marker) {
    const M = RNMaps.Marker;
    return <M {...props}>{props.children}</M>;
  }
  return null;
};

const MapView = forwardRef<any, any>((props, ref) => {
  if (RNMaps?.default) {
    const Native = RNMaps.default;
    return <Native ref={ref} {...props} />;
  }
  return <MapFallback markers={collectMarkers(props.children)} />;
});
MapView.displayName = "MapView";
export default MapView;

function collectMarkers(children: React.ReactNode) {
  const out: { lat: number; lng: number }[] = [];
  React.Children.forEach(children, (child: any) => {
    const c = child?.props?.coordinate;
    if (c) out.push({ lat: c.latitude, lng: c.longitude });
  });
  return out;
}

function MapFallback({ markers }: { markers: { lat: number; lng: number }[] }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Text style={styles.title}>Carte indisponible dans Expo Go iOS</Text>
        <Text style={styles.body}>
          react-native-maps n&apos;est pas embarqué dans Expo Go sur iOS depuis
          le SDK 53. La carte s&apos;affiche normalement dans :
          {"\n"}• un development build (eas build),
          {"\n"}• ou Expo Go Android.
        </Text>
        <Text
          style={styles.link}
          onPress={() =>
            Linking.openURL(
              "https://docs.expo.dev/develop/development-builds/introduction/",
            )
          }
        >
          Doc → development builds
        </Text>
      </View>
      <Text style={styles.overline}>OUVRAGES CHARGÉS ({markers.length})</Text>
      <ScrollView style={styles.scroll} contentContainerStyle={{ gap: 6 }}>
        {markers.map((m, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.rowText}>
              {m.lat.toFixed(4)}, {m.lng.toFixed(4)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    paddingTop: 200,
  },
  badge: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 6,
  },
  body: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  link: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
  },
  overline: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 6,
  },
  scroll: { flex: 1 },
  row: {
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: "monospace",
  },
});
