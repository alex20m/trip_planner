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

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${ENDPOINT}?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return data.map((d) => ({ name: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon) }));
}
