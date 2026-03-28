"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";

import { insertActivity } from "@/lib/supabase/activity";
import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaceRoute } from "@/lib/workspace";
import type { Database } from "@/types/database.types";

type ActionResult = {
  status: "success" | "error";
  message: string;
  nextPath?: string;
  inviteCode?: string;
};

type WorkspaceRole = Database["public"]["Tables"]["workspace_members"]["Row"]["role"];

type UpdateWorkspaceSettingsInput = {
  workspaceId: string;
  name: string;
};

type RemoveWorkspaceMemberInput = {
  workspaceId: string;
  memberUserId: string;
};

type UpdateWorkspaceMemberRoleInput = {
  workspaceId: string;
  memberUserId: string;
  role: WorkspaceRole;
};

type DeleteWorkspaceInput = {
  workspaceId: string;
  confirmationName: string;
};

function makeInviteCode(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  return Array.from({ length }, () => alphabet[randomInt(0, alphabet.length)]).join("");
}

function revalidateWorkspacePaths(workspaceId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/create-workspace");
  revalidatePath(`/workspace/${workspaceId}`);
  revalidatePath(`/workspace/${workspaceId}/activity`);
  revalidatePath(`/workspace/${workspaceId}/chat`);
  revalidatePath(`/workspace/${workspaceId}/members`);
  revalidatePath(`/workspace/${workspaceId}/settings`);
}

async function getWorkspaceContext(workspaceId: string) {
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

  const [{ data: workspace }, { data: membership }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name, invite_code")
      .eq("id", workspaceId)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!workspace || !membership) {
    return {
      status: "error" as const,
      message: "You do not have access to this workspace.",
    };
  }

  return {
    status: "success" as const,
    supabase,
    user,
    workspace,
    membership,
  };
}

async function getWorkspaceOwnerContext(workspaceId: string) {
  const context = await getWorkspaceContext(workspaceId);

  if (context.status === "error") {
    return context;
  }

  const { membership } = context;

  if (membership.role !== "owner") {
    return {
      status: "error" as const,
      message: "Only workspace owners can perform this action.",
    };
  }

  return context;
}

async function getWorkspaceOwnerCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<number> {
  const { count } = await supabase
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("role", "owner");

  return count ?? 0;
}

export async function updateWorkspaceSettingsAction(
  input: UpdateWorkspaceSettingsInput,
): Promise<ActionResult> {
  const nextName = input.name.trim();

  if (!nextName) {
    return {
      status: "error",
      message: "Workspace name is required.",
    };
  }

  const context = await getWorkspaceOwnerContext(input.workspaceId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user, workspace } = context;

  if (workspace.name === nextName) {
    return {
      status: "success",
      message: "Workspace name is already up to date.",
    };
  }

  const { error } = await supabase
    .from("workspaces")
    .update({ name: nextName })
    .eq("id", input.workspaceId);

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    actorId: user.id,
    action: "workspace.updated",
    metadata: {
      field: "name",
      previousName: workspace.name,
      nextName,
    },
  });

  revalidateWorkspacePaths(input.workspaceId);

  return {
    status: "success",
    message: "Workspace settings updated.",
  };
}

export async function regenerateWorkspaceInviteCodeAction(
  workspaceId: string,
): Promise<ActionResult> {
  const context = await getWorkspaceOwnerContext(workspaceId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user, workspace } = context;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = makeInviteCode();
    const { error } = await supabase
      .from("workspaces")
      .update({ invite_code: inviteCode })
      .eq("id", workspaceId);

    if (error) {
      if (error.code === "23505") {
        continue;
      }

      return {
        status: "error",
        message: error.message,
      };
    }

    await insertActivity(supabase, {
      workspaceId,
      actorId: user.id,
      action: "workspace.invite_code_regenerated",
      metadata: {
        previousInviteCode: workspace.invite_code,
      },
    });

    revalidateWorkspacePaths(workspaceId);

    return {
      status: "success",
      message: "Invite code regenerated.",
      inviteCode,
    };
  }

  return {
    status: "error",
    message: "Could not generate a unique invite code. Try again.",
  };
}

export async function removeWorkspaceMemberAction(
  input: RemoveWorkspaceMemberInput,
): Promise<ActionResult> {
  const context = await getWorkspaceOwnerContext(input.workspaceId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;

  if (input.memberUserId === user.id) {
    return {
      status: "error",
      message: "You cannot remove yourself from the workspace.",
    };
  }

  const { data: targetMembership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.memberUserId)
    .maybeSingle();

  if (membershipError) {
    return {
      status: "error",
      message: membershipError.message,
    };
  }

  if (!targetMembership) {
    return {
      status: "error",
      message: "Member not found.",
    };
  }

  if (targetMembership.role === "owner") {
    return {
      status: "error",
      message: "Owners must be demoted before they can be removed.",
    };
  }

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.memberUserId);

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    actorId: user.id,
    action: "member.removed",
    metadata: {
      userId: input.memberUserId,
    },
  });

  revalidateWorkspacePaths(input.workspaceId);

  return {
    status: "success",
    message: "Member removed from the workspace.",
  };
}

export async function updateWorkspaceMemberRoleAction(
  input: UpdateWorkspaceMemberRoleInput,
): Promise<ActionResult> {
  if (input.role !== "owner" && input.role !== "member") {
    return {
      status: "error",
      message: "Unsupported workspace role.",
    };
  }

  const context = await getWorkspaceOwnerContext(input.workspaceId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;
  const { data: targetMembership, error: targetMembershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.memberUserId)
    .maybeSingle();

  if (targetMembershipError) {
    return {
      status: "error",
      message: targetMembershipError.message,
    };
  }

  if (!targetMembership) {
    return {
      status: "error",
      message: "Member not found.",
    };
  }

  if (targetMembership.role === input.role) {
    return {
      status: "success",
      message: input.role === "owner" ? "Member already has owner access." : "Member role is already up to date.",
    };
  }

  if (targetMembership.role === "owner" && input.role === "member") {
    const ownerCount = await getWorkspaceOwnerCount(supabase, input.workspaceId);

    if (ownerCount <= 1) {
      return {
        status: "error",
        message: "This workspace must always have at least one owner.",
      };
    }
  }

  const { error } = await supabase
    .from("workspace_members")
    .update({ role: input.role })
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.memberUserId);

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    actorId: user.id,
    action: "member.role_changed",
    metadata: {
      userId: input.memberUserId,
      previousRole: targetMembership.role,
      nextRole: input.role,
    },
  });

  revalidateWorkspacePaths(input.workspaceId);

  return {
    status: "success",
    message: input.role === "owner" ? "Owner access granted." : "Member role updated.",
  };
}

export async function leaveWorkspaceAction(workspaceId: string): Promise<ActionResult> {
  const context = await getWorkspaceContext(workspaceId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user, membership } = context;

  if (membership.role === "owner") {
    const ownerCount = await getWorkspaceOwnerCount(supabase, workspaceId);

    if (ownerCount <= 1) {
      return {
        status: "error",
        message: "Promote another owner or delete the workspace before leaving.",
      };
    }
  }

  await insertActivity(supabase, {
    workspaceId,
    actorId: user.id,
    action: "member.left",
    metadata: {
      userId: user.id,
      role: membership.role,
    },
  });

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  const destination = await getUserWorkspaceRoute(supabase, user.id);
  revalidateWorkspacePaths(workspaceId);

  return {
    status: "success",
    message: "You left the workspace.",
    nextPath: destination.path,
  };
}

export async function deleteWorkspaceAction(
  input: DeleteWorkspaceInput,
): Promise<ActionResult> {
  const confirmationName = input.confirmationName.trim();
  const context = await getWorkspaceOwnerContext(input.workspaceId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user, workspace } = context;

  if (!confirmationName || confirmationName !== workspace.name) {
    return {
      status: "error",
      message: "Enter the current workspace name to confirm deletion.",
    };
  }

  const { error } = await supabase.from("workspaces").delete().eq("id", input.workspaceId);

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  const destination = await getUserWorkspaceRoute(supabase, user.id);
  revalidateWorkspacePaths(input.workspaceId);

  return {
    status: "success",
    message: "Workspace deleted.",
    nextPath: destination.path,
  };
}