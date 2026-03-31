import type { Database } from "@/types/database.types";

export type WorkspaceTaskStatusDefinition = Database["public"]["Tables"]["workspace_task_statuses"]["Row"];
export type TaskStatusKind = WorkspaceTaskStatusDefinition["kind"];
export type TaskStatusColor = WorkspaceTaskStatusDefinition["color"];
export type TaskStatusColumn = {
  status: string;
  label: string;
  dotColor: string;
};

export const MAX_WORKSPACE_TASK_STATUSES = 7;

export const TASK_STATUS_COLOR_STYLES: Record<
  TaskStatusColor,
  { badge: string; dot: string; soft: string }
> = {
  slate: { badge: "bg-slate-100 text-slate-700", dot: "bg-slate-400", soft: "bg-slate-50 text-slate-700" },
  blue: { badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500", soft: "bg-blue-50 text-blue-700" },
  amber: { badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500", soft: "bg-amber-50 text-amber-700" },
  violet: { badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500", soft: "bg-violet-50 text-violet-700" },
  emerald: { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-700" },
  rose: { badge: "bg-rose-100 text-rose-700", dot: "bg-rose-500", soft: "bg-rose-50 text-rose-700" },
  orange: { badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500", soft: "bg-orange-50 text-orange-700" },
  cyan: { badge: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500", soft: "bg-cyan-50 text-cyan-700" },
};

export const TASK_STATUS_COLOR_OPTIONS = Object.keys(TASK_STATUS_COLOR_STYLES) as TaskStatusColor[];

export const DEFAULT_WORKSPACE_TASK_STATUSES: Array<
  Pick<WorkspaceTaskStatusDefinition, "key" | "label" | "kind" | "color" | "position" | "is_default">
> = [
  { key: "backlog", label: "Backlog", kind: "open", color: "slate", position: 0, is_default: true },
  { key: "todo", label: "Todo", kind: "open", color: "blue", position: 1, is_default: true },
  { key: "in_progress", label: "In Progress", kind: "open", color: "amber", position: 2, is_default: true },
  { key: "in_review", label: "In Review", kind: "open", color: "violet", position: 3, is_default: true },
  { key: "done", label: "Done", kind: "done", color: "emerald", position: 4, is_default: true },
];

const VALID_TASK_STATUS_COLORS = new Set<TaskStatusColor>(Object.keys(TASK_STATUS_COLOR_STYLES) as TaskStatusColor[]);

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatTaskStatusLabel(statusKey: string): string {
  return titleCase(statusKey);
}

export function normalizeTaskStatusKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function normalizeWorkspaceTaskStatuses(
  items: WorkspaceTaskStatusDefinition[] | null | undefined,
): WorkspaceTaskStatusDefinition[] {
  if (!items?.length) {
    return DEFAULT_WORKSPACE_TASK_STATUSES.map((item, index) => ({
      id: `default-${item.key}`,
      workspace_id: "",
      created_by: null,
      key: item.key,
      label: item.label,
      kind: item.kind,
      color: item.color,
      position: item.position ?? index,
      is_default: item.is_default,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    }));
  }

  return [...items]
    .filter((item) => item.key.trim() && item.label.trim())
    .sort((left, right) => left.position - right.position);
}

export function withTaskStatusFallbacks(
  definitions: WorkspaceTaskStatusDefinition[] | null | undefined,
  taskStatuses: string[],
): WorkspaceTaskStatusDefinition[] {
  const normalizedDefinitions = normalizeWorkspaceTaskStatuses(definitions);
  const definitionKeys = new Set(normalizedDefinitions.map((definition) => definition.key));
  const nextDefinitions = [...normalizedDefinitions];

  for (const status of taskStatuses) {
    if (!status || definitionKeys.has(status)) {
      continue;
    }

    const fallbackDefault = DEFAULT_WORKSPACE_TASK_STATUSES.find((item) => item.key === status) ?? null;

    nextDefinitions.push({
      id: `fallback-${status}`,
      workspace_id: normalizedDefinitions[0]?.workspace_id ?? "",
      created_by: null,
      key: status,
      label: fallbackDefault?.label ?? formatTaskStatusLabel(status),
      kind: fallbackDefault?.kind ?? (status === "done" ? "done" : "open"),
      color: fallbackDefault?.color ?? "slate",
      position: nextDefinitions.length,
      is_default: false,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    });
    definitionKeys.add(status);
  }

  return nextDefinitions.sort((left, right) => left.position - right.position);
}

export function getTaskStatusDefinition(
  status: string | null | undefined,
  definitions: WorkspaceTaskStatusDefinition[] | null | undefined,
): WorkspaceTaskStatusDefinition | null {
  if (!status) {
    return null;
  }

  return normalizeWorkspaceTaskStatuses(definitions).find((definition) => definition.key === status) ?? null;
}

export function getTaskStatusLabel(
  status: string | null | undefined,
  definitions: WorkspaceTaskStatusDefinition[] | null | undefined,
): string {
  return getTaskStatusDefinition(status, definitions)?.label ?? formatTaskStatusLabel(status ?? "unknown");
}

export function getTaskStatusColor(
  status: string | null | undefined,
  definitions: WorkspaceTaskStatusDefinition[] | null | undefined,
): TaskStatusColor {
  const color = getTaskStatusDefinition(status, definitions)?.color;
  return color && VALID_TASK_STATUS_COLORS.has(color) ? color : "slate";
}

export function getTaskStatusColumns(
  definitions: WorkspaceTaskStatusDefinition[] | null | undefined,
): TaskStatusColumn[] {
  return normalizeWorkspaceTaskStatuses(definitions).map((definition) => ({
    status: definition.key,
    label: definition.label,
    dotColor: TASK_STATUS_COLOR_STYLES[definition.color]?.dot ?? TASK_STATUS_COLOR_STYLES.slate.dot,
  }));
}

export function isDoneTaskStatus(
  status: string | null | undefined,
  definitions: WorkspaceTaskStatusDefinition[] | null | undefined,
): boolean {
  return getTaskStatusDefinition(status, definitions)?.kind === "done" || status === "done";
}

export function getDefaultOpenTaskStatus(definitions: WorkspaceTaskStatusDefinition[] | null | undefined): string {
  return (
    normalizeWorkspaceTaskStatuses(definitions).find((definition) => definition.kind === "open")?.key ??
    DEFAULT_WORKSPACE_TASK_STATUSES[0].key
  );
}

export function getInFlightTaskStatusKeys(definitions: WorkspaceTaskStatusDefinition[] | null | undefined): string[] {
  return normalizeWorkspaceTaskStatuses(definitions)
    .filter((definition) => definition.kind === "open" && definition.key !== "backlog" && definition.key !== "todo")
    .map((definition) => definition.key);
}

export function validateWorkspaceTaskStatusInput(input: {
  label: string;
  color: string;
  kind: string;
}):
  | { label: string; color: TaskStatusColor; kind: TaskStatusKind; key: string }
  | { error: string } {
  const label = input.label.trim().slice(0, 32);

  if (!label) {
    return { error: "Status label is required." };
  }

  const key = normalizeTaskStatusKey(label);

  if (!key) {
    return { error: "Status label must include letters or numbers." };
  }

  if (!VALID_TASK_STATUS_COLORS.has(input.color as TaskStatusColor)) {
    return { error: "Choose a supported status color." };
  }

  if (input.kind !== "open" && input.kind !== "done") {
    return { error: "Choose whether this is an open or done status." };
  }

  return {
    label,
    color: input.color as TaskStatusColor,
    kind: input.kind as TaskStatusKind,
    key,
  };
}