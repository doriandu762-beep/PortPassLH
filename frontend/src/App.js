import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_COLOR = {
  ouvert: "#2dd36f",
  fermeture: "#ff9f0a",
  bientot: "#ffd60a",
  ferme: "#ff453a",
};
const STATUS_LABEL = {
  ouvert: "Ouvert aux véhicules",
  fermeture: "Fermeture imminente",
  bientot: "Bientôt ouvert aux véhicules",
  ferme: "Fermé",
};
const STATUS_BADGE = {
  ouvert: "b-good",
  fermeture: "b-warn",
  bientot: "b-soon",
  ferme: "b-bad",
};

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function iconFor(work) {
  const symbol = work.type === "Écluse" ? "⚓" : "🌉";
  return L.divIcon({
    className: "",
    html: `<div style="background:${STATUS_COLOR[work.status]};width:34px;height:34px;border-radius:50%;border:3px solid white;box-shadow:0 6px 18px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:15px">${symbol}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function App() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  const userMarkerRef = useRef(null);
  const lastAlertId = useRef(null);

  const [works, setWorks] = useState([]);
  const [mode, setMode] = useState("truck"); // 'truck' | 'car'
  const [position, setPosition] = useState(null);
  const [gpsLabel, setGpsLabel] = useState("GPS...");
  const [subLabel, setSubLabel] = useState("Préparation...");
  const [alert, setAlert] = useState(null); // {kind:'danger'|'warning', text}
  const [view, setView] = useState("map"); // 'map' | 'stats' | 'history'
  const [historyEntries, setHistoryEntries] = useState([]);
  const [stats, setStats] = useState(null);

  const alertDistance = mode === "truck" ? 2000 : 1000;

  // ----- Map init -----
  useEffect(() => {
    if (mapInstance.current) return;
    const map = L.map(mapRef.current, { zoomControl: false }).setView([49.487, 0.19], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapInstance.current = map;
  }, []);

  // ----- Fetch works -----
  const fetchWorks = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/works`);
      setWorks(r.data);
      setSubLabel("HAROPA connecté");
    } catch (e) {
      setSubLabel("Connexion impossible");
    }
  }, []);

  useEffect(() => {
    fetchWorks();
    const t = setInterval(fetchWorks, 30000);
    return () => clearInterval(t);
  }, [fetchWorks]);

  // ----- Draw / refresh markers when works change -----
  useEffect(() => {
    if (!mapInstance.current) return;
    works.forEach((w) => {
      const existing = markersRef.current[w.id];
      const popup = `<strong>${w.name}</strong><br>${w.type}<br>${STATUS_LABEL[w.status]}`;
      if (existing) {
        existing.setIcon(iconFor(w));
        existing.setPopupContent(popup);
      } else {
        const m = L.marker([w.lat, w.lng], { icon: iconFor(w) })
          .addTo(mapInstance.current)
          .bindPopup(popup);
        markersRef.current[w.id] = m;
      }
    });
  }, [works]);

  // ----- Geolocation -----
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsLabel("GPS indisponible");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setGpsLabel("GPS refusé"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // ----- User marker + alerts -----
  useEffect(() => {
    if (!position || !mapInstance.current) return;
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.circleMarker([position.lat, position.lng], {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillColor: "#4da3ff",
        fillOpacity: 1,
      }).addTo(mapInstance.current);
    } else {
      userMarkerRef.current.setLatLng([position.lat, position.lng]);
    }
  }, [position]);

  useEffect(() => {
    if (!position || works.length === 0) return;
    let closestDanger = null;
    let nearest = null;
    works.forEach((w) => {
      const d = distanceMeters(position.lat, position.lng, w.lat, w.lng);
      if (!nearest || d < nearest.d) nearest = { w, d };
      const danger = w.status === "ferme" || w.status === "fermeture";
      if (danger && d <= alertDistance) {
        if (
          !closestDanger ||
          d < closestDanger.d ||
          (w.status === "ferme" && closestDanger.w.status !== "ferme")
        ) {
          closestDanger = { w, d };
        }
      }
    });
    if (closestDanger) {
      const meters = Math.round(closestDanger.d);
      const w = closestDanger.w;
      if (w.status === "ferme") {
        setAlert({ kind: "danger", text: `⛔ ${w.name} fermé à ${meters} m` });
        if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 300]);
      } else {
        setAlert({ kind: "warning", text: `⚠️ ${w.name} fermeture imminente à ${meters} m` });
        if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
      }
      if (lastAlertId.current !== w.id && "speechSynthesis" in window) {
        const text =
          w.status === "ferme"
            ? `${w.name} fermé dans ${meters} mètres`
            : `${w.name} fermeture imminente dans ${meters} mètres`;
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "fr-FR";
        speechSynthesis.speak(u);
        lastAlertId.current = w.id;
      }
    } else {
      setAlert(null);
      lastAlertId.current = null;
    }
    if (nearest) setGpsLabel(`${nearest.w.name} ${Math.round(nearest.d)} m`);
  }, [position, works, alertDistance]);

  // ----- Actions -----
  const setStatus = async (id, status) => {
    try {
      const r = await axios.put(`${API}/works/${id}/status`, { status });
      setWorks((prev) => prev.map((w) => (w.id === id ? r.data : w)));
    } catch (e) {
      console.error(e);
    }
  };

  const simulateNear = (id) => {
    const w = works.find((x) => x.id === id);
    if (!w) return;
    setPosition({ lat: w.lat + 0.002, lng: w.lng + 0.002 });
    if (mapInstance.current) mapInstance.current.setView([w.lat, w.lng], 15, { animate: true });
  };

  const refreshHaropa = async () => {
    setSubLabel("Synchronisation HAROPA...");
    try {
      await axios.post(`${API}/works/refresh`);
      await fetchWorks();
      setSubLabel("HAROPA synchronisé");
    } catch {
      setSubLabel("Sync échouée");
    }
  };

  const openHistory = async () => {
    setView("history");
    try {
      const r = await axios.get(`${API}/history?limit=200`);
      setHistoryEntries(r.data);
    } catch {}
  };

  const openStats = async () => {
    setView("stats");
    try {
      const r = await axios.get(`${API}/stats`);
      setStats(r.data);
    } catch {}
  };

  // Stats counts (from current works array)
  const liveCounts = works.reduce(
    (acc, w) => {
      acc[w.status] = (acc[w.status] || 0) + 1;
      return acc;
    },
    { ouvert: 0, fermeture: 0, bientot: 0, ferme: 0 }
  );

  const chartData = [
    { name: "Ouvert", value: liveCounts.ouvert, color: "#2dd36f" },
    { name: "Fermeture", value: liveCounts.fermeture, color: "#ff9f0a" },
    { name: "Bientôt", value: liveCounts.bientot, color: "#ffd60a" },
    { name: "Fermé", value: liveCounts.ferme, color: "#ff453a" },
  ];

  return (
    <div className="ppl-root">
      <div ref={mapRef} id="map" data-testid="map-canvas" />

      {/* Top overlay */}
      <div className="overlay">
        <div className="topbar">
          <div className="brand" data-testid="brand-pill">
            <div className="dot" />
            <div>
              <strong>PortPassLH</strong>
              <span data-testid="sub-label">{subLabel}</span>
            </div>
          </div>
          <div className="chip" data-testid="gps-status">{gpsLabel}</div>
        </div>
        <div className="nav-tabs">
          <button
            className={view === "map" ? "tab active" : "tab"}
            onClick={() => setView("map")}
            data-testid="tab-map"
          >Carte</button>
          <button
            className={view === "stats" ? "tab active" : "tab"}
            onClick={openStats}
            data-testid="tab-stats"
          >Stats</button>
          <button
            className={view === "history" ? "tab active" : "tab"}
            onClick={openHistory}
            data-testid="tab-history"
          >Historique</button>
        </div>
        {alert && (
          <div className={`alert ${alert.kind}`} data-testid="proximity-alert">{alert.text}</div>
        )}
      </div>

      {/* Bottom sheet */}
      <div className="sheet">
        <div className="sheet-card">
          <div className="grab" />

          {view === "map" && (
            <>
              <div className="stats-row">
                <div className="stat">
                  <label>Mode</label>
                  <strong data-testid="mode-label">{mode === "truck" ? "Camion" : "Voiture"}</strong>
                </div>
                <div className="stat">
                  <label>Alerte</label>
                  <strong data-testid="distance-label">{alertDistance} m</strong>
                </div>
              </div>
              <div className="actions">
                <button
                  className={mode === "truck" ? "btn-primary" : "btn-dark"}
                  onClick={() => setMode("truck")}
                  data-testid="mode-truck-btn"
                >🚛 Camion</button>
                <button
                  className={mode === "car" ? "btn-primary" : "btn-dark"}
                  onClick={() => setMode("car")}
                  data-testid="mode-car-btn"
                >🚗 Voiture</button>
                <button className="btn-dark" onClick={refreshHaropa} data-testid="refresh-haropa-btn">↻ HAROPA</button>
              </div>
              <div className="legend" data-testid="legend">
                🟢 Ouvert aux véhicules<br />
                🟠 Fermeture imminente<br />
                🟡 Bientôt ouvert aux véhicules<br />
                🔴 Fermé
              </div>
              <div className="card">
                <strong>Test rapide</strong>
                <div className="actions">
                  <button className="btn-dark" onClick={() => simulateNear("pont-rouge")} data-testid="sim-pont-rouge">Pont Rouge</button>
                  <button className="btn-dark" onClick={() => simulateNear("pont-7")} data-testid="sim-pont-7">Pont 7</button>
                  <button className="btn-dark" onClick={() => simulateNear("pont-hode")} data-testid="sim-pont-hode">Hode</button>
                </div>
              </div>
              <div className="card">
                <strong>Ouvrages</strong>
                <div className="works-list" data-testid="works-list">
                  {works.map((w) => (
                    <div key={w.id} className="work-item" data-testid={`work-${w.id}`}>
                      <div className="work-top">
                        <div>
                          <strong>{w.name}</strong>
                          <div className="small">
                            {w.type} • {w.lat.toFixed(5)}, {w.lng.toFixed(5)}
                          </div>
                        </div>
                        <span className={`badge ${STATUS_BADGE[w.status]}`} data-testid={`badge-${w.id}`}>
                          {STATUS_LABEL[w.status]}
                        </span>
                      </div>
                      <div className="actions" style={{ marginTop: 10 }}>
                        <button className="btn-good" onClick={() => setStatus(w.id, "ouvert")} data-testid={`set-ouvert-${w.id}`}>Ouvert</button>
                        <button className="btn-warn" onClick={() => setStatus(w.id, "fermeture")} data-testid={`set-fermeture-${w.id}`}>Fermeture</button>
                        <button className="btn-dark" onClick={() => setStatus(w.id, "bientot")} data-testid={`set-bientot-${w.id}`}>Bientôt</button>
                        <button className="btn-bad" onClick={() => setStatus(w.id, "ferme")} data-testid={`set-ferme-${w.id}`}>Fermé</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {view === "stats" && (
            <div data-testid="stats-view">
              <div className="stats-row">
                <div className="stat"><label>Ouvrages</label><strong>{stats?.total_works ?? works.length}</strong></div>
                <div className="stat"><label>Évén. 24h</label><strong>{stats?.total_events_24h ?? "—"}</strong></div>
              </div>
              <div className="card">
                <strong>Répartition actuelle</strong>
                <div style={{ height: 220, marginTop: 8 }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" stroke="#a6b1c2" fontSize={12} />
                      <YAxis stroke="#a6b1c2" fontSize={12} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#0a0f1c", border: "1px solid rgba(255,255,255,.1)", color: "#fff" }} />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {chartData.map((d, i) => (<Cell key={i} fill={d.color} />))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card">
                <strong>Dernière sync HAROPA</strong>
                <div className="small" data-testid="last-sync">
                  {stats?.last_haropa_sync ? new Date(stats.last_haropa_sync).toLocaleString("fr-FR") : "—"}
                </div>
              </div>
            </div>
          )}

          {view === "history" && (
            <div data-testid="history-view">
              <div className="card">
                <strong>Historique récent</strong>
                <div className="history-list">
                  {historyEntries.length === 0 && <div className="small">Aucun événement.</div>}
                  {historyEntries.map((h) => (
                    <div key={h.id} className="hist-row" data-testid={`hist-${h.id}`}>
                      <div className="hist-time">{new Date(h.changed_at).toLocaleString("fr-FR")}</div>
                      <div>
                        <strong>{h.work_name}</strong> →{" "}
                        <span className={`badge ${STATUS_BADGE[h.status]}`}>{STATUS_LABEL[h.status]}</span>
                      </div>
                      <div className="small">Source: {h.source}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
