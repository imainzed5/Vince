"use client";

import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { marked } from "marked";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database.types";

type Note = Database["public"]["Tables"]["notes"]["Row"];

type SaveState = "idle" | "saving" | "saved";

type NoteEditorProps = {
  note: Note | null;
  saveState: SaveState;
  readOnly?: boolean;
  hasConflict?: boolean;
  conflictMessage?: string | null;
  onDirtyChange?: (params: { noteId: string; isDirty: boolean }) => void;
  onReloadRemote?: () => void;
  onSave: (params: { noteId: string; title: string; content: string }) => Promise<void>;
  onTogglePin: (note: Note) => Promise<void>;
  onDelete: (note: Note) => Promise<void>;
};

export function NoteEditor({
  note,
  saveState,
  readOnly = false,
  hasConflict = false,
  conflictMessage = null,
  onDirtyChange,
  onReloadRemote,
  onSave,
  onTogglePin,
  onDelete,
}: NoteEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  useEffect(() => {
    if (!note) {
      setTitle("");
      setContent("");
      return;
    }

    setTitle(note.title ?? "");
    setContent(note.content ?? "");
    onDirtyChange?.({ noteId: note.id, isDirty: false });
  }, [note, onDirtyChange]);

  useEffect(() => {
    if (!note) {
      return;
    }

    const nextTitle = title.trim() || "Untitled";
    const nextContent = content;
    const isDirty = nextTitle !== (note.title ?? "Untitled") || nextContent !== (note.content ?? "");

    onDirtyChange?.({ noteId: note.id, isDirty });
  }, [content, note, onDirtyChange, title]);

  useEffect(() => {
    if (!note || readOnly || hasConflict) {
      return;
    }

    const nextTitle = title.trim() || "Untitled";
    const nextContent = content;

    if (nextTitle === (note.title ?? "Untitled") && nextContent === (note.content ?? "")) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void onSave({ noteId: note.id, title: nextTitle, content: nextContent });
    }, 1000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [content, hasConflict, note, onSave, readOnly, title]);

  const saveLabel = useMemo(() => {
    if (saveState === "saving") {
      return "Saving...";
    }

    if (saveState === "saved") {
      return "Saved";
    }

    return "";
  }, [saveState]);

  const renderedMarkdown = useMemo(() => {
    if (!content.trim()) {
      return "<p>Nothing to preview yet.</p>";
    }

    return DOMPurify.sanitize(marked.parse(content) as string);
  }, [content]);

  if (!note) {
    return (
      <section className="surface-panel flex min-h-[560px] flex-1 items-center justify-center rounded-xl border p-6 text-sm text-muted-foreground">
        Select a note or create a new one.
      </section>
    );
  }

  return (
    <section className="surface-panel min-h-[560px] flex-1 rounded-xl border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="h-10 border-transparent px-0 text-2xl font-semibold shadow-none focus-visible:border-transparent focus-visible:ring-0"
          placeholder="Untitled"
          disabled={readOnly}
        />

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{saveLabel}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void onTogglePin(note)} disabled={readOnly}>
            {note.is_pinned ? (
              <>
                <PinOff className="size-4" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="size-4" />
                Pin
              </>
            )}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setIsDeleteOpen(true)} disabled={readOnly}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      {conflictMessage ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
          <p>{conflictMessage}</p>
          {onReloadRemote ? (
            <Button type="button" size="sm" variant="outline" onClick={onReloadRemote}>
              Reload latest
            </Button>
          ) : null}
        </div>
      ) : null}

      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        className="surface-subpanel h-[320px] w-full resize-none rounded-lg border border-border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        placeholder="Write your note in markdown..."
        disabled={readOnly}
      />

      <div className="surface-subpanel mt-3 rounded-lg border p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
        <article
          className={cn("prose prose-sm max-w-none break-words text-foreground dark:prose-invert")}
          dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
        />
      </div>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete note?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The note will be removed permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void onDelete(note);
                setIsDeleteOpen(false);
              }}
            >
              Delete note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
