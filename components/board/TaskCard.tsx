"use client";

import { useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CalendarDays } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { isDoneTaskStatus } from "@/lib/task-statuses";
import { formatCalendarDate } from "@/lib/utils/time";
import { cn } from "@/lib/utils";
import { PRIORITY_CONFIG } from "@/components/board/config";
import type { Task, WorkspaceTaskStatusDefinition } from "@/types";

type TaskCardProps = {
  blockedByCount?: number;
  blockingCount?: number;
  task: Task;
  taskStatuses?: WorkspaceTaskStatusDefinition[];
  onOpenTask: (taskId: string) => void;
  isDragDisabled?: boolean;
  isOverlay?: boolean;
  isDraggingSource?: boolean;
  isHighlighted?: boolean;
  isEntering?: boolean;
};

function toInitials(value: string | null): string {
  if (!value) {
    return "?";
  }

  return value.replace(/-/g, "").slice(0, 2).toUpperCase();
}

function toDateLabel(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return formatCalendarDate(value, { fallback: "" }) || null;
}

export function TaskCard({
  blockedByCount = 0,
  blockingCount = 0,
  task,
  taskStatuses = [],
  onOpenTask,
  isDragDisabled = false,
  isOverlay = false,
  isDraggingSource = false,
  isHighlighted = false,
  isEntering = false,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: isDragDisabled || isOverlay,
    transition: {
      duration: 260,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  });

  const dueLabel = useMemo(() => toDateLabel(task.due_date), [task.due_date]);
  const isBlocked = task.is_blocked || blockedByCount > 0;
  const isDone = isDoneTaskStatus(task.status, taskStatuses);
  const isOverdue =
    Boolean(task.due_date) &&
    !isDone &&
    new Date(task.due_date as string) < new Date(new Date().toDateString());

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
      : undefined,
    transition,
  };

  const priority = PRIORITY_CONFIG[task.priority];
  const dragHandleProps = isDragDisabled ? {} : { ...attributes, ...listeners };
  const isInteractive = !isDragDisabled && !isOverlay;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        "surface-panel relative rounded-lg border p-3 shadow-sm transition-[transform,box-shadow,opacity,border-color,background-color] duration-200 ease-out will-change-transform dark:shadow-none",
        isInteractive && "surface-panel-hover cursor-grab hover:-translate-y-0.5 hover:border-border/80 hover:shadow-md dark:hover:shadow-none active:scale-[0.99] active:cursor-grabbing active:shadow-sm",
        !isInteractive && !isOverlay && "cursor-pointer",
        isOverlay && "pointer-events-none scale-[1.02] shadow-2xl ring-1 ring-blue-300/50 dark:ring-blue-400/40 animate-board-overlay-float",
        isBlocked ? "border-l-2 border-l-red-500" : "border-border",
        isDone && "opacity-60",
        isHighlighted && !isOverlay && "animate-board-task-highlight",
        isEntering && !isOverlay && "animate-board-task-enter",
        (isDragging || isDraggingSource) && "opacity-35 shadow-none scale-[0.985]",
      )}
      {...dragHandleProps}
      onClick={isOverlay ? undefined : () => onOpenTask(task.id)}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{task.identifier}</span>
        <span className={cn("size-2 rounded-full", priority.color)} title={priority.label} />
      </div>
      <p className={cn("text-sm font-medium text-foreground", isDone && "line-through")}>{task.title}</p>
      {isBlocked && task.blocked_reason ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-300">Blocked: {task.blocked_reason}</p>
      ) : null}
      {blockedByCount > 0 && !task.blocked_reason ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-300">Blocked by {blockedByCount} task{blockedByCount === 1 ? "" : "s"}</p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <Avatar size="sm">
          <AvatarFallback>{toInitials(task.assignee_id)}</AvatarFallback>
        </Avatar>
        {dueLabel ? (
          <span className={cn("inline-flex items-center gap-1 text-xs", isOverdue ? "text-red-600 dark:text-red-300" : "text-muted-foreground")}>
            <CalendarDays className="size-3" />
            {dueLabel}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/80">No due date</span>
        )}
      </div>
      {blockingCount > 0 ? <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">Blocks {blockingCount} task{blockingCount === 1 ? "" : "s"}</p> : null}
    </article>
  );
}
