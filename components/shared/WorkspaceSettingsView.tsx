"use client";

import { startTransition, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

import {
  createWorkspaceTaskStatusAction,
  createWorkspaceTaskFieldAction,
  deleteWorkspaceTaskStatusAction,
  deleteWorkspaceTaskFieldAction,
  deleteWorkspaceAction,
  leaveWorkspaceAction,
  regenerateWorkspaceInviteCodeAction,
  updateWorkspaceTaskStatusAction,
  updateWorkspaceSettingsAction,
} from "@/app/(app)/workspace/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_TASK_CUSTOM_FIELDS,
  getTaskCustomFieldTypeLabel,
  parseTaskCustomFieldOptions,
  validateTaskCustomFieldDefinitionInput,
} from "@/lib/task-custom-fields";
import {
  MAX_WORKSPACE_TASK_STATUSES,
  TASK_STATUS_COLOR_OPTIONS,
  TASK_STATUS_COLOR_STYLES,
  validateWorkspaceTaskStatusInput,
} from "@/lib/task-statuses";
import { copyTextToClipboard } from "@/lib/clipboard";
import { formatCalendarDate } from "@/lib/utils/time";
import type { TaskCustomFieldDefinition, WorkspaceTaskStatusDefinition } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type WorkspaceSettingsViewProps = {
  workspaceId: string;
  initialName: string;
  initialInviteCode: string;
  createdAt: string | null;
  currentUserRole: string;
  initialTaskFields: TaskCustomFieldDefinition[];
  initialTaskStatuses: WorkspaceTaskStatusDefinition[];
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
  initialTaskFields,
  initialTaskStatuses,
}: WorkspaceSettingsViewProps) {
  const router = useRouter();
  const isOwner = currentUserRole === "owner";

  const [savedName, setSavedName] = useState(initialName);
  const [name, setName] = useState(initialName);
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [taskStatuses, setTaskStatuses] = useState(initialTaskStatuses);
  const [taskFields, setTaskFields] = useState(initialTaskFields);
  const [newStatusLabel, setNewStatusLabel] = useState("");
  const [newStatusKind, setNewStatusKind] = useState<"open" | "done">("open");
  const [newStatusColor, setNewStatusColor] = useState<WorkspaceTaskStatusDefinition["color"]>("slate");
  const [statusDrafts, setStatusDrafts] = useState<Record<string, { label: string; color: WorkspaceTaskStatusDefinition["color"] }>>(
    Object.fromEntries(initialTaskStatuses.map((status) => [status.id, { label: status.label, color: status.color }])),
  );
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number" | "date" | "select">("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isSaving, startSaving] = useTransition();
  const [isCreatingStatus, startCreatingStatus] = useTransition();
  const [isCreatingField, startCreatingField] = useTransition();
  const [isRegenerating, startRegenerating] = useTransition();
  const [isLeaving, startLeaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [deletingStatusId, setDeletingStatusId] = useState<string | null>(null);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const hasNameChanged = name.trim() !== savedName;
  const canDeleteWorkspace = deleteConfirmation.trim() === savedName;
  const parsedFieldDraft = validateTaskCustomFieldDefinitionInput({
    name: newFieldName,
    fieldType: newFieldType,
    options: newFieldOptions.split(","),
  });
  const parsedStatusDraft = validateWorkspaceTaskStatusInput({
    label: newStatusLabel,
    color: newStatusColor,
    kind: newStatusKind,
  });
  const canCreateTaskField = isOwner && taskFields.length < MAX_TASK_CUSTOM_FIELDS && !("error" in parsedFieldDraft);
  const canCreateTaskStatus =
    isOwner && taskStatuses.length < MAX_WORKSPACE_TASK_STATUSES && !("error" in parsedStatusDraft);

  const copyInviteCode = async () => {
    const copiedToClipboard = await copyTextToClipboard(inviteCode);

    if (!copiedToClipboard) {
      toast.error("Clipboard access was blocked. Focus the tab and try again.");
      return;
    }

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

  const createTaskField = () => {
    startCreatingField(async () => {
      const result = await createWorkspaceTaskFieldAction({
        workspaceId,
        name: newFieldName,
        fieldType: newFieldType,
        options: newFieldOptions.split(","),
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      const createdField = result.taskField;

      if (createdField) {
        setTaskFields((current) => [...current, createdField].sort((left, right) => left.position - right.position));
      }

      setNewFieldName("");
      setNewFieldType("text");
      setNewFieldOptions("");
      toast.success(result.message);
      router.refresh();
    });
  };

  const createTaskStatus = () => {
    startCreatingStatus(async () => {
      const result = await createWorkspaceTaskStatusAction({
        workspaceId,
        label: newStatusLabel,
        color: newStatusColor,
        kind: newStatusKind,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      const createdStatus = result.taskStatus;

      if (createdStatus) {
        setTaskStatuses((current) => [...current, createdStatus].sort((left, right) => left.position - right.position));
        setStatusDrafts((current) => ({
          ...current,
          [createdStatus.id]: { label: createdStatus.label, color: createdStatus.color },
        }));
      }

      setNewStatusLabel("");
      setNewStatusKind("open");
      setNewStatusColor("slate");
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

  const deleteTaskField = (field: TaskCustomFieldDefinition) => {
    const confirmed = window.confirm(`Delete ${field.name}? Existing task values will no longer be shown.`);

    if (!confirmed) {
      return;
    }

    setDeletingFieldId(field.id);

    startTransition(async () => {
      const result = await deleteWorkspaceTaskFieldAction({
        workspaceId,
        fieldId: field.id,
      });

      setDeletingFieldId(null);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      setTaskFields((current) => current.filter((item) => item.id !== field.id));
      toast.success(result.message);
      router.refresh();
    });
  };

  const updateStatusDraft = (
    statusId: string,
    nextValue: Partial<{ label: string; color: WorkspaceTaskStatusDefinition["color"] }>,
  ) => {
    setStatusDrafts((current) => ({
      ...current,
      [statusId]: {
        label: nextValue.label ?? current[statusId]?.label ?? "",
        color: nextValue.color ?? current[statusId]?.color ?? "slate",
      },
    }));
  };

  const saveTaskStatus = (taskStatus: WorkspaceTaskStatusDefinition) => {
    const draft = statusDrafts[taskStatus.id] ?? { label: taskStatus.label, color: taskStatus.color };

    setSavingStatusId(taskStatus.id);

    startTransition(async () => {
      const result = await updateWorkspaceTaskStatusAction({
        workspaceId,
        statusId: taskStatus.id,
        label: draft.label,
        color: draft.color,
      });

      setSavingStatusId(null);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      const updatedTaskStatus = result.taskStatus;

      if (updatedTaskStatus) {
        setTaskStatuses((current) =>
          current.map((item) => (item.id === updatedTaskStatus.id ? updatedTaskStatus : item)).sort((left, right) => left.position - right.position),
        );
        setStatusDrafts((current) => ({
          ...current,
          [updatedTaskStatus.id]: {
            label: updatedTaskStatus.label,
            color: updatedTaskStatus.color,
          },
        }));
      }

      toast.success(result.message);
      router.refresh();
    });
  };

  const deleteTaskStatus = (taskStatus: WorkspaceTaskStatusDefinition) => {
    const confirmed = window.confirm(`Delete ${taskStatus.label}? Move any tasks out of it first.`);

    if (!confirmed) {
      return;
    }

    setDeletingStatusId(taskStatus.id);

    startTransition(async () => {
      const result = await deleteWorkspaceTaskStatusAction({
        workspaceId,
        statusId: taskStatus.id,
      });

      setDeletingStatusId(null);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      setTaskStatuses((current) => current.filter((item) => item.id !== taskStatus.id));
      setStatusDrafts((current) => {
        const next = { ...current };
        delete next[taskStatus.id];
        return next;
      });
      toast.success(result.message);
      router.refresh();
    });
  };

  return (
    <main className="space-y-6 p-6">
      <section className="surface-panel rounded-xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Workspace settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage workspace details, invite code access, and owner-only controls.
            </p>
          </div>
          <span className="surface-subpanel rounded-full border px-3 py-1 text-xs font-medium text-foreground">
            {isOwner ? "Owner access" : "Member access"}
          </span>
        </div>
      </section>

      <section className="surface-panel rounded-xl border p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">General</h2>
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

      <section className="surface-panel rounded-xl border p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">Invite code</h2>
          <p className="text-sm text-muted-foreground">
            Share the current code with teammates, or rotate it if access should change.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <p className="surface-subpanel rounded-lg border px-4 py-3 font-mono text-2xl font-semibold tracking-wide text-foreground">
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

      <section className="surface-panel rounded-xl border p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Task statuses</h2>
            <p className="text-sm text-muted-foreground">
              Keep the workflow opinionated, but add a few extra statuses when a workspace needs them.
            </p>
          </div>
          <Badge variant="outline">{taskStatuses.length}/{MAX_WORKSPACE_TASK_STATUSES} statuses</Badge>
        </div>

        <div className="space-y-3">
          {taskStatuses.map((taskStatus) => {
            const draft = statusDrafts[taskStatus.id] ?? { label: taskStatus.label, color: taskStatus.color };
            const hasChanges = draft.label.trim() !== taskStatus.label || draft.color !== taskStatus.color;

            return (
              <div key={taskStatus.id} className="surface-subpanel rounded-lg border p-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_180px_120px_auto] lg:items-end">
                  <div className="space-y-2">
                    <Label>Status label</Label>
                    <Input
                      value={draft.label}
                      onChange={(event) => updateStatusDraft(taskStatus.id, { label: event.target.value })}
                      disabled={!isOwner || savingStatusId === taskStatus.id || deletingStatusId === taskStatus.id}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Color</Label>
                    <Select
                      value={draft.color}
                      onValueChange={(value) => updateStatusDraft(taskStatus.id, { color: value as WorkspaceTaskStatusDefinition["color"] })}
                      disabled={!isOwner || savingStatusId === taskStatus.id || deletingStatusId === taskStatus.id}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUS_COLOR_OPTIONS.map((color) => (
                          <SelectItem key={color} value={color}>
                            {color}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Type</Label>
                    <div className={`inline-flex rounded-full px-3 py-2 text-sm font-medium ${TASK_STATUS_COLOR_STYLES[taskStatus.color].soft}`}>
                      {taskStatus.kind === "done" ? "Done" : "Open"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => saveTaskStatus(taskStatus)}
                      disabled={!isOwner || !hasChanges || savingStatusId === taskStatus.id || deletingStatusId === taskStatus.id}
                    >
                      {savingStatusId === taskStatus.id ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => deleteTaskStatus(taskStatus)}
                      disabled={!isOwner || deletingStatusId === taskStatus.id || savingStatusId === taskStatus.id}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {isOwner ? (
          <div className="surface-subpanel mt-5 space-y-4 rounded-xl border border-dashed p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="task-status-label">New status label</Label>
                <Input
                  id="task-status-label"
                  value={newStatusLabel}
                  onChange={(event) => setNewStatusLabel(event.target.value)}
                  placeholder="Ready for client"
                  disabled={isCreatingStatus || taskStatuses.length >= MAX_WORKSPACE_TASK_STATUSES}
                />
              </div>

              <div className="space-y-2">
                <Label>Status type</Label>
                <Select
                  value={newStatusKind}
                  onValueChange={(value) => setNewStatusKind((value as "open" | "done") ?? "open")}
                  disabled={isCreatingStatus || taskStatuses.length >= MAX_WORKSPACE_TASK_STATUSES}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <Select
                value={newStatusColor}
                onValueChange={(value) => setNewStatusColor((value as WorkspaceTaskStatusDefinition["color"]) ?? "slate")}
                disabled={isCreatingStatus || taskStatuses.length >= MAX_WORKSPACE_TASK_STATUSES}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUS_COLOR_OPTIONS.map((color) => (
                    <SelectItem key={color} value={color}>
                      {color}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {"error" in parsedStatusDraft && newStatusLabel.trim() ? (
              <p className="text-sm text-red-700 dark:text-red-300">{parsedStatusDraft.error}</p>
            ) : null}

            <Button type="button" variant="outline" onClick={createTaskStatus} disabled={!canCreateTaskStatus || isCreatingStatus}>
              <Plus className="size-4" />
              {isCreatingStatus ? "Adding status..." : "Add status"}
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Only workspace owners can manage task statuses.</p>
        )}
      </section>

      <section className="surface-panel rounded-xl border p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Task custom fields</h2>
            <p className="text-sm text-muted-foreground">
              Add up to {MAX_TASK_CUSTOM_FIELDS} extra fields that appear in every task detail panel in this workspace.
            </p>
          </div>
          <Badge variant="outline">
            {taskFields.length}/{MAX_TASK_CUSTOM_FIELDS} fields
          </Badge>
        </div>

        <div className="space-y-3">
          {taskFields.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No custom task fields yet.
            </div>
          ) : (
            taskFields.map((field) => {
              const options = parseTaskCustomFieldOptions(field.options);

              return (
                <div key={field.id} className="surface-subpanel flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{field.name}</p>
                      <Badge variant="secondary">{getTaskCustomFieldTypeLabel(field.field_type)}</Badge>
                    </div>
                    {field.field_type === "select" ? (
                      <p className="text-sm text-muted-foreground">Options: {options.join(", ")}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Shown on task details for all projects in this workspace.</p>
                    )}
                  </div>

                  {isOwner ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteTaskField(field)}
                      disabled={deletingFieldId === field.id || isCreatingField}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {isOwner ? (
          <div className="surface-subpanel mt-5 space-y-4 rounded-xl border border-dashed p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-field-name">Field name</Label>
                <Input
                  id="task-field-name"
                  value={newFieldName}
                  onChange={(event) => setNewFieldName(event.target.value)}
                  placeholder="Client priority"
                  disabled={isCreatingField || taskFields.length >= MAX_TASK_CUSTOM_FIELDS}
                />
              </div>

              <div className="space-y-2">
                <Label>Field type</Label>
                <Select
                  value={newFieldType}
                  onValueChange={(value) => setNewFieldType((value as "text" | "number" | "date" | "select") ?? "text")}
                  disabled={isCreatingField || taskFields.length >= MAX_TASK_CUSTOM_FIELDS}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="select">Select</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newFieldType === "select" ? (
              <div className="space-y-2">
                <Label htmlFor="task-field-options">Options</Label>
                <Input
                  id="task-field-options"
                  value={newFieldOptions}
                  onChange={(event) => setNewFieldOptions(event.target.value)}
                  placeholder="Critical, Standard, Deferred"
                  disabled={isCreatingField || taskFields.length >= MAX_TASK_CUSTOM_FIELDS}
                />
                <p className="text-xs text-muted-foreground">Separate options with commas. Duplicate and empty values are removed.</p>
              </div>
            ) : null}

            {"error" in parsedFieldDraft && newFieldName.trim() ? (
              <p className="text-sm text-red-700 dark:text-red-300">{parsedFieldDraft.error}</p>
            ) : null}

            <Button
              type="button"
              variant="outline"
              onClick={createTaskField}
              disabled={!canCreateTaskField || isCreatingField}
            >
              <Plus className="size-4" />
              {isCreatingField ? "Adding field..." : "Add field"}
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Only workspace owners can manage custom task fields.</p>
        )}
      </section>

      <section className="surface-panel rounded-xl border p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">Membership</h2>
          <p className="text-sm text-muted-foreground">
            Leave this workspace when you no longer need access. Owners need another owner in place first.
          </p>
        </div>

        <Button type="button" variant="outline" onClick={leaveWorkspace} disabled={isLeaving || isDeleting}>
          {isLeaving ? "Leaving..." : "Leave workspace"}
        </Button>
      </section>

      {isOwner ? (
        <section className="rounded-xl border border-red-200 bg-red-50/40 p-5 dark:border-red-500/25 dark:bg-red-500/10">
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