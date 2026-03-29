import { redirect } from "next/navigation";

import { RealtimeRefreshBridge } from "@/components/shared/RealtimeRefreshBridge";
import { WorkspaceSettingsView } from "@/components/shared/WorkspaceSettingsView";
import { createClient } from "@/lib/supabase/server";

type WorkspaceSettingsPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceSettingsPage({ params }: WorkspaceSettingsPageProps) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: workspace }, { data: membership }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name, invite_code, created_at")
      .eq("id", workspaceId)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!workspace || !membership) {
    redirect("/dashboard");
  }

  return (
    <>
      <RealtimeRefreshBridge
        name={`workspace:${workspaceId}:settings-refresh`}
        subscriptions={[
          { table: "workspaces", filter: `id=eq.${workspaceId}` },
          { table: "workspace_members", filter: `workspace_id=eq.${workspaceId}` },
        ]}
      />
      <WorkspaceSettingsView
        workspaceId={workspace.id}
        initialName={workspace.name}
        initialInviteCode={workspace.invite_code}
        createdAt={workspace.created_at}
        currentUserRole={membership.role}
      />
    </>
  );
}