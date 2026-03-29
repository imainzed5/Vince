"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import {
  Copy,
  CalendarDays,
  Download,
  History,
  Link2,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";

import {
  addTaskDependencyAction,
  removeTaskDependencyAction,
} from "@/app/(app)/workspace/[workspaceId]/project/[projectId]/actions";
import { ActivityItem } from "@/components/activity/ActivityItem";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BOARD_COLUMNS, PRIORITY_CONFIG } from "@/components/board/config";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTaskThread } from "@/hooks/useTaskThread";
import { extractMentionedUserIds, insertNotifications } from "@/lib/collaboration";
import { insertActivity } from "@/lib/supabase/activity";
import { createClient } from "@/lib/supabase/client";
import { buildTaskDependencyMaps, getTaskDueState } from "@/lib/task-insights";
import { cn } from "@/lib/utils";
import { toRelativeTime } from "@/lib/utils/time";
import type { Task, TaskDependency, TaskPriority, TaskStatus } from "@/types";
import type { Database } from "@/types/database.types";

const TASK_ATTACHMENTS_BUCKET = "task-attachments";
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Attachment = Database["public"]["Tables"]["attachments"]["Row"];

type MemberOption = {
  id: string;
  name: string;
  role: string;
};

type TaskDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  dueDate: string;
  isBlocked: boolean;
  blockedReason: string;
  milestoneId: string;
};

type TaskDetailPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dependencies?: TaskDependency[];
  workspaceId: string;
  projectId: string;
  task: Task | null;
  tasks: Task[];
  milestones?: Milestone[];
  members?: MemberOption[];
  currentUserId: string;
  readOnly?: boolean;
  onTaskUpdated: (task: Task) => void;
  onTaskDuplicated: (task: Task) => void;
  onTaskDeleted: (taskId: string) => void;
};

function buildDraft(task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority as TaskPriority,
    assigneeId: task.assignee_id ?? "unassigned",
    dueDate: task.due_date ?? "",
    isBlocked: Boolean(task.is_blocked),
    blockedReason: task.blocked_reason ?? "",
    milestoneId: task.milestone_id ?? "none",
  };
}

function toInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function areTaskDraftsEqual(left: TaskDraft | null, right: TaskDraft | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.title === right.title &&
    left.description === right.description &&
    left.status === right.status &&
    left.priority === right.priority &&
    left.assigneeId === right.assigneeId &&
    left.dueDate === right.dueDate &&
    left.isBlocked === right.isBlocked &&
    left.blockedReason === right.blockedReason &&
    left.milestoneId === right.milestoneId
  );
}

export function TaskDetailPanel({
  open,
  onOpenChange,
  dependencies = [],
  workspaceId,
  projectId,
  task,
  tasks,
  milestones = [],
  members = [],
  currentUserId,
  readOnly = false,
  onTaskUpdated,
  onTaskDuplicated,
  onTaskDeleted,
}: TaskDetailPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState<TaskDraft | null>(task ? buildDraft(task) : null);
  const [newComment, setNewComment] = useState("");
  const [hasRemoteTaskUpdate, setHasRemoteTaskUpdate] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [isPostingComment, startPostingComment] = useTransition();
  const [isUploadingAttachment, startUploadingAttachment] = useTransition();
  const [isDuplicating, startDuplicating] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [isUpdatingDependencies, setIsUpdatingDependencies] = useState(false);
  const [dependencyTaskId, setDependencyTaskId] = useState<string>("none");
  const draftRef = useRef<TaskDraft | null>(draft);
  const lastSyncedTaskDraftRef = useRef<TaskDraft | null>(task ? buildDraft(task) : null);
  const lastTaskIdRef = useRef<string | null>(task?.id ?? null);
  const localDeleteTaskIdRef = useRef<string | null>(null);

  const memberNameMap = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member.name])),
    [members],
  );
  const currentUserLabel = memberNameMap[currentUserId] ?? "A teammate";
  const { blockedByMap, blockingMap } = useMemo(() => buildTaskDependencyMaps(dependencies), [dependencies]);
  const blockedByDependencies = useMemo(
    () => (task ? dependencies.filter((dependency) => dependency.blocked_task_id === task.id) : []),
    [dependencies, task],
  );
  const availableBlockingTasks = useMemo(
    () =>
      tasks.filter(
        (candidate) =>
          candidate.id !== task?.id &&
          !blockedByDependencies.some((dependency) => dependency.blocking_task_id === candidate.id),
      ),
    [blockedByDependencies, task?.id, tasks],
  );
  const dueState = getTaskDueState({ due_date: draft?.dueDate ?? null, status: draft?.status ?? task?.status ?? "todo" });

  const handleThreadError = useCallback((message: string) => {
    toast.error(message);
  }, []);

  const handleRemoteTaskChange = useCallback(
    (nextTask: Task) => {
      const currentDraft = draftRef.current;
      const previousSyncedDraft = lastSyncedTaskDraftRef.current;
      const nextDraft = buildDraft(nextTask);
      const hasLocalEdits = Boolean(
        currentDraft && previousSyncedDraft && !areTaskDraftsEqual(currentDraft, previousSyncedDraft),
      );

      if (hasLocalEdits && currentDraft && !areTaskDraftsEqual(currentDraft, nextDraft)) {
        setHasRemoteTaskUpdate((current) => {
          if (!current) {
            toast.info(
              "This task changed in another session. Save or reopen the task to refresh the latest fields.",
              { id: "task-remote-update" },
            );
          }

          return true;
        });
      }

      onTaskUpdated(nextTask);
    },
    [onTaskUpdated],
  );

  const handleRemoteTaskDelete = useCallback(
    (taskId: string) => {
      if (localDeleteTaskIdRef.current === taskId) {
        localDeleteTaskIdRef.current = null;
        return;
      }

      if (task?.id !== taskId) {
        return;
      }

      toast.info(`${task.identifier} was deleted in another session.`);
      onTaskDeleted(taskId);
      onOpenChange(false);
    },
    [onOpenChange, onTaskDeleted, task],
  );

  const {
    comments,
    attachments,
    activityItems,
    isLoading: isLoadingThread,
    connected: isThreadConnected,
  } = useTaskThread({
    open,
    workspaceId,
    projectId,
    task,
    currentUserId,
    memberNameMap,
    supabase,
    onError: handleThreadError,
    onRemoteTaskChange: handleRemoteTaskChange,
    onRemoteTaskDelete: handleRemoteTaskDelete,
  });

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!task) {
      setDraft(null);
      draftRef.current = null;
      lastSyncedTaskDraftRef.current = null;
      lastTaskIdRef.current = null;
      localDeleteTaskIdRef.current = null;
      setHasRemoteTaskUpdate(false);
      return;
    }

    setDependencyTaskId("none");

    const nextDraft = buildDraft(task);
    const previousSyncedDraft = lastSyncedTaskDraftRef.current;
    const isTaskChanged = task.id !== lastTaskIdRef.current;
    const currentDraft = draftRef.current;

    if (
      isTaskChanged ||
      !currentDraft ||
      !previousSyncedDraft ||
      areTaskDraftsEqual(currentDraft, previousSyncedDraft) ||
      areTaskDraftsEqual(currentDraft, nextDraft)
    ) {
      setDraft(nextDraft);
      draftRef.current = nextDraft;
      setHasRemoteTaskUpdate(false);
    }

    lastTaskIdRef.current = task.id;
    lastSyncedTaskDraftRef.current = nextDraft;
  }, [task]);

  if (!task || !draft) {
    return null;
  }

  const updateDraft = <Key extends keyof TaskDraft>(key: Key, value: TaskDraft[Key]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const saveTask = () => {
    if (readOnly) {
      return;
    }

    if (!draft.title.trim()) {
      toast.error("Task title is required.");
      return;
    }

    startSaving(async () => {
      const movedAcrossColumns = task.status !== draft.status;
      const nextPosition = movedAcrossColumns
        ? tasks.filter((item) => item.id !== task.id && item.status === draft.status).length
        : task.position;

      const updatePayload: Database["public"]["Tables"]["tasks"]["Update"] = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        status: draft.status,
        priority: draft.priority,
        assignee_id: draft.assigneeId === "unassigned" ? null : draft.assigneeId,
        due_date: draft.dueDate || null,
        is_blocked: draft.isBlocked || blockedByDependencies.length > 0,
        blocked_reason: draft.isBlocked ? draft.blockedReason.trim() || null : null,
        milestone_id: draft.milestoneId === "none" ? null : draft.milestoneId,
        position: nextPosition,
      };

      const { data: updatedTask, error } = await supabase
        .from("tasks")
        .update(updatePayload)
        .eq("id", task.id)
        .select("*")
        .single();

      if (error || !updatedTask) {
        toast.error(error?.message ?? "Could not save task changes.");
        return;
      }

      onTaskUpdated(updatedTask as Task);

      const activityPromises: Promise<unknown>[] = [];
      const notificationPromises: Promise<unknown>[] = [];

      if (task.status !== updatedTask.status) {
        activityPromises.push(
          insertActivity(supabase, {
            workspaceId,
            projectId,
            actorId: currentUserId,
            action: "task.status_changed",
            metadata: {
              taskId: task.id,
              identifier: task.identifier,
              from: task.status,
              to: updatedTask.status,
            },
          }),
        );
      }

      if (task.assignee_id !== updatedTask.assignee_id && updatedTask.assignee_id) {
        activityPromises.push(
          insertActivity(supabase, {
            workspaceId,
            projectId,
            actorId: currentUserId,
            action: "task.assigned",
            metadata: {
              taskId: task.id,
              identifier: task.identifier,
              assigneeId: updatedTask.assignee_id,
            },
          }),
        );

        notificationPromises.push(
          insertNotifications(supabase, [
            {
              workspaceId,
              projectId,
              recipientUserId: updatedTask.assignee_id,
              actorId: currentUserId,
              type: "task.assigned",
              title: `${updatedTask.identifier} was assigned to you`,
              body: updatedTask.title,
              metadata: {
                taskId: updatedTask.id,
                identifier: updatedTask.identifier,
              },
            },
          ]),
        );
      }

      if (task.due_date !== updatedTask.due_date && updatedTask.due_date && updatedTask.assignee_id) {
        notificationPromises.push(
          insertNotifications(supabase, [
            {
              workspaceId,
              projectId,
              recipientUserId: updatedTask.assignee_id,
              actorId: currentUserId,
              type: "task.due_date_changed",
              title: `Due date updated for ${updatedTask.identifier}`,
              body: `${updatedTask.title} is now due on ${updatedTask.due_date}.`,
              metadata: {
                taskId: updatedTask.id,
                identifier: updatedTask.identifier,
                dueDate: updatedTask.due_date,
              },
            },
          ]),
        );
      }

      if (!task.is_blocked && updatedTask.is_blocked) {
        activityPromises.push(
          insertActivity(supabase, {
            workspaceId,
            projectId,
            actorId: currentUserId,
            action: "task.blocked",
            metadata: {
              taskId: task.id,
              identifier: task.identifier,
            },
          }),
        );
      }

      if (
        task.title !== updatedTask.title ||
        task.description !== updatedTask.description ||
        task.priority !== updatedTask.priority ||
        task.due_date !== updatedTask.due_date ||
        task.milestone_id !== updatedTask.milestone_id ||
        task.assignee_id !== updatedTask.assignee_id ||
        task.is_blocked !== updatedTask.is_blocked ||
        task.blocked_reason !== updatedTask.blocked_reason
      ) {
        activityPromises.push(
          insertActivity(supabase, {
            workspaceId,
            projectId,
            actorId: currentUserId,
            action: "task.updated",
            metadata: {
              taskId: task.id,
              identifier: task.identifier,
              title: updatedTask.title,
            },
          }),
        );
      }

      await Promise.all([...activityPromises, ...notificationPromises]);
      toast.success("Task updated.");
    });
  };

  const postComment = () => {
    if (readOnly) {
      return;
    }

    if (!newComment.trim()) {
      return;
    }

    startPostingComment(async () => {
      const { data, error } = await supabase
        .from("task_comments")
        .insert({
          task_id: task.id,
          user_id: currentUserId,
          content: newComment.trim(),
        })
        .select("*")
        .single();

      if (error || !data) {
        toast.error(error?.message ?? "Could not post comment.");
        return;
      }

      setNewComment("");

      await insertActivity(supabase, {
        workspaceId,
        projectId,
        actorId: currentUserId,
        action: "task.comment_added",
        metadata: {
          taskId: task.id,
          identifier: task.identifier,
        },
      });

      const mentionedUserIds = extractMentionedUserIds(data.content, memberNameMap).filter(
        (userId) => userId !== currentUserId,
      );

      if (mentionedUserIds.length) {
        await insertNotifications(
          supabase,
          mentionedUserIds.map((recipientUserId) => ({
            workspaceId,
            projectId,
            recipientUserId,
            actorId: currentUserId,
            type: "task.comment_mentioned",
            title: `${currentUserLabel} mentioned you on ${task.identifier}`,
            body: data.content,
            metadata: {
              taskId: task.id,
              identifier: task.identifier,
            },
          })),
        );
      }

      toast.success("Comment added.");
    });
  };

  const uploadAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (readOnly) {
      return;
    }

    if (!file) {
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("Attachments must be 50MB or smaller.");
      return;
    }

    startUploadingAttachment(async () => {
      const storagePath = `${workspaceId}/${projectId}/${task.id}/${currentUserId}/${Date.now()}-${sanitizeFileName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        toast.error(uploadError.message);
        return;
      }

      const { data, error } = await supabase
        .from("attachments")
        .insert({
          task_id: task.id,
          user_id: currentUserId,
          file_name: file.name,
          file_url: storagePath,
        })
        .select("*")
        .single();

      if (error || !data) {
        await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([storagePath]);
        toast.error(error?.message ?? "Could not attach file.");
        return;
      }

      await insertActivity(supabase, {
        workspaceId,
        projectId,
        actorId: currentUserId,
        action: "task.attachment_added",
        metadata: {
          taskId: task.id,
          identifier: task.identifier,
          fileName: file.name,
        },
      });

      toast.success("Attachment uploaded.");
    });
  };

  const downloadAttachment = async (attachment: Attachment) => {
    const { data, error } = await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).download(attachment.file_url);

    if (error || !data) {
      toast.error(error?.message ?? "Could not download attachment.");
      return;
    }

    const objectUrl = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = attachment.file_name;
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  const duplicateTask = () => {
    if (readOnly) {
      return;
    }

    startDuplicating(async () => {
      const [{ data: projectData, error: projectError }, { data: seqData, error: seqError }] = await Promise.all([
        supabase.from("projects").select("prefix").eq("id", projectId).single(),
        supabase.rpc("generate_task_identifier", {
          p_project_id: projectId,
          p_prefix: task.identifier.split("-")[0] ?? "PRJ",
        }),
      ]);

      const activePrefix = projectError || !projectData ? task.identifier.split("-")[0] ?? "PRJ" : projectData.prefix;
      const identifier = seqError || !seqData ? `${activePrefix}-${String(Date.now()).slice(-6)}` : seqData;

      const { data: duplicatedTask, error } = await supabase
        .from("tasks")
        .insert({
          project_id: projectId,
          identifier,
          title: `Copy of ${task.title}`,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assignee_id: task.assignee_id,
          due_date: task.due_date,
          is_blocked: task.is_blocked,
          blocked_reason: task.blocked_reason,
          milestone_id: task.milestone_id,
          position: tasks.filter((item) => item.status === task.status).length,
          created_by: currentUserId,
        })
        .select("*")
        .single();

      if (error || !duplicatedTask) {
        toast.error(error?.message ?? "Could not duplicate task.");
        return;
      }

      onTaskDuplicated(duplicatedTask as Task);

      await insertActivity(supabase, {
        workspaceId,
        projectId,
        actorId: currentUserId,
        action: "task.duplicated",
        metadata: {
          taskId: duplicatedTask.id,
          identifier: duplicatedTask.identifier,
          sourceTaskId: task.id,
          sourceIdentifier: task.identifier,
          title: duplicatedTask.title,
        },
      });

      toast.success("Task duplicated.");
    });
  };

  const deleteTask = () => {
    if (readOnly) {
      return;
    }

    const confirmed = window.confirm(`Delete ${task.identifier}? This action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    startDeleting(async () => {
      localDeleteTaskIdRef.current = task.id;

      if (attachments.length > 0) {
        await supabase.storage
          .from(TASK_ATTACHMENTS_BUCKET)
          .remove(attachments.map((attachment) => attachment.file_url));
      }

      const { error } = await supabase.from("tasks").delete().eq("id", task.id);

      if (error) {
        toast.error(error.message);
        return;
      }

      await insertActivity(supabase, {
        workspaceId,
        projectId,
        actorId: currentUserId,
        action: "task.deleted",
        metadata: {
          taskId: task.id,
          identifier: task.identifier,
          title: task.title,
        },
      });

      onTaskDeleted(task.id);
      onOpenChange(false);
      toast.success("Task deleted.");
    });
  };

  const addDependency = () => {
    if (readOnly || !task || dependencyTaskId === "none") {
      return;
    }

    setIsUpdatingDependencies(true);
    startTransition(async () => {
      const result = await addTaskDependencyAction({
        workspaceId,
        projectId,
        blockedTaskId: task.id,
        blockingTaskId: dependencyTaskId,
      });

      setIsUpdatingDependencies(false);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      setDependencyTaskId("none");
      toast.success(result.message);
    });
  };

  const removeDependency = (dependencyId: string) => {
    if (readOnly) {
      return;
    }

    setIsUpdatingDependencies(true);
    startTransition(async () => {
      const result = await removeTaskDependencyAction({
        workspaceId,
        projectId,
        dependencyId,
      });

      setIsUpdatingDependencies(false);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="left-auto right-0 top-0 h-screen max-w-[min(720px,100vw)] translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 rounded-none border-l p-0 sm:max-w-[720px]"
      >
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{task.identifier}</Badge>
                <Badge variant="ghost">{BOARD_COLUMNS.find((column) => column.status === draft.status)?.label ?? draft.status}</Badge>
                {draft.isBlocked ? <Badge variant="destructive">Blocked</Badge> : null}
                {readOnly ? <Badge variant="secondary">Archived</Badge> : null}
                <Badge variant="outline">{isThreadConnected ? "Live" : "Connecting..."}</Badge>
              </div>
              <DialogTitle className="text-lg">Task details</DialogTitle>
              <DialogDescription>
                {readOnly
                  ? "This project is archived. You can review the task, comments, and files, but editing is disabled until the project is restored."
                  : "Update the task, add context with comments, and attach files for the team."}
              </DialogDescription>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[1.15fr_0.85fr]">
          <div className="min-h-0 overflow-y-auto border-r px-6 py-5">
            <div className="space-y-5">
              {readOnly ? (
                <Alert>
                  <AlertDescription>
                    Archived projects are read-only. Restore the project from the overview screen to edit this task.
                  </AlertDescription>
                </Alert>
              ) : null}

              {hasRemoteTaskUpdate ? (
                <Alert>
                  <AlertDescription>
                    A teammate changed this task while you had local edits open. Save your version or close and reopen the task to reload the latest saved fields.
                  </AlertDescription>
                </Alert>
              ) : null}

              <section className="space-y-4 rounded-xl border bg-white p-4">
                <div className="space-y-2">
                  <Label htmlFor="task-detail-title">Title</Label>
                  <Input
                    id="task-detail-title"
                    value={draft.title}
                    onChange={(event) => updateDraft("title", event.target.value)}
                    disabled={readOnly}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="task-detail-description">Description</Label>
                  <textarea
                    id="task-detail-description"
                    value={draft.description}
                    onChange={(event) => updateDraft("description", event.target.value)}
                    className="min-h-[140px] w-full resize-y rounded-lg border border-slate-200 p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    placeholder="Add the working context, acceptance notes, or delivery details."
                    disabled={readOnly}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={draft.status}
                      onValueChange={(value) => updateDraft("status", (value ?? draft.status) as TaskStatus)}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BOARD_COLUMNS.map((column) => (
                          <SelectItem key={column.status} value={column.status}>
                            {column.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={draft.priority}
                      onValueChange={(value) => updateDraft("priority", (value ?? draft.priority) as TaskPriority)}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {PRIORITY_CONFIG[priority].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Assignee</Label>
                    <Select
                      value={draft.assigneeId}
                      onValueChange={(value) => updateDraft("assigneeId", value ?? "unassigned")}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {members.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="task-detail-due-date">Due date</Label>
                    <Input
                      id="task-detail-due-date"
                      type="date"
                      value={draft.dueDate}
                      onChange={(event) => updateDraft("dueDate", event.target.value)}
                      disabled={readOnly}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Milestone</Label>
                    <Select
                      value={draft.milestoneId}
                      onValueChange={(value) => updateDraft("milestoneId", value ?? "none")}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No milestone</SelectItem>
                        {milestones.map((milestone) => (
                          <SelectItem key={milestone.id} value={milestone.id}>
                            {milestone.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Blocked state</Label>
                    <Select
                      value={draft.isBlocked ? "blocked" : "clear"}
                      onValueChange={(value) => updateDraft("isBlocked", value === "blocked")}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clear">Clear</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {draft.isBlocked ? (
                  <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                      <ShieldAlert className="size-4" />
                      Blocker reason
                    </div>
                    <textarea
                      value={draft.blockedReason}
                      onChange={(event) => updateDraft("blockedReason", event.target.value)}
                      className="min-h-[88px] w-full resize-y rounded-lg border border-red-200 bg-white p-3 text-sm outline-none focus-visible:border-red-300 focus-visible:ring-2 focus-visible:ring-red-200"
                      placeholder="Describe what is preventing progress."
                      disabled={readOnly}
                    />
                  </div>
                ) : null}

                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <Link2 className="size-4 text-slate-500" />
                    Dependencies
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Blocked by</p>
                    {blockedByDependencies.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No task dependencies yet.</p>
                    ) : (
                      blockedByDependencies.map((dependency) => {
                        const blockingTask = tasks.find((candidate) => candidate.id === dependency.blocking_task_id);

                        return (
                          <div key={dependency.id} className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-sm">
                            <div>
                              <p className="font-medium text-slate-900">{blockingTask?.identifier ?? "Task"}</p>
                              <p className="text-xs text-muted-foreground">{blockingTask?.title ?? "Dependency task"}</p>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => removeDependency(dependency.id)} disabled={readOnly || isUpdatingDependencies}>
                              Remove
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Add blocking task</Label>
                    <div className="flex flex-wrap gap-2">
                      <Select value={dependencyTaskId} onValueChange={(value) => setDependencyTaskId(value ?? "none")} disabled={readOnly || isUpdatingDependencies}>
                        <SelectTrigger className="w-full sm:w-[320px]">
                          <SelectValue placeholder="Choose a task" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Choose a task</SelectItem>
                          {availableBlockingTasks.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                              {candidate.identifier} · {candidate.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button type="button" variant="outline" onClick={addDependency} disabled={readOnly || isUpdatingDependencies || dependencyTaskId === "none"}>
                        {isUpdatingDependencies ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                        Add dependency
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4 rounded-xl border bg-white p-4">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="size-4 text-slate-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Comments</p>
                    <p className="text-xs text-muted-foreground">Keep delivery notes and decisions on the task.</p>
                  </div>
                </div>

                {isLoadingThread ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Loading comments...</div>
                ) : comments.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No comments yet.</div>
                ) : (
                  <div className="space-y-3">
                    {comments.map((comment) => (
                      <article key={comment.id} className="rounded-lg border bg-slate-50 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Avatar size="sm">
                            <AvatarFallback>{toInitials(comment.authorName)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{comment.authorName}</p>
                            <p className="text-xs text-muted-foreground">{toRelativeTime(comment.created_at)}</p>
                          </div>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-slate-700">{comment.content}</p>
                      </article>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="task-comment">Add comment</Label>
                  <textarea
                    id="task-comment"
                    value={newComment}
                    onChange={(event) => setNewComment(event.target.value)}
                    className="min-h-[110px] w-full resize-y rounded-lg border border-slate-200 p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    placeholder="Share an update, a decision, or what you need from the team."
                    disabled={readOnly}
                  />
                </div>

                <Button type="button" variant="outline" onClick={postComment} disabled={readOnly || isPostingComment || !newComment.trim()}>
                  {isPostingComment ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  Add comment
                </Button>
              </section>
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto bg-slate-50/60 px-6 py-5">
            <div className="space-y-4">
              <section className="rounded-xl border bg-white p-4">
                <p className="text-sm font-semibold text-slate-800">Snapshot</p>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Assignee</span>
                    <span className="font-medium text-slate-900">
                      {draft.assigneeId === "unassigned"
                        ? "Unassigned"
                        : memberNameMap[draft.assigneeId] ?? `User ${draft.assigneeId.slice(0, 8)}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Priority</span>
                    <span className="font-medium text-slate-900">{PRIORITY_CONFIG[draft.priority].label}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Due date</span>
                    <span className={cn("font-medium", draft.dueDate ? "text-slate-900" : "text-muted-foreground")}>
                      {draft.dueDate || "Not set"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Milestone</span>
                    <span className="font-medium text-slate-900">
                      {draft.milestoneId === "none"
                        ? "None"
                        : milestones.find((milestone) => milestone.id === draft.milestoneId)?.name ?? "None"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium text-slate-900">{toRelativeTime(task.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Due state</span>
                    <span className={cn("font-medium", dueState === "overdue" ? "text-red-700" : dueState === "due-soon" ? "text-amber-700" : "text-slate-900")}>
                      {dueState === "overdue" ? "Overdue" : dueState === "due-soon" ? "Due soon" : "On track"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Blocked by</span>
                    <span className="font-medium text-slate-900">{blockedByMap[task.id]?.length ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Blocking</span>
                    <span className="font-medium text-slate-900">{blockingMap[task.id]?.length ?? 0}</span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border bg-white p-4">
                <div className="flex items-center gap-2">
                  <Paperclip className="size-4 text-slate-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Attachments</p>
                    <p className="text-xs text-muted-foreground">Upload files directly onto the task.</p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-dashed p-3">
                  <Label htmlFor="task-attachment-upload" className="text-sm font-medium">
                    Upload file
                  </Label>
                  <Input
                    id="task-attachment-upload"
                    type="file"
                    className="mt-2"
                    onChange={uploadAttachment}
                    disabled={readOnly || isUploadingAttachment}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Max file size: 50MB. Files are scoped to authenticated workspace members.
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  {attachments.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No attachments yet.</div>
                  ) : (
                    attachments.map((attachment) => (
                      <div key={attachment.id} className="rounded-lg border bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{attachment.file_name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Added {toRelativeTime(attachment.created_at)}
                            </p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => void downloadAttachment(attachment)}>
                            <Download className="size-4" />
                            Download
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-xl border bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <History className="size-4 text-slate-500" />
                  Recent activity
                </div>
                {activityItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No task activity yet.</div>
                ) : (
                  <ul className="space-y-2">
                    {activityItems.map((item) => (
                      <ActivityItem
                        key={item.id}
                        id={item.id}
                        action={item.action}
                        metadata={item.metadata}
                        actorName={
                          item.actor_id && item.actor_id === currentUserId
                            ? "You"
                            : memberNameMap[item.actor_id ?? ""] ?? "System"
                        }
                        created_at={item.created_at}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl border bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <CalendarDays className="size-4 text-slate-500" />
                  Delivery notes
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Use the left side to update status, scope, blockers, and context. Comments and files stay attached to the task so the board stays lightweight.
                </p>
              </section>
            </div>
          </aside>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={duplicateTask} disabled={readOnly || isDuplicating || isDeleting}>
            {isDuplicating ? <LoaderCircle className="size-4 animate-spin" /> : <Copy className="size-4" />}
            Duplicate task
          </Button>
          <Button type="button" variant="destructive" onClick={deleteTask} disabled={readOnly || isDeleting || isDuplicating}>
            {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete task
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={saveTask} disabled={readOnly || isSaving || isDeleting || isDuplicating}>
            {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}