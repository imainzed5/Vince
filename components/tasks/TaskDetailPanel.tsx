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
  Pencil,
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
import { PRIORITY_CONFIG } from "@/components/board/config";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  areTaskCustomFieldValuesEqual,
  getTaskCustomFieldTypeLabel,
  parseTaskCustomFieldOptions,
  parseTaskCustomFieldValues,
  serializeTaskCustomFieldValues,
  type TaskCustomFieldValues,
} from "@/lib/task-custom-fields";
import { getTaskStatusLabel, withTaskStatusFallbacks } from "@/lib/task-statuses";
import { buildTaskDependencyMaps, getTaskDueState } from "@/lib/task-insights";
import { getMemberDisplayName } from "@/lib/utils/displayName";
import { cn } from "@/lib/utils";
import { toRelativeTime } from "@/lib/utils/time";
import type { Task, TaskCustomFieldDefinition, TaskDependency, TaskPriority, TaskStatus, WorkspaceTaskStatusDefinition } from "@/types";
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

type TaskComment = Database["public"]["Tables"]["task_comments"]["Row"];

type TaskDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  customFields: TaskCustomFieldValues;
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
  taskStatuses?: WorkspaceTaskStatusDefinition[];
  customFieldDefinitions?: TaskCustomFieldDefinition[];
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
    customFields: parseTaskCustomFieldValues(task.custom_fields),
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

function buildCommentPreview(content: string): string {
  const normalizedContent = content.trim().replace(/\s+/g, " ");

  if (normalizedContent.length <= 140) {
    return normalizedContent;
  }

  return `${normalizedContent.slice(0, 137)}...`;
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
    areTaskCustomFieldValuesEqual(left.customFields, right.customFields) &&
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
  taskStatuses = [],
  customFieldDefinitions = [],
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
  const [newCommentIsDecision, setNewCommentIsDecision] = useState(false);
  const [commentFilter, setCommentFilter] = useState<"all" | "decisions">("all");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const [editingCommentIsDecision, setEditingCommentIsDecision] = useState(false);
  const [pendingCommentId, setPendingCommentId] = useState<string | null>(null);
  const [hasRemoteTaskUpdate, setHasRemoteTaskUpdate] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [isPostingComment, startPostingComment] = useTransition();
  const [isUpdatingComment, startUpdatingComment] = useTransition();
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
  const statusOptions = useMemo(
    () => withTaskStatusFallbacks(taskStatuses, [task?.status ?? "", draft?.status ?? ""].filter(Boolean)),
    [draft?.status, task?.status, taskStatuses],
  );
  const dueState = getTaskDueState(
    { due_date: draft?.dueDate ?? null, status: draft?.status ?? task?.status ?? "todo" },
    undefined,
    statusOptions,
  );
  const customFieldSnapshotItems = useMemo(
    () =>
      customFieldDefinitions
        .map((field) => ({
          field,
          value: draft?.customFields[field.id]?.trim() ?? "",
        }))
        .filter((item) => item.value),
    [customFieldDefinitions, draft?.customFields],
  );

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

  const visibleComments = useMemo(
    () => comments.filter((comment) => commentFilter === "all" || Boolean(comment.is_decision)),
    [commentFilter, comments],
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!task) {
      setDraft(null);
      setNewComment("");
      setNewCommentIsDecision(false);
      setCommentFilter("all");
      setEditingCommentId(null);
      setEditingCommentContent("");
      setEditingCommentIsDecision(false);
      setPendingCommentId(null);
      draftRef.current = null;
      lastSyncedTaskDraftRef.current = null;
      lastTaskIdRef.current = null;
      localDeleteTaskIdRef.current = null;
      setHasRemoteTaskUpdate(false);
      return;
    }

    setDependencyTaskId("none");
    setEditingCommentId(null);
    setEditingCommentContent("");
    setEditingCommentIsDecision(false);

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

  const updateCustomFieldValue = (fieldId: string, value: string) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        customFields: {
          ...current.customFields,
          [fieldId]: value,
        },
      };
    });
  };

  const beginEditingComment = (comment: TaskComment) => {
    setEditingCommentId(comment.id);
    setEditingCommentContent(comment.content);
    setEditingCommentIsDecision(Boolean(comment.is_decision));
  };

  const cancelEditingComment = () => {
    setEditingCommentId(null);
    setEditingCommentContent("");
    setEditingCommentIsDecision(false);
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
        custom_fields: serializeTaskCustomFieldValues(draft.customFields, customFieldDefinitions),
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
        !areTaskCustomFieldValuesEqual(
          parseTaskCustomFieldValues(task.custom_fields),
          parseTaskCustomFieldValues(updatedTask.custom_fields),
        ) ||
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
          is_decision: newCommentIsDecision,
        })
        .select("*")
        .single();

      if (error || !data) {
        toast.error(error?.message ?? "Could not post comment.");
        return;
      }

      setNewComment("");
      setNewCommentIsDecision(false);

      await insertActivity(supabase, {
        workspaceId,
        projectId,
        actorId: currentUserId,
        action: "task.comment_added",
        metadata: {
          taskId: task.id,
          identifier: task.identifier,
          commentId: data.id,
          commentPreview: buildCommentPreview(data.content),
          isDecision: data.is_decision,
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

  const saveCommentEdit = (comment: TaskComment) => {
    if (readOnly || comment.deleted_at) {
      return;
    }

    const nextContent = editingCommentContent.trim();

    if (!nextContent) {
      toast.error("Comment content is required.");
      return;
    }

    if (nextContent === comment.content.trim() && editingCommentIsDecision === Boolean(comment.is_decision)) {
      cancelEditingComment();
      return;
    }

    setPendingCommentId(comment.id);

    startUpdatingComment(async () => {
      const previousMentionedUserIds = new Set(
        extractMentionedUserIds(comment.content, memberNameMap).filter((userId) => userId !== currentUserId),
      );

      const { data: updatedComment, error } = await supabase
        .from("task_comments")
        .update({
          content: nextContent,
          is_decision: editingCommentIsDecision,
          edited_at: new Date().toISOString(),
        })
        .eq("id", comment.id)
        .eq("task_id", task.id)
        .is("deleted_at", null)
        .select("*")
        .single();

      setPendingCommentId(null);

      if (error || !updatedComment) {
        toast.error(error?.message ?? "Could not update comment.");
        return;
      }

      await insertActivity(supabase, {
        workspaceId,
        projectId,
        actorId: currentUserId,
        action: "task.comment_edited",
        metadata: {
          taskId: task.id,
          identifier: task.identifier,
          commentId: updatedComment.id,
          commentPreview: buildCommentPreview(updatedComment.content),
          isDecision: updatedComment.is_decision,
        },
      });

      const nextMentionedUserIds = extractMentionedUserIds(updatedComment.content, memberNameMap).filter(
        (userId) => userId !== currentUserId && !previousMentionedUserIds.has(userId),
      );

      if (nextMentionedUserIds.length) {
        await insertNotifications(
          supabase,
          nextMentionedUserIds.map((recipientUserId) => ({
            workspaceId,
            projectId,
            recipientUserId,
            actorId: currentUserId,
            type: "task.comment_mentioned",
            title: `${currentUserLabel} mentioned you on ${task.identifier}`,
            body: updatedComment.content,
            metadata: {
              taskId: task.id,
              identifier: task.identifier,
              commentId: updatedComment.id,
            },
          })),
        );
      }

      cancelEditingComment();
      toast.success("Comment updated.");
    });
  };

  const deleteComment = (comment: TaskComment) => {
    if (readOnly || comment.deleted_at) {
      return;
    }

    const confirmed = window.confirm(
      comment.is_decision
        ? "Delete this decision note? The history entry will remain, but the comment will be marked deleted."
        : "Delete this comment? The history entry will remain, but the comment will be marked deleted.",
    );

    if (!confirmed) {
      return;
    }

    setPendingCommentId(comment.id);

    startUpdatingComment(async () => {
      const { error } = await supabase
        .from("task_comments")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: currentUserId,
        })
        .eq("id", comment.id)
        .eq("task_id", task.id)
        .is("deleted_at", null);

      setPendingCommentId(null);

      if (error) {
        toast.error(error.message);
        return;
      }

      await insertActivity(supabase, {
        workspaceId,
        projectId,
        actorId: currentUserId,
        action: "task.comment_deleted",
        metadata: {
          taskId: task.id,
          identifier: task.identifier,
          commentId: comment.id,
          wasDecision: comment.is_decision,
        },
      });

      if (editingCommentId === comment.id) {
        cancelEditingComment();
      }

      toast.success(comment.is_decision ? "Decision note deleted." : "Comment deleted.");
    });
  };

  const uploadAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

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
          custom_fields: task.custom_fields,
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
        className="surface-shell left-auto right-0 top-0 h-screen max-w-[min(720px,100vw)] translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 rounded-none border-l bg-background/95 p-0 backdrop-blur-xl sm:max-w-[720px]"
      >
        <DialogHeader className="surface-shell border-b px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{task.identifier}</Badge>
                <Badge variant="ghost">{getTaskStatusLabel(draft.status, statusOptions)}</Badge>
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

              <section className="surface-panel space-y-4 rounded-xl border p-4">
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
                    className="surface-subpanel min-h-[140px] w-full resize-y rounded-lg border border-border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
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
                        <SelectValue>{getTaskStatusLabel(draft.status, statusOptions) ?? "Status"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((statusOption) => (
                          <SelectItem key={statusOption.key} value={statusOption.key}>
                            {statusOption.label}
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
                        <SelectValue>{PRIORITY_CONFIG[draft.priority].label}</SelectValue>
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
                        <SelectValue>
                          {draft.assigneeId === "unassigned" ? "Unassigned" : getMemberDisplayName(memberNameMap[draft.assigneeId])}
                        </SelectValue>
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
                        <SelectValue>
                          {draft.milestoneId === "none"
                            ? "No milestone"
                            : milestones.find((milestone) => milestone.id === draft.milestoneId)?.name ?? "Unknown milestone"}
                        </SelectValue>
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
                        <SelectValue>{draft.isBlocked ? "Blocked" : "Clear"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clear">Clear</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {draft.isBlocked ? (
                  <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/25 dark:bg-red-500/10">
                    <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-200">
                      <ShieldAlert className="size-4" />
                      Blocker reason
                    </div>
                    <textarea
                      value={draft.blockedReason}
                      onChange={(event) => updateDraft("blockedReason", event.target.value)}
                      className="surface-subpanel min-h-[88px] w-full resize-y rounded-lg border border-red-200 p-3 text-sm outline-none focus-visible:border-red-300 focus-visible:ring-2 focus-visible:ring-red-200 dark:border-red-500/25"
                      placeholder="Describe what is preventing progress."
                      disabled={readOnly}
                    />
                  </div>
                ) : null}

                {customFieldDefinitions.length > 0 ? (
                  <div className="surface-subpanel space-y-4 rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Custom fields</p>
                      <p className="text-xs text-muted-foreground">Workspace-defined fields that add project-specific context.</p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {customFieldDefinitions.map((field) => {
                        const value = draft.customFields[field.id] ?? "";
                        const options = parseTaskCustomFieldOptions(field.options);

                        return (
                          <div key={field.id} className="space-y-2">
                            <Label>{field.name}</Label>
                            {field.field_type === "select" ? (
                              <Select
                                value={value || "none"}
                                onValueChange={(nextValue) =>
                                  updateCustomFieldValue(field.id, !nextValue || nextValue === "none" ? "" : nextValue)
                                }
                                disabled={readOnly}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue>
                                    {value || `Choose ${field.name.toLowerCase()}`}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No value</SelectItem>
                                  {options.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type={field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text"}
                                inputMode={field.field_type === "number" ? "decimal" : undefined}
                                value={value}
                                onChange={(event) => updateCustomFieldValue(field.id, event.target.value)}
                                placeholder={field.field_type === "text" ? `Add ${field.name.toLowerCase()}` : undefined}
                                disabled={readOnly}
                              />
                            )}
                            <p className="text-xs text-muted-foreground">{getTaskCustomFieldTypeLabel(field.field_type)} field</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="surface-subpanel space-y-3 rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Link2 className="size-4 text-muted-foreground" />
                    Dependencies
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Blocked by</p>
                    {blockedByDependencies.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No task dependencies yet.</p>
                    ) : (
                      blockedByDependencies.map((dependency) => {
                        const blockingTask = tasks.find((candidate) => candidate.id === dependency.blocking_task_id);

                        return (
                          <div key={dependency.id} className="surface-panel flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                            <div>
                              <p className="font-medium text-foreground">{blockingTask?.identifier ?? "Task"}</p>
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
                          <SelectValue placeholder="Choose a task">
                            {dependencyTaskId === "none"
                              ? "Choose a task"
                              : (() => {
                                  const selectedTask = availableBlockingTasks.find((candidate) => candidate.id === dependencyTaskId);
                                  return selectedTask ? `${selectedTask.identifier} · ${selectedTask.title}` : "Choose a task";
                                })()}
                          </SelectValue>
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

              <section className="surface-panel space-y-4 rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Comments</p>
                    <p className="text-xs text-muted-foreground">Keep delivery notes and decisions on the task.</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant={commentFilter === "all" ? "secondary" : "outline"} size="sm" onClick={() => setCommentFilter("all")}>
                    All comments
                  </Button>
                  <Button type="button" variant={commentFilter === "decisions" ? "secondary" : "outline"} size="sm" onClick={() => setCommentFilter("decisions")}>
                    Decisions only
                  </Button>
                  <Badge variant="outline">{comments.filter((comment) => comment.is_decision && !comment.deleted_at).length} decisions</Badge>
                </div>

                {isLoadingThread ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Loading comments...</div>
                ) : visibleComments.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    {commentFilter === "decisions" ? "No decision notes yet." : "No comments yet."}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visibleComments.map((comment) => (
                      <article key={comment.id} className="surface-subpanel rounded-lg border p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Avatar size="sm">
                            <AvatarFallback>{toInitials(comment.authorName)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{comment.authorName}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{toRelativeTime(comment.created_at)}</span>
                              {comment.is_decision ? <Badge variant="outline">Decision</Badge> : null}
                              {comment.edited_at ? <Badge variant="secondary">Edited</Badge> : null}
                              {comment.deleted_at ? <Badge variant="secondary">Deleted</Badge> : null}
                            </div>
                          </div>
                          {comment.user_id === currentUserId && !readOnly && !comment.deleted_at ? (
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => beginEditingComment(comment)}
                                disabled={isUpdatingComment && pendingCommentId === comment.id}
                              >
                                <Pencil className="size-4" />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteComment(comment)}
                                disabled={isUpdatingComment && pendingCommentId === comment.id}
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        {comment.deleted_at ? (
                          <p className="text-sm italic text-muted-foreground">Comment deleted.</p>
                        ) : editingCommentId === comment.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={editingCommentContent}
                              onChange={(event) => setEditingCommentContent(event.target.value)}
                              className="surface-subpanel min-h-[110px] w-full resize-y rounded-lg border border-border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                              disabled={isUpdatingComment}
                            />
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={editingCommentIsDecision}
                                onChange={(event) => setEditingCommentIsDecision(event.target.checked)}
                                disabled={isUpdatingComment}
                              />
                              Mark as decision
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => saveCommentEdit(comment)}
                                disabled={isUpdatingComment && pendingCommentId === comment.id}
                              >
                                {isUpdatingComment && pendingCommentId === comment.id ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                                Save comment
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={cancelEditingComment}
                                disabled={isUpdatingComment && pendingCommentId === comment.id}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-sm text-foreground">{comment.content}</p>
                        )}
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
                    className="surface-subpanel min-h-[110px] w-full resize-y rounded-lg border border-border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    placeholder="Share an update, a decision, or what you need from the team."
                    disabled={readOnly}
                  />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={newCommentIsDecision}
                      onChange={(event) => setNewCommentIsDecision(event.target.checked)}
                      disabled={readOnly || isPostingComment}
                    />
                    Mark as decision
                  </label>
                </div>

                <Button type="button" variant="outline" onClick={postComment} disabled={readOnly || isPostingComment || !newComment.trim()}>
                  {isPostingComment ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  Add comment
                </Button>
              </section>
            </div>
          </div>

          <aside className="surface-shell min-h-0 overflow-y-auto px-6 py-5">
            <div className="space-y-4">
              <section className="surface-panel rounded-xl border p-4">
                <p className="text-sm font-semibold text-foreground">Snapshot</p>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Assignee</span>
                    <span className="font-medium text-foreground">
                      {draft.assigneeId === "unassigned"
                        ? "Unassigned"
                        : getMemberDisplayName(memberNameMap[draft.assigneeId])}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Priority</span>
                    <span className="font-medium text-foreground">{PRIORITY_CONFIG[draft.priority].label}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Due date</span>
                    <span className={cn("font-medium", draft.dueDate ? "text-foreground" : "text-muted-foreground")}>
                      {draft.dueDate || "Not set"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Milestone</span>
                    <span className="font-medium text-foreground">
                      {draft.milestoneId === "none"
                        ? "None"
                        : milestones.find((milestone) => milestone.id === draft.milestoneId)?.name ?? "None"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium text-foreground">{toRelativeTime(task.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Due state</span>
                    <span className={cn("font-medium", dueState === "overdue" ? "text-red-700 dark:text-red-300" : dueState === "due-soon" ? "text-amber-700 dark:text-amber-300" : "text-foreground")}>
                      {dueState === "overdue" ? "Overdue" : dueState === "due-soon" ? "Due soon" : "On track"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Blocked by</span>
                    <span className="font-medium text-foreground">{blockedByMap[task.id]?.length ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Blocking</span>
                    <span className="font-medium text-foreground">{blockingMap[task.id]?.length ?? 0}</span>
                  </div>
                </div>

                {customFieldSnapshotItems.length > 0 ? (
                  <div className="mt-4 space-y-3 border-t pt-4 text-sm">
                    <p className="font-medium text-foreground">Custom field values</p>
                    {customFieldSnapshotItems.map(({ field, value }) => (
                      <div key={field.id} className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{field.name}</span>
                        <span className="font-medium text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="surface-panel rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  <Paperclip className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Attachments</p>
                    <p className="text-xs text-muted-foreground">Upload files directly onto the task.</p>
                  </div>
                </div>

                <div className="surface-subpanel mt-4 rounded-lg border border-dashed p-3">
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
                      <div key={attachment.id} className="surface-subpanel rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{attachment.file_name}</p>
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

              <section className="surface-panel rounded-xl border p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <History className="size-4 text-muted-foreground" />
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

              <section className="surface-panel rounded-xl border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  Delivery notes
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Use the left side to update status, scope, blockers, and context. Comments and files stay attached to the task so the board stays lightweight.
                </p>
              </section>
            </div>
          </aside>
        </div>

        <div className="surface-shell flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={duplicateTask}
              disabled={readOnly || isDuplicating || isDeleting}
            >
              {isDuplicating ? <LoaderCircle className="size-4 animate-spin" /> : <Copy className="size-4" />}
              Duplicate task
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={deleteTask}
              disabled={readOnly || isDeleting || isDuplicating}
            >
              {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete task
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={saveTask}
              disabled={readOnly || isSaving || isDeleting || isDuplicating}
            >
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}