import type { TaskPriority, TaskStatus } from "@/types";

export const BOARD_COLUMNS: Array<{
  status: TaskStatus;
  label: string;
  dotColor: string;
}> = [
  { status: "backlog", label: "Backlog", dotColor: "bg-slate-400" },
  { status: "todo", label: "Todo", dotColor: "bg-blue-500" },
  { status: "in_progress", label: "In Progress", dotColor: "bg-amber-500" },
  { status: "in_review", label: "In Review", dotColor: "bg-violet-500" },
  { status: "done", label: "Done", dotColor: "bg-emerald-500" },
];

export const PRIORITY_CONFIG: Record<
  TaskPriority,
  {
    color: string;
    label: string;
  }
> = {
  urgent: { color: "bg-red-500", label: "Urgent" },
  high: { color: "bg-amber-500", label: "High" },
  medium: { color: "bg-blue-500", label: "Medium" },
  none: { color: "bg-slate-400", label: "No priority" },
};

export function isTaskStatus(value: string): value is TaskStatus {
  return BOARD_COLUMNS.some((column) => column.status === value);
}
