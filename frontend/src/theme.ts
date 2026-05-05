// Design tokens — PortPassLH (dark nautical)
export const colors = {
  bg: "#050A11",
  surface: "#0C1522",
  surfaceElevated: "#132135",
  border: "#1E2F45",
  borderFocus: "#3B82F6",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  textInverse: "#050A11",
  brand: "#2563EB",
  brandActive: "#1D4ED8",
  accent: "#0EA5E9",
};

export type StatusKey = "ouvert" | "fermeture" | "bientot" | "ferme";

export const statusMeta: Record<
  StatusKey,
  { color: string; bg: string; label: string }
> = {
  ouvert: { color: "#10B981", bg: "rgba(16,185,129,0.15)", label: "Ouvert" },
  fermeture: {
    color: "#F97316",
    bg: "rgba(249,115,22,0.15)",
    label: "Fermeture imminente",
  },
  bientot: {
    color: "#EAB308",
    bg: "rgba(234,179,8,0.15)",
    label: "Bientôt ouvert",
  },
  ferme: { color: "#EF4444", bg: "rgba(239,68,68,0.15)", label: "Fermé" },
};

// Normalize backend status strings → StatusKey
export function normalizeStatus(raw?: string): StatusKey {
  if (!raw) return "ouvert";
  const s = raw.toLowerCase();
  if (s.startsWith("ferme") && !s.startsWith("fermet")) return "ferme";
  if (s.startsWith("fermet") || s.includes("imminent")) return "fermeture";
  if (s.startsWith("bient") || s.includes("soon")) return "bientot";
  return "ouvert";
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};
