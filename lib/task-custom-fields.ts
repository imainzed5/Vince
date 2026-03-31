import type { Database, Json } from "@/types/database.types";

export const MAX_TASK_CUSTOM_FIELDS = 8;
export const MAX_TASK_CUSTOM_FIELD_NAME_LENGTH = 40;
export const MAX_TASK_CUSTOM_FIELD_OPTIONS = 8;
export const MAX_TASK_CUSTOM_FIELD_OPTION_LENGTH = 32;
export const MAX_TASK_CUSTOM_FIELD_TEXT_LENGTH = 240;

export type TaskCustomFieldDefinition = Database["public"]["Tables"]["workspace_task_fields"]["Row"];
export type TaskCustomFieldType = TaskCustomFieldDefinition["field_type"];
export type TaskCustomFieldValues = Record<string, string>;

const VALID_TASK_CUSTOM_FIELD_TYPES = new Set<TaskCustomFieldType>(["text", "number", "date", "select"]);

function asStringArray(value: Json | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

export function getTaskCustomFieldTypeLabel(fieldType: TaskCustomFieldType): string {
  switch (fieldType) {
    case "text":
      return "Text";
    case "number":
      return "Number";
    case "date":
      return "Date";
    case "select":
      return "Select";
    default:
      return fieldType;
  }
}

export function normalizeTaskCustomFieldOptions(values: string[]): string[] {
  const normalizedValues: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmedValue = value.trim().slice(0, MAX_TASK_CUSTOM_FIELD_OPTION_LENGTH);

    if (!trimmedValue) {
      continue;
    }

    const key = trimmedValue.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedValues.push(trimmedValue);

    if (normalizedValues.length === MAX_TASK_CUSTOM_FIELD_OPTIONS) {
      break;
    }
  }

  return normalizedValues;
}

export function parseTaskCustomFieldOptions(value: Json | null | undefined): string[] {
  return normalizeTaskCustomFieldOptions(asStringArray(value));
}

export function parseTaskCustomFieldValues(value: Json | null | undefined): TaskCustomFieldValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const parsedValues: TaskCustomFieldValues = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      continue;
    }

    const trimmedValue = entry.trim();

    if (!trimmedValue) {
      continue;
    }

    parsedValues[key] = trimmedValue;
  }

  return parsedValues;
}

export function sanitizeTaskCustomFieldValue(
  definition: Pick<TaskCustomFieldDefinition, "field_type" | "options">,
  value: string | null | undefined,
): string | null {
  const trimmedValue = value?.trim() ?? "";

  if (!trimmedValue) {
    return null;
  }

  switch (definition.field_type) {
    case "text":
      return trimmedValue.slice(0, MAX_TASK_CUSTOM_FIELD_TEXT_LENGTH);
    case "number":
      return /^-?\d+(\.\d+)?$/.test(trimmedValue) ? trimmedValue : null;
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue) ? trimmedValue : null;
    case "select": {
      const options = parseTaskCustomFieldOptions(definition.options);
      return options.includes(trimmedValue) ? trimmedValue : null;
    }
    default:
      return null;
  }
}

export function serializeTaskCustomFieldValues(
  values: TaskCustomFieldValues,
  definitions: TaskCustomFieldDefinition[],
): Json {
  const serializedValues: Record<string, string> = {};

  for (const definition of definitions) {
    const nextValue = sanitizeTaskCustomFieldValue(definition, values[definition.id]);

    if (nextValue) {
      serializedValues[definition.id] = nextValue;
    }
  }

  return serializedValues;
}

export function areTaskCustomFieldValuesEqual(left: TaskCustomFieldValues, right: TaskCustomFieldValues): boolean {
  const leftEntries = Object.entries(left).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  const rightEntries = Object.entries(right).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([leftKey, leftValue], index) => {
    const [rightKey, rightValue] = rightEntries[index] ?? [];
    return leftKey === rightKey && leftValue === rightValue;
  });
}

export function validateTaskCustomFieldDefinitionInput(input: {
  fieldType: string;
  name: string;
  options?: string[];
}): {
  fieldType: TaskCustomFieldType;
  name: string;
  options: string[];
} | {
  error: string;
} {
  const name = input.name.trim().slice(0, MAX_TASK_CUSTOM_FIELD_NAME_LENGTH);

  if (!name) {
    return { error: "Field name is required." };
  }

  if (!VALID_TASK_CUSTOM_FIELD_TYPES.has(input.fieldType as TaskCustomFieldType)) {
    return { error: "Choose a supported field type." };
  }

  const fieldType = input.fieldType as TaskCustomFieldType;
  const options = fieldType === "select" ? normalizeTaskCustomFieldOptions(input.options ?? []) : [];

  if (fieldType === "select" && options.length === 0) {
    return { error: "Select fields need at least one option." };
  }

  return {
    fieldType,
    name,
    options,
  };
}