"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { insertActivity } from "@/lib/supabase/activity";
import { BOARD_COLUMNS, isTaskStatus } from "@/components/board/config";
import { BoardToolbar } from "@/components/board/BoardToolbar";
import { BoardColumn } from "@/components/board/BoardColumn";
import { TaskCard } from "@/components/board/TaskCard";
import { QuickCreateModal } from "@/components/board/QuickCreateModal";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { useTasks } from "@/hooks/useTasks";
import { useTaskStore } from "@/stores/taskStore";
import type { Task, TaskPriority, TaskStatus } from "@/types";
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
  currentUserId: string;
};

type TaskGroups = Record<TaskStatus, Task[]>;

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

function groupTasks(tasks: Task[]): TaskGroups {
  const base: TaskGroups = {
    backlog: [],
    todo: [],
    in_progress: [],
    in_review: [],
    done: [],
  };

  for (const task of tasks) {
    base[task.status].push(task);
  }

  for (const status of Object.keys(base) as TaskStatus[]) {
    base[status].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  return base;
}

function flattenWithPositions(groups: TaskGroups): Task[] {
  const next: Task[] = [];

  for (const column of BOARD_COLUMNS) {
    const ordered = groups[column.status].map((task, index) => ({
      ...task,
      status: column.status,
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

export function BoardView({
  workspaceId,
  projectId,
  projectName,
  projectPhase,
  projectPrefix,
  projectStatus,
  members = [],
  milestones = [],
  currentUserId,
}: BoardViewProps) {
  const supabase = useMemo(() => createClient(), []);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const setSelectedTaskId = useTaskStore((state) => state.setSelectedTaskId);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);
  const { tasks, setTasks, isLoading } = useTasks({
    projectId,
    supabase,
    onError: showToast,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("backlog");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [enteringTaskIds, setEnteringTaskIds] = useState<string[]>([]);
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

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (assigneeFilter !== "all" && task.assignee_id !== assigneeFilter) {
        return false;
      }

      if (priorityFilter !== "all" && task.priority !== priorityFilter) {
        return false;
      }

      return true;
    });
  }, [assigneeFilter, priorityFilter, tasks]);

  const taskGroups = useMemo(() => groupTasks(filteredTasks), [filteredTasks]);
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );
  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks],
  );
  const enteringTaskIdSet = useMemo(() => new Set(enteringTaskIds), [enteringTaskIds]);
  const hasActiveFilters = assigneeFilter !== "all" || priorityFilter !== "all";
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

    const doneCount = tasks.filter((task) => task.status === "done").length;
    return Math.round((doneCount / tasks.length) * 100);
  }, [tasks]);

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
        name: memberNameMap[assigneeId] ?? `User ${assigneeId.slice(0, 8)}`,
      })),
    [memberNameMap, uniqueAssignees],
  );

  useEffect(() => {
    if (selectedTaskId && !tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [selectedTaskId, setSelectedTaskId, tasks]);

  useEffect(() => {
    if (isReadOnly) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping = ["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;

      if ((event.key === "c" || event.key === "C") && !isTyping && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setNewTaskStatus("backlog");
        setIsModalOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isReadOnly]);

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

    const destinationStatus = isTaskStatus(overId)
      ? overId
      : previousTasks.find((task) => task.id === overId)?.status;

    if (!destinationStatus) {
      return;
    }

    const nextGroups = groupTasks(previousTasks);
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

    if (!isTaskStatus(overId)) {
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

    const optimistic = flattenWithPositions(nextGroups);
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

  return (
    <div className="space-y-4">
      {isReadOnly ? (
        <Alert>
          <AlertDescription>
            This project is archived. The board stays visible, but task creation, drag and drop, and task editing are disabled until the project is restored.
          </AlertDescription>
        </Alert>
      ) : null}

      <header className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{projectName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {getPhaseLabel(projectPhase)}
              </Badge>
              {isReadOnly ? <Badge variant="secondary">Archived</Badge> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled>
              Share client link
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
                <AvatarFallback>{initials(memberNameMap[assigneeId] ?? assigneeId)}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        </div>
      </header>

      <BoardToolbar
        onCreateTask={() => openCreateTask("backlog")}
        createDisabled={isReadOnly}
        assigneeOptions={assigneeOptions}
        assigneeFilter={assigneeFilter}
        onAssigneeFilterChange={setAssigneeFilter}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        visibleTaskCount={filteredTasks.length}
        totalTaskCount={tasks.length}
      />

      {isLoading ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-slate-500">Loading board...</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-2">
            {BOARD_COLUMNS.map((column) => (
              <BoardColumn
                key={column.status}
                label={column.label}
                status={column.status}
                color={column.dotColor}
                tasks={taskGroups[column.status]}
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
          <DragOverlay
            dropAnimation={{
              duration: 280,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {activeTask ? (
              <div className="w-[300px] max-w-[300px]">
                <TaskCard
                  task={activeTask}
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
        milestones={milestones}
        members={members}
        currentUserId={currentUserId}
        readOnly={isReadOnly}
        onTaskUpdated={handleTaskUpdated}
        onTaskDuplicated={handleTaskDuplicated}
        onTaskDeleted={handleTaskDeleted}
      />

      {toastMessage ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-md border border-red-200 bg-white px-4 py-3 text-sm text-red-700 shadow-lg">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}
