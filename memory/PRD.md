# PortPassLH – Mobile App (Expo)

## Context
Native mobile companion app (iOS & Android via Expo) for the existing **PortPassLH** web application. It re-uses the deployed FastAPI backend at:
`https://eb4c5836-043c-4dd0-9b6c-abf3c914bec2.preview.emergentagent.com`

Backend source code is **not** in this repo — the mobile app is a pure frontend consumer.

## Users
Truck drivers, logistics operators and admins of the port of Le Havre (France).

## Core features (implemented)
- **Auth** – Emergent Google OAuth via `expo-web-browser.openAuthSessionAsync`; Bearer token stored in **`expo-secure-store`** (never in `AsyncStorage`). Allowlist enforced server-side (Mrxxdoxdoxx@gmail.com).
- **3 tabs** – Carte, Stats, Historique (bottom tab bar, dark port-blue theme).
- **Interactive map** (`react-native-maps`) – custom dark map style, custom circular markers colored per status.
- **4 statuses** – ouvert (vert #10B981), fermeture imminente (orange #F97316), bientôt ouvert (jaune #EAB308), fermé (rouge #EF4444).
- **GPS + proximity alerts** – `expo-location` watchPositionAsync; Haptics + local notifications (`expo-notifications`) + French TTS (`expo-speech`) when distance ≤ threshold (1000 m voiture / 2000 m camion) and status ≠ ouvert. De-dupe per work to avoid spam.
- **Vehicle mode toggle** – segmented control on the map (Voiture / Camion).
- **Stats screen** – total, counts par statut, événements 24 h, dernière synchro HAROPA.
- **History screen** – 200 derniers changements de statut (pull-to-refresh).
- **Work detail bottom sheet** – tap marker → nom, type, statut, distance, mise à jour, source.
- **Admin endpoints wired** (`PUT /api/works/{id}/status`, `POST /api/works/refresh`) — UI not yet exposed (future).

## Backend endpoints consumed
- `GET  /api/works`
- `GET  /api/stats`
- `GET  /api/history?limit=200`
- `POST /api/auth/session`  (body: `{session_id}`)
- `GET  /api/auth/me`        (Authorization: Bearer …)
- `POST /api/auth/logout`
- `PUT  /api/works/{id}/status`  (admin)
- `POST /api/works/refresh`      (admin)

## Environment variables
- `EXPO_PUBLIC_PORTPASS_BACKEND_URL` – external PortPassLH FastAPI URL.

## Architecture notes
- `expo-router` file-based routing (`app/index.tsx` = login, `app/(tabs)/*` = main app).
- `src/AuthContext.tsx` – auth provider (login / logout / bootstrap `/api/auth/me`).
- `src/api.ts` – thin fetch wrapper that injects `Authorization: Bearer <session_token>` from SecureStore.
- `src/MapView.native.tsx` / `src/MapView.web.tsx` – platform split so web preview does not crash on `react-native-maps`.
- `src/location.ts` – haversine distance, permission requests, proximity alert (haptics + notification + TTS).

## Known limitations
- Web preview: `react-native-maps` replaced by a placeholder (native only).
- Proximity alerts only while app is foregrounded (background location would need a dev build).
