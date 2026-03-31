import Link from "next/link";
import { redirect } from "next/navigation";

import { ActivityItem } from "@/components/activity/ActivityItem";
import { RealtimeRefreshBridge } from "@/components/shared/RealtimeRefreshBridge";
import { WorkspaceCreatedToast } from "@/components/shared/WorkspaceCreatedToast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInFlightTaskStatusKeys, isDoneTaskStatus } from "@/lib/task-statuses";
import { getWorkspaceMemberNames } from "@/lib/supabase/member-names";
import { createClient } from "@/lib/supabase/server";
import { getDisplayNameFromEmail, getMemberDisplayName } from "@/lib/utils/displayName";
import { formatCalendarDate } from "@/lib/utils/time";
import type { Database } from "@/types/database.types";

type WorkspacePageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
  searchParams: Promise<{
    q?: string;
  }>;
};

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];
type ActivityRow = Database["public"]["Tables"]["activity_log"]["Row"];
type ProjectStatusUpdateSummary = Pick<
  Database["public"]["Tables"]["project_status_updates"]["Row"],
  "project_id" | "health" | "headline" | "created_at"
>;
type WorkspaceMemberRow = Pick<
  Database["public"]["Tables"]["workspace_members"]["Row"],
  "user_id" | "role"
>;
type WorkspaceTaskRow = Pick<
  Task,
  "id" | "project_id" | "status" | "is_blocked" | "assignee_id" | "due_date" | "title" | "identifier"
>;
type NoteSearchRow = Pick<
  Database["public"]["Tables"]["notes"]["Row"],
  "id" | "title" | "content" | "project_id" | "updated_at"
>;
type MessageSearchRow = Pick<
  Database["public"]["Tables"]["messages"]["Row"],
  "id" | "content" | "project_id" | "user_id" | "created_at"
>;

const phaseLabel: Record<string, string> = {
  planning: "Planning",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

const phaseBadgeClass: Record<string, string> = {
  planning: "border-border bg-muted text-foreground dark:bg-[var(--surface-subpanel)] dark:text-white/56",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-500/18 dark:text-blue-200",
  in_review: "bg-amber-100 text-amber-700 dark:bg-amber-500/18 dark:text-amber-200",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/18 dark:text-emerald-200",
};

function truncate(value: string | null | undefined, maxLength = 140): string {
  const safeValue = (value ?? "").trim();

  if (safeValue.length <= maxLength) {
    return safeValue;
  }

  return `${safeValue.slice(0, maxLength - 1).trimEnd()}…`;
}

function isOverdue(task: WorkspaceTaskRow, taskStatuses: Database["public"]["Tables"]["workspace_task_statuses"]["Row"][]): boolean {
  if (!task.due_date || isDoneTaskStatus(task.status, taskStatuses)) {
    return false;
  }

  return new Date(task.due_date).getTime() < new Date().setHours(0, 0, 0, 0);
}

function isDueSoon(task: WorkspaceTaskRow, taskStatuses: Database["public"]["Tables"]["workspace_task_statuses"]["Row"][]): boolean {
  if (!task.due_date || isDoneTaskStatus(task.status, taskStatuses)) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(task.due_date);
  dueDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
  return diffDays >= 0 && diffDays <= 3;
}

function getHealthBadgeClass(health: string | null | undefined): string {
  if (health === "on_track") {
    return "border-emerald-500/16 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/12 dark:bg-emerald-400/18 dark:text-emerald-200";
  }

  if (health === "at_risk") {
    return "border-amber-500/16 bg-amber-500/10 text-amber-700 dark:border-amber-400/12 dark:bg-amber-400/18 dark:text-amber-200";
  }

  if (health === "off_track") {
    return "border-red-500/16 bg-red-500/10 text-red-700 dark:border-red-400/12 dark:bg-red-400/18 dark:text-red-200";
  }

  return "border-border bg-muted text-foreground dark:bg-[var(--surface-subpanel)] dark:text-white/56";
}

function getHealthLabel(health: string | null | undefined): string {
  if (health === "on_track") {
    return "On track";
  }

  if (health === "at_risk") {
    return "At risk";
  }

  if (health === "off_track") {
    return "Off track";
  }

  return "No update";
}

function getWorkloadLabel(summary: { assignedCount: number; blockedCount: number; overdueCount: number; dueSoonCount: number }): string {
  if (summary.overdueCount > 0 || summary.blockedCount >= 2 || summary.assignedCount >= 6) {
    return "Heavy";
  }

  if (summary.dueSoonCount > 0 || summary.blockedCount > 0 || summary.assignedCount >= 4) {
    return "Watch";
  }

  return "Balanced";
}

function getWorkloadBadgeClass(label: string): string {
  if (label === "Heavy") {
    return "bg-red-500/10 text-red-700 dark:bg-red-400/18 dark:text-red-200";
  }

  if (label === "Watch") {
    return "bg-amber-500/10 text-amber-700 dark:bg-amber-400/18 dark:text-amber-200";
  }

  return "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/18 dark:text-emerald-200";
}

export default async function WorkspacePage({ params, searchParams }: WorkspacePageProps) {
  const { workspaceId } = await params;
  const { q } = await searchParams;
  const renderedAt = Date.now();
  const searchQuery = (q ?? "").trim();
  const canRunSearch = searchQuery.length >= 2;
  const searchableQuery = searchQuery.replace(/[,%]/g, " ");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: workspace }, { data: members, count: memberCount }, { data: projects }, { data: activity }] =
    await Promise.all([
      supabase
        .from("workspaces")
        .select("id, name, invite_code")
        .eq("id", workspaceId)
        .single(),
      supabase
        .from("workspace_members")
        .select("user_id, role", { count: "exact" })
        .eq("workspace_id", workspaceId),
      supabase
        .from("projects")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true }),
      supabase
        .from("activity_log")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  if (!workspace) {
    redirect("/dashboard");
  }

  const workspaceProjects = (projects ?? []) as Project[];
  const workspaceMembers = (members ?? []) as WorkspaceMemberRow[];
  const projectIds = workspaceProjects.map((project) => project.id);
  const [{ data: tasks }, { data: statusUpdates }, { data: taskStatuses }] = await Promise.all([
    projectIds.length
      ? supabase
          .from("tasks")
          .select("id, project_id, status, is_blocked, assignee_id, due_date, title, identifier")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as WorkspaceTaskRow[] }),
    projectIds.length
      ? supabase
          .from("project_status_updates")
          .select("project_id, health, headline, created_at")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as ProjectStatusUpdateSummary[] }),
    supabase
      .from("workspace_task_statuses")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true }),
  ]);
  const workspaceTasks = (tasks ?? []) as WorkspaceTaskRow[];
  const statusUpdateRows = (statusUpdates ?? []) as ProjectStatusUpdateSummary[];
  const workspaceTaskStatuses = (taskStatuses ?? []) as Database["public"]["Tables"]["workspace_task_statuses"]["Row"][];
  const recentActivity = (activity ?? []) as ActivityRow[];
  const memberNames = await getWorkspaceMemberNames(workspaceId, {
    id: user.id,
    email: user.email ?? null,
  });
  const currentUserName = getDisplayNameFromEmail(user.email);
  const projectNameById = Object.fromEntries(workspaceProjects.map((project) => [project.id, project.name]));
  const inFlightStatusKeys = getInFlightTaskStatusKeys(workspaceTaskStatuses);

  const taskCount = workspaceTasks.length;
  const completedTaskCount = workspaceTasks.filter((task) => isDoneTaskStatus(task.status, workspaceTaskStatuses)).length;
  const blockedTaskCount = workspaceTasks.filter((task) => task.is_blocked).length;
  const inFlightTaskCount = workspaceTasks.filter((task) => inFlightStatusKeys.includes(task.status)).length;
  const unassignedTaskCount = workspaceTasks.filter(
    (task) => !task.assignee_id && !isDoneTaskStatus(task.status, workspaceTaskStatuses),
  ).length;
  const overdueTaskCount = workspaceTasks.filter((task) => isOverdue(task, workspaceTaskStatuses)).length;
  const dueSoonTaskCount = workspaceTasks.filter((task) => {
    return isDueSoon(task, workspaceTaskStatuses);
  }).length;

  const latestStatusByProject = new Map<string, ProjectStatusUpdateSummary>();

  for (const statusUpdate of statusUpdateRows) {
    if (!latestStatusByProject.has(statusUpdate.project_id)) {
      latestStatusByProject.set(statusUpdate.project_id, statusUpdate);
    }
  }

  const projectStats = new Map<string, { taskCount: number; completedCount: number; blockedCount: number; overdueCount: number; dueSoonCount: number; unassignedCount: number }>();

  for (const project of workspaceProjects) {
    projectStats.set(project.id, {
      taskCount: 0,
      completedCount: 0,
      blockedCount: 0,
      overdueCount: 0,
      dueSoonCount: 0,
      unassignedCount: 0,
    });
  }

  for (const task of workspaceTasks) {
    const stats = projectStats.get(task.project_id);

    if (!stats) {
      continue;
    }

    stats.taskCount += 1;

    if (isDoneTaskStatus(task.status, workspaceTaskStatuses)) {
      stats.completedCount += 1;
    }

    if (task.is_blocked) {
      stats.blockedCount += 1;
    }

    if (isOverdue(task, workspaceTaskStatuses)) {
      stats.overdueCount += 1;
    }

    if (isDueSoon(task, workspaceTaskStatuses)) {
      stats.dueSoonCount += 1;
    }

    if (!task.assignee_id && !isDoneTaskStatus(task.status, workspaceTaskStatuses)) {
      stats.unassignedCount += 1;
    }
  }

  const projectSummaries = workspaceProjects.map((project) => {
    const stats = projectStats.get(project.id) ?? {
      taskCount: 0,
      completedCount: 0,
      blockedCount: 0,
      overdueCount: 0,
      dueSoonCount: 0,
      unassignedCount: 0,
    };
    const progress = stats.taskCount ? Math.round((stats.completedCount / stats.taskCount) * 100) : 0;
    const latestStatus = latestStatusByProject.get(project.id) ?? null;

    return {
      ...project,
      ownerName: project.owner_id ? getMemberDisplayName(memberNames[project.owner_id]) : null,
      taskCount: stats.taskCount,
      blockedCount: stats.blockedCount,
      overdueCount: stats.overdueCount,
      dueSoonCount: stats.dueSoonCount,
      unassignedCount: stats.unassignedCount,
      latestStatusHealth: latestStatus?.health ?? null,
      latestStatusHeadline: latestStatus?.headline ?? null,
      progress,
    };
  });

  const attentionTasks = [...workspaceTasks]
    .filter(
      (task) =>
        !isDoneTaskStatus(task.status, workspaceTaskStatuses) &&
        (task.is_blocked || !task.assignee_id || isOverdue(task, workspaceTaskStatuses)),
    )
    .sort((left, right) => {
      if (left.is_blocked !== right.is_blocked) {
        return left.is_blocked ? -1 : 1;
      }

      const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue;
    })
    .slice(0, 6);

  const teamSummaries = workspaceMembers
    .map((member) => {
      const assignedTasks = workspaceTasks.filter(
        (task) => task.assignee_id === member.user_id && !isDoneTaskStatus(task.status, workspaceTaskStatuses),
      );
      const dueSoonCount = assignedTasks.filter((task) => isDueSoon(task, workspaceTaskStatuses)).length;
      const workloadLabel = getWorkloadLabel({
        assignedCount: assignedTasks.length,
        blockedCount: assignedTasks.filter((task) => task.is_blocked).length,
        overdueCount: assignedTasks.filter((task) => isOverdue(task, workspaceTaskStatuses)).length,
        dueSoonCount,
      });

      return {
        userId: member.user_id,
        name: getMemberDisplayName(memberNames[member.user_id]),
        role: member.role,
        assignedCount: assignedTasks.length,
        inProgressCount: assignedTasks.filter((task) => inFlightStatusKeys.includes(task.status)).length,
        blockedCount: assignedTasks.filter((task) => task.is_blocked).length,
        overdueCount: assignedTasks.filter((task) => isOverdue(task, workspaceTaskStatuses)).length,
        dueSoonCount,
        workloadLabel,
        tasks: assignedTasks.slice(0, 3),
      };
    })
    .sort((left, right) => {
      if (right.assignedCount !== left.assignedCount) {
        return right.assignedCount - left.assignedCount;
      }

      if (right.blockedCount !== left.blockedCount) {
        return right.blockedCount - left.blockedCount;
      }

      return left.name.localeCompare(right.name);
    });

  const realtimeSubscriptions = [
    { table: "workspaces", filter: `id=eq.${workspaceId}` },
    { table: "workspace_members", filter: `workspace_id=eq.${workspaceId}` },
    { table: "projects", filter: `workspace_id=eq.${workspaceId}` },
    { table: "workspace_task_statuses", filter: `workspace_id=eq.${workspaceId}` },
    { table: "activity_log", filter: `workspace_id=eq.${workspaceId}` },
    { table: "messages", filter: `workspace_id=eq.${workspaceId}` },
    ...projectIds.map((id) => ({ table: "tasks", filter: `project_id=eq.${id}` })),
    ...projectIds.map((id) => ({ table: "notes", filter: `project_id=eq.${id}` })),
    ...projectIds.map((id) => ({ table: "project_status_updates", filter: `project_id=eq.${id}` })),
  ];

  const projectSearchResults = canRunSearch
    ? projectSummaries.filter((project) => {
        const haystack = `${project.name} ${project.description ?? ""} ${project.scope_summary ?? ""} ${project.success_metric ?? ""}`.toLowerCase();
        const planningHaystack = `${project.goal_statement ?? ""}`.toLowerCase();
        return `${haystack} ${planningHaystack}`.includes(searchableQuery.toLowerCase());
      })
    : [];

  let taskSearchResults: WorkspaceTaskRow[] = [];
  let noteSearchResults: NoteSearchRow[] = [];
  let messageSearchResults: MessageSearchRow[] = [];

  if (canRunSearch) {
    const [taskResults, noteResults, messageResults] = await Promise.all([
      projectIds.length
        ? supabase
            .from("tasks")
            .select("id, project_id, status, is_blocked, assignee_id, due_date, title, identifier")
            .in("project_id", projectIds)
            .or(
              [
                `identifier.ilike.%${searchableQuery}%`,
                `title.ilike.%${searchableQuery}%`,
                `description.ilike.%${searchableQuery}%`,
              ].join(","),
            )
            .limit(6)
        : Promise.resolve({ data: [] }),
      projectIds.length
        ? supabase
            .from("notes")
            .select("id, title, content, project_id, updated_at")
            .in("project_id", projectIds)
            .or([`title.ilike.%${searchableQuery}%`, `content.ilike.%${searchableQuery}%`].join(","))
            .limit(6)
        : Promise.resolve({ data: [] }),
      supabase
        .from("messages")
        .select("id, content, project_id, user_id, created_at")
        .eq("workspace_id", workspaceId)
        .ilike("content", `%${searchableQuery}%`)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    taskSearchResults = (taskResults.data ?? []) as WorkspaceTaskRow[];
    noteSearchResults = (noteResults.data ?? []) as NoteSearchRow[];
    messageSearchResults = (messageResults.data ?? []) as MessageSearchRow[];
  }

  return (
    <main className="space-y-6 p-6">
      <RealtimeRefreshBridge
        name={`workspace:${workspaceId}:overview-refresh`}
        subscriptions={realtimeSubscriptions}
      />
      <WorkspaceCreatedToast />

      <section className="surface-panel flex flex-wrap items-start justify-between gap-4 rounded-2xl border p-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Workspace overview</p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{workspace.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Keep projects, updates, notes, and team activity together in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-1 font-medium text-foreground">
              Invite code {workspace.invite_code}
            </span>
            <span>{(memberCount ?? workspaceMembers.length).toLocaleString()} members</span>
            <span>{workspaceProjects.length.toLocaleString()} projects</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/workspace/${workspaceId}/members`}
            className="surface-subpanel surface-subpanel-hover inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium text-foreground transition"
          >
            Manage members
          </Link>
          <Link
            href={`/workspace/${workspaceId}/activity`}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Open activity feed
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-foreground">{workspaceProjects.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">Across active team workspaces.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Open tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-foreground">{inFlightTaskCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">Work still in motion.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Completed tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-foreground">{completedTaskCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">Delivered across all projects.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Blocked tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-foreground">{blockedTaskCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">Resolve these to keep momentum.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Workspace attention</CardTitle>
                <p className="text-sm text-muted-foreground">The work most likely to slow delivery across this workspace.</p>
              </div>
              <Badge variant="outline">{attentionTasks.length} items</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="surface-subpanel rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Blocked</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{blockedTaskCount}</p>
              </div>
              <div className="surface-subpanel rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Overdue</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{overdueTaskCount}</p>
              </div>
              <div className="surface-subpanel rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Due soon</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{dueSoonTaskCount}</p>
              </div>
              <div className="surface-subpanel rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Unassigned</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{unassignedTaskCount}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {attentionTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No urgent attention items right now.
                </div>
              ) : (
                attentionTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/workspace/${workspaceId}/project/${task.project_id}/board`}
                    className="surface-subpanel-hover block rounded-xl border p-4 transition hover:border-border"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{task.identifier}</Badge>
                      {task.is_blocked ? <Badge variant="destructive">Blocked</Badge> : null}
                      {!task.assignee_id ? <Badge variant="secondary">Unassigned</Badge> : null}
                      {isOverdue(task, workspaceTaskStatuses) ? <Badge variant="destructive">Overdue</Badge> : null}
                    </div>
                    <p className="mt-2 font-medium text-foreground">{task.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {projectNameById[task.project_id] ?? "Project"}
                      {task.assignee_id ? ` · ${getMemberDisplayName(memberNames[task.assignee_id])}` : ""}
                      {task.due_date ? ` · Due ${formatCalendarDate(task.due_date, { includeYear: true, fallback: "" })}` : ""}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project briefs</CardTitle>
            <p className="text-sm text-muted-foreground">See ownership and target dates without opening each project.</p>
          </CardHeader>
          <CardContent>
            {projectSummaries.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No projects yet.</div>
            ) : (
              <div className="space-y-3">
                {projectSummaries.map((project) => (
                  <div key={project.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{project.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {project.ownerName ? `Owner: ${project.ownerName}` : "No explicit owner"}
                          {project.target_date ? ` · Target ${formatCalendarDate(project.target_date, { includeYear: true, fallback: "" })}` : " · No target date"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{project.progress}%</Badge>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getHealthBadgeClass(project.latestStatusHealth)}`}>
                          {getHealthLabel(project.latestStatusHealth)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{truncate(project.goal_statement, 120) || truncate(project.scope_summary, 120) || truncate(project.description, 120) || "No scope summary yet."}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Project health</CardTitle>
                <p className="text-sm text-muted-foreground">See progress, latest status, and pressure across your workspace.</p>
              </div>
              <Badge variant="outline">{taskCount} total tasks</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {projectSummaries.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No projects yet. Create your first project from the sidebar to start tracking work.
              </div>
            ) : (
              <div className="space-y-3">
                {projectSummaries.map((project) => (
                  <Link
                    key={project.id}
                    href={`/workspace/${workspaceId}/project/${project.id}/board`}
                    className="surface-subpanel-hover block rounded-xl border p-4 transition hover:border-border"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-foreground">{project.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {project.taskCount} tasks · {project.blockedCount} blocked · {project.overdueCount} overdue
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {project.status === "archived" ? (
                          <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                            Archived
                          </span>
                        ) : null}
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${phaseBadgeClass[project.phase] ?? "bg-muted text-foreground"}`}
                        >
                          {phaseLabel[project.phase] ?? project.phase}
                        </span>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getHealthBadgeClass(project.latestStatusHealth)}`}>
                          {getHealthLabel(project.latestStatusHealth)}
                        </span>
                      </div>
                    </div>
                    {project.latestStatusHeadline ? (
                      <p className="mt-2 text-sm text-foreground">{project.latestStatusHeadline}</p>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No recent structured status update yet.</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-red-50 px-2 py-1 text-red-700 dark:bg-red-500/15 dark:text-red-200">{project.blockedCount} blocked</span>
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">{project.overdueCount} overdue</span>
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">{project.dueSoonCount} due soon</span>
                      <span className="rounded-full bg-muted px-2 py-1 text-foreground">{project.unassignedCount} unassigned</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium text-foreground">{project.progress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${project.progress}%` }} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <p className="text-sm text-muted-foreground">Latest changes from your team and projects.</p>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No activity yet. Create a project or task to start building momentum.
              </div>
            ) : (
              <ul className="space-y-3">
                {recentActivity.map((item) => (
                  <ActivityItem
                    key={item.id}
                    id={item.id}
                    action={item.action}
                    metadata={item.metadata}
                    actorName={
                      item.actor_id && item.actor_id === user.id
                        ? currentUserName
                        : memberNames[item.actor_id ?? ""] ?? "System"
                    }
                    created_at={item.created_at}
                    referenceTime={renderedAt}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Team workload</CardTitle>
                <p className="text-sm text-muted-foreground">See who is carrying pressure, what is due soon, and where work is getting stuck.</p>
              </div>
              <Badge variant="outline">{dueSoonTaskCount} due soon</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {teamSummaries.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No members found in this workspace yet.
              </div>
            ) : (
              <div className="space-y-3">
                {teamSummaries.map((member) => (
                  <div key={member.userId} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-base font-semibold text-foreground">{member.name}</p>
                        <p className="text-sm text-muted-foreground">{member.assignedCount} active tasks assigned</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{member.role}</Badge>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getWorkloadBadgeClass(member.workloadLabel)}`}>
                          {member.workloadLabel}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-muted px-2 py-1 text-foreground">
                        {member.inProgressCount} in progress
                      </span>
                      <span className="rounded-full bg-red-50 px-2 py-1 text-red-700 dark:bg-red-500/15 dark:text-red-200">
                        {member.blockedCount} blocked
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                        {member.overdueCount} overdue
                      </span>
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
                        {member.dueSoonCount} due soon
                      </span>
                    </div>

                    {member.tasks.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {member.tasks.map((task) => (
                          <Link
                            key={task.id}
                            href={`/workspace/${workspaceId}/project/${task.project_id}/board`}
                            className="surface-subpanel flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm transition hover:border-border hover:bg-[var(--surface-subpanel-hover)]"
                          >
                            <span className="font-medium text-foreground">
                              {task.identifier} · {task.title}
                            </span>
                            <span className="text-xs text-muted-foreground">{projectNameById[task.project_id] ?? "Project"}</span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">No active assigned work right now.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace search</CardTitle>
            <p className="text-sm text-muted-foreground">
              Search across projects, tasks, notes, and chat from the workspace header.
            </p>
          </CardHeader>
          <CardContent>
            {!searchQuery ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Search is scoped to this workspace. Try a task identifier, project name, or a chat phrase.
              </div>
            ) : !canRunSearch ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Enter at least 2 characters to search this workspace.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="surface-subpanel rounded-lg border px-3 py-2 text-sm text-foreground">
                  Showing matches for <span className="font-medium">{searchQuery}</span>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Projects</p>
                  {projectSearchResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No project matches.</p>
                  ) : (
                    projectSearchResults.slice(0, 4).map((project) => (
                      <Link
                        key={project.id}
                        href={`/workspace/${workspaceId}/project/${project.id}/board`}
                        className="surface-subpanel block rounded-lg border px-3 py-2 text-sm transition hover:border-border hover:bg-[var(--surface-subpanel-hover)]"
                      >
                        <p className="font-medium text-foreground">{project.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{truncate(project.scope_summary, 120) || truncate(project.description, 120) || "No project description."}</p>
                      </Link>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Tasks</p>
                  {taskSearchResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No task matches.</p>
                  ) : (
                    taskSearchResults.map((task) => (
                      <Link
                        key={task.id}
                        href={`/workspace/${workspaceId}/project/${task.project_id}/board`}
                        className="surface-subpanel block rounded-lg border px-3 py-2 text-sm transition hover:border-border hover:bg-[var(--surface-subpanel-hover)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-foreground">{task.identifier} · {task.title}</p>
                          <span className="text-xs text-muted-foreground">{projectNameById[task.project_id] ?? "Project"}</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Notes</p>
                  {noteSearchResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No note matches.</p>
                  ) : (
                    noteSearchResults.map((note) => (
                      <Link
                        key={note.id}
                        href={`/workspace/${workspaceId}/project/${note.project_id}/notes`}
                        className="surface-subpanel block rounded-lg border px-3 py-2 text-sm transition hover:border-border hover:bg-[var(--surface-subpanel-hover)]"
                      >
                        <p className="font-medium text-foreground">{note.title || "Untitled"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{truncate(note.content, 120) || "No note preview available."}</p>
                      </Link>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Chat</p>
                  {messageSearchResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No chat matches.</p>
                  ) : (
                    messageSearchResults.map((message) => (
                      <Link
                        key={message.id}
                        href={
                          message.project_id
                            ? `/workspace/${workspaceId}/project/${message.project_id}/chat`
                            : `/workspace/${workspaceId}/chat`
                        }
                        className="surface-subpanel block rounded-lg border px-3 py-2 text-sm transition hover:border-border hover:bg-[var(--surface-subpanel-hover)]"
                      >
                        <p className="text-xs text-muted-foreground">
                          {getMemberDisplayName(memberNames[message.user_id])}
                        </p>
                        <p className="mt-1 text-sm text-foreground">{truncate(message.content, 140)}</p>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
