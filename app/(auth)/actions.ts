"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
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
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
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

  const destination = await getUserWorkspaceRoute(supabase, data.user.id);
  return redirect(destination.path);
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/login");
}
