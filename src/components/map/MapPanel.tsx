"use client";
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import type { TripEvent } from "@/lib/types";
import { EVENT_COLORS } from "@/lib/types";

// Loaded with next/dynamic({ ssr: false }) from TripView — Leaflet can only
// run in the browser.

// Marker colors per event type; matches the calendar legend (tailwind.config.ts).
const PIN_COLORS: Record<TripEvent["type"], string> = {
  activity: "#3B6EF6",
  travel: "#E8842C",
  accommodation: "#2FA36B"
};

function pinIcon(type: TripEvent["type"]) {
  return L.divIcon({
    className: "",
    html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 1C7.3 1 1 7.2 1 14.8 1 25 15 39 15 39s14-14 14-24.2C29 7.2 22.7 1 15 1z"
        fill="${PIN_COLORS[type]}" stroke="white" stroke-width="2"/>
      <circle cx="15" cy="14.5" r="5" fill="white"/>
    </svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 39],
    popupAnchor: [0, -36]
  });
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default function MapPanel({ events }: { events: TripEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  const mapped = useMemo(
    () => events.filter((e) => e.location_lat != null && e.location_lng != null),
    [events]
  );
  const unmapped = events.length - mapped.length;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true, worldCopyJump: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    map.setView([20, 0], 2);
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
    if (!map || !layer) return;
    layer.clearLayers();
    if (mapped.length === 0) return;

    for (const e of mapped) {
      const when = format(new Date(e.start_at), "d MMM, HH:mm", { locale: enUS });
      const marker = L.marker([e.location_lat!, e.location_lng!], {
        icon: pinIcon(e.type),
        title: e.title
      }).addTo(layer);
      marker.bindPopup(
        `<strong>${esc(e.title)}</strong><br/>` +
          `<span style="opacity:.7">${esc(EVENT_COLORS[e.type].label)} · ${esc(when)}</span><br/>` +
          `<span style="opacity:.7">${esc(e.location ?? "")}</span>`
      );
    }
    const bounds = L.latLngBounds(mapped.map((e) => [e.location_lat!, e.location_lng!] as [number, number]));
    map.fitBounds(bounds.pad(0.2), { maxZoom: 14 });
  }, [mapped]);

  return (
    <div>
      {unmapped > 0 && (
        <p className="mb-3 text-sm text-ink/60">
          {unmapped} event{unmapped === 1 ? "" : "s"} without a mapped location {unmapped === 1 ? "is" : "are"} not
          shown. Pick the location from the suggestions when editing an event to place it on the map.
        </p>
      )}
      {events.length === 0 && (
        <p className="mb-3 text-sm text-ink/60">No events yet — add events with a location to see them here.</p>
      )}
      <div
        ref={containerRef}
        role="application"
        aria-label="Map of event locations"
        className="h-[26rem] w-full overflow-hidden rounded-2xl border border-ink/10 shadow-soft sm:h-[32rem]"
      />
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink/60">
        {(Object.keys(EVENT_COLORS) as TripEvent["type"][]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIN_COLORS[t] }} />
            {EVENT_COLORS[t].label}
          </span>
        ))}
      </div>
    </div>
  );
}
