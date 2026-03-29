import { redirect } from "next/navigation";

import { ChatView } from "@/components/chat/ChatView";
import { RealtimeRefreshBridge } from "@/components/shared/RealtimeRefreshBridge";
import { getWorkspaceMemberNames } from "@/lib/supabase/member-names";
import { createClient } from "@/lib/supabase/server";

type ProjectChatPageProps = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
  }>;
};

export default async function ProjectChatPage({ params }: ProjectChatPageProps) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: project } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const memberNames = await getWorkspaceMemberNames(workspaceId, {
    id: user.id,
    email: user.email ?? null,
  });

  return (
    <>
      <RealtimeRefreshBridge
        name={`project:${projectId}:chat-refresh`}
        subscriptions={[
          { table: "projects", filter: `id=eq.${projectId}` },
          { table: "workspace_members", filter: `workspace_id=eq.${workspaceId}` },
        ]}
      />
      <ChatView
        workspaceId={workspaceId}
        projectId={projectId}
        readOnly={(project?.status ?? "active") === "archived"}
        memberNames={memberNames}
      />
    </>
  );
}
