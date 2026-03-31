import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getDisplayName, getDisplayNameFromEmail } from "@/lib/utils/displayName";
import type { Database, Json } from "@/types/database.types";
import type { UserNotificationPreferences, UserProfile, UserSidebarPreferences } from "@/types";

export const DEFAULT_USER_TIMEZONE = "UTC";

export const DEFAULT_NOTIFICATION_PREFERENCES: UserNotificationPreferences = {
  chatMentions: true,
  taskReminders: true,
};

export const DEFAULT_SIDEBAR_PREFERENCES: UserSidebarPreferences = {
  pinnedWorkspaceIds: [],
  recentWorkspaceIds: [],
  pinnedProjectIdsByWorkspace: {},
  recentProjectIdsByWorkspace: {},
  hasSeenCompactRailOnboarding: false,
};

type TypedSupabaseClient = SupabaseClient<Database>;

type EnsureUserProfileInput = {
  userId: string;
  email: string | null;
  displayName?: string | null;
};

function getDisplayNameFromUserMetadata(user: Pick<User, "user_metadata">): string | null {
  const metadata = user.user_metadata;

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const displayName = metadata.display_name;

  return typeof displayName === "string" ? displayName : null;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isStringArray);
}

export function normalizeNotificationPreferences(
  value: Json | null | undefined,
): UserNotificationPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  return {
    chatMentions: isBoolean(value.chatMentions)
      ? value.chatMentions
      : DEFAULT_NOTIFICATION_PREFERENCES.chatMentions,
    taskReminders: isBoolean(value.taskReminders)
      ? value.taskReminders
      : DEFAULT_NOTIFICATION_PREFERENCES.taskReminders,
  };
}

export function normalizeSidebarPreferences(
  value: Json | null | undefined,
): UserSidebarPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_SIDEBAR_PREFERENCES;
  }

  return {
    pinnedWorkspaceIds: isStringArray(value.pinnedWorkspaceIds)
      ? value.pinnedWorkspaceIds
      : DEFAULT_SIDEBAR_PREFERENCES.pinnedWorkspaceIds,
    recentWorkspaceIds: isStringArray(value.recentWorkspaceIds)
      ? value.recentWorkspaceIds
      : DEFAULT_SIDEBAR_PREFERENCES.recentWorkspaceIds,
    pinnedProjectIdsByWorkspace: isStringArrayRecord(value.pinnedProjectIdsByWorkspace)
      ? value.pinnedProjectIdsByWorkspace
      : DEFAULT_SIDEBAR_PREFERENCES.pinnedProjectIdsByWorkspace,
    recentProjectIdsByWorkspace: isStringArrayRecord(value.recentProjectIdsByWorkspace)
      ? value.recentProjectIdsByWorkspace
      : DEFAULT_SIDEBAR_PREFERENCES.recentProjectIdsByWorkspace,
    hasSeenCompactRailOnboarding: isBoolean(value.hasSeenCompactRailOnboarding)
      ? value.hasSeenCompactRailOnboarding
      : DEFAULT_SIDEBAR_PREFERENCES.hasSeenCompactRailOnboarding,
  };
}

export function resolveUserDisplayName(
  profile: Pick<UserProfile, "display_name"> | null | undefined,
  email: string | null | undefined,
): string {
  return getDisplayName(profile?.display_name, getDisplayNameFromEmail(email));
}

export async function getUserProfile(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<UserProfile | null> {
  const { data } = await supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle();
  return data ?? null;
}

export async function ensureUserProfile(
  supabase: TypedSupabaseClient,
  input: EnsureUserProfileInput,
): Promise<UserProfile | null> {
  const existingProfile = await getUserProfile(supabase, input.userId);

  if (existingProfile) {
    return existingProfile;
  }

  const { data } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: input.userId,
        display_name: input.displayName?.trim() || getDisplayNameFromEmail(input.email),
        timezone: DEFAULT_USER_TIMEZONE,
        notification_preferences: DEFAULT_NOTIFICATION_PREFERENCES,
        sidebar_preferences: DEFAULT_SIDEBAR_PREFERENCES,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .maybeSingle();

  return data ?? null;
}

export async function getCurrentUserProfileSnapshot(
  supabase: TypedSupabaseClient,
  user: Pick<User, "id" | "email" | "user_metadata">,
): Promise<{
  profile: UserProfile | null;
  displayName: string;
  sidebarPreferences: UserSidebarPreferences;
  timezone: string;
  notificationPreferences: UserNotificationPreferences;
}> {
  const profile = await ensureUserProfile(supabase, {
    userId: user.id,
    email: user.email ?? null,
    displayName: getDisplayNameFromUserMetadata(user),
  });

  return {
    profile,
    displayName: resolveUserDisplayName(profile, user.email ?? null),
    sidebarPreferences: normalizeSidebarPreferences(profile?.sidebar_preferences),
    timezone: profile?.timezone ?? DEFAULT_USER_TIMEZONE,
    notificationPreferences: normalizeNotificationPreferences(profile?.notification_preferences),
  };
}