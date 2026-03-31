import type { Json } from "@/types/database.types";
import type { TaskPriority, TaskStatus } from "@/types";

type JsonRecord = Record<string, Json | undefined>;

export type ProjectAttentionFilter = "all" | "blocked" | "overdue" | "due_soon" | "blocking_others";
export type ProjectListSortOption = "board_order" | "due_date" | "priority" | "newest";
export type MyTasksAttentionFilter = ProjectAttentionFilter;
export type MyTasksSortOption = "due_date" | "priority" | "project" | "newest";

export type ProjectSavedViewConfig = {
  assigneeFilter: string;
  priorityFilter: TaskPriority | "all";
  attentionFilter: ProjectAttentionFilter;
  milestoneFilter: string;
  viewMode: "board" | "list";
  sortOption: ProjectListSortOption;
};

export type MyTasksSavedViewConfig = {
  workspaceFilter: string;
  projectFilter: string;
  statusFilter: TaskStatus | "all";
  priorityFilter: TaskPriority | "all";
  attentionFilter: MyTasksAttentionFilter;
  sortOption: MyTasksSortOption;
};

export type ProjectTemplateConfig = {
  projectDescription: string;
  goalStatement: string;
  scopeSummary: string;
  successMetric: string;
  phase: "planning" | "in_progress" | "in_review" | "done";
  keyOutcomes: string[];
  milestones: string[];
};

export const DEFAULT_PROJECT_SAVED_VIEW_CONFIG: ProjectSavedViewConfig = {
  assigneeFilter: "all",
  priorityFilter: "all",
  attentionFilter: "all",
  milestoneFilter: "all",
  viewMode: "board",
  sortOption: "board_order",
};

export const DEFAULT_MY_TASKS_SAVED_VIEW_CONFIG: MyTasksSavedViewConfig = {
  workspaceFilter: "all",
  projectFilter: "all",
  statusFilter: "all",
  priorityFilter: "all",
  attentionFilter: "all",
  sortOption: "due_date",
};

export const DEFAULT_PROJECT_TEMPLATE_CONFIG: ProjectTemplateConfig = {
  projectDescription: "",
  goalStatement: "",
  scopeSummary: "",
  successMetric: "",
  phase: "planning",
  keyOutcomes: [],
  milestones: [],
};

const VALID_TASK_PRIORITIES = new Set<TaskPriority | "all">(["all", "urgent", "high", "medium", "none"]);
const VALID_ATTENTION_FILTERS = new Set<ProjectAttentionFilter>(["all", "blocked", "overdue", "due_soon", "blocking_others"]);
const VALID_PROJECT_SORT_OPTIONS = new Set<ProjectListSortOption>(["board_order", "due_date", "priority", "newest"]);
const VALID_MY_TASKS_SORT_OPTIONS = new Set<MyTasksSortOption>(["due_date", "priority", "project", "newest"]);
const VALID_PROJECT_PHASES = new Set<ProjectTemplateConfig["phase"]>(["planning", "in_progress", "in_review", "done"]);

function asRecord(value: Json | null | undefined): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

function asStringArray(value: Json | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

export function normalizeKeyOutcomes(values: string[]): string[] {
  const normalizedValues: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      continue;
    }

    const key = trimmedValue.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedValues.push(trimmedValue);

    if (normalizedValues.length === 5) {
      break;
    }
  }

  return normalizedValues;
}

export function parseProjectKeyOutcomes(value: Json | null | undefined): string[] {
  return normalizeKeyOutcomes(asStringArray(value ?? undefined));
}

export function parseProjectSavedViewConfig(value: Json | null | undefined): ProjectSavedViewConfig {
  const record = asRecord(value);
  const assigneeFilter = typeof record.assigneeFilter === "string" ? record.assigneeFilter : "all";
  const priorityFilter = VALID_TASK_PRIORITIES.has(record.priorityFilter as TaskPriority | "all")
    ? (record.priorityFilter as TaskPriority | "all")
    : "all";
  const attentionFilter = VALID_ATTENTION_FILTERS.has(record.attentionFilter as ProjectAttentionFilter)
    ? (record.attentionFilter as ProjectAttentionFilter)
    : "all";
  const milestoneFilter = typeof record.milestoneFilter === "string" ? record.milestoneFilter : "all";
  const viewMode = record.viewMode === "list" ? "list" : "board";
  const sortOption = VALID_PROJECT_SORT_OPTIONS.has(record.sortOption as ProjectListSortOption)
    ? (record.sortOption as ProjectListSortOption)
    : "board_order";

  return {
    assigneeFilter,
    priorityFilter,
    attentionFilter,
    milestoneFilter,
    viewMode,
    sortOption,
  };
}

export function parseMyTasksSavedViewConfig(value: Json | null | undefined): MyTasksSavedViewConfig {
  const record = asRecord(value);
  const workspaceFilter = typeof record.workspaceFilter === "string" ? record.workspaceFilter : "all";
  const projectFilter = typeof record.projectFilter === "string" ? record.projectFilter : "all";
  const statusFilter = typeof record.statusFilter === "string" && record.statusFilter.trim()
    ? (record.statusFilter as TaskStatus | "all")
    : "all";
  const priorityFilter = VALID_TASK_PRIORITIES.has(record.priorityFilter as TaskPriority | "all")
    ? (record.priorityFilter as TaskPriority | "all")
    : "all";
  const attentionFilter = VALID_ATTENTION_FILTERS.has(record.attentionFilter as MyTasksAttentionFilter)
    ? (record.attentionFilter as MyTasksAttentionFilter)
    : "all";
  const sortOption = VALID_MY_TASKS_SORT_OPTIONS.has(record.sortOption as MyTasksSortOption)
    ? (record.sortOption as MyTasksSortOption)
    : "due_date";

  return {
    workspaceFilter,
    projectFilter,
    statusFilter,
    priorityFilter,
    attentionFilter,
    sortOption,
  };
}

export function parseProjectTemplateConfig(value: Json | null | undefined): ProjectTemplateConfig {
  const record = asRecord(value);
  const phase = VALID_PROJECT_PHASES.has(record.phase as ProjectTemplateConfig["phase"])
    ? (record.phase as ProjectTemplateConfig["phase"])
    : "planning";

  return {
    projectDescription: typeof record.projectDescription === "string" ? record.projectDescription : "",
    goalStatement: typeof record.goalStatement === "string" ? record.goalStatement : "",
    scopeSummary: typeof record.scopeSummary === "string" ? record.scopeSummary : "",
    successMetric: typeof record.successMetric === "string" ? record.successMetric : "",
    phase,
    keyOutcomes: parseProjectKeyOutcomes(record.keyOutcomes),
    milestones: asStringArray(record.milestones),
  };
}