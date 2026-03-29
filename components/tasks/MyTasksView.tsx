"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { CheckCircle2, Filter, FolderKanban, Link2, ShieldAlert } from "lucide-react";

import { BOARD_COLUMNS, PRIORITY_CONFIG } from "@/components/board/config";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { buildTaskDependencyMaps, getTaskDueState } from "@/lib/task-insights";
import { formatCalendarDate } from "@/lib/utils/time";
import { cn } from "@/lib/utils";
import type { Project, Task, TaskDependency, TaskPriority, TaskStatus, Workspace } from "@/types";
import type { Database } from "@/types/database.types";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type WorkspaceMemberRow = Database["public"]["Tables"]["workspace_members"]["Row"];

type MemberOption = {
  id: string;
  name: string;
  role: string;
};

type MyTasksViewProps = {
  currentUserId: string;
  defaultWorkspaceId: string | null;
  initialDependencies: TaskDependency[];
  initialTasks: Task[];
  workspaces: Workspace[];
  projects: Project[];
  milestones: Milestone[];
  membersByWorkspace: Record<string, MemberOption[]>;
};

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const index = items.findIndex((item) => item.id === nextItem.id);

  if (index === -1) {
    return [...items, nextItem];
  }

  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

function fallbackMemberName(userId: string): string {
  return `User ${userId.slice(0, 8)}`;
}

function formatDate(value: string | null): string {
  return formatCalendarDate(value, {
    fallback: "No due date",
    includeYear: true,
  });
}

export function MyTasksView({
  currentUserId,
  defaultWorkspaceId,
  initialDependencies,
  initialTasks,
  workspaces,
  projects,
  milestones,
  membersByWorkspace,
}: MyTasksViewProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [dependencyItems, setDependencyItems] = useState<TaskDependency[]>(initialDependencies);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [workspaceItems, setWorkspaceItems] = useState<Workspace[]>(workspaces);
  const [projectItems, setProjectItems] = useState<Project[]>(projects);
  const [milestoneItems, setMilestoneItems] = useState<Milestone[]>(milestones);
  const [workspaceMembers, setWorkspaceMembers] = useState<Record<string, MemberOption[]>>(membersByWorkspace);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [workspaceFilter, setWorkspaceFilter] = useState<string>(defaultWorkspaceId ?? "all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [attentionFilter, setAttentionFilter] = useState<"all" | "blocked" | "overdue" | "due_soon" | "blocking_others">("all");
  const [sortOption, setSortOption] = useState<"due_date" | "priority" | "project" | "newest">("due_date");

  const workspaceById = useMemo(
    () => Object.fromEntries(workspaceItems.map((workspace) => [workspace.id, workspace])),
    [workspaceItems],
  );
  const projectById = useMemo(
    () => Object.fromEntries(projectItems.map((project) => [project.id, project])),
    [projectItems],
  );
  const workspaceIds = useMemo(() => workspaceItems.map((workspace) => workspace.id), [workspaceItems]);
  const projectIds = useMemo(() => projectItems.map((project) => project.id), [projectItems]);
  const { blockedByMap, blockingMap } = useMemo(() => buildTaskDependencyMaps(dependencyItems), [dependencyItems]);

  const myTasks = useMemo(
    () => tasks.filter((task) => task.assignee_id === currentUserId),
    [currentUserId, tasks],
  );

  const workspaceScopedProjects = useMemo(() => {
    if (workspaceFilter === "all") {
      return projectItems;
    }

    return projectItems.filter((project) => project.workspace_id === workspaceFilter);
  }, [projectItems, workspaceFilter]);

  const visibleTasks = useMemo(() => {
    const filtered = myTasks.filter((task) => {
      const project = projectById[task.project_id];
      const workspaceId = project?.workspace_id;

      if (workspaceFilter !== "all" && workspaceId !== workspaceFilter) {
        return false;
      }

      if (projectFilter !== "all" && task.project_id !== projectFilter) {
        return false;
      }

      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }

      if (priorityFilter !== "all" && task.priority !== priorityFilter) {
        return false;
      }

      if (attentionFilter === "blocked" && !(task.is_blocked || (blockedByMap[task.id]?.length ?? 0) > 0)) {
        return false;
      }

      if (attentionFilter === "overdue" && getTaskDueState(task) !== "overdue") {
        return false;
      }

      if (attentionFilter === "due_soon" && getTaskDueState(task) !== "due-soon") {
        return false;
      }

      if (attentionFilter === "blocking_others" && (blockingMap[task.id]?.length ?? 0) === 0) {
        return false;
      }

      return true;
    });

    return [...filtered].sort((left, right) => {
      if (sortOption === "priority") {
        const rank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, none: 3 };
        return rank[left.priority as TaskPriority] - rank[right.priority as TaskPriority];
      }

      if (sortOption === "project") {
        return (projectById[left.project_id]?.name ?? "").localeCompare(projectById[right.project_id]?.name ?? "");
      }

      if (sortOption === "newest") {
        return new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime();
      }

      const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;

      if (leftDue !== rightDue) {
        return leftDue - rightDue;
      }

      return new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime();
    });
  }, [attentionFilter, blockedByMap, blockingMap, myTasks, priorityFilter, projectById, projectFilter, sortOption, statusFilter, workspaceFilter]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  const selectedProject = selectedTask ? projectById[selectedTask.project_id] ?? null : null;
  const selectedWorkspaceMembers = selectedProject
    ? workspaceMembers[selectedProject.workspace_id] ?? []
    : [];
  const selectedProjectMilestones = selectedTask
    ? milestoneItems.filter((milestone) => milestone.project_id === selectedTask.project_id)
    : [];
  const selectedProjectTasks = selectedTask
    ? tasks.filter((task) => task.project_id === selectedTask.project_id)
    : [];
  const selectedProjectDependencies = selectedTask
    ? dependencyItems.filter((dependency) => dependency.project_id === selectedTask.project_id)
    : [];
  const selectedProjectIsReadOnly = selectedProject?.status === "archived";

  const completedCount = myTasks.filter((task) => task.status === "done").length;
  const blockedCount = myTasks.filter((task) => task.is_blocked || (blockedByMap[task.id]?.length ?? 0) > 0).length;
  const dueSoonCount = myTasks.filter((task) => getTaskDueState(task) === "due-soon").length;

  const handleTaskUpdated = (updatedTask: Task) => {
    setTasks((current) => current.map((task) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task)));
  };

  const handleTaskDuplicated = (createdTask: Task) => {
    setTasks((current) => {
      if (current.some((task) => task.id === createdTask.id)) {
        return current;
      }

      return [...current, createdTask];
    });
  };

  const handleTaskDeleted = (taskId: string) => {
    setSelectedTaskId((current) => (current === taskId ? null : current));
    setTasks((current) => current.filter((task) => task.id !== taskId));
  };

  useEffect(() => {
    setWorkspaceItems(workspaces);
  }, [workspaces]);

  useEffect(() => {
    setProjectItems(projects);
  }, [projects]);

  useEffect(() => {
    setMilestoneItems(milestones);
  }, [milestones]);

  useEffect(() => {
    setWorkspaceMembers(membersByWorkspace);
  }, [membersByWorkspace]);

  useEffect(() => {
    setDependencyItems(initialDependencies);
  }, [initialDependencies]);

  useEffect(() => {
    if (!workspaceIds.length) {
      setRealtimeConnected(false);
      return;
    }

    const channel = supabase.channel(`my-tasks:${currentUserId}`);

    const handleWorkspaceChange = (payload: RealtimePostgresChangesPayload<Workspace>) => {
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Workspace;

      setWorkspaceItems((current) => {
        if (payload.eventType === "DELETE") {
          return current.filter((workspace) => workspace.id !== row.id);
        }

        return upsertById(current, row).sort(
          (left, right) => new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime(),
        );
      });
    };

    const handleProjectChange = (payload: RealtimePostgresChangesPayload<Project>) => {
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Project;

      if (payload.eventType === "DELETE") {
        setProjectItems((current) => current.filter((project) => project.id !== row.id));
        setTasks((current) => current.filter((task) => task.project_id !== row.id));
        setMilestoneItems((current) => current.filter((milestone) => milestone.project_id !== row.id));
        return;
      }

      setProjectItems((current) =>
        upsertById(current, row).sort(
          (left, right) => new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime(),
        ),
      );
    };

    const handleTaskChange = (payload: RealtimePostgresChangesPayload<Task>) => {
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Task;

      if (payload.eventType === "DELETE") {
        setSelectedTaskId((current) => (current === row.id ? null : current));
        setTasks((current) => current.filter((task) => task.id !== row.id));
        return;
      }

      setTasks((current) => {
        const nextTasks = upsertById(current, row);
        return nextTasks.sort(
          (left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime(),
        );
      });
    };

    const handleMilestoneChange = (payload: RealtimePostgresChangesPayload<Milestone>) => {
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Milestone;

      if (payload.eventType === "DELETE") {
        setMilestoneItems((current) => current.filter((milestone) => milestone.id !== row.id));
        setTasks((current) =>
          current.map((task) => (task.milestone_id === row.id ? { ...task, milestone_id: null } : task)),
        );
        return;
      }

      setMilestoneItems((current) => {
        const nextMilestones = upsertById(current, row);
        return nextMilestones.sort(
          (left, right) => new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime(),
        );
      });
    };

    const handleDependencyChange = (payload: RealtimePostgresChangesPayload<TaskDependency>) => {
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as TaskDependency;

      if (payload.eventType === "DELETE") {
        setDependencyItems((current) => current.filter((dependency) => dependency.id !== row.id));
        return;
      }

      setDependencyItems((current) => {
        if (current.some((dependency) => dependency.id === row.id)) {
          return current.map((dependency) => (dependency.id === row.id ? row : dependency));
        }

        return [...current, row];
      });
    };

    const handleWorkspaceMemberChange = (payload: RealtimePostgresChangesPayload<WorkspaceMemberRow>) => {
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as WorkspaceMemberRow;

      if (row.user_id === currentUserId) {
        router.refresh();
        return;
      }

      setWorkspaceMembers((current) => {
        const currentMembers = current[row.workspace_id] ?? [];

        if (payload.eventType === "DELETE") {
          return {
            ...current,
            [row.workspace_id]: currentMembers.filter((member) => member.id !== row.user_id),
          };
        }

        const nextMember: MemberOption = {
          id: row.user_id,
          role: row.role,
          name: currentMembers.find((member) => member.id === row.user_id)?.name ?? fallbackMemberName(row.user_id),
        };
        const nextMembers = currentMembers.some((member) => member.id === row.user_id)
          ? currentMembers.map((member) => (member.id === row.user_id ? nextMember : member))
          : [...currentMembers, nextMember];

        return {
          ...current,
          [row.workspace_id]: nextMembers,
        };
      });
    };

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "workspace_members",
        filter: `user_id=eq.${currentUserId}`,
      },
      () => {
        router.refresh();
      },
    );

    for (const workspaceId of workspaceIds) {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "workspaces",
            filter: `id=eq.${workspaceId}`,
          },
          handleWorkspaceChange,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "projects",
            filter: `workspace_id=eq.${workspaceId}`,
          },
          handleProjectChange,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "workspace_members",
            filter: `workspace_id=eq.${workspaceId}`,
          },
          handleWorkspaceMemberChange,
        );
    }

    for (const projectId of projectIds) {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tasks",
            filter: `project_id=eq.${projectId}`,
          },
          handleTaskChange,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "milestones",
            filter: `project_id=eq.${projectId}`,
          },
          handleMilestoneChange,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "task_dependencies",
            filter: `project_id=eq.${projectId}`,
          },
          handleDependencyChange,
        );
    }

    channel.subscribe((status) => {
      setRealtimeConnected(status === "SUBSCRIBED");
    });

    return () => {
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, projectIds, router, supabase, workspaceIds]);

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My tasks</h1>
          <p className="text-sm text-muted-foreground">Tasks assigned to you across your active projects.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{realtimeConnected ? "Live" : "Connecting..."}</Badge>
          <Badge variant="outline">{visibleTasks.length} visible</Badge>
          <Badge variant="outline">{myTasks.length} assigned</Badge>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{myTasks.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{completedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Blocked</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{blockedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Due soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{dueSoonCount}</p>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <Filter className="size-4" />
          Filter your assigned work
        </div>
        <div className="grid gap-3 md:grid-cols-6">
          <Select value={workspaceFilter} onValueChange={(value) => {
            const nextValue = value ?? "all";
            setWorkspaceFilter(nextValue);
            setProjectFilter("all");
          }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All workspaces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workspaces</SelectItem>
              {workspaceItems.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={projectFilter} onValueChange={(value) => setProjectFilter(value ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {workspaceScopedProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(value) => setStatusFilter((value ?? "all") as TaskStatus | "all")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {BOARD_COLUMNS.map((column) => (
                <SelectItem key={column.status} value={column.status}>
                  {column.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter((value ?? "all") as TaskPriority | "all")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {PRIORITY_CONFIG[priority].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={attentionFilter} onValueChange={(value) => setAttentionFilter((value ?? "all") as typeof attentionFilter)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All attention states" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All attention states</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="due_soon">Due soon</SelectItem>
              <SelectItem value="blocking_others">Blocking others</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOption} onValueChange={(value) => setSortOption((value ?? "due_date") as typeof sortOption)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sort tasks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due_date">Sort by due date</SelectItem>
              <SelectItem value="priority">Sort by priority</SelectItem>
              <SelectItem value="project">Sort by project</SelectItem>
              <SelectItem value="newest">Sort by newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-3">
        {visibleTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-8 text-center">
            <p className="text-base font-medium text-slate-900">No tasks match these filters.</p>
            <p className="mt-2 text-sm text-muted-foreground">Try clearing a filter or update task assignments from a project board.</p>
          </div>
        ) : (
          visibleTasks.map((task) => {
            const project = projectById[task.project_id];
            const workspace = project ? workspaceById[project.workspace_id] : null;
            const priority = PRIORITY_CONFIG[task.priority as TaskPriority];
            const statusLabel = BOARD_COLUMNS.find((column) => column.status === task.status)?.label ?? task.status;

            return (
              <button
                key={task.id}
                type="button"
                className="w-full rounded-xl border bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                onClick={() => setSelectedTaskId(task.id)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{task.identifier}</Badge>
                      <Badge variant="ghost">{statusLabel}</Badge>
                      {task.is_blocked || (blockedByMap[task.id]?.length ?? 0) > 0 ? <Badge variant="destructive">Blocked</Badge> : null}
                      {getTaskDueState(task) === "overdue" ? <Badge variant="destructive">Overdue</Badge> : null}
                      {getTaskDueState(task) === "due-soon" ? <Badge variant="secondary">Due soon</Badge> : null}
                    </div>
                    <p className="text-base font-semibold text-slate-900">{task.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <FolderKanban className="size-4" />
                        {project?.name ?? "Project"}
                      </span>
                      {workspace ? <span>{workspace.name}</span> : null}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Badge variant="outline" className="gap-2">
                      <span className={cn("size-2 rounded-full", priority.color)} />
                      {priority.label}
                    </Badge>
                    <span className={cn("text-sm", task.due_date ? "text-slate-700" : "text-muted-foreground")}>
                      {formatDate(task.due_date)}
                    </span>
                  </div>
                </div>

                {task.description ? (
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600">{task.description}</p>
                ) : null}

                {task.blocked_reason ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    <ShieldAlert className="size-4" />
                    {task.blocked_reason}
                  </div>
                ) : null}

                {((blockedByMap[task.id]?.length ?? 0) > 0 || (blockingMap[task.id]?.length ?? 0) > 0) ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {(blockedByMap[task.id]?.length ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-700">
                        <Link2 className="size-3" />
                        Blocked by {blockedByMap[task.id]?.length}
                      </span>
                    ) : null}
                    {(blockingMap[task.id]?.length ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                        <Link2 className="size-3" />
                        Blocks {blockingMap[task.id]?.length}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </button>
            );
          })
        )}
      </section>

      <TaskDetailPanel
        open={Boolean(selectedTask)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedTaskId(null);
          }
        }}
        workspaceId={selectedProject?.workspace_id ?? ""}
        projectId={selectedTask?.project_id ?? ""}
        task={selectedTask}
        tasks={selectedProjectTasks}
        dependencies={selectedProjectDependencies}
        milestones={selectedProjectMilestones}
        members={selectedWorkspaceMembers}
        currentUserId={currentUserId}
        readOnly={selectedProjectIsReadOnly}
        onTaskUpdated={handleTaskUpdated}
        onTaskDuplicated={handleTaskDuplicated}
        onTaskDeleted={handleTaskDeleted}
      />
    </main>
  );
}