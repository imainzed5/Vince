import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getDisplayName, getDisplayNameFromEmail } from "@/lib/utils/displayName";
import type { Database, Json } from "@/types/database.types";
import type { UserNotificationPreferences, UserProfile } from "@/types";

export const DEFAULT_USER_TIMEZONE = "UTC";

export const DEFAULT_NOTIFICATION_PREFERENCES: UserNotificationPreferences = {
  chatMentions: true,
  taskReminders: true,
};

type TypedSupabaseClient = SupabaseClient<Database>;

type EnsureUserProfileInput = {
  userId: string;
  email: string | null;
  displayName?: string | null;
};

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
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
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .maybeSingle();

  return data ?? null;
}

export async function getCurrentUserProfileSnapshot(
  supabase: TypedSupabaseClient,
  user: Pick<User, "id" | "email">,
): Promise<{
  profile: UserProfile | null;
  displayName: string;
  timezone: string;
  notificationPreferences: UserNotificationPreferences;
}> {
  const profile = await ensureUserProfile(supabase, {
    userId: user.id,
    email: user.email ?? null,
  });

  return {
    profile,
    displayName: resolveUserDisplayName(profile, user.email ?? null),
    timezone: profile?.timezone ?? DEFAULT_USER_TIMEZONE,
    notificationPreferences: normalizeNotificationPreferences(profile?.notification_preferences),
  };
}