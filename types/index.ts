import type { Database } from "@/types/database.types";

export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];
export type WorkspaceMember = Database["public"]["Tables"]["workspace_members"]["Row"];
export type WorkspaceRole = WorkspaceMember["role"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectShare = Database["public"]["Tables"]["project_shares"]["Row"];
export type ProjectStatusUpdate = Database["public"]["Tables"]["project_status_updates"]["Row"];
export type ProjectTemplate = Database["public"]["Tables"]["project_templates"]["Row"];
export type SavedView = Database["public"]["Tables"]["saved_views"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];
export type TaskCustomFieldDefinition = Database["public"]["Tables"]["workspace_task_fields"]["Row"];
export type TaskCustomFieldType = TaskCustomFieldDefinition["field_type"];
export type WorkspaceTaskStatusDefinition = Database["public"]["Tables"]["workspace_task_statuses"]["Row"];
export type TaskDependency = Database["public"]["Tables"]["task_dependencies"]["Row"];

export type TaskStatus = Task["status"];
export type TaskPriority = Task["priority"];

export type UserNotificationPreferences = {
	chatMentions: boolean;
	taskReminders: boolean;
};

export type UserSidebarPreferences = {
	pinnedWorkspaceIds: string[];
	recentWorkspaceIds: string[];
	pinnedProjectIdsByWorkspace: Record<string, string[]>;
	recentProjectIdsByWorkspace: Record<string, string[]>;
	hasSeenCompactRailOnboarding: boolean;
};
