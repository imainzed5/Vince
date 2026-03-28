import Link from "next/link";
import { redirect } from "next/navigation";

import { ActivityItem } from "@/components/activity/ActivityItem";
import { WorkspaceCreatedToast } from "@/components/shared/WorkspaceCreatedToast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkspaceMemberNames } from "@/lib/supabase/member-names";
import { createClient } from "@/lib/supabase/server";
import { getDisplayNameFromEmail } from "@/lib/utils/displayName";
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
  planning: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  in_review: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
};

function truncate(value: string | null | undefined, maxLength = 140): string {
  const safeValue = (value ?? "").trim();

  if (safeValue.length <= maxLength) {
    return safeValue;
  }

  return `${safeValue.slice(0, maxLength - 1).trimEnd()}…`;
}

function isOverdue(task: WorkspaceTaskRow): boolean {
  if (!task.due_date || task.status === "done") {
    return false;
  }

  return new Date(task.due_date).getTime() < new Date().setHours(0, 0, 0, 0);
}

export default async function WorkspacePage({ params, searchParams }: WorkspacePageProps) {
  const { workspaceId } = await params;
  const { q } = await searchParams;
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
  const { data: tasks } = projectIds.length
    ? await supabase
        .from("tasks")
        .select("id, project_id, status, is_blocked, assignee_id, due_date, title, identifier")
        .in("project_id", projectIds)
    : { data: [] };
  const workspaceTasks = (tasks ?? []) as WorkspaceTaskRow[];
  const recentActivity = (activity ?? []) as ActivityRow[];
  const memberNames = await getWorkspaceMemberNames(workspaceId, {
    id: user.id,
    email: user.email ?? null,
  });
  const currentUserName = getDisplayNameFromEmail(user.email);
  const projectNameById = Object.fromEntries(workspaceProjects.map((project) => [project.id, project.name]));

  const taskCount = workspaceTasks.length;
  const completedTaskCount = workspaceTasks.filter((task) => task.status === "done").length;
  const blockedTaskCount = workspaceTasks.filter((task) => task.is_blocked).length;
  const inFlightTaskCount = workspaceTasks.filter((task) => task.status !== "done").length;
  const unassignedTaskCount = workspaceTasks.filter((task) => !task.assignee_id && task.status !== "done").length;

  const projectStats = new Map<string, { taskCount: number; completedCount: number; blockedCount: number }>();

  for (const project of workspaceProjects) {
    projectStats.set(project.id, {
      taskCount: 0,
      completedCount: 0,
      blockedCount: 0,
    });
  }

  for (const task of workspaceTasks) {
    const stats = projectStats.get(task.project_id);

    if (!stats) {
      continue;
    }

    stats.taskCount += 1;

    if (task.status === "done") {
      stats.completedCount += 1;
    }

    if (task.is_blocked) {
      stats.blockedCount += 1;
    }
  }

  const projectSummaries = workspaceProjects.map((project) => {
    const stats = projectStats.get(project.id) ?? {
      taskCount: 0,
      completedCount: 0,
      blockedCount: 0,
    };
    const progress = stats.taskCount ? Math.round((stats.completedCount / stats.taskCount) * 100) : 0;

    return {
      ...project,
      taskCount: stats.taskCount,
      blockedCount: stats.blockedCount,
      progress,
    };
  });

  const teamSummaries = workspaceMembers
    .map((member) => {
      const assignedTasks = workspaceTasks.filter(
        (task) => task.assignee_id === member.user_id && task.status !== "done",
      );

      return {
        userId: member.user_id,
        name: memberNames[member.user_id] ?? `User ${member.user_id.slice(0, 8)}`,
        role: member.role,
        assignedCount: assignedTasks.length,
        inProgressCount: assignedTasks.filter((task) => task.status === "in_progress" || task.status === "in_review").length,
        blockedCount: assignedTasks.filter((task) => task.is_blocked).length,
        overdueCount: assignedTasks.filter((task) => isOverdue(task)).length,
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

  const projectSearchResults = canRunSearch
    ? projectSummaries.filter((project) => {
        const haystack = `${project.name} ${project.description ?? ""}`.toLowerCase();
        return haystack.includes(searchableQuery.toLowerCase());
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
      <WorkspaceCreatedToast />

      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-white p-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Workspace overview</p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{workspace.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Keep projects, updates, notes, and team activity together in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
              Invite code {workspace.invite_code}
            </span>
            <span>{(memberCount ?? workspaceMembers.length).toLocaleString()} members</span>
            <span>{workspaceProjects.length.toLocaleString()} projects</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/workspace/${workspaceId}/members`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
            <p className="text-3xl font-semibold text-slate-900">{workspaceProjects.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">Across active team workspaces.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Open tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{inFlightTaskCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">Work still in motion.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Completed tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{completedTaskCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">Delivered across all projects.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Blocked tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{blockedTaskCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">Resolve these to keep momentum.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Project health</CardTitle>
                <p className="text-sm text-muted-foreground">See progress and blockers across your workspace.</p>
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
                    className="block rounded-xl border p-4 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-900">{project.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {project.taskCount} tasks · {project.blockedCount} blocked
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {project.status === "archived" ? (
                          <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                            Archived
                          </span>
                        ) : null}
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${phaseBadgeClass[project.phase] ?? "bg-slate-100 text-slate-700"}`}
                        >
                          {phaseLabel[project.phase] ?? project.phase}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium text-slate-700">{project.progress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200">
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
                <CardTitle>Team visibility</CardTitle>
                <p className="text-sm text-muted-foreground">See who owns work, where blockers are, and what is overdue.</p>
              </div>
              <Badge variant="outline">{unassignedTaskCount} unassigned</Badge>
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
                        <p className="text-base font-semibold text-slate-900">{member.name}</p>
                        <p className="text-sm text-muted-foreground">{member.assignedCount} active tasks assigned</p>
                      </div>
                      <Badge variant="outline">{member.role}</Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                        {member.inProgressCount} in progress
                      </span>
                      <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">
                        {member.blockedCount} blocked
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                        {member.overdueCount} overdue
                      </span>
                    </div>

                    {member.tasks.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {member.tasks.map((task) => (
                          <Link
                            key={task.id}
                            href={`/workspace/${workspaceId}/project/${task.project_id}/board`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition hover:border-slate-300"
                          >
                            <span className="font-medium text-slate-900">
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
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Showing matches for <span className="font-medium">{searchQuery}</span>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Projects</p>
                  {projectSearchResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No project matches.</p>
                  ) : (
                    projectSearchResults.slice(0, 4).map((project) => (
                      <Link
                        key={project.id}
                        href={`/workspace/${workspaceId}/project/${project.id}/board`}
                        className="block rounded-lg border px-3 py-2 text-sm transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <p className="font-medium text-slate-900">{project.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{truncate(project.description, 120) || "No project description."}</p>
                      </Link>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Tasks</p>
                  {taskSearchResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No task matches.</p>
                  ) : (
                    taskSearchResults.map((task) => (
                      <Link
                        key={task.id}
                        href={`/workspace/${workspaceId}/project/${task.project_id}/board`}
                        className="block rounded-lg border px-3 py-2 text-sm transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-slate-900">{task.identifier} · {task.title}</p>
                          <span className="text-xs text-muted-foreground">{projectNameById[task.project_id] ?? "Project"}</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Notes</p>
                  {noteSearchResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No note matches.</p>
                  ) : (
                    noteSearchResults.map((note) => (
                      <Link
                        key={note.id}
                        href={`/workspace/${workspaceId}/project/${note.project_id}/notes`}
                        className="block rounded-lg border px-3 py-2 text-sm transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <p className="font-medium text-slate-900">{note.title || "Untitled"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{truncate(note.content, 120) || "No note preview available."}</p>
                      </Link>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Chat</p>
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
                        className="block rounded-lg border px-3 py-2 text-sm transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <p className="text-xs text-muted-foreground">
                          {memberNames[message.user_id] ?? `User ${message.user_id.slice(0, 8)}`}
                        </p>
                        <p className="mt-1 text-sm text-slate-900">{truncate(message.content, 140)}</p>
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
