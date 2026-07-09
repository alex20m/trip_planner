import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MapPanel from "@/components/map/MapPanel";
import type { TripEvent } from "@/lib/types";

// Leaflet needs real layout measurements, so it is stubbed out in jsdom; the
// tests assert which events get markers, not how tiles render.
const marker = vi.hoisted(() =>
  vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() }))
);
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
      divIcon: vi.fn(() => ({})),
      latLngBounds: vi.fn(() => ({ pad: vi.fn().mockReturnThis() }))
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
    ...overrides
  };
}

describe("MapPanel", () => {
  beforeEach(() => marker.mockClear());

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
});
