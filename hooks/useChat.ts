import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "@/components/ui/sonner";

import { useRealtime } from "@/hooks/useRealtime";
import {
  extractMentionedUserIds,
  getChatLastReadAt,
  insertNotifications,
  upsertChatReadState,
} from "@/lib/collaboration";
import { createClient } from "@/lib/supabase/client";
import { getRealtimeChangedRow, getRealtimeNewRow, getRealtimeOldRow } from "@/lib/supabase/realtime-payload";
import { getCurrentUserProfileSnapshot } from "@/lib/supabase/user-profiles";
import { getDisplayNameFromEmail, getMemberDisplayName } from "@/lib/utils/displayName";
import type { Database } from "@/types/database.types";

export type ChatItem = Database["public"]["Tables"]["messages"]["Row"] & {
  displayName: string;
  isOptimistic?: boolean;
};

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type ChatReadStateRow = Database["public"]["Tables"]["chat_read_states"]["Row"];

type UseChatOptions = {
  workspaceId: string;
  projectId?: string | null;
  memberNames?: Record<string, string>;
};

function toFallbackName(userId: string): string {
  return getMemberDisplayName(null);
}

export function useChat({ workspaceId, projectId = null, memberNames = {} }: UseChatOptions) {
  const supabase = createClient();
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState("You");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);

  const applyDisplayName = useCallback(
    (message: MessageRow): ChatItem => ({
      ...message,
      displayName:
        message.user_id === currentUserId
          ? currentUserName
          : memberNames[message.user_id] ?? toFallbackName(message.user_id),
    }),
    [currentUserId, currentUserName, memberNames],
  );

  useEffect(() => {
    const loadCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const profileSnapshot = await getCurrentUserProfileSnapshot(supabase, user);

      setCurrentUserId(user.id);
      setCurrentUserName(profileSnapshot.displayName);
      const nextLastReadAt = await getChatLastReadAt(supabase, {
        workspaceId,
        projectId,
        userId: user.id,
      });
      setLastReadAt(nextLastReadAt);
    };

    void loadCurrentUser();
  }, [projectId, supabase, workspaceId]);

  const loadMessages = useCallback(async () => {
    setIsLoading(true);

    let query = supabase
      .from("messages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (projectId) {
      query = query.eq("project_id", projectId);
    } else {
      query = query.is("project_id", null);
    }

    const { data, error } = await query;

    if (error) {
      setErrorMessage(error.message);
      toast.error(error.message);
    }

    setMessages(((data ?? []) as MessageRow[]).map((message) => applyDisplayName(message)));
    setIsLoading(false);
  }, [applyDisplayName, projectId, supabase, workspaceId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const markAsRead = useCallback(async () => {
    if (!currentUserId) {
      return;
    }

    const nextLastReadAt = await upsertChatReadState(supabase, {
      workspaceId,
      projectId,
      userId: currentUserId,
    });

    if (nextLastReadAt) {
      setLastReadAt(nextLastReadAt);
    }
  }, [currentUserId, projectId, supabase, workspaceId]);

  useEffect(() => {
    if (!currentUserId || isLoading) {
      return;
    }

    void markAsRead();
  }, [currentUserId, isLoading, markAsRead, messages.length]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void markAsRead();
      }
    };

    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUserId, markAsRead]);

  const setupMessagesChannel = useCallback(
    (channel: RealtimeChannel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: projectId ? `project_id=eq.${projectId}` : `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          setMessages((current) => {
            if (payload.eventType === "DELETE") {
              const removed = getRealtimeOldRow<MessageRow>(payload, "useChat.messages.delete", [
                "id",
                "project_id",
              ]);

              if (!removed) {
                return current;
              }

              if (!projectId && removed.project_id !== null) {
                return current;
              }

              return current.filter((item) => item.id !== removed.id);
            }

            if (payload.eventType === "INSERT") {
              const inserted = getRealtimeNewRow<MessageRow>(payload, "useChat.messages.insert", [
                "id",
                "workspace_id",
                "project_id",
                "user_id",
                "content",
              ]);

              if (!inserted) {
                return current;
              }

              if (!projectId && inserted.project_id !== null) {
                return current;
              }

              if (inserted.user_id !== currentUserId && document.visibilityState === "visible") {
                void markAsRead();
              }

              const next = applyDisplayName(inserted);
              const withoutTemp = current.filter(
                (item) => !(item.id.startsWith("temp-") && item.content === next.content && item.user_id === next.user_id),
              );

              return [...withoutTemp, next];
            }

            const updated = getRealtimeNewRow<MessageRow>(payload, "useChat.messages.update", [
              "id",
              "workspace_id",
              "project_id",
              "user_id",
              "content",
            ]);

            if (!updated) {
              return current;
            }

            if (!projectId && updated.project_id !== null) {
              return current;
            }

            const next = applyDisplayName(updated);
            return current.map((item) => (item.id === next.id ? next : item));
          });
        },
      ),
    [applyDisplayName, currentUserId, markAsRead, projectId, workspaceId],
  );

  const { connected } = useRealtime({
    enabled: Boolean(workspaceId),
    name: projectId ? `project:${projectId}:messages` : `workspace:${workspaceId}:messages`,
    supabase,
    setup: setupMessagesChannel,
  });

  const setupReadStateChannel = useCallback(
    (channel: RealtimeChannel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_read_states",
          filter: currentUserId ? `user_id=eq.${currentUserId}` : undefined,
        },
        (payload) => {
          const row = getRealtimeChangedRow<ChatReadStateRow>(payload, "useChat.readState", [
            "workspace_id",
            "user_id",
            "scope_key",
          ]);

          if (!row) {
            return;
          }

          if (row.workspace_id !== workspaceId) {
            return;
          }

          const scopeKey = projectId ? `project:${projectId}` : `workspace:${workspaceId}`;

          if (row.scope_key !== scopeKey) {
            return;
          }

          if (payload.eventType === "DELETE") {
            setLastReadAt(null);
            return;
          }

          setLastReadAt(row.last_read_at);
        },
      ),
    [currentUserId, projectId, workspaceId],
  );

  useRealtime({
    enabled: Boolean(currentUserId),
    name: projectId ? `project:${projectId}:read-state` : `workspace:${workspaceId}:read-state`,
    supabase,
    setup: setupReadStateChannel,
  });

  const sendMessage = useCallback(
    async (content: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMessage("Session expired. Please sign in again.");
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const profileSnapshot = await getCurrentUserProfileSnapshot(supabase, user);
      const senderDisplayName = profileSnapshot.displayName || getDisplayNameFromEmail(user.email);

      const tempId = `temp-${Date.now()}`;

      setMessages((current) => [
        ...current,
        {
          id: tempId,
          workspace_id: workspaceId,
          project_id: projectId,
          user_id: user.id,
          content,
          created_at: new Date().toISOString(),
          displayName: senderDisplayName,
          isOptimistic: true,
        },
      ]);

      const { data, error } = await supabase
        .from("messages")
        .insert({
          workspace_id: workspaceId,
          project_id: projectId,
          user_id: user.id,
          content,
        })
        .select("*")
        .single();

      if (error || !data) {
        setMessages((current) => current.filter((item) => item.id !== tempId));
        setErrorMessage(error?.message ?? "Could not send message.");
        toast.error(error?.message ?? "Could not send message.");
        return;
      }

      const mentionedUserIds = extractMentionedUserIds(content, memberNames).filter((userId) => userId !== user.id);

      if (mentionedUserIds.length) {
        await insertNotifications(
          supabase,
          mentionedUserIds.map((recipientUserId) => ({
            workspaceId,
            projectId,
            recipientUserId,
            actorId: user.id,
            type: "chat.mentioned",
            title: `${senderDisplayName} mentioned you in ${projectId ? "project chat" : "workspace chat"}`,
            body: content,
            metadata: {
              messageId: data.id,
              projectId,
            },
          })),
        );
      }

      await markAsRead();
    },
    [markAsRead, memberNames, projectId, supabase, workspaceId],
  );

  return {
    messages,
    isLoading,
    currentUserId,
    errorMessage,
    sendMessage,
    lastReadAt,
    connected,
  };
}
