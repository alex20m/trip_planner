"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Loaded with next/dynamic({ ssr: false }) from EventModal — Leaflet can only
// run in the browser.

// A confirmed place to preview: coordinates straight from the picked
// geocoder suggestion, labelled with the place name (travel legs prefix
// "From:"/"To:" so the two pins stay distinguishable).
export interface PreviewPoint {
  lat: number;
  lng: number;
  label: string;
}

// Same pin shape as the trip map, in a single neutral accent color — the
// preview confirms *where* a place is, not what type of event it belongs to.
const PIN_COLOR = "#3B6EF6";

function pinIcon() {
  return L.divIcon({
    className: "",
    html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 1C7.3 1 1 7.2 1 14.8 1 25 15 39 15 39s14-14 14-24.2C29 7.2 22.7 1 15 1z"
        fill="${PIN_COLOR}" stroke="white" stroke-width="2"/>
      <circle cx="15" cy="14.5" r="5" fill="white"/>
    </svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 39]
  });
}

// City-level suggestions deserve a city-level frame: close enough to
// recognise the place, wide enough to see the surrounding region and catch
// a same-named town on the wrong continent.
const SINGLE_POINT_ZOOM = 9;

export default function LocationPreviewMap({ points }: { points: PreviewPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Wheel zoom stays off: the map sits inside a scrollable modal, and
    // hijacking the wheel mid-scroll to zoom the map is disorienting. The
    // +/- controls and pinch zoom still work.
    const map = L.map(containerRef.current, { scrollWheelZoom: false, worldCopyJump: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer || points.length === 0) return;
    layer.clearLayers();
    for (const p of points) {
      L.marker([p.lat, p.lng], { icon: pinIcon(), title: p.label }).addTo(layer);
    }
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], SINGLE_POINT_ZOOM);
    } else {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])).pad(0.2), {
        maxZoom: SINGLE_POINT_ZOOM
      });
    }
  }, [points]);

  return (
    <div className="relative h-44 w-full overflow-hidden rounded-2xl border border-ink/10">
      <div
        ref={containerRef}
        role="application"
        aria-label="Map preview of the chosen location"
        className="h-full w-full"
      />
    </div>
  );
}
