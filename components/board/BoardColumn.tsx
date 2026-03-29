"use client";

import { useEffect, useRef, useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TaskCard } from "@/components/board/TaskCard";
import type { Task, TaskStatus } from "@/types";

type BoardColumnProps = {
  blockedByMap?: Record<string, string[]>;
  blockingMap?: Record<string, string[]>;
  label: string;
  status: TaskStatus;
  color: string;
  tasks: Task[];
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
        "flex w-[300px] shrink-0 flex-col rounded-xl border bg-slate-50 p-3 transition-[border-color,background-color,box-shadow] duration-300 ease-out",
        hasActiveDrag && "border-slate-300 bg-slate-50/90",
        isOver && "border-blue-300 bg-linear-to-b from-blue-50 to-white shadow-[0_14px_32px_rgba(59,130,246,0.14)]",
      )}
    >
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", color)} />
          <h3 className={cn("text-sm font-semibold text-slate-800 transition-colors duration-300", isOver && "text-blue-700")}>
            {label}
          </h3>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "transition-[transform,background-color,border-color,color] duration-300",
            isCountAnimating && "animate-board-count-pop",
            isOver && "border-blue-200 bg-white text-blue-700",
          )}
        >
          {tasks.length}
        </Badge>
      </header>

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className={cn("space-y-2 rounded-lg transition-colors duration-300", isOver && "bg-white/60")}>
          {tasks.length === 0 && hasActiveDrag ? (
            <div
              className={cn(
                "rounded-lg border border-dashed px-3 py-4 text-center text-xs font-medium text-slate-400 transition-[border-color,background-color,color] duration-300",
                isOver ? "border-blue-300 bg-white text-blue-700" : "border-slate-200 bg-transparent",
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
        className="mt-3 w-full justify-start text-slate-600"
        disabled={addDisabled}
        onClick={() => onAddTask(status)}
      >
        + Add task
      </Button>
    </section>
  );
}
