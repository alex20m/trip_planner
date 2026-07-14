// Place search backed by the OpenStreetMap Nominatim geocoder.
// Free, no API key; usage policy asks for debounced requests and attribution
// (the map view shows the OSM attribution).

export interface PlaceSuggestion {
  /** Full display name, e.g. "Colosseum, Rome, Lazio, Italy" */
  name: string;
  lat: number;
  lng: number;
}

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const REVERSE_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";

interface NominatimResult {
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    footway?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    suburb?: string;
    country?: string;
  };
}

export interface SearchPlacesOptions {
  /**
   * Match settlements (cities, towns, villages) instead of exact places, and
   * label them as "City, Country". Off by default: a plain search resolves
   * anything the geocoder knows, including exact street addresses like
   * "Itämerenkatu 20", so an event can pin a precise spot and not just a city.
   */
  cityLevel?: boolean;
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  { cityLevel = false }: SearchPlacesOptions = {}
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  let url = `${ENDPOINT}?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(q)}`;
  if (cityLevel) url += "&featuretype=settlement";
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const data = (await res.json()) as NominatimResult[];
  const places = data.map((d) => ({
    name: cityLevel ? shortName(d) : placeLabel(d),
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon)
  }));
  // Settlement queries can return the same city several times (e.g. as both a
  // boundary and a place node); the shortened labels make those duplicates
  // indistinguishable, so keep only the first of each.
  if (!cityLevel) return places;
  const seen = new Set<string>();
  return places.filter((p) => !seen.has(p.name) && seen.add(p.name));
}

// Turn a dropped map pin into the same shape a picked suggestion has. The
// clicked coordinates are kept exactly as-is (the pin stays where the user put
// it); only the label comes from the geocoder. Returns null when the point has
// no known place (e.g. mid-ocean), so the caller can fall back to a coordinate
// label.
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
  { cityLevel = false }: SearchPlacesOptions = {}
): Promise<PlaceSuggestion | null> {
  // zoom 10 ≈ city/town; zoom 18 ≈ building. City-level events want the
  // settlement the pin falls in, not the exact address under the cursor.
  const zoom = cityLevel ? 10 : 18;
  const url =
    `${REVERSE_ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Reverse geocode failed (${res.status})`);
  const d = (await res.json()) as NominatimResult & { error?: string };
  if (!d || d.error || !d.display_name) return null;
  return { name: cityLevel ? shortName(d) : placeLabel(d), lat, lng };
}

function shortName(d: NominatimResult): string {
  const place = d.name?.trim() || d.display_name.split(",")[0].trim();
  const country = d.address?.country?.trim();
  if (!place) return d.display_name;
  return country && country !== place ? `${place}, ${country}` : place;
}

// Concise label for a full-precision result. Nominatim's raw display_name can
// run to a dozen comma-separated parts; instead show the specific place (a POI
// name or a "street number" address) followed by its city and country. Falls
// back to display_name when there aren't enough address details to build one.
function placeLabel(d: NominatimResult): string {
  const a = d.address ?? {};
  const street = a.road || a.pedestrian || a.footway;
  const primary =
    d.name?.trim() ||
    (street ? [street, a.house_number].filter(Boolean).join(" ") : "") ||
    d.display_name.split(",")[0].trim();
  const locality = a.city || a.town || a.village || a.municipality || a.suburb;
  // Without a locality or country there's no structure to condense, so keep
  // Nominatim's full display name rather than collapse to a bare first segment.
  if (!locality && !a.country) return d.display_name;
  const parts: string[] = [];
  for (const part of [primary, locality, a.country]) {
    const t = part?.trim();
    if (t && !parts.includes(t)) parts.push(t);
  }
  return parts.length ? parts.join(", ") : d.display_name;
}
