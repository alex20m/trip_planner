"use client";
import { useLayoutEffect, useRef } from "react";

export const SLIDE_MS = 260;

// Animation is a nicety, not a requirement: skip it where the browser can't do
// it (jsdom in tests) or where the user has asked for less motion.
function canSlide(el: HTMLElement) {
  if (typeof el.animate !== "function") return false;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  return !reduced?.matches;
}

/**
 * Slides list rows between their old and new positions when the list reorders,
 * so a note visibly travels to its new place instead of teleporting there.
 *
 * Works by remembering each row's offset after every render and, when one has
 * moved, starting it back at its previous offset and animating the gap away.
 *
 * Returns a factory for `ref` callbacks — give each row `ref={rowRef(note.id)}`.
 */
export function useSlideOnReorder<T extends HTMLElement = HTMLElement>() {
  const rows = useRef(new Map<string, T>());
  const offsets = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const previous = offsets.current;
    const current = new Map<string, number>();
    // Rebuilding from the rows still mounted also drops offsets for rows that
    // have since been deleted.
    rows.current.forEach((el, id) => {
      const top = el.offsetTop;
      current.set(id, top);
      const was = previous.get(id);
      if (was === undefined || was === top || !canSlide(el)) return;
      el.animate(
        [{ transform: `translateY(${was - top}px)` }, { transform: "translateY(0)" }],
        { duration: SLIDE_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" }
      );
    });
    offsets.current = current;
  });

  // Only the element map is cleared on unmount — the recorded offsets are what
  // the next render compares against, and React detaches refs before then.
  return (id: string) => (el: T | null) => {
    if (el) rows.current.set(id, el);
    else rows.current.delete(id);
  };
}
