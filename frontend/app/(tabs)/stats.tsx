import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getStats } from "../../src/api";
import { colors, radius, spacing, statusMeta } from "../../src/theme";
import type { Stats } from "../../src/types";

export default function StatsScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getStats();
      setStats(data);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Erreur de chargement");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const lastSync = stats?.last_haropa_sync
    ? new Date(stats.last_haropa_sync)
    : null;

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="stats-screen">
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
          />
        }
      >
        <Text style={styles.overline}>VUE D'ENSEMBLE</Text>
        <Text style={styles.h1}>Statistiques</Text>
        <Text style={styles.subtitle}>
          Synthèse en temps réel du réseau portuaire
        </Text>

        {loading ? (
          <ActivityIndicator
            color={colors.brand}
            size="large"
            style={{ marginTop: 40 }}
          />
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="warning" color="#F87171" size={22} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : stats ? (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.overline}>TOTAL OUVRAGES</Text>
              <Text style={styles.bigNumber} testID="stat-total">
                {stats.total_works}
              </Text>
              <View style={styles.heroFooter}>
                <Ionicons
                  name="sync"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.heroFooterText}>
                  Dernière synchro HAROPA :{" "}
                  {lastSync
                    ? lastSync.toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </Text>
              </View>
            </View>

            <View style={styles.grid}>
              <StatusTile
                label={statusMeta.ouvert.label}
                value={stats.open_count}
                color={statusMeta.ouvert.color}
                bg={statusMeta.ouvert.bg}
                testID="stat-open"
              />
              <StatusTile
                label={statusMeta.fermeture.label}
                value={stats.closing_count}
                color={statusMeta.fermeture.color}
                bg={statusMeta.fermeture.bg}
                testID="stat-closing"
              />
              <StatusTile
                label={statusMeta.bientot.label}
                value={stats.soon_count}
                color={statusMeta.bientot.color}
                bg={statusMeta.bientot.bg}
                testID="stat-soon"
              />
              <StatusTile
                label={statusMeta.ferme.label}
                value={stats.closed_count}
                color={statusMeta.ferme.color}
                bg={statusMeta.ferme.bg}
                testID="stat-closed"
              />
            </View>

            <View style={styles.eventsCard}>
              <View style={styles.eventsIcon}>
                <Ionicons name="pulse" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventsLabel}>Événements 24 h</Text>
                <Text style={styles.eventsValue} testID="stat-events-24h">
                  {stats.total_events_24h}
                </Text>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusTile({
  label,
  value,
  color,
  bg,
  testID,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  testID?: string;
}) {
  return (
    <View style={[styles.tile, { borderColor: color }]} testID={testID}>
      <View style={[styles.tileBadge, { backgroundColor: bg }]}>
        <View style={[styles.tileDot, { backgroundColor: color }]} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={[styles.tileLabel, { color }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  overline: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  h1: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: "900",
    marginTop: 4,
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 6,
    marginBottom: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  bigNumber: {
    color: colors.textPrimary,
    fontSize: 64,
    fontWeight: "900",
    marginTop: 4,
    letterSpacing: -2,
  },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  heroFooterText: { color: colors.textMuted, fontSize: 12 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tile: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 8,
  },
  tileBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tileDot: { width: 10, height: 10, borderRadius: 5 },
  tileValue: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  eventsCard: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  eventsIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(14,165,233,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  eventsLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  eventsValue: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2,
  },
  errorCard: {
    marginTop: 40,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
    padding: spacing.md,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  errorText: { color: "#FCA5A5", flex: 1 },
});
