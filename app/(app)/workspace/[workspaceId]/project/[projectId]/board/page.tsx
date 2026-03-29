import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { BoardView } from "@/components/board/BoardView";
import { RealtimeRefreshBridge } from "@/components/shared/RealtimeRefreshBridge";
import { getWorkspaceMemberNames } from "@/lib/supabase/member-names";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type BoardPageProps = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
  }>;
};

export default async function BoardPage({ params }: BoardPageProps) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: project, error: projectError }, { data: members }, { data: milestones }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, phase, prefix, status")
      .eq("id", projectId)
      .eq("workspace_id", workspaceId)
      .single(),
    supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", workspaceId)
      .order("joined_at", { ascending: true }),
    supabase
      .from("milestones")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
  ]);

  if (projectError || !project) {
    return (
      <main className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Could not load project board</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {projectError?.message ?? "Project was not found or you do not have access to it."}
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const memberNames = await getWorkspaceMemberNames(workspaceId, {
    id: user.id,
    email: user.email ?? null,
  });

  const memberOptions = ((members ?? []) as Pick<Database["public"]["Tables"]["workspace_members"]["Row"], "user_id" | "role">[]).map(
    (member) => ({
      id: member.user_id,
      role: member.role,
      name: memberNames[member.user_id] ?? `User ${member.user_id.slice(0, 8)}`,
    }),
  );

  return (
    <main className="p-6">
      <RealtimeRefreshBridge
        name={`project:${projectId}:board-refresh`}
        subscriptions={[
          { table: "projects", filter: `id=eq.${projectId}` },
          { table: "milestones", filter: `project_id=eq.${projectId}` },
          { table: "workspace_members", filter: `workspace_id=eq.${workspaceId}` },
        ]}
      />
      <BoardView
        workspaceId={workspaceId}
        projectId={projectId}
        projectName={project.name}
        projectPhase={project.phase}
        projectPrefix={project.prefix}
        projectStatus={project.status}
        members={memberOptions}
        milestones={(milestones ?? []) as Database["public"]["Tables"]["milestones"]["Row"][]}
        currentUserId={user.id}
      />
    </main>
  );
}
