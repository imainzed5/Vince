"use client";

import { CalendarDays, Link2 } from "lucide-react";

import { BOARD_COLUMNS, PRIORITY_CONFIG } from "@/components/board/config";
import { Badge } from "@/components/ui/badge";
import { formatCalendarDate } from "@/lib/utils/time";
import { cn } from "@/lib/utils";
import { getTaskDueState } from "@/lib/task-insights";
import type { Task } from "@/types";
import type { Database } from "@/types/database.types";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];

type TaskListViewProps = {
  tasks: Task[];
  milestones?: Milestone[];
  memberNameMap: Record<string, string>;
  blockedByMap?: Record<string, string[]>;
  blockingMap?: Record<string, string[]>;
  onOpenTask: (taskId: string) => void;
};

export function TaskListView({
  tasks,
  milestones = [],
  memberNameMap,
  blockedByMap = {},
  blockingMap = {},
  onOpenTask,
}: TaskListViewProps) {
  const milestoneNameMap = Object.fromEntries(milestones.map((milestone) => [milestone.id, milestone.name]));

  if (!tasks.length) {
    return <div className="rounded-lg border bg-white p-6 text-sm text-slate-500">No tasks match the current filters.</div>;
  }

  return (
    <div className="space-y-3 rounded-xl border bg-white p-4">
      <div className="hidden grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr_0.9fr_0.9fr] gap-3 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
        <span>Task</span>
        <span>Status</span>
        <span>Priority</span>
        <span>Assignee</span>
        <span>Due</span>
        <span>Dependencies</span>
      </div>

      <div className="space-y-2">
        {tasks.map((task) => {
          const priority = PRIORITY_CONFIG[task.priority];
          const statusLabel = BOARD_COLUMNS.find((column) => column.status === task.status)?.label ?? task.status;
          const dueState = getTaskDueState(task);
          const blockedByCount = blockedByMap[task.id]?.length ?? 0;
          const blockingCount = blockingMap[task.id]?.length ?? 0;

          return (
            <button
              key={task.id}
              type="button"
              className="grid w-full gap-3 rounded-xl border bg-slate-50/70 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50 lg:grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr_0.9fr_0.9fr] lg:items-center"
              onClick={() => onOpenTask(task.id)}
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{task.identifier}</Badge>
                  {task.is_blocked || blockedByCount > 0 ? <Badge variant="destructive">Blocked</Badge> : null}
                  {dueState === "overdue" ? <Badge variant="destructive">Overdue</Badge> : null}
                  {dueState === "due-soon" ? <Badge variant="secondary">Due soon</Badge> : null}
                </div>
                <div>
                  <p className={cn("text-sm font-semibold text-slate-900", task.status === "done" && "line-through opacity-70")}>{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.milestone_id ? milestoneNameMap[task.milestone_id] ?? "Milestone" : "No milestone"}
                  </p>
                </div>
              </div>

              <div className="text-sm text-slate-700">{statusLabel}</div>

              <div>
                <Badge variant="outline" className="gap-2">
                  <span className={cn("size-2 rounded-full", priority.color)} />
                  {priority.label}
                </Badge>
              </div>

              <div className="text-sm text-slate-700">
                {task.assignee_id ? memberNameMap[task.assignee_id] ?? `User ${task.assignee_id.slice(0, 8)}` : "Unassigned"}
              </div>

              <div className={cn("inline-flex items-center gap-2 text-sm", dueState === "overdue" ? "text-red-700" : dueState === "due-soon" ? "text-amber-700" : "text-slate-600")}>
                <CalendarDays className="size-4" />
                {formatCalendarDate(task.due_date, { fallback: "No due date", includeYear: true })}
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                {blockedByCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-700">
                    <Link2 className="size-3" />
                    Blocked by {blockedByCount}
                  </span>
                ) : null}
                {blockingCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                    <Link2 className="size-3" />
                    Blocks {blockingCount}
                  </span>
                ) : null}
                {blockedByCount === 0 && blockingCount === 0 ? <span className="text-muted-foreground">None</span> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}