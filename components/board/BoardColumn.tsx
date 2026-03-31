"use client";

import { useEffect, useRef, useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TaskCard } from "@/components/board/TaskCard";
import type { Task, TaskStatus, WorkspaceTaskStatusDefinition } from "@/types";

type BoardColumnProps = {
  blockedByMap?: Record<string, string[]>;
  blockingMap?: Record<string, string[]>;
  label: string;
  status: TaskStatus;
  color: string;
  tasks: Task[];
  taskStatuses?: WorkspaceTaskStatusDefinition[];
  onAddTask: (status: TaskStatus) => void;
  addDisabled?: boolean;
  onOpenTask: (taskId: string) => void;
  isDragDisabled?: boolean;
  activeTaskId?: string | null;
  highlightedTaskId?: string | null;
  enteringTaskIds?: ReadonlySet<string>;
};

export function BoardColumn({
  blockedByMap = {},
  blockingMap = {},
  label,
  status,
  color,
  tasks,
  taskStatuses = [],
  onAddTask,
  addDisabled = false,
  onOpenTask,
  isDragDisabled = false,
  activeTaskId = null,
  highlightedTaskId = null,
  enteringTaskIds,
}: BoardColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  const [isCountAnimating, setIsCountAnimating] = useState(false);
  const hasMountedRef = useRef(false);
  const hasActiveDrag = Boolean(activeTaskId);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    setIsCountAnimating(true);

    const timeoutId = window.setTimeout(() => {
      setIsCountAnimating(false);
    }, 280);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [tasks.length]);

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "surface-subpanel flex min-w-0 flex-col rounded-xl border p-3 transition-[border-color,background-color,box-shadow] duration-300 ease-out",
        hasActiveDrag && "border-border/90 dark:bg-[rgb(255_255_255_/_0.022)]",
        isOver && "border-blue-300/70 bg-linear-to-b from-blue-500/12 to-[var(--surface-panel)] shadow-[0_14px_32px_rgba(59,130,246,0.14)] dark:border-blue-400/45 dark:from-blue-400/10 dark:to-[var(--surface-panel)]",
      )}
    >
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", color)} />
          <h3 className={cn("text-sm font-semibold text-foreground transition-colors duration-300", isOver && "text-blue-700 dark:text-blue-200")}>
            {label}
          </h3>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "transition-[transform,background-color,border-color,color] duration-300",
            isCountAnimating && "animate-board-count-pop",
            isOver && "border-blue-300/60 surface-panel text-blue-700 dark:border-blue-400/30 dark:bg-[var(--surface-panel-hover)] dark:text-blue-200",
          )}
        >
          {tasks.length}
        </Badge>
      </header>

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className={cn("space-y-2 rounded-lg transition-colors duration-300", isOver && "dark:bg-[rgb(255_255_255_/_0.02)]")}>
          {tasks.length === 0 && hasActiveDrag ? (
            <div
              className={cn(
                "rounded-lg border border-dashed px-3 py-4 text-center text-xs font-medium text-muted-foreground transition-[border-color,background-color,color] duration-300",
                isOver
                  ? "border-blue-300/70 surface-panel text-blue-700 dark:border-blue-400/40 dark:bg-[var(--surface-panel-hover)] dark:text-blue-200"
                  : "border-border bg-transparent",
              )}
            >
              {isOver ? "Drop task here" : "Drag a task into this column"}
            </div>
          ) : null}
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              blockedByCount={blockedByMap[task.id]?.length ?? 0}
              blockingCount={blockingMap[task.id]?.length ?? 0}
              task={task}
              taskStatuses={taskStatuses}
              onOpenTask={onOpenTask}
              isDragDisabled={isDragDisabled}
              isDraggingSource={task.id === activeTaskId}
              isHighlighted={task.id === highlightedTaskId}
              isEntering={enteringTaskIds?.has(task.id) ?? false}
            />
          ))}
        </div>
      </SortableContext>

      <Button
        type="button"
        variant="ghost"
        className="mt-3 w-full justify-start text-muted-foreground"
        disabled={addDisabled}
        onClick={() => onAddTask(status)}
      >
        + Add task
      </Button>
    </section>
  );
}
