"use client";

import { Pin } from "lucide-react";

import { RelativeTimeText } from "@/components/shared/RelativeTimeText";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database.types";

type Note = Database["public"]["Tables"]["notes"]["Row"];

type NotesListProps = {
  notes: Note[];
  activeNoteId: string | null;
  onSelect: (noteId: string) => void;
  onCreate: () => void;
  readOnly?: boolean;
  isLoading?: boolean;
  initialReferenceTime?: number;
};

export function NotesList({
  notes,
  activeNoteId,
  onSelect,
  onCreate,
  readOnly = false,
  isLoading,
  initialReferenceTime,
}: NotesListProps) {
  return (
    <aside className="w-full rounded-xl border bg-white p-3 md:w-80 md:shrink-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Notes</h2>
        <Button type="button" size="sm" onClick={onCreate} disabled={readOnly}>
          + New note
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No notes yet
        </div>
      ) : (
        <ul className="space-y-1">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => onSelect(note.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left transition",
                  activeNoteId === note.id
                    ? "border-blue-300 bg-blue-50"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                )}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-900">{note.title || "Untitled"}</span>
                  {note.is_pinned ? <Pin className="size-3 text-amber-500" /> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  <RelativeTimeText
                    value={note.updated_at}
                    initialReferenceTime={initialReferenceTime}
                  />
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
