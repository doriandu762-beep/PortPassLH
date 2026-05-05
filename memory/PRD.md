# PortPassLH – PRD

## Problem statement
Convertir la page HTML PortPassLH V5 (suivi temps réel des ponts/écluses du port du Havre avec alertes GPS) en une vraie app full-stack **React + FastAPI + MongoDB** :
- Backend Python qui scrape la page HAROPA toutes les 5 min et expose une API
- Pas d'authentification (accès libre)
- Fonctionnalités additionnelles : historique des fermetures/ouvertures + statistiques
- Conserver le thème sombre bleu portuaire actuel

## Architecture
- **Backend** (`/app/backend/server.py`, FastAPI + Motor + BeautifulSoup/lxml)
  - Collections MongoDB : `works`, `status_history`, `meta`
  - Seed automatique de 13 ouvrages au démarrage
  - Tâche de fond : sync HAROPA toutes les 300 s (graceful fallback si URL HS)
- **Frontend** (`/app/frontend/src/App.js`, React 19 + Leaflet + Recharts)
  - Carte Leaflet plein écran + panneau latéral glassmorphism
  - Polling `GET /api/works` toutes les 30 s
  - Geolocation GPS + alertes proximité (vibration + speech synthesis FR)
  - 3 vues : Carte, Stats (BarChart Recharts), Historique

## User personas
- **Conducteur camion** : alerte 2000 m sur ponts fermés/fermeture imminente
- **Conducteur voiture** : alerte 1000 m
- **Opérateur portuaire** : met à jour manuellement les statuts via l'UI

## Core requirements (static)
- Liste de 13 ouvrages (ponts + écluse François 1er) avec coordonnées GPS
- 4 statuts : `ouvert` / `fermeture` / `bientot` / `ferme`
- Mode véhicule : truck (2000 m) / car (1000 m)

## Implemented (2026-01-13)
- API REST : `GET /api/works`, `PUT /api/works/{id}/status`, `POST /api/works/refresh`, `GET /api/works/{id}/history`, `GET /api/history`, `GET /api/stats`
- Scraper HAROPA + scheduler 5 min (échec gracieux si URL 404)
- Historique persistant (source = `manual` | `haropa` | `seed`)
- UI dark portuaire identique à la maquette HTML
- Vue Stats avec BarChart 4 statuts + dernière sync HAROPA
- Vue Historique (200 derniers événements)
- Tests backend (7/7) + frontend (Playwright) : 100 %

## Backlog (P1 / P2)
- P1 : Indexes Mongo sur `status_history.changed_at` et `work_id`
- P1 : Migrer scraper HAROPA vers `httpx.AsyncClient` (non-bloquant)
- P1 : Mettre à jour l'URL HAROPA quand la nouvelle page officielle sera identifiée
- P2 : Migrer `on_event` → FastAPI lifespan
- P2 : Notifications push (PWA) + export CSV de l'historique
- P2 : PWA installable + offline cache via service worker

## Next tasks
1. Identifier la nouvelle URL HAROPA active (fournir à l'agent ou ajuster les sélecteurs)
2. Ajouter filtres dans l'historique (par ouvrage, par source, par période)
3. Optionnel : notifications push si fermeture détectée à proximité
