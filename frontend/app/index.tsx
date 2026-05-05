import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useAuth } from "../src/AuthContext";
import { colors, spacing, radius } from "../src/theme";

const HERO =
  "https://images.unsplash.com/photo-1762228015786-0aeed4008674?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzl8MHwxfHNlYXJjaHwyfHxpbmR1c3RyaWFsJTIwc2hpcHBpbmclMjBwb3J0JTIwbmlnaHR8ZW58MHx8fHwxNzc4MDA1MjE5fDA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { user, loading, signIn, error } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

  if (loading) {
    return (
      <View style={styles.loadingRoot} testID="auth-loading">
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  if (user) return <Redirect href="/(tabs)" />;

  const onPress = async () => {
    setSubmitting(true);
    setLocalError(null);
    try {
      await signIn();
    } catch (e: any) {
      setLocalError(e?.message || "Erreur d'authentification");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ImageBackground
      source={{ uri: HERO }}
      style={styles.root}
      resizeMode="cover"
      testID="auth-screen"
    >
      <View style={styles.overlay} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="boat" size={28} color={colors.accent} />
          </View>
          <Text style={styles.brand}>PortPassLH</Text>
          <Text style={styles.tagline}>
            Statut en temps réel des ponts & écluses
          </Text>
          <Text style={styles.taglineSmall}>Port du Havre</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.overline}>CONNEXION SÉCURISÉE</Text>
          <TouchableOpacity
            style={[styles.googleBtn, submitting && { opacity: 0.6 }]}
            onPress={onPress}
            disabled={submitting}
            activeOpacity={0.85}
            testID="auth-google-btn"
          >
            {submitting ? (
              <ActivityIndicator color="#050A11" />
            ) : (
              <>
                <Ionicons
                  name="logo-google"
                  size={20}
                  color="#050A11"
                  style={{ marginRight: 10 }}
                />
                <Text style={styles.googleBtnText}>
                  Se connecter avec Google
                </Text>
              </>
            )}
          </TouchableOpacity>
          {localError ? (
            <Text style={styles.error} testID="auth-error">
              {localError}
            </Text>
          ) : null}
          <Text style={styles.legal}>
            Accès réservé aux utilisateurs autorisés.
          </Text>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,10,17,0.85)",
  },
  safe: { flex: 1, padding: spacing.lg, justifyContent: "space-between" },
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  header: { alignItems: "flex-start", marginTop: spacing.xl },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  brand: {
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1,
    color: colors.textPrimary,
  },
  tagline: {
    marginTop: spacing.sm,
    fontSize: 16,
    color: colors.textSecondary,
  },
  taglineSmall: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  footer: { gap: spacing.md },
  overline: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 2,
  },
  googleBtn: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  googleBtnText: {
    color: "#050A11",
    fontSize: 16,
    fontWeight: "700",
  },
  error: {
    color: "#F87171",
    fontSize: 13,
    marginTop: spacing.sm,
  },
  legal: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
