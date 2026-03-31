import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type RealtimeRow = Record<string, unknown>;

type RealtimePayloadLike = Pick<
  RealtimePostgresChangesPayload<RealtimeRow>,
  "eventType" | "new" | "old"
>;

function isRealtimeRow(value: unknown, requiredKeys: readonly string[]): value is RealtimeRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  return requiredKeys.every((key) => key in value);
}

function warnInvalidPayload(
  context: string,
  payload: RealtimePayloadLike,
  source: "old" | "new",
  requiredKeys: readonly string[],
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.warn(`[realtime] Ignoring invalid payload in ${context}.`, {
    eventType: payload.eventType,
    source,
    requiredKeys,
  });
}

export function getRealtimeOldRow<T extends RealtimeRow>(
  payload: RealtimePayloadLike,
  context: string,
  requiredKeys: readonly string[],
): T | null {
  if (!isRealtimeRow(payload.old, requiredKeys)) {
    warnInvalidPayload(context, payload, "old", requiredKeys);
    return null;
  }

  return payload.old as T;
}

export function getRealtimeNewRow<T extends RealtimeRow>(
  payload: RealtimePayloadLike,
  context: string,
  requiredKeys: readonly string[],
): T | null {
  if (!isRealtimeRow(payload.new, requiredKeys)) {
    warnInvalidPayload(context, payload, "new", requiredKeys);
    return null;
  }

  return payload.new as T;
}

export function getRealtimeChangedRow<T extends RealtimeRow>(
  payload: RealtimePayloadLike,
  context: string,
  requiredKeys: readonly string[],
): T | null {
  return payload.eventType === "DELETE"
    ? getRealtimeOldRow<T>(payload, context, requiredKeys)
    : getRealtimeNewRow<T>(payload, context, requiredKeys);
}