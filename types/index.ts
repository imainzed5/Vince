import type { Database } from "@/types/database.types";

export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];
export type WorkspaceMember = Database["public"]["Tables"]["workspace_members"]["Row"];
export type WorkspaceRole = WorkspaceMember["role"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];

export type TaskStatus = Task["status"];
export type TaskPriority = Task["priority"];
