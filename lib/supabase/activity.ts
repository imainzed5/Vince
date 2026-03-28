import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

type ActivityParams = {
  workspaceId: string;
  projectId?: string;
  actorId: string;
  action: string;
  metadata?: Record<string, unknown>;
};

export async function insertActivity(
  supabase: SupabaseClient<Database>,
  params: ActivityParams,
): Promise<void> {
  await supabase.from("activity_log").insert({
    workspace_id: params.workspaceId,
    project_id: params.projectId ?? null,
    actor_id: params.actorId,
    action: params.action,
    metadata: (params.metadata ?? {}) as Json,
  });
}
