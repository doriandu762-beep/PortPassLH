import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import type { Work, VehicleMode } from "./types";
import { normalizeStatus } from "./theme";

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// Haversine distance in metres
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function thresholdForMode(mode: VehicleMode): number {
  return mode === "camion" ? 2000 : 1000;
}

export async function triggerProximityAlert(
  work: Work,
  distance: number,
): Promise<void> {
  const status = normalizeStatus(work.status);
  // Only alert when status is not "ouvert"
  if (status === "ouvert") return;
  const statusLabel =
    status === "ferme"
      ? "fermé"
      : status === "fermeture"
        ? "en fermeture imminente"
        : "bientôt ouvert";

  const phrase = `Attention, ${work.name} est ${statusLabel} à ${Math.round(
    distance,
  )} mètres.`;

  // Haptics
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    /* ignore */
  }

  // Local notification
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${work.name} — ${statusLabel}`,
        body: `À ${Math.round(distance)} m de votre position`,
        sound: true,
      },
      trigger: null,
    });
  } catch {
    /* ignore */
  }

  // Voice
  try {
    Speech.speak(phrase, { language: "fr-FR", rate: 1.0 });
  } catch {
    /* ignore */
  }
}
