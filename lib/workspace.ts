import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

type WorkspaceSummary = Pick<
  Database["public"]["Tables"]["workspaces"]["Row"],
  "id" | "name"
>;

type ProjectSummary = Pick<
  Database["public"]["Tables"]["projects"]["Row"],
  "id" | "name" | "workspace_id"
>;

type UserWorkspaceMembership = Pick<
  Database["public"]["Tables"]["workspace_members"]["Row"],
  "workspace_id"
>;

export type UserWorkspaceRoute =
  | { kind: "none"; path: "/create-workspace" }
  | { kind: "single"; path: `/workspace/${string}`; workspaceId: string }
  | { kind: "multiple"; path: "/dashboard"; workspaceIds: string[] };

export async function getUserWorkspaceIds(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true });

  if (error) {
    return [];
  }

  return (data as UserWorkspaceMembership[] | null)?.map((membership) => membership.workspace_id) ?? [];
}

export async function getUserWorkspaceId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const workspaceIds = await getUserWorkspaceIds(supabase, userId);

  if (!workspaceIds.length) {
    return null;
  }

  return workspaceIds[0] ?? null;
}

export async function getUserWorkspaceRoute(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UserWorkspaceRoute> {
  const workspaceIds = await getUserWorkspaceIds(supabase, userId);

  if (!workspaceIds.length) {
    return { kind: "none", path: "/create-workspace" };
  }

  if (workspaceIds.length === 1) {
    return {
      kind: "single",
      path: `/workspace/${workspaceIds[0]}`,
      workspaceId: workspaceIds[0],
    };
  }

  return {
    kind: "multiple",
    path: "/dashboard",
    workspaceIds,
  };
}

export async function getAccessibleWorkspace(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<WorkspaceSummary | null> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

export async function getProjectInWorkspace(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  projectId: string,
): Promise<ProjectSummary | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, workspace_id")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}
