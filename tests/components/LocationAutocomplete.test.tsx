import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import type { PlaceSuggestion } from "@/lib/geocode";

const searchPlaces = vi.hoisted(() => vi.fn());
vi.mock("@/lib/geocode", () => ({ searchPlaces }));

const rome: PlaceSuggestion = { name: "Colosseum, Rome, Italy", lat: 41.8902, lng: 12.4922 };

function Harness({ onSelect = vi.fn() }: { onSelect?: (p: PlaceSuggestion) => void }) {
  // Minimal stateful parent mirroring how EventModal drives the component.
  const [text, setText] = useState("");
  return <LocationAutocomplete value={text} onChange={setText} onSelect={(p) => { setText(p.name); onSelect(p); }} />;
}

describe("LocationAutocomplete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchPlaces.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function typeAndSearch(value: string) {
    fireEvent.change(screen.getByRole("combobox"), { target: { value } });
    // Let the debounce elapse and the mocked fetch resolve.
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
  }

  it("shows geocoder suggestions after typing, debounced", async () => {
    searchPlaces.mockResolvedValue([rome]);
    render(<Harness />);

    await typeAndSearch("colos");

    expect(searchPlaces).toHaveBeenCalledWith("colos", expect.anything());
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Colosseum, Rome, Italy")).toBeInTheDocument();
  });

  it("does not search for queries shorter than two characters", async () => {
    render(<Harness />);

    await typeAndSearch("c");

    expect(searchPlaces).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selecting a suggestion fills the field and reports the place", async () => {
    searchPlaces.mockResolvedValue([rome]);
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    await typeAndSearch("colos");
    fireEvent.mouseDown(screen.getByText("Colosseum, Rome, Italy"));

    expect(onSelect).toHaveBeenCalledWith(rome);
    expect(screen.getByRole("combobox")).toHaveValue("Colosseum, Rome, Italy");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports picking with the keyboard", async () => {
    searchPlaces.mockResolvedValue([rome]);
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    await typeAndSearch("colos");
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith(rome);
  });

  it("shows an empty state when nothing matches", async () => {
    searchPlaces.mockResolvedValue([]);
    render(<Harness />);

    await typeAndSearch("zzzznotaplace");

    expect(screen.getByText(/no places found/i)).toBeInTheDocument();
  });
});
