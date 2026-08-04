import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotesPanel from "@/components/notes/NotesPanel";
import type { NoteSection } from "@/lib/types";

const updateEq = vi.fn();
const insert = vi.fn();

type Row = Record<string, unknown>;

// What the next insert resolves to. Defaults to the row the server would hand
// back; tests override it to hold a save open or to fail one.
let rows = 0;
const insertedRow = async (values: Row) => ({
  data: { id: `new-${++rows}`, done: false, ...values },
  error: null
});
let insertResult: (values: Row) => Promise<{ data: Row | null; error: unknown }> = insertedRow;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      update: (values: unknown) => ({ eq: (...args: unknown[]) => updateEq(values, ...args) }),
      insert: (values: Row) => {
        insert(values);
        return { select: () => ({ single: () => insertResult(values) }) };
      }
    })
  })
}));

beforeEach(() => {
  insertResult = insertedRow;
});

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

  // On touch devices (no hover), a `group-hover`-revealed delete button makes
  // the first tap on a note only trigger the row's :hover instead of toggling
  // the checkbox, so it takes two taps. The reveal must be gated behind
  // `@media (hover: hover)` — never an unconditional `hidden` — so the button
  // stays visible on touch and the checkbox toggles on the first tap.
  it("does not hide the delete button behind a plain hover state on touch", () => {
    render(<Harness />);

    const del = screen.getByRole("button", { name: "Delete note" });
    const classes = del.className.split(/\s+/);
    // No unconditional `hidden`/`group-hover:block` — only their hover-gated forms.
    expect(classes).not.toContain("hidden");
    expect(classes).not.toContain("group-hover:block");
    expect(classes).toContain("[@media(hover:hover)]:hidden");
    expect(classes).toContain("[@media(hover:hover)]:group-hover:block");
  });
});

describe("NotesPanel — ordering by checked state", () => {
  const checklist: NoteSection[] = [
    {
      id: "section-1",
      trip_id: "trip-1",
      title: "Packing list",
      sort_order: 0,
      notes: [
        { id: "note-1", section_id: "section-1", content: "Passport", done: false, sort_order: 0 },
        { id: "note-2", section_id: "section-1", content: "Charger", done: false, sort_order: 1 },
        { id: "note-3", section_id: "section-1", content: "Socks", done: true, sort_order: 2 }
      ]
    }
  ];

  function ChecklistHarness() {
    const [state, setState] = useState(checklist);
    return <NotesPanel tripId="trip-1" sections={state} setSections={setState} editable />;
  }

  const noteOrder = () =>
    screen.getAllByRole("listitem").map((li) => li.textContent?.replace(/\s+$/, ""));

  beforeEach(() => {
    updateEq.mockReset();
    updateEq.mockResolvedValue({ error: null });
  });

  it("ticks the box where the user clicked and holds the note there before moving it", async () => {
    render(<ChecklistHarness />);

    await userEvent.click(screen.getAllByRole("checkbox")[0]);

    // Still first, but visibly checked — the move must not steal the feedback.
    expect(noteOrder()).toEqual(["Passport", "Charger", "Socks"]);
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    expect(screen.getByText("Passport")).toHaveClass("line-through");

    await waitFor(() => expect(noteOrder()).toEqual(["Charger", "Socks", "Passport"]));
  });

  it("unticks the box in place when the server rejects the update, without moving it", async () => {
    updateEq.mockResolvedValue({ error: { message: "nope" } });
    render(<ChecklistHarness />);

    await userEvent.click(screen.getAllByRole("checkbox")[0]);

    await waitFor(() => expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked());
    expect(noteOrder()).toEqual(["Passport", "Charger", "Socks"]);
  });

  it("sends a note to the bottom of the section when it is checked", async () => {
    render(<ChecklistHarness />);
    expect(noteOrder()).toEqual(["Passport", "Charger", "Socks"]);

    await userEvent.click(screen.getAllByRole("checkbox")[0]);

    await waitFor(() => expect(noteOrder()).toEqual(["Charger", "Socks", "Passport"]));
    // The new positions are persisted so the order survives a reload.
    expect(updateEq).toHaveBeenCalledWith({ done: true }, "id", "note-1");
    expect(updateEq).toHaveBeenCalledWith({ sort_order: 0 }, "id", "note-2");
    expect(updateEq).toHaveBeenCalledWith({ sort_order: 2 }, "id", "note-1");
  });

  it("brings a note back as the last unchecked note when it is unchecked", async () => {
    render(<ChecklistHarness />);

    // "Socks" starts checked, and sits last.
    await userEvent.click(screen.getAllByRole("checkbox")[2]);

    await waitFor(() => expect(noteOrder()).toEqual(["Passport", "Charger", "Socks"]));
    expect(updateEq).toHaveBeenCalledWith({ done: false }, "id", "note-3");
  });

  it("keeps both moves when a second note is ticked while the first is still settling", async () => {
    render(<ChecklistHarness />);

    await userEvent.click(screen.getAllByRole("checkbox")[0]); // Passport
    await userEvent.click(screen.getAllByRole("checkbox")[1]); // Charger

    // Neither has moved yet, and both read as checked.
    expect(noteOrder()).toEqual(["Passport", "Charger", "Socks"]);

    // The later move must not be computed from a snapshot taken before the
    // earlier one landed, which would put Passport back where it started.
    await waitFor(() => expect(noteOrder()).toEqual(["Socks", "Passport", "Charger"]));
  });

  it("shows checked notes last even for sections saved before this ordering existed", () => {
    const legacy: NoteSection[] = [
      {
        ...checklist[0],
        notes: [
          { id: "note-1", section_id: "section-1", content: "Passport", done: true, sort_order: 0 },
          { id: "note-2", section_id: "section-1", content: "Charger", done: false, sort_order: 1 }
        ]
      }
    ];
    function LegacyHarness() {
      const [state, setState] = useState(legacy);
      return <NotesPanel tripId="trip-1" sections={state} setSections={setState} editable />;
    }

    render(<LegacyHarness />);

    expect(noteOrder()).toEqual(["Charger", "Passport"]);
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

  // The field used to be disabled while the insert was in flight. A disabled
  // field is blurred by the browser, so every keystroke and Enter pressed
  // before the round trip finished went nowhere — someone typing a packing
  // list at speed lost roughly every other note.
  it("keeps taking notes while the previous one is still saving", async () => {
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => (release = resolve));
    let held = false;
    insertResult = async (values) => {
      if (!held) {
        held = true;
        await inFlight;
      }
      return { data: { id: `new-${String(values.content)}`, done: false, ...values }, error: null };
    };

    render(<Harness />);
    const field = screen.getByPlaceholderText("Type a note…");

    await userEvent.type(field, "Sunscreen{Enter}");
    expect(field).toBeEnabled();
    expect(field).toHaveFocus();
    // The field no longer dims while saving, so the progress shows separately.
    expect(screen.getByRole("status", { name: "Saving note" })).toBeInTheDocument();

    // Typed while the first note is still on its way to the server.
    await userEvent.type(field, "Towel{Enter}");
    release();

    await waitFor(() => {
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ content: "Sunscreen" }));
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ content: "Towel" }));
    });
    // Both land in the list: the second save must not be computed from a
    // snapshot taken before the first one was added.
    await waitFor(() =>
      expect(screen.getAllByRole("listitem").map((li) => li.textContent?.replace(/\s+$/, ""))).toEqual(
        ["Passport", "Sunscreen", "Towel"]
      )
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps a note that could not be saved on screen, and retries it", async () => {
    insertResult = async () => ({ data: null, error: { message: "offline" } });
    render(<Harness />);

    await userEvent.type(screen.getByPlaceholderText("Type a note…"), "Sunscreen{Enter}");

    // The draft is cleared on submit, so a silent failure would lose the text.
    expect(await screen.findByRole("alert")).toHaveTextContent("Sunscreen");
    expect(screen.queryByText("Sunscreen")).not.toBeInTheDocument();

    insertResult = insertedRow;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("Sunscreen")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

  // There is no Save button on a free-form section — the text saves itself —
  // so the status line is the only confirmation the user's notes were stored.
  it("reports saving and then saved while the body is written", async () => {
    updateEq.mockReset();
    let finishSave!: (v: unknown) => void;
    updateEq.mockReturnValue(new Promise((resolve) => (finishSave = resolve)));

    const { container } = render(<FreeformHarness />);
    const textarea = screen.getByPlaceholderText("Write your notes…");

    await userEvent.type(textarea, "!");
    textarea.blur();

    await waitFor(() => expect(screen.getByText("Saving…")).toBeInTheDocument());
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    finishSave({ error: null });

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
  });

  it("says nothing until the body actually changes", async () => {
    updateEq.mockReset();
    updateEq.mockResolvedValue({ error: null });

    render(<FreeformHarness />);
    screen.getByPlaceholderText("Write your notes…").blur();

    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(updateEq).not.toHaveBeenCalled();
  });
});
