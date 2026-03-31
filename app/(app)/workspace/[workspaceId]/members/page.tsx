import { redirect } from "next/navigation";

import { MembersView, type MemberListItem } from "@/components/shared/MembersView";
import { RealtimeRefreshBridge } from "@/components/shared/RealtimeRefreshBridge";
import { getWorkspaceMemberNames } from "@/lib/supabase/member-names";
import { createClient } from "@/lib/supabase/server";
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
  const memberNames = await getWorkspaceMemberNames(workspaceId, {
    id: user.id,
    email: user.email ?? null,
  });

  const memberItems: MemberListItem[] = memberRows.map((member) => {
    return {
      id: member.id,
      userId: member.user_id,
      role: member.role,
      displayName: memberNames[member.user_id] ?? "Unknown member",
      joinedDateLabel: toStableDateLabel(member.joined_at),
    };
  });

  const currentMembership = memberRows.find((member) => member.user_id === user.id) ?? null;

  return (
    <>
      <RealtimeRefreshBridge
        name={`workspace:${workspaceId}:members-refresh`}
        subscriptions={[
          { table: "workspaces", filter: `id=eq.${workspaceId}` },
          { table: "workspace_members", filter: `workspace_id=eq.${workspaceId}` },
        ]}
      />
      <MembersView
        workspaceId={workspaceId}
        inviteCode={workspace.invite_code}
        currentUserId={user.id}
        currentUserRole={currentMembership?.role ?? "member"}
        members={memberItems}
      />
    </>
  );
}
