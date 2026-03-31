import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { resolveUserDisplayName } from "@/lib/supabase/user-profiles";
import { getDisplayNameFromEmail, getMemberDisplayName } from "@/lib/utils/displayName";
import type { Database } from "@/types/database.types";

export async function getWorkspaceMemberNames(
  workspaceId: string,
  fallbackCurrentUser?: { id: string; email: string | null },
): Promise<Record<string, string>> {
  const memberNames: Record<string, string> = {};

  if (fallbackCurrentUser?.email) {
    memberNames[fallbackCurrentUser.id] = getDisplayNameFromEmail(fallbackCurrentUser.email);
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return memberNames;
  }

  const adminClient = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data: members } = await adminClient
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);

  const userIds = Array.from(new Set((members ?? []).map((member) => member.user_id)));

  const { data: profiles } = await adminClient
    .from("user_profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

  await Promise.all(
    userIds.map(async (userId) => {
      if (memberNames[userId]) {
        return;
      }

      const { data } = await adminClient.auth.admin.getUserById(userId);
      const email = data.user?.email;

      memberNames[userId] = resolveUserDisplayName(profileMap.get(userId) ?? null, email)
        || (email ? getDisplayNameFromEmail(email) : getMemberDisplayName(null));
    }),
  );

  return memberNames;
}
