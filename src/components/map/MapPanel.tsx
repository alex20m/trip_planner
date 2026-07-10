"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import type { TripEvent } from "@/lib/types";
import { EVENT_COLORS } from "@/lib/types";
import { ExpandIcon, ShrinkIcon } from "@/components/Icons";

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

// Arrowhead for travel legs: an SVG triangle pointing north, rotated to the
// leg's bearing so the direction of travel is visible on the line itself.
function arrowIcon(bearingDeg: number) {
  return L.divIcon({
    className: "",
    html: `<div style="transform: rotate(${bearingDeg}deg)"><svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 2 15 14 9 11 3 14z" fill="${PIN_COLORS.travel}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    </svg></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

// Compass bearing (degrees clockwise from north) from one point to another,
// with the longitude delta corrected for latitude so the on-screen arrow
// matches the drawn line. Good enough for a display arrow.
function bearing(from: [number, number], to: [number, number]): number {
  const midLat = ((from[0] + to[0]) / 2) * (Math.PI / 180);
  return (Math.atan2((to[1] - from[1]) * Math.cos(midLat), to[0] - from[0]) * 180) / Math.PI;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default function MapPanel({ events }: { events: TripEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  // A fixed overlay rather than the Fullscreen API: iOS Safari has no element
  // fullscreen, and this way Escape/exit behavior is identical everywhere.
  const [fullscreen, setFullscreen] = useState(false);

  const mapped = useMemo(
    () => events.filter((e) => e.location_lat != null && e.location_lng != null),
    [events]
  );
  // Travel legs with both ends mapped get an arrival marker and a directed
  // line from start to end destination.
  const legs = useMemo(
    () =>
      events.filter(
        (e) =>
          e.type === "travel" &&
          e.location_lat != null &&
          e.location_lng != null &&
          e.end_location_lat != null &&
          e.end_location_lng != null
      ),
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
      const isLeg = legs.includes(e);
      const marker = L.marker([e.location_lat!, e.location_lng!], {
        icon: pinIcon(e.type),
        title: e.title
      }).addTo(layer);
      marker.bindPopup(
        `<strong>${esc(e.title)}</strong><br/>` +
          `<span style="opacity:.7">${esc(EVENT_COLORS[e.type].label)} · ${esc(when)}</span><br/>` +
          `<span style="opacity:.7">${esc(isLeg ? `Departure · ${e.location ?? ""}` : (e.location ?? ""))}</span>`
      );
    }

    for (const e of legs) {
      const from: [number, number] = [e.location_lat!, e.location_lng!];
      const to: [number, number] = [e.end_location_lat!, e.end_location_lng!];
      const when = format(new Date(e.start_at), "d MMM, HH:mm", { locale: enUS });
      const arrival = L.marker(to, { icon: pinIcon("travel"), title: e.title }).addTo(layer);
      arrival.bindPopup(
        `<strong>${esc(e.title)}</strong><br/>` +
          `<span style="opacity:.7">${esc(EVENT_COLORS.travel.label)} · ${esc(when)}</span><br/>` +
          `<span style="opacity:.7">Arrival · ${esc(e.end_location ?? "")}</span>`
      );
      L.polyline([from, to], {
        color: PIN_COLORS.travel,
        weight: 3,
        opacity: 0.75,
        dashArray: "8 8"
      }).addTo(layer);
      // Direction arrow halfway along the leg, pointing at the destination.
      const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      L.marker(mid, { icon: arrowIcon(bearing(from, to)), interactive: false, keyboard: false }).addTo(layer);
    }

    const points = [
      ...mapped.map((e) => [e.location_lat!, e.location_lng!] as [number, number]),
      ...legs.map((e) => [e.end_location_lat!, e.end_location_lng!] as [number, number])
    ];
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds.pad(0.2), { maxZoom: 14 });
  }, [mapped, legs]);

  // Leaflet sizes its tile grid to the container, so it must re-measure when
  // the map jumps between the inline card and the full-screen overlay.
  useEffect(() => {
    mapRef.current?.invalidateSize();
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

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
      <div className={fullscreen ? "fixed inset-0 z-50 bg-paper" : "relative"}>
        <div
          ref={containerRef}
          role="application"
          aria-label="Map of event locations"
          className={
            fullscreen
              ? "h-full w-full"
              : "h-[26rem] w-full overflow-hidden rounded-2xl border border-ink/10 shadow-soft sm:h-[32rem]"
          }
        />
        <button
          type="button"
          onClick={() => setFullscreen((f) => !f)}
          aria-label={fullscreen ? "Exit full screen" : "View map in full screen"}
          title={fullscreen ? "Exit full screen (Esc)" : "View map in full screen"}
          className="absolute right-3 top-3 z-[1000] rounded-xl border border-ink/10 bg-paper/95 p-2 text-ink shadow-soft transition-colors duration-150 hover:bg-paper"
        >
          {fullscreen ? <ShrinkIcon className="h-5 w-5" /> : <ExpandIcon className="h-5 w-5" />}
        </button>
      </div>
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
