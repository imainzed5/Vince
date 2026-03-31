"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/supabase/user-profiles";
import { getUserWorkspaceRoute } from "@/lib/workspace";

function encodeMessage(message: string) {
  return encodeURIComponent(message);
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return redirect(`/login?error=${encodeMessage(error?.message ?? "Unable to sign in.")}`);
  }

  const destination = await getUserWorkspaceRoute(supabase, data.user.id);
  return redirect(destination.path);
}

export async function signupAction(formData: FormData) {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!displayName) {
    return redirect(`/signup?error=${encodeMessage("Display name is required.")}`);
  }

  if (displayName.length > 60) {
    return redirect(`/signup?error=${encodeMessage("Display name must be 60 characters or fewer.")}`);
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
      },
      emailRedirectTo: origin ? `${origin}/` : undefined,
    },
  });

  if (error) {
    return redirect(`/signup?error=${encodeMessage(error.message)}`);
  }

  if (!data.session || !data.user) {
    return redirect(
      `/login?message=${encodeMessage("Account created. Check your email to confirm your account.")}`,
    );
  }

  await ensureUserProfile(supabase, {
    userId: data.user.id,
    email: data.user.email ?? null,
    displayName,
  });

  const destination = await getUserWorkspaceRoute(supabase, data.user.id);
  return redirect(destination.path);
}

export async function forgotPasswordAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return redirect(`/forgot-password?error=${encodeMessage("Email is required.")}`);
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: origin ? `${origin}/reset-password` : undefined,
  });

  if (error) {
    return redirect(`/forgot-password?error=${encodeMessage(error.message)}`);
  }

  return redirect(
    `/forgot-password?message=${encodeMessage("Password reset sent. Check your email for the recovery link.")}`,
  );
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/login");
}
