import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useSlideOnReorder, SLIDE_MS } from "@/components/notes/useSlideOnReorder";

const animate = vi.fn();

// jsdom lays everything out at offsetTop 0, so drive the offsets from the
// order the ids are rendered in — that is what the hook diffs against.
function stubOffsets(order: string[]) {
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      const index = order.indexOf(this.dataset.id ?? "");
      return index === -1 ? 0 : index * 100;
    }
  });
}

function List({ ids }: { ids: string[] }) {
  const rowRef = useSlideOnReorder<HTMLDivElement>();
  return (
    <div>
      {ids.map((id) => (
        <div key={id} data-id={id} ref={rowRef(id)} />
      ))}
    </div>
  );
}

function mockPrefersReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion: reduce") ? reduce : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  animate.mockReset();
  HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
  mockPrefersReducedMotion(false);
});

afterEach(() => {
  cleanup();
  // @ts-expect-error restoring the jsdom default
  delete HTMLElement.prototype.offsetTop;
});

describe("useSlideOnReorder", () => {
  it("does not animate rows on the first render", () => {
    stubOffsets(["a", "b", "c"]);

    render(<List ids={["a", "b", "c"]} />);

    // There is no previous position to travel from, so a list appearing for
    // the first time must not slide in from nowhere.
    expect(animate).not.toHaveBeenCalled();
  });

  it("slides a row from where it was to where it now is", () => {
    stubOffsets(["a", "b", "c"]);
    const { rerender } = render(<List ids={["a", "b", "c"]} />);

    // "c" moves to the top: it was at 200, it is now at 0.
    stubOffsets(["c", "a", "b"]);
    animate.mockClear();
    rerender(<List ids={["c", "a", "b"]} />);

    const moved = animate.mock.calls.map(([keyframes]) => keyframes[0].transform);
    expect(moved).toContain("translateY(200px)");
    // The two rows pushed down by one slot travel the other way.
    expect(moved).toContain("translateY(-100px)");
    expect(animate).toHaveBeenCalledTimes(3);
  });

  it("ends every slide at the row's real position", () => {
    stubOffsets(["a", "b"]);
    const { rerender } = render(<List ids={["a", "b"]} />);

    stubOffsets(["b", "a"]);
    animate.mockClear();
    rerender(<List ids={["b", "a"]} />);

    for (const [keyframes, options] of animate.mock.calls) {
      expect(keyframes[1].transform).toBe("translateY(0)");
      expect(options.duration).toBe(SLIDE_MS);
    }
  });

  it("leaves rows that did not move alone", () => {
    stubOffsets(["a", "b", "c"]);
    const { rerender } = render(<List ids={["a", "b", "c"]} />);

    // Only "c" is removed; "a" and "b" keep their positions.
    stubOffsets(["a", "b"]);
    animate.mockClear();
    rerender(<List ids={["a", "b"]} />);

    expect(animate).not.toHaveBeenCalled();
  });

  it("does not slide a newly added row", () => {
    stubOffsets(["a", "b"]);
    const { rerender } = render(<List ids={["a", "b"]} />);

    // "new" is prepended: it has no previous position, the others shift down.
    stubOffsets(["new", "a", "b"]);
    animate.mockClear();
    rerender(<List ids={["new", "a", "b"]} />);

    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls.every(([k]) => k[0].transform === "translateY(-100px)")).toBe(true);
  });

  it("does not resurrect a deleted row's old position when its id comes back", () => {
    stubOffsets(["a", "b", "c"]);
    const { rerender } = render(<List ids={["a", "b", "c"]} />);

    // "c" (at 200) is deleted, then an item with the same id reappears at the top.
    stubOffsets(["a", "b"]);
    rerender(<List ids={["a", "b"]} />);
    stubOffsets(["c", "a", "b"]);
    animate.mockClear();
    rerender(<List ids={["c", "a", "b"]} />);

    // Stale offsets would make the returning row jump 200px before settling.
    const transforms = animate.mock.calls.map(([k]) => k[0].transform);
    expect(transforms).not.toContain("translateY(200px)");
    expect(transforms).toEqual(["translateY(-100px)", "translateY(-100px)"]);
  });

  it("honours a request for reduced motion", () => {
    mockPrefersReducedMotion(true);
    stubOffsets(["a", "b"]);
    const { rerender } = render(<List ids={["a", "b"]} />);

    stubOffsets(["b", "a"]);
    animate.mockClear();
    rerender(<List ids={["b", "a"]} />);

    expect(animate).not.toHaveBeenCalled();
  });

  it("reorders without crashing where Element.animate is unavailable", () => {
    // @ts-expect-error simulating a browser without the Web Animations API
    HTMLElement.prototype.animate = undefined;
    stubOffsets(["a", "b"]);
    const { rerender } = render(<List ids={["a", "b"]} />);

    stubOffsets(["b", "a"]);

    expect(() => rerender(<List ids={["b", "a"]} />)).not.toThrow();
  });
});
