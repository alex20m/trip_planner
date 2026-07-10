"use client";
import { useEffect, useId, useRef, useState } from "react";
import { searchPlaces, type PlaceSuggestion } from "@/lib/geocode";
import Spinner from "@/components/Spinner";

// Google Maps-style place picker: type to search, choose a real place from
// the dropdown. Typing only updates the raw text — the parent decides what an
// unconfirmed (typed but not selected) location means. Selecting a suggestion
// fires onSelect with the place's name and coordinates.
export default function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Location (optional)"
}: {
  value: string;
  onChange: (text: string) => void;
  onSelect: (place: PlaceSuggestion) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  // Only set while the user is typing; programmatic value changes (picking a
  // suggestion, opening an existing event) must not trigger a search.
  const [query, setQuery] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Unique per instance — the event form renders two of these for travel legs.
  const listId = useId();

  useEffect(() => {
    if (query === null) return;
    if (query.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    setFailed(false);
    const ctrl = new AbortController();
    // Debounce so we don't hit the geocoder on every keystroke.
    const timer = setTimeout(() => {
      searchPlaces(query, ctrl.signal)
        .then((results) => {
          setSuggestions(results);
          setActive(-1);
          setOpen(true);
          setSearching(false);
        })
        .catch((err: unknown) => {
          if ((err as Error).name === "AbortError") return;
          setSuggestions([]);
          setFailed(true);
          setOpen(true);
          setSearching(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function pick(s: PlaceSuggestion) {
    setOpen(false);
    setQuery(null);
    setSuggestions([]);
    onSelect(s);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && suggestions[active]) pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="field"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listId}
        autoComplete="off"
      />
      {searching && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40">
          <Spinner className="h-3.5 w-3.5" />
        </span>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-ink/10 bg-surface p-1.5 shadow-panel"
        >
          {suggestions.map((s, i) => (
            <li key={`${s.lat},${s.lng}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown instead of click so picking wins over the
                // outside-mousedown close handler.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={`w-full truncate rounded-xl px-3 py-2 text-left text-sm ${
                  i === active ? "bg-ink/5 text-ink" : "text-ink/80"
                }`}
                title={s.name}
              >
                {s.name}
              </button>
            </li>
          ))}
          {suggestions.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink/50">
              {failed ? "Couldn't search places. Check your connection." : "No places found."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
