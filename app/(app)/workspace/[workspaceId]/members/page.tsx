import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { MembersView, type MemberListItem } from "@/components/shared/MembersView";
import { createClient } from "@/lib/supabase/server";
import { getDisplayNameFromEmail } from "@/lib/utils/displayName";
import type { Database } from "@/types/database.types";

type WorkspaceMembersPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

type Member = Database["public"]["Tables"]["workspace_members"]["Row"];

function toStableDateLabel(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

export default async function WorkspaceMembersPage({ params }: WorkspaceMembersPageProps) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: workspace }, { data: members }] = await Promise.all([
    supabase.from("workspaces").select("invite_code").eq("id", workspaceId).single(),
    supabase
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("joined_at", { ascending: true }),
  ]);

  if (!workspace) {
    return <main className="p-6 text-sm text-red-700">Unable to load members for this workspace.</main>;
  }

  const memberRows = (members ?? []) as Member[];
  const userIds = Array.from(new Set(memberRows.map((member) => member.user_id)));

  const emailByUserId = new Map<string, string | null>();
  if (user.email) {
    emailByUserId.set(user.id, user.email);
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (serviceRoleKey) {
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

    await Promise.all(
      userIds.map(async (userId) => {
        if (emailByUserId.has(userId)) {
          return;
        }

        const { data } = await adminClient.auth.admin.getUserById(userId);
        emailByUserId.set(userId, data.user?.email ?? null);
      }),
    );
  }

  const memberItems: MemberListItem[] = memberRows.map((member) => {
    const email = emailByUserId.get(member.user_id) ?? null;
    const displayName = email ? getDisplayNameFromEmail(email) : `User ${member.user_id.slice(0, 8)}`;

    return {
      id: member.id,
      userId: member.user_id,
      role: member.role,
      displayName,
      joinedDateLabel: toStableDateLabel(member.joined_at),
    };
  });

  const currentMembership = memberRows.find((member) => member.user_id === user.id) ?? null;

  return (
    <MembersView
      workspaceId={workspaceId}
      inviteCode={workspace.invite_code}
      currentUserId={user.id}
      currentUserRole={currentMembership?.role ?? "member"}
      members={memberItems}
    />
  );
}
