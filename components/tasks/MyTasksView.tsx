"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Filter, FolderKanban, ShieldAlert } from "lucide-react";

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
import { formatCalendarDate } from "@/lib/utils/time";
import { cn } from "@/lib/utils";
import type { Project, Task, TaskPriority, TaskStatus, Workspace } from "@/types";
import type { Database } from "@/types/database.types";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];

type MemberOption = {
  id: string;
  name: string;
  role: string;
};

type MyTasksViewProps = {
  currentUserId: string;
  defaultWorkspaceId: string | null;
  initialTasks: Task[];
  workspaces: Workspace[];
  projects: Project[];
  milestones: Milestone[];
  membersByWorkspace: Record<string, MemberOption[]>;
};

function formatDate(value: string | null): string {
  return formatCalendarDate(value, {
    fallback: "No due date",
    includeYear: true,
  });
}

export function MyTasksView({
  currentUserId,
  defaultWorkspaceId,
  initialTasks,
  workspaces,
  projects,
  milestones,
  membersByWorkspace,
}: MyTasksViewProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [workspaceFilter, setWorkspaceFilter] = useState<string>(defaultWorkspaceId ?? "all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");

  const workspaceById = useMemo(
    () => Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );
  const projectById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project])),
    [projects],
  );

  const myTasks = useMemo(
    () => tasks.filter((task) => task.assignee_id === currentUserId),
    [currentUserId, tasks],
  );

  const workspaceScopedProjects = useMemo(() => {
    if (workspaceFilter === "all") {
      return projects;
    }

    return projects.filter((project) => project.workspace_id === workspaceFilter);
  }, [projects, workspaceFilter]);

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

      return true;
    });

    return [...filtered].sort((left, right) => {
      const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;

      if (leftDue !== rightDue) {
        return leftDue - rightDue;
      }

      return new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime();
    });
  }, [myTasks, priorityFilter, projectById, projectFilter, statusFilter, workspaceFilter]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  const selectedProject = selectedTask ? projectById[selectedTask.project_id] ?? null : null;
  const selectedWorkspaceMembers = selectedProject
    ? membersByWorkspace[selectedProject.workspace_id] ?? []
    : [];
  const selectedProjectMilestones = selectedTask
    ? milestones.filter((milestone) => milestone.project_id === selectedTask.project_id)
    : [];
  const selectedProjectTasks = selectedTask
    ? tasks.filter((task) => task.project_id === selectedTask.project_id)
    : [];
  const selectedProjectIsReadOnly = selectedProject?.status === "archived";

  const completedCount = myTasks.filter((task) => task.status === "done").length;
  const blockedCount = myTasks.filter((task) => task.is_blocked).length;

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

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My tasks</h1>
          <p className="text-sm text-muted-foreground">Tasks assigned to you across your active projects.</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <Filter className="size-4" />
          Filter your assigned work
        </div>
        <div className="grid gap-3 md:grid-cols-4">
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
              {workspaces.map((workspace) => (
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
                      {task.is_blocked ? <Badge variant="destructive">Blocked</Badge> : null}
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