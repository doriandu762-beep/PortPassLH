import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getHistory } from "../../src/api";
import { colors, normalizeStatus, radius, spacing, statusMeta } from "../../src/theme";
import type { HistoryEntry } from "../../src/types";

export default function HistoryScreen() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getHistory(200);
      setEntries(data);
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

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="history-screen">
      <View style={styles.header}>
        <Text style={styles.overline}>JOURNAL D'ACTIVITÉ</Text>
        <Text style={styles.h1}>Historique</Text>
        <Text style={styles.subtitle}>
          200 derniers changements de statut
        </Text>
      </View>

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
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <Row entry={item} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.brand}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="hourglass" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>Aucun événement récent</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function Row({ entry }: { entry: HistoryEntry }) {
  const status = normalizeStatus(entry.status);
  const meta = statusMeta[status];
  const d = new Date(entry.changed_at);
  const date = d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
  const time = d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View
      style={[styles.row, { borderLeftColor: meta.color }]}
      testID={`history-row-${entry.id}`}
    >
      <View style={styles.rowHead}>
        <Text style={styles.rowName} numberOfLines={1}>
          {entry.work_name}
        </Text>
        <Text style={styles.rowTime}>{time}</Text>
      </View>
      <View style={styles.rowFoot}>
        <View
          style={[
            styles.pill,
            { backgroundColor: meta.bg, borderColor: meta.color },
          ]}
        >
          <View style={[styles.pillDot, { backgroundColor: meta.color }]} />
          <Text style={[styles.pillText, { color: meta.color }]}>
            {meta.label}
          </Text>
        </View>
        <View style={styles.rowMeta}>
          <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
          <Text style={styles.rowMetaText}>{date}</Text>
          <Text style={styles.rowMetaDot}>·</Text>
          <Text style={styles.rowMetaText}>{entry.source}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.lg, paddingBottom: spacing.md },
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
  subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: 6 },
  list: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xl },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    padding: 14,
    gap: 10,
  },
  rowHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  rowName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  rowTime: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  rowFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: 6,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  rowMetaText: { color: colors.textMuted, fontSize: 12 },
  rowMetaDot: { color: colors.textMuted, fontSize: 12 },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  errorCard: {
    margin: spacing.lg,
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
