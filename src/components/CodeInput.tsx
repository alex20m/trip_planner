"use client";
import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

// Segmented one-time-code entry: `length` single-digit boxes backed by one
// compact string in the parent. Entry is sequential (you fill left to right),
// so the value never has internal gaps and stays a plain string. Pasting the
// whole code fills every box at once; completing the last digit fires
// onComplete so the caller can auto-submit.
export default function CodeInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = true
}: {
  length?: number;
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function focusBox(i: number) {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    el?.focus();
    el?.select();
  }

  function commit(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  }

  function handleChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const digit = e.target.value.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    // Clamp to the first empty slot so typing in a box past the end never
    // leaves a gap — the digit lands in the next free box instead.
    const pos = Math.min(i, value.length);
    commit(value.slice(0, pos) + digit + value.slice(pos + 1));
    focusBox(pos + 1);
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value.length === 0) return;
      if (value[i]) {
        // Clear the digit in this box and stay put.
        commit(value.slice(0, i) + value.slice(i + 1));
        focusBox(i);
      } else {
        // Empty box (the active one): remove the previous digit and step back.
        commit(value.slice(0, -1));
        focusBox(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(i + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const clean = commit(e.clipboardData.getData("text"));
    focusBox(clean.length);
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label={`${length}-digit verification code`}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          maxLength={1}
          className="code-box"
        />
      ))}
    </div>
  );
}
