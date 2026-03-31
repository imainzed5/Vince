"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/supabase/user-profiles";
import type { UserNotificationPreferences } from "@/types";

type ActionResult = {
  status: "success" | "error";
  message: string;
};

type UpdateUserProfileInput = {
  displayName: string;
  notificationPreferences: UserNotificationPreferences;
  timezone: string;
};

type ChangePasswordInput = {
  password: string;
  confirmPassword: string;
};

async function getCurrentUserContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error" as const,
      message: "Your session has expired. Please sign in again.",
    };
  }

  return {
    status: "success" as const,
    supabase,
    user,
  };
}

function isValidPreferenceSet(value: UserNotificationPreferences): boolean {
  return typeof value.chatMentions === "boolean" && typeof value.taskReminders === "boolean";
}

export async function updateUserProfileAction(
  input: UpdateUserProfileInput,
): Promise<ActionResult> {
  const context = await getCurrentUserContext();

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;
  const displayName = input.displayName.trim();
  const timezone = input.timezone.trim();

  if (!displayName) {
    return {
      status: "error",
      message: "Display name is required.",
    };
  }

  if (displayName.length > 60) {
    return {
      status: "error",
      message: "Display name must be 60 characters or fewer.",
    };
  }

  if (!timezone || timezone.length > 64) {
    return {
      status: "error",
      message: "Choose a valid timezone.",
    };
  }

  if (!isValidPreferenceSet(input.notificationPreferences)) {
    return {
      status: "error",
      message: "Notification preferences were invalid.",
    };
  }

  await ensureUserProfile(supabase, {
    userId: user.id,
    email: user.email ?? null,
  });

  const { error } = await supabase
    .from("user_profiles")
    .update({
      display_name: displayName,
      notification_preferences: input.notificationPreferences,
      timezone,
    })
    .eq("user_id", user.id);

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");

  return {
    status: "success",
    message: "Account settings updated.",
  };
}

export async function changePasswordAction(
  input: ChangePasswordInput,
): Promise<ActionResult> {
  const context = await getCurrentUserContext();

  if (context.status === "error") {
    return context;
  }

  const password = input.password.trim();
  const confirmPassword = input.confirmPassword.trim();

  if (password.length < 8) {
    return {
      status: "error",
      message: "Password must be at least 8 characters.",
    };
  }

  if (password !== confirmPassword) {
    return {
      status: "error",
      message: "Passwords do not match.",
    };
  }

  const { error } = await context.supabase.auth.updateUser({
    password,
  });

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  return {
    status: "success",
    message: "Password updated.",
  };
}