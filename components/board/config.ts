import { DEFAULT_WORKSPACE_TASK_STATUSES, getTaskStatusColumns } from "@/lib/task-statuses";
import type { TaskPriority, TaskStatus } from "@/types";

export const BOARD_COLUMNS = getTaskStatusColumns(
  DEFAULT_WORKSPACE_TASK_STATUSES.map((status, index) => ({
    id: `default-${status.key}`,
    workspace_id: "",
    created_by: null,
    key: status.key,
    label: status.label,
    kind: status.kind,
    color: status.color,
    position: status.position ?? index,
    is_default: status.is_default,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  })),
) as Array<{
  status: TaskStatus;
  label: string;
  dotColor: string;
}>;

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
