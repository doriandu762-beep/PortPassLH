import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { Work } from "./types";
import { normalizeStatus, statusMeta } from "./theme";

interface Props {
  works: Work[];
  userLoc: { latitude: number; longitude: number } | null;
  onMarkerPress?: (workId: string) => void;
  testID?: string;
}

const INITIAL_LAT = 49.4875;
const INITIAL_LNG = 0.18;
const INITIAL_ZOOM = 11;

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
<style>
  html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#050A11; }
  .marker { width: 26px; height: 26px; border-radius: 13px; border: 2px solid #ffffff; display:flex; align-items:center; justify-content:center; color:#050A11; font-weight:900; font-size:11px; font-family: -apple-system, system-ui, sans-serif; }
  .pulse { animation: pulse 1.6s infinite; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); } 70% { box-shadow: 0 0 0 14px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }
  .leaflet-popup-content-wrapper { background:#0C1522; color:#F8FAFC; border:1px solid #1E2F45; border-radius:10px; }
  .leaflet-popup-tip { background:#0C1522; }
  .leaflet-popup-content { margin: 10px 12px; font-family: -apple-system, system-ui, sans-serif; font-size:13px; }
  .leaflet-control-attribution { background: rgba(5,10,17,0.8) !important; color:#64748B !important; }
  .leaflet-control-attribution a { color:#94A3B8 !important; }
  .leaflet-bar a, .leaflet-bar a:hover { background-color:#0C1522 !important; color:#F8FAFC !important; border-bottom-color:#1E2F45 !important; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
  var map = L.map('map', { zoomControl: true }).setView([${INITIAL_LAT}, ${INITIAL_LNG}], ${INITIAL_ZOOM});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '© OpenStreetMap · CartoDB' }).addTo(map);
  var markersLayer = L.layerGroup().addTo(map);
  var userMarker = null;
  window.addEventListener('message', function (ev) {
    try {
      var msg = JSON.parse(ev.data);
      if (msg.type === 'markers') setMarkers(msg.data);
      if (msg.type === 'user') setUserLocation(msg.data);
      if (msg.type === 'center') { if (userMarker) map.flyTo(userMarker.getLatLng(), 14, { duration: 0.6 }); }
    } catch (e) {}
  });
  function setMarkers(works) {
    markersLayer.clearLayers();
    works.forEach(function (w) {
      var pulse = w.status !== 'ouvert' ? ' pulse' : '';
      var iconHtml = '<div class="marker' + pulse + '" style="background:' + w.color + ';">' + (w.type === 'Écluse' ? 'É' : 'P') + '</div>';
      var icon = L.divIcon({ html: iconHtml, className: '', iconSize: [26, 26], iconAnchor: [13, 13] });
      var m = L.marker([w.lat, w.lng], { icon: icon }).bindPopup('<b>' + w.name + '</b><br/>' + (w.statusLabel || ''));
      m.on('click', function () { window.parent && window.parent.postMessage(JSON.stringify({ type: 'marker', id: w.id }), '*'); });
      markersLayer.addLayer(m);
    });
  }
  function setUserLocation(loc) {
    if (!loc) return;
    if (userMarker) userMarker.setLatLng([loc.latitude, loc.longitude]);
    else {
      var icon = L.divIcon({ html: '<div style="width:18px;height:18px;border-radius:9px;background:#3B82F6;border:3px solid #ffffff;box-shadow:0 0 12px rgba(59,130,246,0.8);"></div>', className: '', iconSize: [18, 18], iconAnchor: [9, 9] });
      userMarker = L.marker([loc.latitude, loc.longitude], { icon: icon }).addTo(map);
    }
  }
  window.parent && window.parent.postMessage(JSON.stringify({ type: 'ready' }), '*');
</script>
</body>
</html>`;

export default function LeafletMap({ works, userLoc, onMarkerPress, testID }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef(false);

  const decoratedWorks = useMemo(
    () =>
      works.map((w) => {
        const status = normalizeStatus(w.status);
        return {
          id: w.id,
          name: w.name,
          type: w.type,
          status,
          statusLabel: statusMeta[status].label,
          color: statusMeta[status].color,
          lat: w.lat,
          lng: w.lng,
        };
      }),
    [works],
  );

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "ready") {
          ready.current = true;
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ type: "markers", data: decoratedWorks }),
            "*",
          );
          if (userLoc) {
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ type: "user", data: userLoc }),
              "*",
            );
          }
        } else if (msg.type === "marker") {
          onMarkerPress?.(msg.id);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [decoratedWorks, userLoc, onMarkerPress]);

  useEffect(() => {
    if (!ready.current) return;
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ type: "markers", data: decoratedWorks }),
      "*",
    );
  }, [decoratedWorks]);

  useEffect(() => {
    if (!ready.current || !userLoc) return;
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ type: "user", data: userLoc }),
      "*",
    );
  }, [userLoc]);

  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      {/* eslint-disable-next-line */}
      <iframe
        ref={iframeRef}
        srcDoc={HTML}
        style={{
          border: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "#050A11",
        }}
        title="map"
      />
    </View>
  );
}
