import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import L from "leaflet";
import MapPanel from "@/components/map/MapPanel";
import type { TripEvent } from "@/lib/types";

// Leaflet needs real layout measurements, so it is stubbed out in jsdom; the
// tests assert which events get markers, not how tiles render.
const marker = vi.hoisted(() =>
  vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() }))
);
const polyline = vi.hoisted(() =>
  vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() }))
);
const latLngBounds = vi.hoisted(() => vi.fn(() => ({ pad: vi.fn().mockReturnThis() })));
const invalidateSize = vi.hoisted(() => vi.fn());
const divIcon = vi.hoisted(() => vi.fn((_options: { iconAnchor: [number, number] }) => ({})));
vi.mock("leaflet", async () => {
  // Real coordinate math (latLng, projection) is kept: the arrow-placement
  // logic under test depends on Leaflet's actual Web-Mercator projection.
  const actual = await vi.importActual<typeof import("leaflet")>("leaflet");
  const layerGroup = () => ({ addTo: vi.fn().mockReturnThis(), clearLayers: vi.fn() });
  return {
    default: {
      map: vi.fn(() => ({
        setView: vi.fn().mockReturnThis(),
        fitBounds: vi.fn(),
        invalidateSize,
        remove: vi.fn()
      })),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      layerGroup: vi.fn(layerGroup),
      marker,
      polyline,
      divIcon,
      latLngBounds,
      latLng: actual.latLng,
      Projection: actual.Projection
    }
  };
});
vi.mock("leaflet/dist/leaflet.css", () => ({}));

function makeEvent(overrides: Partial<TripEvent>): TripEvent {
  return {
    id: "e1",
    trip_id: "t1",
    title: "Museum",
    type: "activity",
    start_at: "2026-08-05T12:00:00Z",
    end_at: null,
    location: null,
    location_lat: null,
    location_lng: null,
    description: null,
    all_day: false,
    ...overrides
  };
}

describe("MapPanel", () => {
  beforeEach(() => {
    marker.mockClear();
    polyline.mockClear();
    latLngBounds.mockClear();
    invalidateSize.mockClear();
    divIcon.mockClear();
  });

  it("adds a marker for every event that has coordinates", () => {
    render(
      <MapPanel
        events={[
          makeEvent({ id: "e1", location: "Colosseum", location_lat: 41.89, location_lng: 12.49 }),
          makeEvent({ id: "e2", location: "Pantheon", location_lat: 41.898, location_lng: 12.476 })
        ]}
      />
    );

    expect(marker).toHaveBeenCalledTimes(2);
    expect(marker).toHaveBeenCalledWith([41.89, 12.49], expect.anything());
    expect(marker).toHaveBeenCalledWith([41.898, 12.476], expect.anything());
  });

  it("counts events without coordinates instead of plotting them", () => {
    render(
      <MapPanel
        events={[
          makeEvent({ id: "e1", location: "Colosseum", location_lat: 41.89, location_lng: 12.49 }),
          makeEvent({ id: "e2", location: "typed by hand" }),
          makeEvent({ id: "e3" })
        ]}
      />
    );

    expect(marker).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/2 events without a mapped location/i)).toBeInTheDocument();
  });

  it("explains the empty state when the trip has no events", () => {
    render(<MapPanel events={[]} />);
    expect(screen.getByText(/no events yet/i)).toBeInTheDocument();
    expect(marker).not.toHaveBeenCalled();
  });

  it("draws a travel leg as a clickable directed line without endpoint pins", () => {
    render(
      <MapPanel
        events={[
          makeEvent({
            id: "leg",
            type: "travel",
            title: "Train north",
            location: "Helsinki",
            location_lat: 60.17,
            location_lng: 24.94,
            end_location: "Oulu",
            end_location_lat: 65.01,
            end_location_lng: 25.47
          })
        ]}
      />
    );

    // No departure/arrival pins — the only marker is the single direction
    // arrow along the leg, and it must not intercept clicks meant for the line.
    expect(marker).toHaveBeenCalledTimes(1);
    const [arrowAt, arrowOptions] = marker.mock.calls[0] as unknown as [L.LatLng, { interactive?: boolean }];
    expect(arrowOptions).toMatchObject({ interactive: false });
    // The arrow sits at the midpoint of the leg *as drawn*: the line is
    // straight in projected Web-Mercator space, so the midpoint must be
    // computed there too — the raw lat/lng midpoint would sit off the line.
    const proj = L.Projection.SphericalMercator;
    const p1 = proj.project(L.latLng(60.17, 24.94));
    const p2 = proj.project(L.latLng(65.01, 25.47));
    const onLineMid = proj.unproject(p1.add(p2.subtract(p1).multiplyBy(0.5)));
    expect(arrowAt.lat).toBeCloseTo(onLineMid.lat, 10);
    expect(arrowAt.lng).toBeCloseTo(onLineMid.lng, 10);
    // Regression guard: on a long north-south leg the on-line midpoint is
    // measurably north of the naive lat average.
    expect(arrowAt.lat).toBeGreaterThan((60.17 + 65.01) / 2 + 0.05);
    // The connecting line runs from the start to the end destination: a
    // visible dashed line plus a wider invisible click target that opens the
    // trip info popup.
    const latlngs = [
      [60.17, 24.94],
      [65.01, 25.47]
    ];
    expect(polyline).toHaveBeenCalledWith(latlngs, expect.objectContaining({ dashArray: "8 8", interactive: false }));
    expect(polyline).toHaveBeenCalledWith(latlngs, expect.objectContaining({ opacity: 0 }));
    const popups = polyline.mock.results
      .flatMap((r) => (r.value as { bindPopup: ReturnType<typeof vi.fn> }).bindPopup.mock.calls)
      .map((call) => String(call[0]));
    expect(popups).toHaveLength(1);
    expect(popups[0]).toContain("Train north");
    expect(popups[0]).toContain("Helsinki");
    expect(popups[0]).toContain("Oulu");
    // Both ends are part of the fitted bounds.
    expect(latLngBounds).toHaveBeenCalledWith([
      [60.17, 24.94],
      [65.01, 25.47]
    ]);
    // The travel leg is fully mapped: nothing should be reported as unmapped.
    expect(screen.queryByText(/without a mapped location/i)).not.toBeInTheDocument();
  });

  it("fans out pins for events at the same location so each stays visible", () => {
    render(
      <MapPanel
        events={[
          makeEvent({ id: "e1", title: "Lunch", location: "Colosseum", location_lat: 41.89, location_lng: 12.49 }),
          makeEvent({ id: "e2", title: "Tour", location: "Colosseum", location_lat: 41.89, location_lng: 12.49 })
        ]}
      />
    );

    // Both events get their own marker at the shared coordinates…
    expect(marker).toHaveBeenCalledTimes(2);
    expect(marker).toHaveBeenNthCalledWith(1, [41.89, 12.49], expect.objectContaining({ title: "Lunch" }));
    expect(marker).toHaveBeenNthCalledWith(2, [41.89, 12.49], expect.objectContaining({ title: "Tour" }));
    // …and the icons are anchored apart so the pins don't cover each other.
    const anchors = divIcon.mock.calls.map((call) => call[0].iconAnchor);
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).not.toEqual(anchors[1]);
  });

  it("keeps a single pin unshifted when its location is unique", () => {
    render(
      <MapPanel
        events={[makeEvent({ id: "e1", location: "Colosseum", location_lat: 41.89, location_lng: 12.49 })]}
      />
    );

    expect(divIcon).toHaveBeenCalledTimes(1);
    expect(divIcon.mock.calls[0][0].iconAnchor).toEqual([15, 39]);
  });

  it("does not draw a line for a travel event missing end coordinates", () => {
    render(
      <MapPanel
        events={[
          makeEvent({ id: "leg", type: "travel", location: "Helsinki", location_lat: 60.17, location_lng: 24.94 })
        ]}
      />
    );

    expect(marker).toHaveBeenCalledTimes(1);
    expect(polyline).not.toHaveBeenCalled();
  });

  it("toggles the map into and out of full screen", () => {
    render(<MapPanel events={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /view map in full screen/i }));
    // Leaflet must re-measure the container after the layout change.
    expect(invalidateSize).toHaveBeenCalled();
    // The overlay must NOT lock body scroll: toggling body overflow makes iOS
    // re-evaluate the standalone-PWA viewport, which can flip the status bar
    // to its default white and leave it stuck after the overlay closes.
    expect(document.body.style.overflow).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /exit full screen/i }));
    expect(screen.getByRole("button", { name: /view map in full screen/i })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps an app-colored bar above the full-screen map so the iOS status bar never flips", () => {
    render(<MapPanel events={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /view map in full screen/i }));
    // iOS derives the standalone status-bar color from the page content at the
    // top of the viewport. The exit button's paper-colored header strip must
    // sit above the map so the light map tiles never touch the top edge.
    const exit = screen.getByRole("button", { name: /exit full screen/i });
    const header = exit.parentElement!;
    expect(header.className).toContain("bg-paper");
    const overlay = header.parentElement!;
    expect(overlay.className).toContain("flex-col");
    expect(overlay.firstElementChild).toBe(header);
  });

  it("keeps Leaflet's imperatively added classes on the map container across the full-screen toggle", () => {
    render(<MapPanel events={[]} />);
    // Leaflet adds classes like this to the container it is mounted on; a
    // React className rewrite on toggle would wipe them and break the map
    // until the page is reloaded.
    const container = screen.getByRole("application");
    container.classList.add("leaflet-container");

    fireEvent.click(screen.getByRole("button", { name: /view map in full screen/i }));
    expect(container).toHaveClass("leaflet-container");

    fireEvent.click(screen.getByRole("button", { name: /exit full screen/i }));
    expect(container).toHaveClass("leaflet-container");
  });

  it("exits full screen when Escape is pressed", () => {
    render(<MapPanel events={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /view map in full screen/i }));
    expect(screen.getByRole("button", { name: /exit full screen/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: /view map in full screen/i })).toBeInTheDocument();
  });
});
