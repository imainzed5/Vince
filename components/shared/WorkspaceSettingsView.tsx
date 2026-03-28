"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/sonner";

import {
  deleteWorkspaceAction,
  leaveWorkspaceAction,
  regenerateWorkspaceInviteCodeAction,
  updateWorkspaceSettingsAction,
} from "@/app/(app)/workspace/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCalendarDate } from "@/lib/utils/time";

type WorkspaceSettingsViewProps = {
  workspaceId: string;
  initialName: string;
  initialInviteCode: string;
  createdAt: string | null;
  currentUserRole: string;
};

function formatCreatedAt(value: string | null): string {
  return formatCalendarDate(value, {
    fallback: "Unknown",
    includeYear: true,
  });
}

export function WorkspaceSettingsView({
  workspaceId,
  initialName,
  initialInviteCode,
  createdAt,
  currentUserRole,
}: WorkspaceSettingsViewProps) {
  const router = useRouter();
  const isOwner = currentUserRole === "owner";

  const [savedName, setSavedName] = useState(initialName);
  const [name, setName] = useState(initialName);
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isSaving, startSaving] = useTransition();
  const [isRegenerating, startRegenerating] = useTransition();
  const [isLeaving, startLeaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [copied, setCopied] = useState(false);

  const hasNameChanged = name.trim() !== savedName;
  const canDeleteWorkspace = deleteConfirmation.trim() === savedName;

  const copyInviteCode = async () => {
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    toast.success("Invite code copied.");
    window.setTimeout(() => setCopied(false), 1500);
  };

  const submitSettings = () => {
    startSaving(async () => {
      const result = await updateWorkspaceSettingsAction({
        workspaceId,
        name,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      setSavedName(name.trim());
      toast.success(result.message);
      router.refresh();
    });
  };

  const regenerateInviteCode = () => {
    startRegenerating(async () => {
      const result = await regenerateWorkspaceInviteCodeAction(workspaceId);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      if (result.inviteCode) {
        setInviteCode(result.inviteCode);
      }

      toast.success(result.message);
      router.refresh();
    });
  };

  const leaveWorkspace = () => {
    const confirmed = window.confirm(
      isOwner
        ? "Leave this workspace? You need another owner in place before this can succeed."
        : "Leave this workspace? You will lose access immediately.",
    );

    if (!confirmed) {
      return;
    }

    startLeaving(async () => {
      const result = await leaveWorkspaceAction(workspaceId);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.push(result.nextPath ?? "/dashboard");
      router.refresh();
    });
  };

  const deleteWorkspace = () => {
    startDeleting(async () => {
      const result = await deleteWorkspaceAction({
        workspaceId,
        confirmationName: deleteConfirmation,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.push(result.nextPath ?? "/create-workspace");
      router.refresh();
    });
  };

  return (
    <main className="space-y-6 p-6">
      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Workspace settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage workspace details, invite code access, and owner-only controls.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {isOwner ? "Owner access" : "Member access"}
          </span>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">General</h2>
          <p className="text-sm text-muted-foreground">Rename the workspace and review its setup details.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_220px] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!isOwner || isSaving || isDeleting}
            />
          </div>

          <Button type="button" onClick={submitSettings} disabled={!isOwner || !hasNameChanged || isSaving || isDeleting}>
            {isSaving ? "Saving..." : "Save changes"}
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">Created {formatCreatedAt(createdAt)}</p>
        {!isOwner ? (
          <p className="mt-3 text-sm text-muted-foreground">Only workspace owners can edit these settings.</p>
        ) : null}
      </section>

      <section className="rounded-xl border bg-white p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Invite code</h2>
          <p className="text-sm text-muted-foreground">
            Share the current code with teammates, or rotate it if access should change.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <p className="rounded-lg bg-slate-100 px-4 py-3 font-mono text-2xl font-semibold tracking-wide text-slate-900">
            {inviteCode}
          </p>
          <Button type="button" variant="outline" onClick={() => void copyInviteCode()}>
            {copied ? "Copied!" : "Copy invite code"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={regenerateInviteCode}
            disabled={!isOwner || isRegenerating}
          >
            {isRegenerating ? "Regenerating..." : "Regenerate code"}
          </Button>
        </div>

        {!isOwner ? (
          <p className="mt-3 text-sm text-muted-foreground">Only workspace owners can regenerate the invite code.</p>
        ) : null}
      </section>

      <section className="rounded-xl border bg-white p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Membership</h2>
          <p className="text-sm text-muted-foreground">
            Leave this workspace when you no longer need access. Owners need another owner in place first.
          </p>
        </div>

        <Button type="button" variant="outline" onClick={leaveWorkspace} disabled={isLeaving || isDeleting}>
          {isLeaving ? "Leaving..." : "Leave workspace"}
        </Button>
      </section>

      {isOwner ? (
        <section className="rounded-xl border border-red-200 bg-red-50/40 p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-red-900">Delete workspace</h2>
            <p className="text-sm text-red-800/80">
              This permanently removes the workspace, its projects, tasks, notes, chat, and activity history.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_220px] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="workspace-delete-confirmation">Type the workspace name to confirm</Label>
              <Input
                id="workspace-delete-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder={savedName}
                disabled={isDeleting}
              />
            </div>

            <Button
              type="button"
              variant="destructive"
              onClick={deleteWorkspace}
              disabled={!canDeleteWorkspace || isDeleting || isSaving}
            >
              {isDeleting ? "Deleting..." : "Delete workspace"}
            </Button>
          </div>
        </section>
      ) : null}
    </main>
  );
}