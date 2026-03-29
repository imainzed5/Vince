import { useCallback, useEffect, useMemo, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { useRealtime } from "@/hooks/useRealtime";
import type { Task } from "@/types";
import type { Database } from "@/types/database.types";

type TaskComment = Database["public"]["Tables"]["task_comments"]["Row"];
type Attachment = Database["public"]["Tables"]["attachments"]["Row"];
type ActivityRow = Database["public"]["Tables"]["activity_log"]["Row"];

export type TaskCommentViewModel = TaskComment & {
  authorName: string;
};

type UseTaskThreadOptions = {
  open: boolean;
  workspaceId: string;
  projectId: string;
  task: Task | null;
  currentUserId: string;
  memberNameMap: Record<string, string>;
  supabase: SupabaseClient<Database>;
  onError?: (message: string) => void;
  onRemoteTaskChange?: (task: Task) => void;
  onRemoteTaskDelete?: (taskId: string) => void;
};

function toCommentViewModel(
  comment: TaskComment,
  memberNameMap: Record<string, string>,
  currentUserId: string,
): TaskCommentViewModel {
  return {
    ...comment,
    authorName:
      memberNameMap[comment.user_id] ??
      (comment.user_id === currentUserId ? "You" : `User ${comment.user_id.slice(0, 8)}`),
  };
}

export function useTaskThread({
  open,
  workspaceId,
  projectId,
  task,
  currentUserId,
  memberNameMap,
  supabase,
  onError,
  onRemoteTaskChange,
  onRemoteTaskDelete,
}: UseTaskThreadOptions) {
  const [comments, setComments] = useState<TaskCommentViewModel[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open || !task) {
      setComments([]);
      setAttachments([]);
      setActivityItems([]);
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);

    void Promise.all([
      supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", task.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("attachments")
        .select("*")
        .eq("task_id", task.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("activity_log")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("project_id", projectId)
        .contains("metadata", { taskId: task.id })
        .order("created_at", { ascending: false })
        .limit(8),
    ]).then(([commentsResult, attachmentsResult, activityResult]) => {
      if (!isActive) {
        return;
      }

      if (commentsResult.error) {
        onError?.(commentsResult.error.message);
      }

      if (attachmentsResult.error) {
        onError?.(attachmentsResult.error.message);
      }

      if (activityResult.error) {
        onError?.(activityResult.error.message);
      }

      setComments(
        (commentsResult.data ?? []).map((comment) =>
          toCommentViewModel(comment as TaskComment, memberNameMap, currentUserId),
        ),
      );
      setAttachments((attachmentsResult.data ?? []) as Attachment[]);
      setActivityItems((activityResult.data ?? []) as ActivityRow[]);
      setIsLoading(false);
    });

    return () => {
      isActive = false;
    };
  }, [currentUserId, memberNameMap, onError, open, projectId, supabase, task, workspaceId]);

  const setupTaskChannel = useCallback(
    (channel: RealtimeChannel) => {
      if (!task) {
        return channel;
      }

      return channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `id=eq.${task.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            onRemoteTaskDelete?.((payload.old as Task).id);
            return;
          }

          onRemoteTaskChange?.(payload.new as Task);
        },
      );
    },
    [onRemoteTaskChange, onRemoteTaskDelete, task],
  );

  const { connected: taskConnected } = useRealtime({
    enabled: Boolean(open && task?.id),
    name: task ? `task:${task.id}:row` : "task:row",
    supabase,
    setup: setupTaskChannel,
  });

  const setupCommentsChannel = useCallback(
    (channel: RealtimeChannel) => {
      if (!task) {
        return channel;
      }

      return channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_comments",
          filter: `task_id=eq.${task.id}`,
        },
        (payload) => {
          setComments((current) => {
            if (payload.eventType === "DELETE") {
              const removed = payload.old as TaskComment;
              return current.filter((comment) => comment.id !== removed.id);
            }

            if (payload.eventType === "INSERT") {
              const inserted = toCommentViewModel(payload.new as TaskComment, memberNameMap, currentUserId);

              if (current.some((comment) => comment.id === inserted.id)) {
                return current;
              }

              return [...current, inserted];
            }

            const updated = toCommentViewModel(payload.new as TaskComment, memberNameMap, currentUserId);
            return current.map((comment) => (comment.id === updated.id ? updated : comment));
          });
        },
      );
    },
    [currentUserId, memberNameMap, task],
  );

  const { connected: commentsConnected } = useRealtime({
    enabled: Boolean(open && task?.id),
    name: task ? `task:${task.id}:comments` : "task:comments",
    supabase,
    setup: setupCommentsChannel,
  });

  const setupAttachmentsChannel = useCallback(
    (channel: RealtimeChannel) => {
      if (!task) {
        return channel;
      }

      return channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attachments",
          filter: `task_id=eq.${task.id}`,
        },
        (payload) => {
          setAttachments((current) => {
            if (payload.eventType === "DELETE") {
              const removed = payload.old as Attachment;
              return current.filter((attachment) => attachment.id !== removed.id);
            }

            if (payload.eventType === "INSERT") {
              const inserted = payload.new as Attachment;

              if (current.some((attachment) => attachment.id === inserted.id)) {
                return current;
              }

              return [inserted, ...current];
            }

            const updated = payload.new as Attachment;
            return current.map((attachment) => (attachment.id === updated.id ? updated : attachment));
          });
        },
      );
    },
    [task],
  );

  const { connected: attachmentsConnected } = useRealtime({
    enabled: Boolean(open && task?.id),
    name: task ? `task:${task.id}:attachments` : "task:attachments",
    supabase,
    setup: setupAttachmentsChannel,
  });

  const setupActivityChannel = useCallback(
    (channel: RealtimeChannel) => {
      if (!task) {
        return channel;
      }

      return channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_log",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const inserted = payload.new as ActivityRow;
          const metadata = inserted.metadata as Record<string, unknown> | null;

          if (inserted.project_id !== projectId || metadata?.taskId !== task.id) {
            return;
          }

          setActivityItems((current) => {
            if (current.some((item) => item.id === inserted.id)) {
              return current;
            }

            return [inserted, ...current].slice(0, 8);
          });
        },
      );
    },
    [projectId, task, workspaceId],
  );

  const { connected: activityConnected } = useRealtime({
    enabled: Boolean(open && task?.id),
    name: task ? `task:${task.id}:activity` : "task:activity",
    supabase,
    setup: setupActivityChannel,
  });

  const connected = useMemo(() => {
    if (!open || !task) {
      return false;
    }

    return taskConnected && commentsConnected && attachmentsConnected && activityConnected;
  }, [activityConnected, attachmentsConnected, commentsConnected, open, task, taskConnected]);

  return {
    comments,
    attachments,
    activityItems,
    isLoading,
    connected,
  };
}