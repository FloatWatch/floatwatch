"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";

export function LocationMap({ latitude, longitude, onChange, readOnly = false }: { latitude: number | null; longitude: number | null; onChange?: (latitude: number, longitude: number) => void; readOnly?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const onChangeRef = useRef<(latitude: number, longitude: number) => void>(() => undefined);
  onChangeRef.current = onChange ?? (() => undefined);

  useEffect(() => {
    let disposed = false;
    async function mount() {
      if (!containerRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;
      const hasLocation = latitude != null && longitude != null && latitude >= 32.8 && latitude <= 38.7 && longitude >= 124.0 && longitude <= 132.0;
      const koreaBounds = L.latLngBounds([32.8, 124.0], [38.7, 132.0]);
      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        maxBounds: koreaBounds,
        maxBoundsViscosity: 1,
        minZoom: 7,
      }).setView(hasLocation ? [latitude, longitude] : [36.35, 127.85], hasLocation ? 13 : 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, minZoom: 7, bounds: koreaBounds, noWrap: true, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      if (hasLocation) markerRef.current = createMarker(L, map, latitude, longitude);
      if (!readOnly) map.on("click", (event: { latlng: { lat: number; lng: number } }) => {
        if (!koreaBounds.contains(event.latlng)) return;
        if (markerRef.current) markerRef.current.setLatLng(event.latlng);
        else markerRef.current = createMarker(L, map, event.latlng.lat, event.latlng.lng);
        onChangeRef.current(Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6)));
      });
      mapRef.current = map;
      window.setTimeout(() => map.invalidateSize(), 50);
    }
    void mount();
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);

  useEffect(() => {
    if (latitude == null || longitude == null || !mapRef.current) return;
    if (latitude < 32.8 || latitude > 38.7 || longitude < 124.0 || longitude > 132.0) return;
    if (markerRef.current) markerRef.current.setLatLng([latitude, longitude]);
    else void import("leaflet").then((L) => { if (mapRef.current && !markerRef.current) markerRef.current = createMarker(L, mapRef.current, latitude, longitude); });
    mapRef.current.setView([latitude, longitude], Math.max(mapRef.current.getZoom(), 13), { animate: true });
  }, [latitude, longitude]);

  return <div ref={containerRef} className="media-location-map" aria-label="촬영 위치 선택 지도"/>;
}

function createMarker(L: typeof import("leaflet"), map: LeafletMap, latitude: number, longitude: number) {
  return L.circleMarker([latitude, longitude], { radius: 9, color: "#ffffff", weight: 3, fillColor: "#e66b43", fillOpacity: 1 }).addTo(map);
}
