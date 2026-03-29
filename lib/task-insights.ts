import type { Task, TaskDependency } from "@/types";

export type TaskDueState = "none" | "due-soon" | "overdue";

function startOfDay(reference: Date) {
  return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
}

export function getTaskDueState(task: Pick<Task, "due_date" | "status">, reference = new Date()): TaskDueState {
  if (!task.due_date || task.status === "done") {
    return "none";
  }

  const today = startOfDay(reference).getTime();
  const due = startOfDay(new Date(task.due_date)).getTime();

  if (due < today) {
    return "overdue";
  }

  const diffDays = Math.round((due - today) / 86_400_000);
  return diffDays <= 3 ? "due-soon" : "none";
}

export function buildTaskDependencyMaps(dependencies: TaskDependency[]) {
  const blockedByMap: Record<string, string[]> = {};
  const blockingMap: Record<string, string[]> = {};

  for (const dependency of dependencies) {
    blockedByMap[dependency.blocked_task_id] ??= [];
    blockingMap[dependency.blocking_task_id] ??= [];

    blockedByMap[dependency.blocked_task_id].push(dependency.blocking_task_id);
    blockingMap[dependency.blocking_task_id].push(dependency.blocked_task_id);
  }

  return {
    blockedByMap,
    blockingMap,
  };
}