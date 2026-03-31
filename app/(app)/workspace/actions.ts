"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";

import { insertActivity } from "@/lib/supabase/activity";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_TASK_CUSTOM_FIELDS,
  validateTaskCustomFieldDefinitionInput,
  type TaskCustomFieldDefinition,
} from "@/lib/task-custom-fields";
import {
  MAX_WORKSPACE_TASK_STATUSES,
  validateWorkspaceTaskStatusInput,
  type WorkspaceTaskStatusDefinition,
} from "@/lib/task-statuses";
import { getUserWorkspaceRoute } from "@/lib/workspace";
import type { Database } from "@/types/database.types";

type ActionResult = {
  status: "success" | "error";
  fieldId?: string;
  taskField?: TaskCustomFieldDefinition;
  message: string;
  nextPath?: string;
  inviteCode?: string;
  statusId?: string;
  taskStatus?: WorkspaceTaskStatusDefinition;
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

type CreateWorkspaceTaskFieldInput = {
  workspaceId: string;
  name: string;
  fieldType: string;
  options?: string[];
};

type DeleteWorkspaceTaskFieldInput = {
  workspaceId: string;
  fieldId: string;
};

type CreateWorkspaceTaskStatusInput = {
  workspaceId: string;
  label: string;
  color: string;
  kind: string;
};

type UpdateWorkspaceTaskStatusInput = {
  workspaceId: string;
  statusId: string;
  label: string;
  color: string;
};

type DeleteWorkspaceTaskStatusInput = {
  workspaceId: string;
  statusId: string;
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

export async function createWorkspaceTaskFieldAction(
  input: CreateWorkspaceTaskFieldInput,
): Promise<ActionResult> {
  const parsedInput = validateTaskCustomFieldDefinitionInput(input);

  if ("error" in parsedInput) {
    return {
      status: "error",
      message: parsedInput.error,
    };
  }

  const context = await getWorkspaceOwnerContext(input.workspaceId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;
  const { count } = await supabase
    .from("workspace_task_fields")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", input.workspaceId);

  if ((count ?? 0) >= MAX_TASK_CUSTOM_FIELDS) {
    return {
      status: "error",
      message: `Workspaces can have up to ${MAX_TASK_CUSTOM_FIELDS} custom task fields.`,
    };
  }

  const { data: existingFields, error: existingFieldsError } = await supabase
    .from("workspace_task_fields")
    .select("name")
    .eq("workspace_id", input.workspaceId);

  if (existingFieldsError) {
    return {
      status: "error",
      message: existingFieldsError.message,
    };
  }

  const hasDuplicateName = (existingFields ?? []).some(
    (field) => field.name.trim().toLowerCase() === parsedInput.name.toLowerCase(),
  );

  if (hasDuplicateName) {
    return {
      status: "error",
      message: "A field with that name already exists.",
    };
  }

  const { data: taskField, error } = await supabase
    .from("workspace_task_fields")
    .insert({
      workspace_id: input.workspaceId,
      created_by: user.id,
      name: parsedInput.name,
      field_type: parsedInput.fieldType,
      options: parsedInput.options,
      position: count ?? 0,
    })
    .select("*")
    .single();

  if (error || !taskField) {
    return {
      status: "error",
      message: error?.message ?? "Could not create custom field.",
    };
  }

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    actorId: user.id,
    action: "workspace.task_field_created",
    metadata: {
      fieldId: taskField.id,
      fieldName: taskField.name,
      fieldType: taskField.field_type,
    },
  });

  revalidateWorkspacePaths(input.workspaceId);

  return {
    status: "success",
    message: "Custom task field added.",
    taskField: taskField as TaskCustomFieldDefinition,
  };
}

export async function createWorkspaceTaskStatusAction(
  input: CreateWorkspaceTaskStatusInput,
): Promise<ActionResult> {
  const parsedInput = validateWorkspaceTaskStatusInput(input);

  if ("error" in parsedInput) {
    return {
      status: "error",
      message: parsedInput.error,
    };
  }

  const context = await getWorkspaceOwnerContext(input.workspaceId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;
  const { data: existingStatuses, count, error: existingStatusesError } = await supabase
    .from("workspace_task_statuses")
    .select("id, key, label", { count: "exact" })
    .eq("workspace_id", input.workspaceId)
    .order("position", { ascending: true });

  if (existingStatusesError) {
    return {
      status: "error",
      message: existingStatusesError.message,
    };
  }

  if ((count ?? 0) >= MAX_WORKSPACE_TASK_STATUSES) {
    return {
      status: "error",
      message: `Workspaces can have up to ${MAX_WORKSPACE_TASK_STATUSES} task statuses.`,
    };
  }

  const hasDuplicate = (existingStatuses ?? []).some(
    (status) => status.key === parsedInput.key || status.label.trim().toLowerCase() === parsedInput.label.toLowerCase(),
  );

  if (hasDuplicate) {
    return {
      status: "error",
      message: "A status with that name already exists.",
    };
  }

  const { data: taskStatus, error } = await supabase
    .from("workspace_task_statuses")
    .insert({
      workspace_id: input.workspaceId,
      created_by: user.id,
      key: parsedInput.key,
      label: parsedInput.label,
      color: parsedInput.color,
      kind: parsedInput.kind,
      position: count ?? 0,
      is_default: false,
    })
    .select("*")
    .single();

  if (error || !taskStatus) {
    return {
      status: "error",
      message: error?.message ?? "Could not create task status.",
    };
  }

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    actorId: user.id,
    action: "workspace.task_status_created",
    metadata: {
      statusId: taskStatus.id,
      statusKey: taskStatus.key,
      statusLabel: taskStatus.label,
      statusKind: taskStatus.kind,
    },
  });

  revalidateWorkspacePaths(input.workspaceId);

  return {
    status: "success",
    message: "Task status added.",
    taskStatus: taskStatus as WorkspaceTaskStatusDefinition,
  };
}

export async function updateWorkspaceTaskStatusAction(
  input: UpdateWorkspaceTaskStatusInput,
): Promise<ActionResult> {
  const parsedInput = validateWorkspaceTaskStatusInput({
    label: input.label,
    color: input.color,
    kind: "open",
  });

  if ("error" in parsedInput) {
    return {
      status: "error",
      message: parsedInput.error,
    };
  }

  const context = await getWorkspaceOwnerContext(input.workspaceId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;
  const { data: taskStatus, error: fetchError } = await supabase
    .from("workspace_task_statuses")
    .select("*")
    .eq("id", input.statusId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();

  if (fetchError) {
    return {
      status: "error",
      message: fetchError.message,
    };
  }

  if (!taskStatus) {
    return {
      status: "error",
      message: "Task status not found.",
    };
  }

  const { data: duplicateStatus } = await supabase
    .from("workspace_task_statuses")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .ilike("label", parsedInput.label)
    .neq("id", input.statusId)
    .maybeSingle();

  if (duplicateStatus) {
    return {
      status: "error",
      message: "A status with that name already exists.",
    };
  }

  if (taskStatus.label === parsedInput.label && taskStatus.color === parsedInput.color) {
    return {
      status: "success",
      message: "Task status is already up to date.",
      taskStatus: taskStatus as WorkspaceTaskStatusDefinition,
    };
  }

  const { data: updatedTaskStatus, error } = await supabase
    .from("workspace_task_statuses")
    .update({
      label: parsedInput.label,
      color: parsedInput.color,
    })
    .eq("id", input.statusId)
    .eq("workspace_id", input.workspaceId)
    .select("*")
    .single();

  if (error || !updatedTaskStatus) {
    return {
      status: "error",
      message: error?.message ?? "Could not update task status.",
    };
  }

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    actorId: user.id,
    action: "workspace.task_status_updated",
    metadata: {
      statusId: updatedTaskStatus.id,
      statusKey: updatedTaskStatus.key,
      previousLabel: taskStatus.label,
      nextLabel: updatedTaskStatus.label,
      previousColor: taskStatus.color,
      nextColor: updatedTaskStatus.color,
    },
  });

  revalidateWorkspacePaths(input.workspaceId);

  return {
    status: "success",
    message: "Task status updated.",
    taskStatus: updatedTaskStatus as WorkspaceTaskStatusDefinition,
  };
}

export async function deleteWorkspaceTaskStatusAction(
  input: DeleteWorkspaceTaskStatusInput,
): Promise<ActionResult> {
  const context = await getWorkspaceOwnerContext(input.workspaceId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;
  const { data: taskStatus, error: fetchError } = await supabase
    .from("workspace_task_statuses")
    .select("*")
    .eq("id", input.statusId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();

  if (fetchError) {
    return {
      status: "error",
      message: fetchError.message,
    };
  }

  if (!taskStatus) {
    return {
      status: "error",
      message: "Task status not found.",
    };
  }

  const { data: workspaceProjects, error: projectsError } = await supabase
    .from("projects")
    .select("id")
    .eq("workspace_id", input.workspaceId);

  if (projectsError) {
    return {
      status: "error",
      message: projectsError.message,
    };
  }

  const projectIds = (workspaceProjects ?? []).map((project) => project.id);
  const { count: taskCount } = projectIds.length
    ? await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .in("project_id", projectIds)
        .eq("status", taskStatus.key)
    : { count: 0 };

  if ((taskCount ?? 0) > 0) {
    return {
      status: "error",
      message: "Move tasks out of this status before deleting it.",
    };
  }

  const { error } = await supabase
    .from("workspace_task_statuses")
    .delete()
    .eq("id", input.statusId)
    .eq("workspace_id", input.workspaceId);

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  const { data: remainingStatuses } = await supabase
    .from("workspace_task_statuses")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .order("position", { ascending: true });

  await Promise.all(
    (remainingStatuses ?? []).map((status, index) =>
      supabase.from("workspace_task_statuses").update({ position: index }).eq("id", status.id),
    ),
  );

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    actorId: user.id,
    action: "workspace.task_status_deleted",
    metadata: {
      statusId: taskStatus.id,
      statusKey: taskStatus.key,
      statusLabel: taskStatus.label,
      statusKind: taskStatus.kind,
    },
  });

  revalidateWorkspacePaths(input.workspaceId);

  return {
    status: "success",
    message: "Task status removed.",
    statusId: input.statusId,
  };
}

export async function deleteWorkspaceTaskFieldAction(
  input: DeleteWorkspaceTaskFieldInput,
): Promise<ActionResult> {
  const context = await getWorkspaceOwnerContext(input.workspaceId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;
  const { data: taskField, error: fetchError } = await supabase
    .from("workspace_task_fields")
    .select("*")
    .eq("id", input.fieldId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();

  if (fetchError) {
    return {
      status: "error",
      message: fetchError.message,
    };
  }

  if (!taskField) {
    return {
      status: "error",
      message: "Custom field not found.",
    };
  }

  const { error } = await supabase
    .from("workspace_task_fields")
    .delete()
    .eq("id", input.fieldId)
    .eq("workspace_id", input.workspaceId);

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  const { data: remainingFields } = await supabase
    .from("workspace_task_fields")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .order("position", { ascending: true });

  await Promise.all(
    (remainingFields ?? []).map((field, index) =>
      supabase.from("workspace_task_fields").update({ position: index }).eq("id", field.id),
    ),
  );

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    actorId: user.id,
    action: "workspace.task_field_deleted",
    metadata: {
      fieldId: taskField.id,
      fieldName: taskField.name,
      fieldType: taskField.field_type,
    },
  });

  revalidateWorkspacePaths(input.workspaceId);

  return {
    status: "success",
    message: "Custom task field removed.",
    fieldId: input.fieldId,
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