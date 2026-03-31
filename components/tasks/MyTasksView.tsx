"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, CheckCircle2, Filter, FolderKanban, Link2, RotateCcw, Save, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

import { PRIORITY_CONFIG } from "@/components/board/config";
import { BrowserMountTimingMark } from "@/components/shared/route-timing-bridge";
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
import {
  DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG,
  parseMyTasksSavedViewConfig,
  type MyTasksAttentionFilter,
  type MyTasksSortOption,
} from "@/lib/pm-config";
import { getRealtimeChangedRow } from "@/lib/supabase/realtime-payload";
import { getTaskStatusLabel, isDoneTaskStatus, withTaskStatusFallbacks } from "@/lib/task-statuses";
import { createClient } from "@/lib/supabase/client";
import { buildTaskDependencyMaps, getTaskDueState } from "@/lib/task-insights";
import { useMyTasksLiveData } from "@/hooks/useMyTasksLiveData";
import { getMemberDisplayName } from "@/lib/utils/displayName";
import { formatCalendarDate } from "@/lib/utils/time";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type {
  Project,
  Task,
  TaskCustomFieldDefinition,
  TaskDependency,
  TaskPriority,
  TaskStatus,
  Workspace,
  WorkspaceTaskStatusDefinition,
} from "@/types";
import type { Database } from "@/types/database.types";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type SavedViewRow = Database["public"]["Tables"]["saved_views"]["Row"];
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
  customFieldDefinitionsByWorkspace: Record<string, TaskCustomFieldDefinition[]>;
  taskStatusesByWorkspace: Record<string, WorkspaceTaskStatusDefinition[]>;
};

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const index = items.findIndex((item) => item.id === nextItem.id);

  if (index === -1) {
    return [...items, nextItem];
  }

  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

function fallbackMemberName(userId: string): string {
  return getMemberDisplayName(null);
}

function formatDate(value: string | null): string {
  return formatCalendarDate(value, {
    fallback: "No due date",
    includeYear: true,
  });
}

function sortSavedViews(items: SavedViewRow[]): SavedViewRow[] {
  return [...items].sort(
    (left, right) => new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime(),
  );
}

const ATTENTION_FILTER_LABELS: Record<MyTasksAttentionFilter, string> = {
  all: "All attention states",
  blocked: "Blocked",
  overdue: "Overdue",
  due_soon: "Due soon",
  blocking_others: "Blocking others",
};

const SORT_OPTION_LABELS: Record<MyTasksSortOption, string> = {
  due_date: "Sort by due date",
  priority: "Sort by priority",
  project: "Sort by project",
  newest: "Sort by newest",
};

export function MyTasksView({
  currentUserId,
  defaultWorkspaceId,
  initialDependencies,
  initialTasks,
  workspaces,
  projects,
  milestones,
  membersByWorkspace,
  customFieldDefinitionsByWorkspace,
  taskStatusesByWorkspace,
}: MyTasksViewProps) {
  const router = useRouter();
  const supabase = createClient();
  const rememberedWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const {
    dependencyItems,
    tasks,
    workspaceItems,
    projectItems,
    milestoneItems,
    workspaceMembers,
    workspaceTaskStatuses,
    realtimeConnected,
    selectedTaskId,
    setSelectedTaskId,
    updateTask,
    addTaskIfMissing,
    removeTask,
  } = useMyTasksLiveData({
    currentUserId,
    initialDependencies,
    initialTasks,
    workspaces,
    projects,
    milestones,
    membersByWorkspace,
    taskStatusesByWorkspace,
  });
  const [workspaceFilter, setWorkspaceFilter] = useState<string>(defaultWorkspaceId ?? "all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [attentionFilter, setAttentionFilter] = useState<MyTasksAttentionFilter>("all");
  const [sortOption, setSortOption] = useState<MyTasksSortOption>("due_date");
  const [savedViews, setSavedViews] = useState<SavedViewRow[]>([]);
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<string>("none");
  const [isSavingView, setIsSavingView] = useState(false);
  const [isDeletingView, setIsDeletingView] = useState(false);

  const workspaceById = useMemo(
    () => Object.fromEntries(workspaceItems.map((workspace) => [workspace.id, workspace])),
    [workspaceItems],
  );
  const projectById = useMemo(
    () => Object.fromEntries(projectItems.map((project) => [project.id, project])),
    [projectItems],
  );
  const workspaceIds = useMemo(() => workspaceItems.map((workspace) => workspace.id), [workspaceItems]);
  const { blockedByMap, blockingMap } = useMemo(() => buildTaskDependencyMaps(dependencyItems), [dependencyItems]);
  const hasActiveFilters =
    workspaceFilter !== DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG.workspaceFilter ||
    projectFilter !== DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG.projectFilter ||
    statusFilter !== DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG.statusFilter ||
    priorityFilter !== DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG.priorityFilter ||
    attentionFilter !== DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG.attentionFilter ||
    sortOption !== DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG.sortOption;

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
  const availableStatusDefinitions = useMemo(() => {
    if (workspaceFilter !== "all") {
      const scopedStatuses = workspaceTaskStatuses[workspaceFilter] ?? [];
      const scopedTaskStatuses = myTasks
        .filter((task) => projectById[task.project_id]?.workspace_id === workspaceFilter)
        .map((task) => task.status);

      return withTaskStatusFallbacks(scopedStatuses, scopedTaskStatuses);
    }

    return withTaskStatusFallbacks(undefined, myTasks.map((task) => task.status));
  }, [myTasks, projectById, workspaceFilter, workspaceTaskStatuses]);

  const visibleTasks = useMemo(() => {
    const filtered = myTasks.filter((task) => {
      const project = projectById[task.project_id];
      const workspaceId = project?.workspace_id;
      const taskStatuses = workspaceId ? workspaceTaskStatuses[workspaceId] ?? [] : [];

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

      if (attentionFilter === "overdue" && getTaskDueState(task, undefined, taskStatuses) !== "overdue") {
        return false;
      }

      if (attentionFilter === "due_soon" && getTaskDueState(task, undefined, taskStatuses) !== "due-soon") {
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
  }, [attentionFilter, blockedByMap, blockingMap, myTasks, priorityFilter, projectById, projectFilter, sortOption, statusFilter, workspaceFilter, workspaceTaskStatuses]);

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
  const currentSavedViewConfig = useMemo(
    () => ({
      workspaceFilter,
      projectFilter,
      statusFilter,
      priorityFilter,
      attentionFilter,
      sortOption,
    }),
    [attentionFilter, priorityFilter, projectFilter, sortOption, statusFilter, workspaceFilter],
  );

  const completedCount = myTasks.filter((task) => {
    const workspaceId = projectById[task.project_id]?.workspace_id;
    return isDoneTaskStatus(task.status, workspaceId ? workspaceTaskStatuses[workspaceId] ?? [] : []);
  }).length;
  const blockedCount = myTasks.filter((task) => task.is_blocked || (blockedByMap[task.id]?.length ?? 0) > 0).length;
  const dueSoonCount = myTasks.filter((task) => {
    const workspaceId = projectById[task.project_id]?.workspace_id;
    return getTaskDueState(task, undefined, workspaceId ? workspaceTaskStatuses[workspaceId] ?? [] : []) === "due-soon";
  }).length;

  const handleTaskUpdated = (updatedTask: Task) => {
    updateTask(updatedTask);
  };

  const handleTaskDuplicated = (createdTask: Task) => {
    addTaskIfMissing(createdTask);
  };

  const handleTaskDeleted = (taskId: string) => {
    removeTask(taskId);
  };

  useEffect(() => {
    if (defaultWorkspaceId) {
      if (workspaceFilter !== defaultWorkspaceId) {
        setWorkspaceFilter(defaultWorkspaceId);
        setProjectFilter("all");
      }

      return;
    }

    if (workspaceFilter !== "all") {
      return;
    }

    if (rememberedWorkspaceId && workspaceIds.includes(rememberedWorkspaceId)) {
      setWorkspaceFilter(rememberedWorkspaceId);
      setProjectFilter("all");
    }
  }, [defaultWorkspaceId, rememberedWorkspaceId, workspaceFilter, workspaceIds]);

  useEffect(() => {
    if (
      workspaceFilter !== "all" &&
      workspaceIds.includes(workspaceFilter) &&
      workspaceFilter !== rememberedWorkspaceId
    ) {
      setCurrentWorkspaceId(workspaceFilter);
    }
  }, [rememberedWorkspaceId, setCurrentWorkspaceId, workspaceFilter, workspaceIds]);

  useEffect(() => {
    let isActive = true;

    void supabase
      .from("saved_views")
      .select("*")
      .eq("scope", "my_tasks")
      .is("project_id", null)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!isActive) {
          return;
        }

        if (error) {
          toast.error(error.message);
          return;
        }

        setSavedViews(sortSavedViews((data ?? []) as SavedViewRow[]));
      });

    const channel = supabase.channel(`my-tasks-saved-views:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "saved_views",
          filter: "scope=eq.my_tasks",
        },
        (payload) => {
          const row = getRealtimeChangedRow<SavedViewRow>(payload, "MyTasksView.savedViews", [
            "id",
            "scope",
            "project_id",
            "name",
            "user_id",
          ]);

          if (!row) {
            return;
          }

          if (row.project_id) {
            return;
          }

          if (payload.eventType === "DELETE") {
            setSavedViews((current) => current.filter((view) => view.id !== row.id));
            setSelectedSavedViewId((current) => (current === row.id ? "none" : current));
            return;
          }

          if (payload.eventType === "INSERT") {
            setSavedViews((current) => sortSavedViews([...current.filter((view) => view.id !== row.id), row]));
            return;
          }

          setSavedViews((current) => sortSavedViews(current.map((view) => (view.id === row.id ? row : view))));
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, supabase]);

  useEffect(() => {
    if (selectedSavedViewId === "none") {
      return;
    }

    const savedView = savedViews.find((view) => view.id === selectedSavedViewId);

    if (!savedView) {
      setSelectedSavedViewId("none");
      return;
    }

    const config = parseMyTasksSavedViewConfig(savedView.config);
    setWorkspaceFilter(config.workspaceFilter);
    setProjectFilter(config.projectFilter);
    setStatusFilter(config.statusFilter);
    setPriorityFilter(config.priorityFilter);
    setAttentionFilter(config.attentionFilter);
    setSortOption(config.sortOption);
  }, [savedViews, selectedSavedViewId]);

  const saveCurrentView = async () => {
    const suggestedName = savedViews.length === 0 ? "My focus" : `My view ${savedViews.length + 1}`;
    const name = window.prompt("Name this saved view", suggestedName)?.trim();

    if (!name) {
      return;
    }

    setIsSavingView(true);

    const { data, error } = await supabase
      .from("saved_views")
      .insert({
        user_id: currentUserId,
        scope: "my_tasks",
        project_id: null,
        name,
        config: currentSavedViewConfig,
      })
      .select("*")
      .single();

    setIsSavingView(false);

    if (error || !data) {
      toast.error(error?.code === "23505" ? "A saved view with that name already exists." : error?.message ?? "Could not save view.");
      return;
    }

    setSavedViews((current) => sortSavedViews([...current.filter((view) => view.id !== data.id), data as SavedViewRow]));
    setSelectedSavedViewId(data.id);
    toast.success("Saved view created.");
  };

  const deleteSavedView = async () => {
    if (selectedSavedViewId === "none") {
      return;
    }

    const savedView = savedViews.find((view) => view.id === selectedSavedViewId);

    if (!savedView) {
      setSelectedSavedViewId("none");
      return;
    }

    const confirmed = window.confirm(`Delete the saved view \"${savedView.name}\"?`);

    if (!confirmed) {
      return;
    }

    setIsDeletingView(true);

    const { error } = await supabase.from("saved_views").delete().eq("id", savedView.id);

    setIsDeletingView(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSavedViews((current) => current.filter((view) => view.id !== savedView.id));
    setSelectedSavedViewId("none");
    toast.success("Saved view deleted.");
  };

  return (
    <main className="space-y-6 p-6">
      <BrowserMountTimingMark
        name="my-tasks-view"
        context={{
          workspaceCount: workspaceItems.length,
          projectCount: projectItems.length,
          visibleTaskCount: visibleTasks.length,
          assignedTaskCount: myTasks.length,
        }}
      />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My tasks</h1>
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
            <p className="text-3xl font-semibold text-foreground">{myTasks.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-foreground">{completedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Blocked</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-foreground">{blockedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Due soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-foreground">{dueSoonCount}</p>
          </CardContent>
        </Card>
      </section>

      <section className="surface-panel rounded-xl border p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="size-4" />
            Filter your assigned work
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="surface-subpanel flex items-center gap-2 rounded-lg border px-2 py-1">
              <Bookmark className="size-4 text-muted-foreground" />
              <Select value={selectedSavedViewId} onValueChange={(value) => setSelectedSavedViewId(value ?? "none")}>
                <SelectTrigger className="w-[180px] border-none px-1 shadow-none focus-visible:ring-0">
                  <SelectValue placeholder="Current view">
                    {selectedSavedViewId === "none"
                      ? "Current view"
                      : savedViews.find((view) => view.id === selectedSavedViewId)?.name ?? "Current view"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Current view</SelectItem>
                  {savedViews.map((view) => (
                    <SelectItem key={view.id} value={view.id}>
                      {view.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={saveCurrentView} disabled={isSavingView}>
              {isSavingView ? <RotateCcw className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save view
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={deleteSavedView} disabled={isDeletingView || selectedSavedViewId === "none"}>
              {isDeletingView ? <RotateCcw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete view
            </Button>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setWorkspaceFilter(DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG.workspaceFilter);
                  setProjectFilter(DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG.projectFilter);
                  setStatusFilter(DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG.statusFilter);
                  setPriorityFilter(DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG.priorityFilter);
                  setAttentionFilter(DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG.attentionFilter);
                  setSortOption(DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG.sortOption);
                  setSelectedSavedViewId("none");
                }}
              >
                <RotateCcw className="size-4" />
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-6">
          <Select value={workspaceFilter} onValueChange={(value) => {
            const nextValue = value ?? "all";
            setWorkspaceFilter(nextValue);
            setProjectFilter("all");
          }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All workspaces">
                {workspaceFilter === "all"
                  ? "All workspaces"
                  : workspaceItems.find((workspace) => workspace.id === workspaceFilter)?.name ?? "Unknown workspace"}
              </SelectValue>
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
              <SelectValue placeholder="All projects">
                {projectFilter === "all"
                  ? "All projects"
                  : workspaceScopedProjects.find((project) => project.id === projectFilter)?.name ?? "Unknown project"}
              </SelectValue>
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
              <SelectValue placeholder="All statuses">
                {statusFilter === "all"
                  ? "All statuses"
                  : getTaskStatusLabel(statusFilter, availableStatusDefinitions)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {availableStatusDefinitions.map((statusOption) => (
                <SelectItem key={statusOption.key} value={statusOption.key}>
                  {statusOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter((value ?? "all") as TaskPriority | "all")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All priorities">
                {priorityFilter === "all" ? "All priorities" : PRIORITY_CONFIG[priorityFilter].label}
              </SelectValue>
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
              <SelectValue placeholder="All attention states">{ATTENTION_FILTER_LABELS[attentionFilter]}</SelectValue>
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
              <SelectValue placeholder="Sort tasks">{SORT_OPTION_LABELS[sortOption]}</SelectValue>
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
          <div className="surface-panel rounded-xl border border-dashed p-8 text-center">
            <p className="text-base font-medium text-foreground">No tasks match these filters.</p>
            <p className="mt-2 text-sm text-muted-foreground">Try clearing a filter or update task assignments from a project board.</p>
          </div>
        ) : (
          visibleTasks.map((task) => {
            const project = projectById[task.project_id];
            const workspace = project ? workspaceById[project.workspace_id] : null;
            const priority = PRIORITY_CONFIG[task.priority as TaskPriority];
            const taskStatuses = project ? workspaceTaskStatuses[project.workspace_id] ?? [] : [];
            const statusLabel = getTaskStatusLabel(task.status, taskStatuses);
            const dueState = getTaskDueState(task, undefined, taskStatuses);
            const isDone = isDoneTaskStatus(task.status, taskStatuses);

            return (
              <button
                key={task.id}
                type="button"
                className="surface-panel w-full rounded-xl border p-4 text-left transition hover:border-border hover:bg-[var(--surface-panel-hover)]"
                onClick={() => setSelectedTaskId(task.id)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{task.identifier}</Badge>
                      <Badge variant="ghost">{statusLabel}</Badge>
                      {task.is_blocked || (blockedByMap[task.id]?.length ?? 0) > 0 ? <Badge variant="destructive">Blocked</Badge> : null}
                      {dueState === "overdue" ? <Badge variant="destructive">Overdue</Badge> : null}
                      {dueState === "due-soon" ? <Badge variant="secondary">Due soon</Badge> : null}
                    </div>
                    <p className={cn("text-base font-semibold text-foreground", isDone && "line-through opacity-70")}>{task.title}</p>
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
                    <span className={cn("text-sm", task.due_date ? "text-foreground" : "text-muted-foreground")}>
                      {formatDate(task.due_date)}
                    </span>
                  </div>
                </div>

                {task.description ? (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
                ) : null}

                {task.blocked_reason ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-200">
                    <ShieldAlert className="size-4" />
                    {task.blocked_reason}
                  </div>
                ) : null}

                {((blockedByMap[task.id]?.length ?? 0) > 0 || (blockingMap[task.id]?.length ?? 0) > 0) ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {(blockedByMap[task.id]?.length ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-700 dark:bg-red-500/15 dark:text-red-200">
                        <Link2 className="size-3" />
                        Blocked by {blockedByMap[task.id]?.length}
                      </span>
                    ) : null}
                    {(blockingMap[task.id]?.length ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
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
        taskStatuses={selectedProject?.workspace_id ? workspaceTaskStatuses[selectedProject.workspace_id] ?? [] : []}
        dependencies={selectedProjectDependencies}
        milestones={selectedProjectMilestones}
        members={selectedWorkspaceMembers}
        customFieldDefinitions={
          selectedProject?.workspace_id ? customFieldDefinitionsByWorkspace[selectedProject.workspace_id] ?? [] : []
        }
        currentUserId={currentUserId}
        readOnly={selectedProjectIsReadOnly}
        onTaskUpdated={handleTaskUpdated}
        onTaskDuplicated={handleTaskDuplicated}
        onTaskDeleted={handleTaskDeleted}
      />
    </main>
  );
}