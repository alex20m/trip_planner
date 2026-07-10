import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MapPanel from "@/components/map/MapPanel";
import type { TripEvent } from "@/lib/types";

// Leaflet needs real layout measurements, so it is stubbed out in jsdom; the
// tests assert which events get markers, not how tiles render.
const marker = vi.hoisted(() =>
  vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() }))
);
const polyline = vi.hoisted(() => vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })));
const latLngBounds = vi.hoisted(() => vi.fn(() => ({ pad: vi.fn().mockReturnThis() })));
vi.mock("leaflet", () => {
  const layerGroup = () => ({ addTo: vi.fn().mockReturnThis(), clearLayers: vi.fn() });
  return {
    default: {
      map: vi.fn(() => ({
        setView: vi.fn().mockReturnThis(),
        fitBounds: vi.fn(),
        remove: vi.fn()
      })),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      layerGroup: vi.fn(layerGroup),
      marker,
      polyline,
      divIcon: vi.fn(() => ({})),
      latLngBounds
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

  it("draws a travel leg as two markers linked by a directed line (issue #69)", () => {
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

    // Departure pin, arrival pin, and the direction arrow at the midpoint.
    expect(marker).toHaveBeenCalledWith([60.17, 24.94], expect.anything());
    expect(marker).toHaveBeenCalledWith([65.01, 25.47], expect.anything());
    expect(marker).toHaveBeenCalledWith([(60.17 + 65.01) / 2, (24.94 + 25.47) / 2], expect.anything());
    // The connecting line runs from the start to the end destination.
    expect(polyline).toHaveBeenCalledWith(
      [
        [60.17, 24.94],
        [65.01, 25.47]
      ],
      expect.anything()
    );
    // Both ends are part of the fitted bounds.
    expect(latLngBounds).toHaveBeenCalledWith([
      [60.17, 24.94],
      [65.01, 25.47]
    ]);
    // The travel leg is fully mapped: nothing should be reported as unmapped.
    expect(screen.queryByText(/without a mapped location/i)).not.toBeInTheDocument();
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
});
