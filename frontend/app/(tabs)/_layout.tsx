import React, { useEffect } from "react";
import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { useAuth } from "../../src/AuthContext";
import { colors } from "../../src/theme";
import {
  requestLocationPermission,
  requestNotificationPermission,
} from "../../src/location";

export default function TabsLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user) {
      requestLocationPermission();
      requestNotificationPermission();
    }
  }, [user]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Carte",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map" color={color} size={size} />
          ),
          tabBarButtonTestID: "tab-map",
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" color={color} size={size} />
          ),
          tabBarButtonTestID: "tab-stats",
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Historique",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time" color={color} size={size} />
          ),
          tabBarButtonTestID: "tab-history",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
});
