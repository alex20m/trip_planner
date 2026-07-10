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

interface NominatimResult {
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  address?: { country?: string };
}

export interface SearchPlacesOptions {
  /**
   * Match settlements (cities, towns, villages) instead of exact places, and
   * label them as "City, Country". All event locations (travel, activities,
   * stays) use this — an event only needs to say which city it happens in,
   * not a street address.
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
  let url = `${ENDPOINT}?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
  if (cityLevel) url += "&featuretype=settlement&addressdetails=1";
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const data = (await res.json()) as NominatimResult[];
  const places = data.map((d) => ({
    name: cityLevel ? shortName(d) : d.display_name,
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

function shortName(d: NominatimResult): string {
  const place = d.name?.trim() || d.display_name.split(",")[0].trim();
  const country = d.address?.country?.trim();
  if (!place) return d.display_name;
  return country && country !== place ? `${place}, ${country}` : place;
}
