"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/sonner";
import {
  DndContext,
  DragOverlay,
  DragEndEvent,
  DragStartEvent,
  DragCancelEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PROJECT_SAVED_VIEW_CONFIG,
  parseProjectSavedViewConfig,
  type ProjectAttentionFilter,
  type ProjectListSortOption,
} from "@/lib/pm-config";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { insertActivity } from "@/lib/supabase/activity";
import { BoardToolbar } from "@/components/board/BoardToolbar";
import { BoardColumn } from "@/components/board/BoardColumn";
import { TaskCard } from "@/components/board/TaskCard";
import { QuickCreateModal } from "@/components/board/QuickCreateModal";
import { TaskListView } from "@/components/tasks/TaskListView";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { useTasks } from "@/hooks/useTasks";
import {
  getDefaultOpenTaskStatus,
  getTaskStatusColumns,
  isDoneTaskStatus,
  withTaskStatusFallbacks,
} from "@/lib/task-statuses";
import { buildTaskDependencyMaps, getTaskDueState } from "@/lib/task-insights";
import { getMemberDisplayName } from "@/lib/utils/displayName";
import { useTaskStore } from "@/stores/taskStore";
import type { Task, TaskCustomFieldDefinition, TaskPriority, TaskStatus, WorkspaceTaskStatusDefinition } from "@/types";
import type { Database } from "@/types/database.types";

type BoardViewProps = {
  workspaceId: string;
  projectId: string;
  projectName: string;
  projectPhase: string;
  projectPrefix: string;
  projectStatus: string;
  members?: Array<{ id: string; name: string; role: string }>;
  milestones?: Array<Database["public"]["Tables"]["milestones"]["Row"]>;
  customFieldDefinitions?: TaskCustomFieldDefinition[];
  taskStatuses?: WorkspaceTaskStatusDefinition[];
  currentUserId: string;
};

type TaskGroups = Record<string, Task[]>;
type SavedViewRow = Database["public"]["Tables"]["saved_views"]["Row"];

const PHASE_LABELS: Record<"planning" | "in_progress" | "in_review" | "done", string> = {
  planning: "Planning",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

function getPhaseLabel(phase: string): string {
  if (phase in PHASE_LABELS) {
    return PHASE_LABELS[phase as keyof typeof PHASE_LABELS];
  }

  return phase;
}

function groupTasks(tasks: Task[], statuses: string[]): TaskGroups {
  const base = Object.fromEntries(statuses.map((status) => [status, [] as Task[]])) as TaskGroups;

  for (const task of tasks) {
    base[task.status] ??= [];
    base[task.status].push(task);
  }

  for (const status of Object.keys(base)) {
    base[status].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  return base;
}

function flattenWithPositions(groups: TaskGroups, statuses: string[]): Task[] {
  const next: Task[] = [];

  for (const status of statuses) {
    const ordered = (groups[status] ?? []).map((task, index) => ({
      ...task,
      status,
      position: index,
    }));

    next.push(...ordered);
  }

  return next;
}

function getChangedTasks(previous: Task[], next: Task[]): Task[] {
  const previousById = new Map(previous.map((task) => [task.id, task]));

  return next.filter((task) => {
    const previousTask = previousById.get(task.id);

    return (
      !previousTask ||
      previousTask.status !== task.status ||
      (previousTask.position ?? null) !== (task.position ?? null)
    );
  });
}

function initials(value: string): string {
  return value.replace(/-/g, "").slice(0, 2).toUpperCase();
}

function sortSavedViews(items: SavedViewRow[]): SavedViewRow[] {
  return [...items].sort(
    (left, right) => new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime(),
  );
}

export function BoardView({
  workspaceId,
  projectId,
  projectName,
  projectPhase,
  projectPrefix,
  projectStatus,
  members = [],
  milestones = [],
  customFieldDefinitions = [],
  taskStatuses = [],
  currentUserId,
}: BoardViewProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const setSelectedTaskId = useTaskStore((state) => state.setSelectedTaskId);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);
  const { tasks, setTasks, dependencies, isLoading } = useTasks({
    projectId,
    supabase,
    onError: showToast,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("backlog");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [milestoneFilter, setMilestoneFilter] = useState<string>("all");
  const [attentionFilter, setAttentionFilter] = useState<ProjectAttentionFilter>("all");
  const [sortOption, setSortOption] = useState<ProjectListSortOption>("board_order");
  const [savedViews, setSavedViews] = useState<SavedViewRow[]>([]);
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<string>("none");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [enteringTaskIds, setEnteringTaskIds] = useState<string[]>([]);
  const [isSavingView, setIsSavingView] = useState(false);
  const [isDeletingView, setIsDeletingView] = useState(false);
  const highlightTimeoutRef = useRef<number | null>(null);
  const enteringTimeoutsRef = useRef<Map<string, number>>(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor),
  );

  const { blockedByMap, blockingMap } = useMemo(() => buildTaskDependencyMaps(dependencies), [dependencies]);
  const taskStatusDefinitions = useMemo(
    () => withTaskStatusFallbacks(taskStatuses, tasks.map((task) => task.status)),
    [taskStatuses, tasks],
  );
  const taskStatusColumns = useMemo(() => getTaskStatusColumns(taskStatusDefinitions), [taskStatusDefinitions]);
  const taskStatusKeys = useMemo(() => taskStatusColumns.map((column) => column.status), [taskStatusColumns]);
  const taskStatusSet = useMemo(() => new Set(taskStatusKeys), [taskStatusKeys]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (assigneeFilter !== "all" && task.assignee_id !== assigneeFilter) {
        return false;
      }

      if (priorityFilter !== "all" && task.priority !== priorityFilter) {
        return false;
      }

      if (milestoneFilter !== "all" && task.milestone_id !== milestoneFilter) {
        return false;
      }

      if (attentionFilter === "blocked" && !(task.is_blocked || (blockedByMap[task.id]?.length ?? 0) > 0)) {
        return false;
      }

      if (attentionFilter === "overdue" && getTaskDueState(task, undefined, taskStatusDefinitions) !== "overdue") {
        return false;
      }

      if (attentionFilter === "due_soon" && getTaskDueState(task, undefined, taskStatusDefinitions) !== "due-soon") {
        return false;
      }

      if (attentionFilter === "blocking_others" && (blockingMap[task.id]?.length ?? 0) === 0) {
        return false;
      }

      return true;
    });
  }, [assigneeFilter, attentionFilter, blockedByMap, blockingMap, milestoneFilter, priorityFilter, taskStatusDefinitions, tasks]);

  const viewMode = searchParams.get("view") === "list" ? "list" : "board";
  const taskGroups = useMemo(() => groupTasks(visibleTasks, taskStatusKeys), [taskStatusKeys, visibleTasks]);
  const listTasks = useMemo(() => {
    const nextTasks = [...visibleTasks];

    if (sortOption === "board_order") {
      const statusRank = Object.fromEntries(taskStatusColumns.map((column, index) => [column.status, index])) as Record<string, number>;

      return nextTasks.sort((left, right) => {
        const leftRank = statusRank[left.status];
        const rightRank = statusRank[right.status];

        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return (left.position ?? 0) - (right.position ?? 0);
      });
    }

    if (sortOption === "priority") {
      const rank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, none: 3 };
      return nextTasks.sort((left, right) => rank[left.priority as TaskPriority] - rank[right.priority as TaskPriority]);
    }

    if (sortOption === "newest") {
      return nextTasks.sort(
        (left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime(),
      );
    }

    return nextTasks.sort((left, right) => {
      const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;

      if (leftDue !== rightDue) {
        return leftDue - rightDue;
      }

      return new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime();
    });
  }, [sortOption, taskStatusColumns, visibleTasks]);
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );
  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks],
  );
  const enteringTaskIdSet = useMemo(() => new Set(enteringTaskIds), [enteringTaskIds]);
  const hasActiveFilters =
    assigneeFilter !== "all" ||
    priorityFilter !== "all" ||
    milestoneFilter !== "all" ||
    attentionFilter !== "all" ||
    sortOption !== "board_order";
  const isReadOnly = projectStatus === "archived";

  const clearEnteringTask = useCallback((taskId: string) => {
    const timeoutId = enteringTimeoutsRef.current.get(taskId);

    if (timeoutId) {
      window.clearTimeout(timeoutId);
      enteringTimeoutsRef.current.delete(taskId);
    }

    setEnteringTaskIds((current) => current.filter((id) => id !== taskId));
  }, []);

  const markTaskEntering = useCallback(
    (taskId: string, duration = 520) => {
      const existingTimeoutId = enteringTimeoutsRef.current.get(taskId);

      if (existingTimeoutId) {
        window.clearTimeout(existingTimeoutId);
      }

      setEnteringTaskIds((current) => [...current.filter((id) => id !== taskId), taskId]);

      const timeoutId = window.setTimeout(() => {
        enteringTimeoutsRef.current.delete(taskId);
        setEnteringTaskIds((current) => current.filter((id) => id !== taskId));
      }, duration);

      enteringTimeoutsRef.current.set(taskId, timeoutId);
    },
    [],
  );

  const highlightTask = useCallback((taskId: string, duration = 1400) => {
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    setHighlightedTaskId(taskId);

    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedTaskId((current) => (current === taskId ? null : current));
      highlightTimeoutRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToastMessage(null);
    }, 3500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [toastMessage]);

  useEffect(() => {
    const enteringTimeouts = enteringTimeoutsRef.current;

    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }

      for (const timeoutId of enteringTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }

      enteringTimeouts.clear();
    };
  }, []);

  const progressPct = useMemo(() => {
    if (!tasks.length) {
      return 0;
    }

    const doneCount = tasks.filter((task) => isDoneTaskStatus(task.status, taskStatusDefinitions)).length;
    return Math.round((doneCount / tasks.length) * 100);
  }, [taskStatusDefinitions, tasks]);

  const uniqueAssignees = useMemo(() => {
    return Array.from(new Set(tasks.map((task) => task.assignee_id).filter(Boolean) as string[]));
  }, [tasks]);

  const memberNameMap = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member.name])),
    [members],
  );

  const assigneeOptions = useMemo(
    () =>
      uniqueAssignees.map((assigneeId) => ({
        id: assigneeId,
        name: getMemberDisplayName(memberNameMap[assigneeId]),
      })),
    [memberNameMap, uniqueAssignees],
  );
  const milestoneOptions = useMemo(
    () => milestones.map((milestone) => ({ id: milestone.id, name: milestone.name })),
    [milestones],
  );

  const setViewMode = useCallback(
    (nextViewMode: "board" | "list") => {
      const nextParams = new URLSearchParams(searchParams.toString());

      if (nextViewMode === "board") {
        nextParams.delete("view");
      } else {
        nextParams.set("view", "list");
      }

      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const currentSavedViewConfig = useMemo(
    () => ({
      assigneeFilter,
      priorityFilter,
      attentionFilter,
      milestoneFilter,
      viewMode,
      sortOption,
    }),
    [assigneeFilter, attentionFilter, milestoneFilter, priorityFilter, sortOption, viewMode],
  );

  const applySavedView = useCallback(
    (config: ReturnType<typeof parseProjectSavedViewConfig>) => {
      setAssigneeFilter(config.assigneeFilter);
      setPriorityFilter(config.priorityFilter);
      setAttentionFilter(config.attentionFilter);
      setMilestoneFilter(config.milestoneFilter);
      setSortOption(config.sortOption);
      setViewMode(config.viewMode);
    },
    [setViewMode],
  );

  useEffect(() => {
    let isActive = true;

    void supabase
      .from("saved_views")
      .select("*")
      .eq("scope", "project")
      .eq("project_id", projectId)
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

    const channel = supabase.channel(`project-saved-views:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "saved_views",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as SavedViewRow;

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
  }, [projectId, supabase]);

  useEffect(() => {
    if (selectedTaskId && !tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [selectedTaskId, setSelectedTaskId, tasks]);

  useEffect(() => {
    if (selectedSavedViewId === "none") {
      return;
    }

    const savedView = savedViews.find((view) => view.id === selectedSavedViewId);

    if (!savedView) {
      setSelectedSavedViewId("none");
      return;
    }

    applySavedView(parseProjectSavedViewConfig(savedView.config));
  }, [applySavedView, savedViews, selectedSavedViewId]);

  useEffect(() => {
    if (isReadOnly) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping = ["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;

      if ((event.key === "c" || event.key === "C") && !isTyping && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setNewTaskStatus(getDefaultOpenTaskStatus(taskStatusDefinitions) as TaskStatus);
        setIsModalOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isReadOnly, taskStatusDefinitions]);

  const openCreateTask = (status: TaskStatus) => {
    if (isReadOnly) {
      return;
    }

    setNewTaskStatus(status);
    setIsModalOpen(true);
  };

  const openTaskPanel = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveTaskId(String(active.id));
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    setActiveTaskId(null);
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveTaskId(null);

    if (hasActiveFilters || isReadOnly) {
      return;
    }

    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) {
      return;
    }

    const previousTasks = tasks.map((task) => ({ ...task }));
    const activeTask = previousTasks.find((task) => task.id === activeId);

    if (!activeTask) {
      return;
    }

    const sourceStatus = activeTask.status;

    const destinationStatus = taskStatusSet.has(overId)
      ? overId
      : previousTasks.find((task) => task.id === overId)?.status;

    if (!destinationStatus) {
      return;
    }

    const nextGroups = groupTasks(previousTasks, taskStatusKeys);
    const sourceList = nextGroups[sourceStatus].map((task) => ({ ...task }));
    const targetList = sourceStatus === destinationStatus
      ? sourceList
      : nextGroups[destinationStatus].map((task) => ({ ...task }));

    const sourceIndex = sourceList.findIndex((task) => task.id === activeId);

    if (sourceIndex < 0) {
      return;
    }

    const [moved] = sourceList.splice(sourceIndex, 1);
    const movedTask = { ...moved, status: destinationStatus };

    let targetIndex = targetList.length;

    if (!taskStatusSet.has(overId)) {
      const overIndex = targetList.findIndex((task) => task.id === overId);
      if (overIndex >= 0) {
        targetIndex = overIndex;
      }
    }

    if (sourceStatus === destinationStatus) {
      sourceList.splice(targetIndex, 0, movedTask);
      nextGroups[destinationStatus] = sourceList;
    } else {
      targetList.splice(targetIndex, 0, movedTask);
      nextGroups[sourceStatus] = sourceList;
      nextGroups[destinationStatus] = targetList;
    }

    const optimistic = flattenWithPositions(nextGroups, taskStatusKeys);
    const changedTasks = getChangedTasks(previousTasks, optimistic);

    if (!changedTasks.length) {
      return;
    }

    setTasks(optimistic);

    try {
      for (const task of changedTasks) {
        const { error } = await supabase
          .from("tasks")
          .update({ status: task.status, position: task.position })
          .eq("id", task.id);

        if (error) {
          throw error;
        }
      }

      highlightTask(activeId);

      if (sourceStatus !== destinationStatus) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          await insertActivity(supabase, {
            workspaceId,
            projectId,
            actorId: user.id,
            action: "task.status_changed",
            metadata: {
              taskId: activeTask.id,
              identifier: activeTask.identifier,
              from: sourceStatus,
              to: destinationStatus,
            },
          });
        }

        toast.success("Task status updated.");
      }
    } catch {
      setTasks(previousTasks);
      showToast("Could not move task. Changes were rolled back.");
      toast.error("Could not update task status.");
    }
  };

  const handleOptimisticCreate = (task: Task) => {
    markTaskEntering(task.id);
    setTasks((current) => [...current, task]);
  };

  const handleCreateCommit = (tempTaskId: string, createdTask: Task) => {
    clearEnteringTask(tempTaskId);
    markTaskEntering(createdTask.id, 620);
    highlightTask(createdTask.id, 1600);

    setTasks((current) => {
      const hasCreatedTask = current.some((task) => task.id === createdTask.id);
      const withoutTemp = current.filter((task) => task.id !== tempTaskId);

      if (hasCreatedTask) {
        return withoutTemp;
      }

      return [...withoutTemp, createdTask];
    });
  };

  const handleCreateRollback = (tempTaskId: string) => {
    clearEnteringTask(tempTaskId);
    setTasks((current) => current.filter((task) => task.id !== tempTaskId));
  };

  const handleTaskUpdated = (updatedTask: Task) => {
    setTasks((current) => current.map((task) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task)));
  };

  const handleTaskDuplicated = (createdTask: Task) => {
    markTaskEntering(createdTask.id, 620);
    highlightTask(createdTask.id, 1600);

    setTasks((current) => {
      if (current.some((task) => task.id === createdTask.id)) {
        return current;
      }

      return [...current, createdTask];
    });
  };

  const handleTaskDeleted = (taskId: string) => {
    if (selectedTaskId === taskId) {
      setSelectedTaskId(null);
    }

    setTasks((current) => current.filter((task) => task.id !== taskId));
  };

  const saveCurrentView = async () => {
    const suggestedName = savedViews.length === 0 ? "Focus view" : `View ${savedViews.length + 1}`;
    const name = window.prompt("Name this saved view", suggestedName)?.trim();

    if (!name) {
      return;
    }

    setIsSavingView(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setIsSavingView(false);
      toast.error(userError?.message ?? "Could not identify the current user.");
      return;
    }

    const { data, error } = await supabase
      .from("saved_views")
      .insert({
        user_id: user.id,
        scope: "project",
        project_id: projectId,
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
    <div className="space-y-4">
      {isReadOnly ? (
        <Alert>
          <AlertDescription>
            This project is archived. The board stays visible, but task creation, drag and drop, and task editing are disabled until the project is restored.
          </AlertDescription>
        </Alert>
      ) : null}

      <header className="surface-panel rounded-xl border p-4 shadow-sm dark:shadow-none">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{projectName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {getPhaseLabel(projectPhase)}
              </Badge>
              {isReadOnly ? <Badge variant="secondary">Archived</Badge> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(`/workspace/${workspaceId}/project/${projectId}/overview`)}>
              Project brief
            </Button>
            <Button type="button" onClick={() => openCreateTask("backlog")} disabled={isReadOnly}>
              + Add task
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <Progress value={progressPct}>
            <ProgressLabel>Progress</ProgressLabel>
            <span className="ml-auto text-sm text-muted-foreground tabular-nums">{progressPct}%</span>
          </Progress>
          <AvatarGroup>
            {uniqueAssignees.slice(0, 4).map((assigneeId) => (
              <Avatar key={assigneeId} size="sm">
                <AvatarFallback>{initials(getMemberDisplayName(memberNameMap[assigneeId]))}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        </div>
      </header>

      <BoardToolbar
        onCreateTask={() => openCreateTask(getDefaultOpenTaskStatus(taskStatusDefinitions) as TaskStatus)}
        onViewModeChange={setViewMode}
        createDisabled={isReadOnly}
        assigneeOptions={assigneeOptions}
        assigneeFilter={assigneeFilter}
        onAssigneeFilterChange={setAssigneeFilter}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        milestoneOptions={milestoneOptions}
        milestoneFilter={milestoneFilter}
        onMilestoneFilterChange={setMilestoneFilter}
        attentionFilter={attentionFilter}
        onAttentionFilterChange={setAttentionFilter}
        sortOption={sortOption}
        onSortOptionChange={setSortOption}
        savedViews={savedViews.map((view) => ({ id: view.id, name: view.name }))}
        selectedSavedViewId={selectedSavedViewId}
        onSavedViewSelect={setSelectedSavedViewId}
        onSaveCurrentView={saveCurrentView}
        onDeleteSavedView={deleteSavedView}
        isSavingView={isSavingView}
        isDeletingView={isDeletingView}
        visibleTaskCount={visibleTasks.length}
        totalTaskCount={tasks.length}
        viewMode={viewMode}
      />

      {isLoading ? (
        <div className="surface-panel rounded-lg border p-6 text-sm text-muted-foreground shadow-sm dark:shadow-none">Loading board...</div>
      ) : viewMode === "list" ? (
        <TaskListView
          tasks={listTasks}
          milestones={milestones}
          taskStatuses={taskStatusDefinitions}
          memberNameMap={memberNameMap}
          blockedByMap={blockedByMap}
          blockingMap={blockingMap}
          onOpenTask={openTaskPanel}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          <div className="overflow-x-auto pb-2">
            <div
              className="grid min-w-full gap-4"
              style={{
                gridTemplateColumns: `repeat(${taskStatusColumns.length}, minmax(220px, 1fr))`,
              }}
            >
              {taskStatusColumns.map((column) => (
                <BoardColumn
                  key={column.status}
                  label={column.label}
                  status={column.status as TaskStatus}
                  color={column.dotColor}
                  tasks={taskGroups[column.status] ?? []}
                  taskStatuses={taskStatusDefinitions}
                  blockedByMap={blockedByMap}
                  blockingMap={blockingMap}
                  onAddTask={openCreateTask}
                  addDisabled={isReadOnly}
                  onOpenTask={openTaskPanel}
                  isDragDisabled={hasActiveFilters || isReadOnly}
                  activeTaskId={activeTaskId}
                  highlightedTaskId={highlightedTaskId}
                  enteringTaskIds={enteringTaskIdSet}
                />
              ))}
            </div>
          </div>
          <DragOverlay
            dropAnimation={{
              duration: 280,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {activeTask ? (
              <div className="w-[clamp(220px,18vw,300px)] max-w-[300px]">
                <TaskCard
                  task={activeTask}
                  taskStatuses={taskStatusDefinitions}
                  onOpenTask={openTaskPanel}
                  isDragDisabled
                  isOverlay
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <QuickCreateModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        workspaceId={workspaceId}
        projectId={projectId}
        projectPrefix={projectPrefix}
        assignees={members}
        taskStatuses={taskStatusDefinitions}
        readOnly={isReadOnly}
        defaultStatus={newTaskStatus}
        onOptimisticCreate={handleOptimisticCreate}
        onCreateCommit={handleCreateCommit}
        onCreateRollback={handleCreateRollback}
        onError={showToast}
      />

      <TaskDetailPanel
        open={Boolean(selectedTask)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedTaskId(null);
          }
        }}
        workspaceId={workspaceId}
        projectId={projectId}
        task={selectedTask}
        tasks={tasks}
        taskStatuses={taskStatusDefinitions}
        dependencies={dependencies}
        milestones={milestones}
        members={members}
        customFieldDefinitions={customFieldDefinitions}
        currentUserId={currentUserId}
        readOnly={isReadOnly}
        onTaskUpdated={handleTaskUpdated}
        onTaskDuplicated={handleTaskDuplicated}
        onTaskDeleted={handleTaskDeleted}
      />

      {toastMessage ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-md border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-lg backdrop-blur dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-200">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}
