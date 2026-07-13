import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import LocationPreviewMap from "@/components/map/LocationPreviewMap";

// Leaflet needs real layout measurements, so it is stubbed out in jsdom; the
// tests assert which points get markers and how the view is framed, not how
// tiles render.
const marker = vi.hoisted(() => vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })));
const setView = vi.hoisted(() => vi.fn());
const fitBounds = vi.hoisted(() => vi.fn());
const latLngBounds = vi.hoisted(() => vi.fn(() => ({ pad: vi.fn().mockReturnThis() })));
const clearLayers = vi.hoisted(() => vi.fn());
const mapOptions = vi.hoisted(() => vi.fn());
vi.mock("leaflet", () => {
  const layerGroup = () => ({ addTo: vi.fn().mockReturnThis(), clearLayers });
  return {
    default: {
      map: vi.fn((_el: HTMLElement, options: unknown) => {
        mapOptions(options);
        return { setView, fitBounds, remove: vi.fn() };
      }),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      layerGroup: vi.fn(layerGroup),
      marker,
      divIcon: vi.fn(() => ({})),
      latLngBounds
    }
  };
});
vi.mock("leaflet/dist/leaflet.css", () => ({}));

describe("LocationPreviewMap", () => {
  beforeEach(() => {
    marker.mockClear();
    setView.mockClear();
    fitBounds.mockClear();
    latLngBounds.mockClear();
    clearLayers.mockClear();
    mapOptions.mockClear();
  });

  it("centers on a single picked place and pins it", () => {
    render(<LocationPreviewMap points={[{ lat: 60.17, lng: 24.94, label: "Helsinki, Finland" }]} />);

    expect(marker).toHaveBeenCalledTimes(1);
    expect(marker).toHaveBeenCalledWith([60.17, 24.94], expect.objectContaining({ title: "Helsinki, Finland" }));
    expect(setView).toHaveBeenCalledWith([60.17, 24.94], expect.any(Number));
    expect(fitBounds).not.toHaveBeenCalled();
  });

  it("fits both ends of a travel leg into view with a pin each", () => {
    render(
      <LocationPreviewMap
        points={[
          { lat: 60.17, lng: 24.94, label: "From: Helsinki, Finland" },
          { lat: 65.01, lng: 25.47, label: "To: Oulu, Finland" }
        ]}
      />
    );

    expect(marker).toHaveBeenCalledTimes(2);
    expect(marker).toHaveBeenCalledWith([60.17, 24.94], expect.objectContaining({ title: "From: Helsinki, Finland" }));
    expect(marker).toHaveBeenCalledWith([65.01, 25.47], expect.objectContaining({ title: "To: Oulu, Finland" }));
    expect(latLngBounds).toHaveBeenCalledWith([
      [60.17, 24.94],
      [65.01, 25.47]
    ]);
    expect(fitBounds).toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();
  });

  it("replaces the pin when a different place is picked", () => {
    const { rerender } = render(
      <LocationPreviewMap points={[{ lat: 60.17, lng: 24.94, label: "Helsinki, Finland" }]} />
    );
    rerender(<LocationPreviewMap points={[{ lat: 41.89, lng: 12.49, label: "Rome, Italy" }]} />);

    // The old marker layer is cleared before the new pin is added, and the
    // view recenters on the newly picked place.
    expect(clearLayers).toHaveBeenCalled();
    expect(marker).toHaveBeenLastCalledWith([41.89, 12.49], expect.objectContaining({ title: "Rome, Italy" }));
    expect(setView).toHaveBeenLastCalledWith([41.89, 12.49], expect.any(Number));
  });

  it("keeps wheel zoom off so the modal keeps scrolling normally", () => {
    render(<LocationPreviewMap points={[{ lat: 60.17, lng: 24.94, label: "Helsinki, Finland" }]} />);

    expect(mapOptions).toHaveBeenCalledWith(expect.objectContaining({ scrollWheelZoom: false }));
  });
});
