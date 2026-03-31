"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "@/components/ui/sonner";

import { NoteEditor } from "@/components/notes/NoteEditor";
import { NotesList } from "@/components/notes/NotesList";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRealtime } from "@/hooks/useRealtime";
import { insertActivity } from "@/lib/supabase/activity";
import { createClient } from "@/lib/supabase/client";
import { getRealtimeNewRow, getRealtimeOldRow } from "@/lib/supabase/realtime-payload";
import type { Database } from "@/types/database.types";

type Note = Database["public"]["Tables"]["notes"]["Row"];

type NotesViewProps = {
  workspaceId: string;
  projectId: string;
  initialNotes: Note[];
  isReadOnly?: boolean;
  renderedAt?: number;
};

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if ((a.is_pinned ?? false) !== (b.is_pinned ?? false)) {
      return a.is_pinned ? -1 : 1;
    }

    const aDate = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const bDate = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return bDate - aDate;
  });
}

export function NotesView({
  workspaceId,
  projectId,
  initialNotes,
  isReadOnly = false,
  renderedAt,
}: NotesViewProps) {
  const supabase = createClient();
  const [notes, setNotes] = useState<Note[]>(sortNotes(initialNotes));
  const [activeNoteId, setActiveNoteId] = useState<string | null>(initialNotes[0]?.id ?? null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [isCreating, setIsCreating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [dirtyNotes, setDirtyNotes] = useState<Record<string, boolean>>({});
  const [pendingRemoteNotes, setPendingRemoteNotes] = useState<Record<string, Note>>({});
  const [conflictedNoteId, setConflictedNoteId] = useState<string | null>(null);
  const activeNoteIdRef = useRef<string | null>(activeNoteId);
  const dirtyNotesRef = useRef<Record<string, boolean>>(dirtyNotes);

  const activeNote = notes.find((note) => note.id === activeNoteId) ?? null;
  const activeConflictMessage = activeNoteId && conflictedNoteId === activeNoteId
    ? "A teammate updated this note while you were editing. Reload the latest version before saving again."
    : null;

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  useEffect(() => {
    dirtyNotesRef.current = dirtyNotes;
  }, [dirtyNotes]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id ?? null);
    };

    void loadCurrentUser();
  }, [supabase]);

  const clearPendingRemoteNote = useCallback((noteId: string) => {
    setPendingRemoteNotes((current) => {
      if (!current[noteId]) {
        return current;
      }

      const next = { ...current };
      delete next[noteId];
      return next;
    });

    setConflictedNoteId((current) => (current === noteId ? null : current));
  }, []);

  const handleReloadRemote = useCallback(() => {
    if (!activeNoteId) {
      return;
    }

    const pendingNote = pendingRemoteNotes[activeNoteId];

    if (!pendingNote) {
      return;
    }

    setNotes((current) => sortNotes(current.map((note) => (note.id === pendingNote.id ? pendingNote : note))));
    clearPendingRemoteNote(activeNoteId);
    setSaveState("idle");
  }, [activeNoteId, clearPendingRemoteNote, pendingRemoteNotes]);

  const handleDirtyChange = useCallback((params: { noteId: string; isDirty: boolean }) => {
    if (!params.noteId) {
      return;
    }

    setDirtyNotes((current) => {
      if (params.isDirty) {
        return { ...current, [params.noteId]: true };
      }

      if (!current[params.noteId]) {
        return current;
      }

      const next = { ...current };
      delete next[params.noteId];
      return next;
    });
  }, []);

  const setupNotesChannel = useCallback(
    (channel: RealtimeChannel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          setNotes((current) => {
            if (payload.eventType === "DELETE") {
              const removed = getRealtimeOldRow<Note>(payload, "NotesView.notes.delete", ["id"]);

              if (!removed) {
                return current;
              }

              const remaining = current.filter((note) => note.id !== removed.id);

              clearPendingRemoteNote(removed.id);
              setActiveNoteId((currentId) => (currentId === removed.id ? remaining[0]?.id ?? null : currentId));
              return remaining;
            }

            const incoming = getRealtimeNewRow<Note>(payload, "NotesView.notes.change", [
              "id",
              "project_id",
              "updated_by",
            ]);

            if (!incoming) {
              return current;
            }

            const activeId = activeNoteIdRef.current;
            const isActiveDirty = Boolean(dirtyNotesRef.current[incoming.id]);
            const shouldHoldRemoteVersion =
              Boolean(currentUserId) && incoming.id === activeId && isActiveDirty && incoming.updated_by !== currentUserId;

            if (payload.eventType === "INSERT") {
              if (current.some((note) => note.id === incoming.id)) {
                return current;
              }

              return sortNotes([incoming, ...current]);
            }

            if (shouldHoldRemoteVersion) {
              setPendingRemoteNotes((currentPending) => ({
                ...currentPending,
                [incoming.id]: incoming,
              }));
              setConflictedNoteId(incoming.id);
              return current;
            }

            clearPendingRemoteNote(incoming.id);
            return sortNotes(current.map((note) => (note.id === incoming.id ? incoming : note)));
          });
        },
      ),
    [clearPendingRemoteNote, currentUserId, projectId],
  );

  useRealtime({
    enabled: Boolean(projectId),
    name: `project:${projectId}:notes`,
    supabase,
    setup: setupNotesChannel,
  });

  const handleCreateNote = async () => {
    if (isCreating || isReadOnly) {
      return;
    }

    setIsCreating(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const { data, error } = await supabase
        .from("notes")
        .insert({
          project_id: projectId,
          title: "Untitled",
          content: "",
          is_pinned: false,
          updated_by: user.id,
        })
        .select("*")
        .single();

      if (error || !data) {
        toast.error(error?.message ?? "Could not create note.");
        return;
      }

      await insertActivity(supabase, {
        workspaceId,
        projectId,
        actorId: user.id,
        action: "note.created",
        metadata: { noteId: data.id, title: data.title },
      });

      clearPendingRemoteNote(data.id);
      setNotes((current) => sortNotes([data as Note, ...current]));
      setActiveNoteId(data.id);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSave = async ({ noteId, title, content }: { noteId: string; title: string; content: string }) => {
    if (isReadOnly) {
      return;
    }

    setSaveState("saving");
    const previousNote = notes.find((note) => note.id === noteId) ?? null;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: currentRemoteNote, error: currentRemoteNoteError } = await supabase
      .from("notes")
      .select("*")
      .eq("id", noteId)
      .single();

    if (currentRemoteNoteError || !currentRemoteNote) {
      toast.error(currentRemoteNoteError?.message ?? "Could not validate the latest note version.");
      setSaveState("idle");
      return;
    }

    if (
      previousNote &&
      currentRemoteNote.updated_at !== previousNote.updated_at &&
      currentRemoteNote.updated_by !== user?.id
    ) {
      setPendingRemoteNotes((current) => ({
        ...current,
        [noteId]: currentRemoteNote as Note,
      }));
      setConflictedNoteId(noteId);
      toast.error("This note changed remotely before your save completed. Reload the latest version and try again.");
      setSaveState("idle");
      return;
    }

    const updatedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from("notes")
      .update({
        title,
        content,
        updated_by: user?.id ?? null,
        updated_at: updatedAt,
      })
      .eq("id", noteId)
      .select("*")
      .single();

    if (!error && data) {
      if (
        user?.id &&
        previousNote &&
        (previousNote.title !== data.title || (previousNote.content ?? "") !== (data.content ?? ""))
      ) {
        await insertActivity(supabase, {
          workspaceId,
          projectId,
          actorId: user.id,
          action: "note.updated",
          metadata: {
            noteId: data.id,
            title: data.title,
          },
        });
      }

      clearPendingRemoteNote(noteId);
      setNotes((current) =>
        sortNotes(current.map((note) => (note.id === noteId ? ({ ...note, ...(data as Note) } as Note) : note))),
      );
      setSaveState("saved");
      toast.success("Note saved.", { id: "note-saved" });
      window.setTimeout(() => setSaveState("idle"), 1000);
      return;
    }

    toast.error(error?.message ?? "Could not save note.");
    setSaveState("idle");
  };

  const handleTogglePin = async (note: Note) => {
    if (isReadOnly) {
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("notes")
      .update({ is_pinned: !(note.is_pinned ?? false), updated_at: new Date().toISOString() })
      .eq("id", note.id)
      .select("*")
      .single();

    if (!data) {
      toast.error("Could not update note pin state.");
      return;
    }

    clearPendingRemoteNote(note.id);
    setNotes((current) =>
      sortNotes(current.map((item) => (item.id === note.id ? ({ ...item, ...(data as Note) } as Note) : item))),
    );

    if (user?.id) {
      await insertActivity(supabase, {
        workspaceId,
        projectId,
        actorId: user.id,
        action: data.is_pinned ? "note.pinned" : "note.unpinned",
        metadata: {
          noteId: data.id,
          title: data.title,
        },
      });
    }
  };

  const handleDelete = async (note: Note) => {
    if (isReadOnly) {
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("notes").delete().eq("id", note.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (user?.id) {
      await insertActivity(supabase, {
        workspaceId,
        projectId,
        actorId: user.id,
        action: "note.deleted",
        metadata: {
          noteId: note.id,
          title: note.title,
        },
      });
    }

    clearPendingRemoteNote(note.id);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    setActiveNoteId((current) => {
      if (current !== note.id) {
        return current;
      }

      const remaining = notes.filter((item) => item.id !== note.id);
      return remaining[0]?.id ?? null;
    });
  };

  return (
    <div className="flex flex-col gap-4 p-6 md:flex-row">
      {isReadOnly ? (
        <Alert className="md:hidden">
          <AlertDescription>
            This project is archived. Notes stay visible, but editing is disabled until the project is restored.
          </AlertDescription>
        </Alert>
      ) : null}

      <NotesList
        notes={notes}
        activeNoteId={activeNoteId}
        onSelect={setActiveNoteId}
        onCreate={() => void handleCreateNote()}
        readOnly={isReadOnly}
        isLoading={isCreating && notes.length === 0}
        initialReferenceTime={renderedAt}
      />
      <div className="flex flex-1 flex-col gap-4">
        {isReadOnly ? (
          <Alert>
            <AlertDescription>
              This project is archived. Notes stay visible, but editing is disabled until the project is restored.
            </AlertDescription>
          </Alert>
        ) : null}
        <NoteEditor
          note={activeNote}
          saveState={saveState}
          readOnly={isReadOnly}
          hasConflict={Boolean(activeConflictMessage)}
          conflictMessage={activeConflictMessage}
          onDirtyChange={handleDirtyChange}
          onReloadRemote={handleReloadRemote}
          onSave={handleSave}
          onTogglePin={handleTogglePin}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
