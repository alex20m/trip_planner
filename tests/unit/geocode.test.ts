import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchPlaces, reverseGeocode } from "@/lib/geocode";

function mockFetch(results: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => results });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("searchPlaces", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns full display names for exact place search", async () => {
    const fetchMock = mockFetch([
      { display_name: "Colosseum, Rome, Lazio, Italy", lat: "41.8902", lon: "12.4922" }
    ]);

    const places = await searchPlaces("colosseum");

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain("featuretype");
    expect(places).toEqual([{ name: "Colosseum, Rome, Lazio, Italy", lat: 41.8902, lng: 12.4922 }]);
  });

  it("searches settlements and labels them City, Country when cityLevel is set", async () => {
    const fetchMock = mockFetch([
      {
        display_name: "Helsinki, Uusimaa, Southern Finland, Mainland Finland, Finland",
        name: "Helsinki",
        lat: "60.1699",
        lon: "24.9384",
        address: { country: "Finland" }
      }
    ]);

    const places = await searchPlaces("helsinki", undefined, { cityLevel: true });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("featuretype=settlement");
    expect(url).toContain("addressdetails=1");
    expect(places).toEqual([{ name: "Helsinki, Finland", lat: 60.1699, lng: 24.9384 }]);
  });

  it("collapses settlement results that shorten to the same label", async () => {
    mockFetch([
      { display_name: "Rome, Lazio, Italy", name: "Rome", lat: "41.89", lon: "12.48", address: { country: "Italy" } },
      { display_name: "Rome, Lazio, Italy", name: "Rome", lat: "41.90", lon: "12.49", address: { country: "Italy" } }
    ]);

    const places = await searchPlaces("rome", undefined, { cityLevel: true });

    expect(places).toEqual([{ name: "Rome, Italy", lat: 41.89, lng: 12.48 }]);
  });

  it("falls back to the display name when address details are missing", async () => {
    mockFetch([{ display_name: "Atlantis", lat: "0", lon: "0" }]);

    const places = await searchPlaces("atlantis", undefined, { cityLevel: true });

    expect(places).toEqual([{ name: "Atlantis", lat: 0, lng: 0 }]);
  });
});

function mockReverse(result: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("reverseGeocode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names a dropped pin City, Country and keeps the clicked coordinates", async () => {
    const fetchMock = mockReverse({
      display_name: "Helsinki, Uusimaa, Finland",
      name: "Helsinki",
      lat: "60.2",
      lon: "24.9",
      address: { country: "Finland" }
    });

    const place = await reverseGeocode(60.1699, 24.9384, undefined, { cityLevel: true });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/reverse");
    expect(url).toContain("lat=60.1699");
    expect(url).toContain("lon=24.9384");
    expect(url).toContain("zoom=10");
    // The label comes from the geocoder, but the pin stays exactly where it was dropped.
    expect(place).toEqual({ name: "Helsinki, Finland", lat: 60.1699, lng: 24.9384 });
  });

  it("returns null when the pin falls on nothing Nominatim can name", async () => {
    mockReverse({ error: "Unable to geocode" });

    const place = await reverseGeocode(0, 0, undefined, { cityLevel: true });

    expect(place).toBeNull();
  });

  it("throws when the reverse request fails so the caller can fall back", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(reverseGeocode(1, 2)).rejects.toThrow(/503/);
  });
});
