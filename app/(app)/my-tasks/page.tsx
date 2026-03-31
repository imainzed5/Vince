import { redirect } from "next/navigation";

import { MyTasksView } from "@/components/tasks/MyTasksView";
import { getWorkspaceMemberNames } from "@/lib/supabase/member-names";
import { createClient } from "@/lib/supabase/server";
import { getMemberDisplayName } from "@/lib/utils/displayName";
import { getUserWorkspaceRoute } from "@/lib/workspace";
import type { Project, Task, TaskCustomFieldDefinition, TaskDependency, Workspace, WorkspaceTaskStatusDefinition } from "@/types";
import type { Database } from "@/types/database.types";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type WorkspaceMember = Database["public"]["Tables"]["workspace_members"]["Row"];

type MyTasksPageProps = {
  searchParams?: Promise<{
    workspaceId?: string;
  }>;
};

export default async function MyTasksPage({ searchParams }: MyTasksPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const destination = await getUserWorkspaceRoute(supabase, user.id);

  if (destination.kind === "none") {
    redirect(destination.path);
  }

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  const workspaceIds = (memberships ?? []).map((membership) => membership.workspace_id);

  if (!workspaceIds.length) {
    redirect("/create-workspace");
  }

  const [{ data: workspaces }, { data: projects }, { data: allMembers }] = await Promise.all([
    supabase.from("workspaces").select("*").in("id", workspaceIds).order("created_at", { ascending: true }),
    supabase.from("projects").select("*").in("workspace_id", workspaceIds).order("created_at", { ascending: true }),
    supabase.from("workspace_members").select("*").in("workspace_id", workspaceIds).order("joined_at", { ascending: true }),
  ]);

  const projectIds = (projects ?? []).map((project) => project.id);

  const [{ data: tasks }, { data: milestones }, { data: taskDependencies }, { data: taskFieldDefinitions }, { data: taskStatusDefinitions }, memberNamePairs] = await Promise.all([
    projectIds.length
      ? supabase.from("tasks").select("*").in("project_id", projectIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Database["public"]["Tables"]["tasks"]["Row"][] }),
    projectIds.length
      ? supabase.from("milestones").select("*").in("project_id", projectIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as Milestone[] }),
    projectIds.length
      ? supabase.from("task_dependencies").select("*").in("project_id", projectIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as Database["public"]["Tables"]["task_dependencies"]["Row"][] }),
    workspaceIds.length
      ? supabase
          .from("workspace_task_fields")
          .select("*")
          .in("workspace_id", workspaceIds)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] as TaskCustomFieldDefinition[] }),
    workspaceIds.length
      ? supabase
          .from("workspace_task_statuses")
          .select("*")
          .in("workspace_id", workspaceIds)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] as WorkspaceTaskStatusDefinition[] }),
    Promise.all(
      workspaceIds.map(async (workspaceId) => [
        workspaceId,
        await getWorkspaceMemberNames(workspaceId, {
          id: user.id,
          email: user.email ?? null,
        }),
      ] as const),
    ),
  ]);

  const memberNamesByWorkspace = Object.fromEntries(memberNamePairs);
  const customFieldDefinitionsByWorkspace = ((taskFieldDefinitions ?? []) as TaskCustomFieldDefinition[]).reduce<
    Record<string, TaskCustomFieldDefinition[]>
  >((accumulator, field) => {
    accumulator[field.workspace_id] ??= [];
    accumulator[field.workspace_id].push(field);
    return accumulator;
  }, {});
  const membersByWorkspace = ((allMembers ?? []) as WorkspaceMember[]).reduce<Record<string, Array<{ id: string; name: string; role: string }>>>(
    (accumulator, member) => {
      const displayName = getMemberDisplayName(memberNamesByWorkspace[member.workspace_id]?.[member.user_id]);

      accumulator[member.workspace_id] ??= [];
      accumulator[member.workspace_id].push({
        id: member.user_id,
        name: displayName,
        role: member.role,
      });

      return accumulator;
    },
    {},
  );
  const taskStatusesByWorkspace = ((taskStatusDefinitions ?? []) as WorkspaceTaskStatusDefinition[]).reduce<
    Record<string, WorkspaceTaskStatusDefinition[]>
  >((accumulator, status) => {
    accumulator[status.workspace_id] ??= [];
    accumulator[status.workspace_id].push(status);
    return accumulator;
  }, {});

  const defaultWorkspaceId =
    typeof resolvedSearchParams?.workspaceId === "string" && workspaceIds.includes(resolvedSearchParams.workspaceId)
      ? resolvedSearchParams.workspaceId
      : null;

  return (
    <MyTasksView
      currentUserId={user.id}
      defaultWorkspaceId={defaultWorkspaceId}
      initialDependencies={(taskDependencies ?? []) as TaskDependency[]}
      initialTasks={(tasks ?? []) as Task[]}
      workspaces={(workspaces ?? []) as Workspace[]}
      projects={(projects ?? []) as Project[]}
      milestones={(milestones ?? []) as Milestone[]}
      membersByWorkspace={membersByWorkspace}
      customFieldDefinitionsByWorkspace={customFieldDefinitionsByWorkspace}
      taskStatusesByWorkspace={taskStatusesByWorkspace}
    />
  );
}
