"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function errorRedirect(message: string) {
  return redirect(`/create-workspace?error=${encodeURIComponent(message)}`);
}

function formatDbError(prefix: string, error: {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}) {
  const parts = [prefix, error.message];

  if (error.code) {
    parts.push(`code=${error.code}`);
  }

  if (error.details) {
    parts.push(`details=${error.details}`);
  }

  if (error.hint) {
    parts.push(`hint=${error.hint}`);
  }

  return parts.join(" | ");
}

function getRpcErrorMessage(error: {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}) {
  if (error.code === "P0001") {
    return error.message;
  }

  return null;
}

function revalidateWorkspaceSelection(workspaceId: string) {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/create-workspace");
  revalidatePath(`/workspace/${workspaceId}`);
}

export async function createWorkspaceAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return errorRedirect("Workspace name is required.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login?error=Session%20expired.%20Please%20sign%20in%20again.");
  }

  const { data: workspace, error } = await supabase
    .rpc("create_workspace_with_owner", { p_name: name })
    .single();

  if (error || !workspace) {
    const rpcMessage = error ? getRpcErrorMessage(error) : null;

    return errorRedirect(
      rpcMessage
        ? rpcMessage
        : error
          ? formatDbError("Could not create workspace.", error)
        : "Could not create workspace.",
    );
  }

  revalidateWorkspaceSelection(workspace.workspace_id);

  return redirect(`/workspace/${workspace.workspace_id}?created=1`);
}

export async function joinWorkspaceAction(formData: FormData) {
  const inviteCode = String(formData.get("inviteCode") ?? "")
    .trim()
    .toUpperCase();

  if (!inviteCode) {
    return errorRedirect("Invite code is required.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login?error=Session%20expired.%20Please%20sign%20in%20again.");
  }

  const { data: membershipResult, error } = await supabase
    .rpc("join_workspace_with_invite_code", { p_invite_code: inviteCode })
    .single();

  if (error || !membershipResult) {
    const rpcMessage = error ? getRpcErrorMessage(error) : null;

    return errorRedirect(
      rpcMessage
        ? rpcMessage
        : error
          ? formatDbError("Could not join workspace.", error)
          : "Could not join workspace.",
    );
  }

  revalidateWorkspaceSelection(membershipResult.workspace_id);

  const searchParam = membershipResult.already_member ? "alreadyJoined=1" : "joined=1";

  return redirect(`/workspace/${membershipResult.workspace_id}?${searchParam}`);
}
