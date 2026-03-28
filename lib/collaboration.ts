import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json, TablesInsert } from "@/types/database.types";

type NotificationInsert = TablesInsert<"notifications">;

type NotificationInput = {
  workspaceId: string;
  projectId?: string | null;
  recipientUserId: string;
  actorId: string;
  type: string;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
};

type ChatScopeParams = {
  workspaceId: string;
  projectId?: string | null;
};

type ChatReadParams = ChatScopeParams & {
  userId: string;
};

function normalizeMentionToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildNameTokens(name: string): string[] {
  const tokens = new Set<string>();
  const compact = normalizeMentionToken(name);

  if (compact) {
    tokens.add(compact);
  }

  for (const part of name.split(/\s+/)) {
    const normalized = normalizeMentionToken(part);

    if (normalized.length >= 2) {
      tokens.add(normalized);
    }
  }

  return [...tokens];
}

export function buildChatScopeKey({ workspaceId, projectId = null }: ChatScopeParams): string {
  return projectId ? `project:${projectId}` : `workspace:${workspaceId}`;
}

export function extractMentionedUserIds(
  content: string,
  memberNames: Record<string, string>,
): string[] {
  const mentionHandles = new Set(
    [...content.matchAll(/(^|\s)@([a-z0-9][a-z0-9._-]{1,31})/gi)].map(([, , handle]) =>
      normalizeMentionToken(handle),
    ),
  );

  if (!mentionHandles.size) {
    return [];
  }

  const recipients: string[] = [];

  for (const [userId, name] of Object.entries(memberNames)) {
    const tokens = buildNameTokens(name);

    if (tokens.some((token) => mentionHandles.has(token))) {
      recipients.push(userId);
    }
  }

  return [...new Set(recipients)];
}

export async function insertNotifications(
  supabase: SupabaseClient<Database>,
  notifications: NotificationInput[],
): Promise<void> {
  const payload: NotificationInsert[] = [];
  const seen = new Set<string>();

  for (const notification of notifications) {
    if (!notification.recipientUserId || notification.recipientUserId === notification.actorId) {
      continue;
    }

    const dedupeKey = [
      notification.recipientUserId,
      notification.type,
      notification.projectId ?? "workspace",
      notification.title,
    ].join(":");

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    payload.push({
      workspace_id: notification.workspaceId,
      project_id: notification.projectId ?? null,
      user_id: notification.recipientUserId,
      actor_id: notification.actorId,
      type: notification.type,
      title: notification.title,
      body: notification.body ?? null,
      metadata: (notification.metadata ?? {}) as Json,
    });
  }

  if (!payload.length) {
    return;
  }

  const { error } = await supabase.from("notifications").insert(payload);

  if (error) {
    console.error("Could not insert notifications", error);
  }
}

export async function getChatLastReadAt(
  supabase: SupabaseClient<Database>,
  params: ChatReadParams,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("chat_read_states")
    .select("last_read_at")
    .eq("user_id", params.userId)
    .eq("scope_key", buildChatScopeKey(params))
    .maybeSingle();

  if (error) {
    return null;
  }

  return data?.last_read_at ?? null;
}

export async function getUnreadChatCount(
  supabase: SupabaseClient<Database>,
  params: ChatReadParams,
): Promise<number> {
  const lastReadAt = await getChatLastReadAt(supabase, params);
  let query = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", params.workspaceId);

  if (params.projectId) {
    query = query.eq("project_id", params.projectId);
  } else {
    query = query.is("project_id", null);
  }

  if (lastReadAt) {
    query = query.gt("created_at", lastReadAt);
  }

  const { count } = await query;

  return count ?? 0;
}

export async function upsertChatReadState(
  supabase: SupabaseClient<Database>,
  params: ChatReadParams,
): Promise<string | null> {
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from("chat_read_states")
    .upsert(
      {
        workspace_id: params.workspaceId,
        project_id: params.projectId ?? null,
        user_id: params.userId,
        scope_key: buildChatScopeKey(params),
        last_read_at: timestamp,
      },
      { onConflict: "user_id,scope_key" },
    )
    .select("last_read_at")
    .single();

  if (error) {
    return null;
  }

  return data?.last_read_at ?? timestamp;
}