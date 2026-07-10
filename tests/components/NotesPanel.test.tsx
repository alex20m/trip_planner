import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotesPanel from "@/components/notes/NotesPanel";
import type { NoteSection } from "@/lib/types";

const updateEq = vi.fn();
const insert = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      update: (values: unknown) => ({ eq: (...args: unknown[]) => updateEq(values, ...args) }),
      insert: (values: unknown) => {
        insert(values);
        return { select: () => ({ single: () => Promise.resolve({ data: null }) }) };
      }
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
    insert.mockReset();
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

describe("NotesPanel — adding a note", () => {
  beforeEach(() => {
    insert.mockReset();
  });

  it("shows an Add button only once the user has typed a note, and adds on click", async () => {
    render(<Harness />);

    // No Add-note button until there is text to add.
    expect(screen.queryByRole("button", { name: "Add note" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Type a note…"), "Sunscreen");

    const addButton = screen.getByRole("button", { name: "Add note" });
    expect(addButton).toBeInTheDocument();

    await userEvent.click(addButton);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ content: "Sunscreen" }));
  });
});

describe("NotesPanel — adding a section", () => {
  it("guides the user instead of inserting when the section name is empty", async () => {
    insert.mockReset();
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: /Add/ }));

    expect(insert).not.toHaveBeenCalled();
    expect(screen.getByText("Give the section a name first.")).toBeInTheDocument();
  });

  it("defaults to a checklist section", async () => {
    insert.mockReset();
    render(<Harness />);

    await userEvent.type(screen.getByPlaceholderText("New section, e.g. Packing list"), "Chores");
    await userEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Chores", kind: "checklist", body: null })
    );
  });

  it("inserts a free-form section when that type is chosen", async () => {
    insert.mockReset();
    render(<Harness />);

    await userEvent.type(screen.getByPlaceholderText("New section, e.g. Packing list"), "Ideas");
    await userEvent.click(screen.getByRole("radio", { name: "Free-form notes" }));
    await userEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Ideas", kind: "freeform", body: "" })
    );
  });
});

describe("NotesPanel — free-form section", () => {
  const freeformSections: NoteSection[] = [
    { id: "section-2", trip_id: "trip-1", title: "Ideas", sort_order: 0, kind: "freeform", body: "Old text", notes: [] }
  ];

  function FreeformHarness({ editable = true }: { editable?: boolean }) {
    const [state, setState] = useState(freeformSections);
    return <NotesPanel tripId="trip-1" sections={state} setSections={setState} editable={editable} />;
  }

  it("renders a textarea, not a checklist, and saves the body on blur", async () => {
    updateEq.mockReset();
    updateEq.mockResolvedValue({ error: null });
    render(<FreeformHarness />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const textarea = screen.getByPlaceholderText("Write your notes…");
    expect(textarea).toHaveValue("Old text");

    await userEvent.clear(textarea);
    await userEvent.type(textarea, "New plan");
    textarea.blur();

    await waitFor(() =>
      expect(updateEq).toHaveBeenCalledWith({ body: "New plan" }, "id", "section-2")
    );
  });

  it("shows the text read-only when the viewer cannot edit", () => {
    render(<FreeformHarness editable={false} />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Old text")).toBeInTheDocument();
  });
});
