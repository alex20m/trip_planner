import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotesPanel from "@/components/notes/NotesPanel";
import type { NoteSection } from "@/lib/types";

const updateEq = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      update: (values: unknown) => ({ eq: (...args: unknown[]) => updateEq(values, ...args) })
    })
  })
}));

const sections: NoteSection[] = [
  {
    id: "section-1",
    trip_id: "trip-1",
    title: "Packing list",
    sort_order: 0,
    notes: [{ id: "note-1", section_id: "section-1", content: "Passport", done: false, sort_order: 0 }]
  }
];

// NotesPanel is controlled by its parent, so give it real state to mutate.
function Harness() {
  const [state, setState] = useState(sections);
  return <NotesPanel tripId="trip-1" sections={state} setSections={setState} editable />;
}

describe("NotesPanel — toggling a note", () => {
  beforeEach(() => {
    updateEq.mockReset();
  });

  it("checks the box immediately, without a spinner, while the update is in flight", async () => {
    // A save that never resolves during this test.
    updateEq.mockReturnValue(new Promise(() => {}));

    const { container } = render(<Harness />);
    await userEvent.click(screen.getByRole("checkbox"));

    expect(updateEq).toHaveBeenCalledWith({ done: true }, "id", "note-1");
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("checkbox")).toBeEnabled();
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("rolls the checkbox back when the server rejects the update", async () => {
    updateEq.mockResolvedValue({ error: { message: "nope" } });

    render(<Harness />);
    await userEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
  });
});
