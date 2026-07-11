"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import type { TripEvent } from "@/lib/types";
import { EVENT_COLORS } from "@/lib/types";
import { ExpandIcon, ShrinkIcon } from "@/components/Icons";
import { syncThemeColor } from "@/lib/theme";

// Loaded with next/dynamic({ ssr: false }) from TripView — Leaflet can only
// run in the browser.

// Marker colors per event type; matches the calendar legend (tailwind.config.ts).
const PIN_COLORS: Record<TripEvent["type"], string> = {
  activity: "#3B6EF6",
  travel: "#E8842C",
  accommodation: "#2FA36B"
};

// dx/dy shift the pin by whole pixels via the anchor so co-located events fan
// out instead of stacking into a single visible pin (the offset is constant in
// screen space, so the pins stay separated at every zoom level).
function pinIcon(type: TripEvent["type"], dx = 0, dy = 0) {
  return L.divIcon({
    className: "",
    html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 1C7.3 1 1 7.2 1 14.8 1 25 15 39 15 39s14-14 14-24.2C29 7.2 22.7 1 15 1z"
        fill="${PIN_COLORS[type]}" stroke="white" stroke-width="2"/>
      <circle cx="15" cy="14.5" r="5" fill="white"/>
    </svg>`,
    iconSize: [30, 40],
    iconAnchor: [15 - dx, 39 - dy],
    popupAnchor: [dx, dy - 36]
  });
}

// Pixel radius of the fan-out circle for pins that share a location.
const SPREAD_RADIUS = 14;

// Arrowhead for travel legs: an SVG triangle pointing north, rotated to the
// leg's bearing so the direction of travel is visible on the line itself.
function arrowIcon(bearingDeg: number) {
  return L.divIcon({
    className: "",
    html: `<div style="transform: rotate(${bearingDeg}deg)"><svg width="${ARROW_SIZE}" height="${ARROW_SIZE}" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 2 15 14 9 11 3 14z" fill="${PIN_COLORS.travel}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    </svg></div>`,
    iconSize: [ARROW_SIZE, ARROW_SIZE],
    iconAnchor: [ARROW_SIZE / 2, ARROW_SIZE / 2]
  });
}

const ARROW_SIZE = 28;
// Fraction along a leg where the single direction arrow is drawn: the
// midpoint, so the direction of travel reads clearly without cluttering
// the line with repeated arrowheads.
const ARROW_POSITION = 0.5;

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
  // Travel legs with both ends mapped are drawn as a directed line from the
  // start to the end destination — no pins, the line itself carries the info.
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

    // Collect every pin first so pins that share a location can be fanned out
    // around it — otherwise they stack at the exact same point and only the
    // topmost one can be seen or clicked. Travel legs get no pins at all:
    // they are drawn purely as a directed, clickable line below.
    type Pin = { at: [number, number]; type: TripEvent["type"]; title: string; popup: string };
    const pins: Pin[] = [];

    for (const e of mapped) {
      if (legs.includes(e)) continue;
      const when = format(new Date(e.start_at), "d MMM, HH:mm", { locale: enUS });
      pins.push({
        at: [e.location_lat!, e.location_lng!],
        type: e.type,
        title: e.title,
        popup:
          `<strong>${esc(e.title)}</strong><br/>` +
          `<span style="opacity:.7">${esc(EVENT_COLORS[e.type].label)} · ${esc(when)}</span><br/>` +
          `<span style="opacity:.7">${esc(e.location ?? "")}</span>`
      });
    }

    // ~1 m precision: coordinates from the same location suggestion are
    // identical, but this also catches re-picked locations that round the
    // same way.
    const groups = new Map<string, Pin[]>();
    for (const pin of pins) {
      const key = `${pin.at[0].toFixed(5)},${pin.at[1].toFixed(5)}`;
      const group = groups.get(key);
      if (group) group.push(pin);
      else groups.set(key, [pin]);
    }
    groups.forEach((group) => {
      group.forEach((pin, i) => {
        let dx = 0;
        let dy = 0;
        if (group.length > 1) {
          const angle = (2 * Math.PI * i) / group.length - Math.PI / 2;
          dx = Math.round(SPREAD_RADIUS * Math.cos(angle));
          dy = Math.round(SPREAD_RADIUS * Math.sin(angle));
        }
        L.marker(pin.at, { icon: pinIcon(pin.type, dx, dy), title: pin.title })
          .addTo(layer)
          .bindPopup(pin.popup);
      });
    });

    for (const e of legs) {
      const from: [number, number] = [e.location_lat!, e.location_lng!];
      const to: [number, number] = [e.end_location_lat!, e.end_location_lng!];
      const when = format(new Date(e.start_at), "d MMM, HH:mm", { locale: enUS });
      const popup =
        `<strong>${esc(e.title)}</strong><br/>` +
        `<span style="opacity:.7">${esc(EVENT_COLORS.travel.label)} · ${esc(when)}</span><br/>` +
        `<span style="opacity:.7">${esc(e.location ?? "")} → ${esc(e.end_location ?? "")}</span>`;
      // The visible dashed leg. Not interactive itself: dash gaps and a 3 px
      // stroke are a poor click/tap target, so clicks go to the wider
      // invisible line below instead.
      L.polyline([from, to], {
        color: PIN_COLORS.travel,
        weight: 3,
        opacity: 0.8,
        dashArray: "8 8",
        interactive: false
      }).addTo(layer);
      // Invisible fat click target along the same leg; clicking anywhere on
      // (or near) the line opens the trip info popup at the click point.
      L.polyline([from, to], { color: PIN_COLORS.travel, weight: 20, opacity: 0 })
        .addTo(layer)
        .bindPopup(popup);
      // A single direction arrow at the leg's midpoint, pointing at the
      // destination. Non-interactive so it never swallows clicks meant for
      // the line. Position and rotation are both computed in projected
      // Web-Mercator space: Leaflet draws the leg as a straight segment in
      // that space, and Mercator's y-axis is nonlinear in latitude, so
      // interpolating raw lat/lng would put the arrow visibly off the drawn
      // line on long legs.
      const proj = L.Projection.SphericalMercator;
      const p1 = proj.project(L.latLng(from));
      const p2 = proj.project(L.latLng(to));
      const at = proj.unproject(p1.add(p2.subtract(p1).multiplyBy(ARROW_POSITION)));
      // Projected y grows northward, so this is the bearing clockwise from north.
      const dir = (Math.atan2(p2.x - p1.x, p2.y - p1.y) * 180) / Math.PI;
      L.marker(at, { icon: arrowIcon(dir), interactive: false, keyboard: false }).addTo(layer);
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
      // Re-assert the status-bar tint: after this full-screen overlay closes,
      // iOS leaves the status-bar region stuck on the light style it picked up
      // from the map. syncThemeColor forces a repaint by changing the color;
      // the second, delayed call covers WebKit re-evaluating the bar once the
      // overlay teardown and scroll restoration have settled.
      syncThemeColor();
      window.setTimeout(() => syncThemeColor(), 400);
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
      {/* The inline-card vs. overlay styles live on this wrapper, NOT on the
          map div: Leaflet adds its own classes to the map div imperatively,
          and a React className update would wipe them, breaking the map
          until remount (the container div's className must stay constant). */}
      <div
        className={
          fullscreen
            ? "fixed inset-0 z-50 bg-paper"
            : "relative h-[26rem] w-full overflow-hidden rounded-2xl border border-ink/10 shadow-soft sm:h-[32rem]"
        }
      >
        <div
          ref={containerRef}
          role="application"
          aria-label="Map of event locations"
          className="h-full w-full"
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
