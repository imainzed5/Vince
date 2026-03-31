import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { isDoneTaskStatus } from "@/lib/task-statuses";
import type { Database, Json } from "@/types/database.types";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function startOfDay(reference: Date) {
  return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (cronSecret && authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const today = startOfDay(new Date());
  const blockedThreshold = new Date(today.getTime() - 2 * 86_400_000);

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .not("assignee_id", "is", null);

  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 500 });
  }

  const taskRows = (tasks ?? []) as TaskRow[];
  const projectIds = Array.from(new Set(taskRows.map((task) => task.project_id)));
  const { data: projects, error: projectsError } = projectIds.length
    ? await supabase.from("projects").select("id, workspace_id").in("id", projectIds)
    : { data: [] as Pick<ProjectRow, "id" | "workspace_id">[], error: null };

  if (projectsError) {
    return NextResponse.json({ error: projectsError.message }, { status: 500 });
  }

  const workspaceByProjectId = Object.fromEntries((projects ?? []).map((project) => [project.id, project.workspace_id]));
  const workspaceIds = Array.from(new Set((projects ?? []).map((project) => project.workspace_id)));
  const { data: taskStatuses, error: taskStatusesError } = workspaceIds.length
    ? await supabase
        .from("workspace_task_statuses")
        .select("*")
        .in("workspace_id", workspaceIds)
        .order("position", { ascending: true })
    : { data: [], error: null };

  if (taskStatusesError) {
    return NextResponse.json({ error: taskStatusesError.message }, { status: 500 });
  }

  const taskStatusesByWorkspace = ((taskStatuses ?? []) as Database["public"]["Tables"]["workspace_task_statuses"]["Row"][]).reduce<
    Record<string, Database["public"]["Tables"]["workspace_task_statuses"]["Row"][]>
  >((accumulator, status) => {
    accumulator[status.workspace_id] ??= [];
    accumulator[status.workspace_id].push(status);
    return accumulator;
  }, {});
  const notificationsToInsert: Database["public"]["Tables"]["notifications"]["Insert"][] = [];
  const reminderKeys = new Set<string>();

  for (const task of taskRows) {
    if (!task.assignee_id) {
      continue;
    }

    const workspaceId = workspaceByProjectId[task.project_id];

    if (!workspaceId) {
      continue;
    }

    if (isDoneTaskStatus(task.status, taskStatusesByWorkspace[workspaceId] ?? [])) {
      continue;
    }

    let type: string | null = null;
    let title = "";
    let body = "";
    let reminderKey = "";

    if (task.due_date) {
      const dueDate = startOfDay(new Date(task.due_date));
      const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);

      if (diffDays < 0) {
        type = "task.overdue";
        title = `${task.identifier} is overdue`;
        body = task.title;
        reminderKey = `task.overdue:${task.id}:${today.toISOString().slice(0, 10)}`;
      } else if (diffDays <= 3) {
        type = "task.due_soon";
        title = `${task.identifier} is due soon`;
        body = task.title;
        reminderKey = `task.due_soon:${task.id}:${task.due_date}`;
      }
    }

    if (!type && task.is_blocked && task.updated_at && new Date(task.updated_at) < blockedThreshold) {
      type = "task.blocked_stale";
      title = `${task.identifier} is still blocked`;
      body = task.title;
      reminderKey = `task.blocked_stale:${task.id}:${today.toISOString().slice(0, 10)}`;
    }

    if (!type || reminderKeys.has(reminderKey)) {
      continue;
    }

    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", task.assignee_id)
      .eq("type", type)
      .contains("metadata", { reminderKey } as Record<string, unknown>);

    if ((count ?? 0) > 0) {
      continue;
    }

    reminderKeys.add(reminderKey);
    notificationsToInsert.push({
      actor_id: null,
      body,
      metadata: {
        reminderKey,
        taskId: task.id,
        identifier: task.identifier,
      } as Json,
      project_id: task.project_id,
      title,
      type,
      user_id: task.assignee_id,
      workspace_id: workspaceId,
    });
  }

  if (notificationsToInsert.length) {
    const { error } = await supabase.from("notifications").insert(notificationsToInsert);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ inserted: notificationsToInsert.length });
}