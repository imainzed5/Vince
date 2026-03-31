import { redirect } from "next/navigation";

import { MyTasksView } from "@/components/tasks/MyTasksView";
import { createRouteTimingLogger } from "@/lib/observability/route-timing";
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
  const timing = createRouteTimingLogger("app/(app)/my-tasks/page");
  let outcome = "render";
  let workspaceCount = 0;
  let projectCount = 0;
  let relevantProjectCount = 0;
  let taskCount = 0;
  let defaultWorkspaceId: string | null = null;

  try {
    const resolvedSearchParams = await timing.measure("resolve_search_params", async () => searchParams);
    const supabase = await timing.measure("createClient", createClient);
    const {
      data: { user },
    } = await timing.measure("auth.getUser", () => supabase.auth.getUser());

    if (!user) {
      outcome = "redirect_login";
      redirect("/login");
    }

    const destination = await timing.measure("resolve_workspace_route", () => getUserWorkspaceRoute(supabase, user.id));

    if (destination.kind === "none") {
      outcome = "redirect_empty_workspace";
      redirect(destination.path);
    }

    const { data: memberships } = await timing.measure("load_memberships", () =>
      supabase
        .from("workspace_members")
        .select("*")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true }),
    );

    const workspaceIds = (memberships ?? []).map((membership) => membership.workspace_id);
    workspaceCount = workspaceIds.length;

    if (!workspaceIds.length) {
      outcome = "redirect_create_workspace";
      redirect("/create-workspace");
    }

    const [{ data: workspaces }, { data: projects }, { data: allMembers }] = await timing.measure(
      "load_workspace_shell",
      () =>
        Promise.all([
          supabase.from("workspaces").select("*").in("id", workspaceIds).order("created_at", { ascending: true }),
          supabase.from("projects").select("*").in("workspace_id", workspaceIds).order("created_at", { ascending: true }),
          supabase.from("workspace_members").select("*").in("workspace_id", workspaceIds).order("joined_at", { ascending: true }),
        ]),
    );

    const accessibleProjects = (projects ?? []) as Project[];
    const accessibleProjectIds = accessibleProjects.map((project) => project.id);
    projectCount = accessibleProjects.length;

    const { data: assignedTaskRows } = accessibleProjectIds.length
      ? await timing.measure("load_assigned_project_ids", () =>
          supabase
            .from("tasks")
            .select("project_id")
            .eq("assignee_id", user.id)
            .in("project_id", accessibleProjectIds),
        )
      : { data: [] as Pick<Task, "project_id">[] };

    const relevantProjectIds = Array.from(
      new Set((assignedTaskRows ?? []).map((task) => task.project_id).filter(Boolean)),
    );
    relevantProjectCount = relevantProjectIds.length;

    const [{ data: tasks }, { data: milestones }, { data: taskDependencies }, { data: taskFieldDefinitions }, { data: taskStatusDefinitions }, memberNamePairs] = await timing.measure(
      "load_task_domain",
      () =>
        Promise.all([
          relevantProjectIds.length
            ? supabase.from("tasks").select("*").in("project_id", relevantProjectIds).order("created_at", { ascending: false })
            : Promise.resolve({ data: [] as Database["public"]["Tables"]["tasks"]["Row"][] }),
          relevantProjectIds.length
            ? supabase.from("milestones").select("*").in("project_id", relevantProjectIds).order("created_at", { ascending: true })
            : Promise.resolve({ data: [] as Milestone[] }),
          relevantProjectIds.length
            ? supabase.from("task_dependencies").select("*").in("project_id", relevantProjectIds).order("created_at", { ascending: true })
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
        ]),
    );

    taskCount = (tasks ?? []).length;

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

    defaultWorkspaceId =
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
        projects={accessibleProjects}
        milestones={(milestones ?? []) as Milestone[]}
        membersByWorkspace={membersByWorkspace}
        customFieldDefinitionsByWorkspace={customFieldDefinitionsByWorkspace}
        taskStatusesByWorkspace={taskStatusesByWorkspace}
      />
    );
  } finally {
    timing.finish({
      outcome,
      workspaceCount,
      projectCount,
      relevantProjectCount,
      taskCount,
      defaultWorkspaceId,
    });
  }
}
