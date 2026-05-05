import React, { forwardRef } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { colors, spacing, radius } from "./theme";

// Web stub for react-native-maps — shows informative placeholder.
// On native iOS/Android, MapView.native.tsx is used instead.
export const PROVIDER_DEFAULT = undefined as any;

type MarkerProps = {
  coordinate: { latitude: number; longitude: number };
  onPress?: () => void;
  children?: React.ReactNode;
  testID?: string;
  tracksViewChanges?: boolean;
};

// eslint-disable-next-line react/display-name
export const Marker: React.FC<MarkerProps> = () => null;

interface MapViewProps {
  style?: any;
  initialRegion?: any;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  customMapStyle?: any;
  testID?: string;
  provider?: any;
  children?: React.ReactNode;
}

const MapView = forwardRef<any, MapViewProps>((props, _ref) => {
  return (
    <View style={[styles.wrap, props.style]} testID={props.testID}>
      <View style={styles.badge}>
        <Text style={styles.title}>Carte native</Text>
        <Text style={styles.body}>
          La carte interactive (react-native-maps) s&apos;affiche sur iOS et
          Android. Scannez le QR code Expo Go pour la voir en action.
        </Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={{ gap: 8 }}>
        {React.Children.map(props.children, (child: any) => {
          if (!child?.props?.coordinate) return null;
          return (
            <View style={styles.row}>
              <Text style={styles.rowText}>
                {child.props.coordinate.latitude.toFixed(4)},{" "}
                {child.props.coordinate.longitude.toFixed(4)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
});

MapView.displayName = "MapView";
export default MapView;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.lg,
    justifyContent: "flex-start",
  },
  badge: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  body: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  scroll: { maxHeight: 300 },
  row: {
    backgroundColor: colors.surfaceElevated,
    padding: 8,
    borderRadius: radius.sm,
  },
  rowText: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: "monospace",
  },
});
