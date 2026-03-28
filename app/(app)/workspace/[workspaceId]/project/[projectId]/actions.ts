"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { insertActivity } from "@/lib/supabase/activity";
import { isValidProjectPrefix, normalizeProjectPrefix } from "@/lib/project-prefix";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type MilestoneRow = Database["public"]["Tables"]["milestones"]["Row"];
type StandupRow = Database["public"]["Tables"]["standups"]["Row"];
type ProjectPhase = ProjectRow["phase"];
type ProjectStatus = ProjectRow["status"];

type ProjectActionResult = {
  status: "success" | "error";
  message: string;
  nextPath?: string;
  prefix?: string;
  project?: ProjectRow;
  milestone?: MilestoneRow;
  milestoneId?: string;
  standup?: StandupRow;
};

type UpdateProjectPrefixInput = {
  workspaceId: string;
  projectId: string;
  prefix: string;
};

type UpdateProjectDetailsInput = {
  workspaceId: string;
  projectId: string;
  name: string;
  description: string;
};

type UpdateProjectPhaseInput = {
  workspaceId: string;
  projectId: string;
  phase: ProjectPhase;
};

type UpdateProjectStatusInput = {
  workspaceId: string;
  projectId: string;
  status: ProjectStatus;
};

type DeleteProjectInput = {
  workspaceId: string;
  projectId: string;
  confirmationName: string;
};

type AddMilestoneInput = {
  workspaceId: string;
  projectId: string;
  name: string;
  dueDate: string;
};

type DeleteMilestoneInput = {
  workspaceId: string;
  projectId: string;
  milestoneId: string;
};

type AddStandupInput = {
  workspaceId: string;
  projectId: string;
  done: string;
  next: string;
  blockers: string;
};

const VALID_PROJECT_PHASES = new Set<ProjectPhase>(["planning", "in_progress", "in_review", "done"]);
const VALID_PROJECT_STATUSES = new Set<ProjectStatus>(["active", "archived"]);

function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function revalidateProjectPaths(workspaceId: string, projectId: string) {
  revalidatePath("/dashboard");
  revalidatePath(`/workspace/${workspaceId}`);
  revalidatePath(`/workspace/${workspaceId}/activity`);
  revalidatePath(`/workspace/${workspaceId}/project/${projectId}`);
  revalidatePath(`/workspace/${workspaceId}/project/${projectId}/board`);
  revalidatePath(`/workspace/${workspaceId}/project/${projectId}/overview`);
  revalidatePath(`/workspace/${workspaceId}/project/${projectId}/notes`);
  revalidatePath(`/workspace/${workspaceId}/project/${projectId}/chat`);
  revalidatePath(`/workspace/${workspaceId}/project/${projectId}/activity`);
}

async function getProjectContext(workspaceId: string, projectId: string) {
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

  const [{ data: membership }, { data: project }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  if (!membership || !project) {
    return {
      status: "error" as const,
      message: "Project was not found or you do not have access to it.",
    };
  }

  return {
    status: "success" as const,
    supabase,
    user,
    membership,
    project: project as ProjectRow,
  };
}

async function getProjectOwnerContext(workspaceId: string, projectId: string) {
  const context = await getProjectContext(workspaceId, projectId);

  if (context.status === "error") {
    return context;
  }

  if (context.membership.role !== "owner") {
    return {
      status: "error" as const,
      message: "Only workspace owners can manage project settings.",
    };
  }

  return context;
}

export async function updateProjectPrefixAction(
  input: UpdateProjectPrefixInput,
): Promise<ProjectActionResult> {
  const normalizedPrefix = normalizeProjectPrefix(input.prefix);

  if (!isValidProjectPrefix(normalizedPrefix)) {
    return {
      status: "error",
      message: "Project prefixes must be 2 to 6 uppercase letters or numbers.",
    };
  }

  const context = await getProjectOwnerContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  const { user, project } = context;

  if (project.prefix === normalizedPrefix) {
    return {
      status: "success",
      message: "Project prefix is already up to date.",
      prefix: normalizedPrefix,
    };
  }

  const adminClient = createServiceRoleClient();
  const { error } = await adminClient
    .from("projects")
    .update({ prefix: normalizedPrefix })
    .eq("id", input.projectId)
    .eq("workspace_id", input.workspaceId);

  if (error) {
    return {
      status: "error",
      message: error.code === "23505" ? "That project prefix is already in use in this workspace." : error.message,
    };
  }

  await insertActivity(adminClient, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: "project.prefix_updated",
    metadata: {
      projectId: input.projectId,
      previousPrefix: project.prefix,
      nextPrefix: normalizedPrefix,
    },
  });

  revalidateProjectPaths(input.workspaceId, input.projectId);

  return {
    status: "success",
    message: "Project prefix updated.",
    prefix: normalizedPrefix,
  };
}

export async function updateProjectDetailsAction(
  input: UpdateProjectDetailsInput,
): Promise<ProjectActionResult> {
  const nextName = input.name.trim();
  const nextDescription = input.description.trim() || null;

  if (!nextName) {
    return {
      status: "error",
      message: "Project name is required.",
    };
  }

  const context = await getProjectOwnerContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  const { user, project } = context;

  if (project.name === nextName && (project.description ?? null) === nextDescription) {
    return {
      status: "success",
      message: "Project details are already up to date.",
      project,
    };
  }

  const adminClient = createServiceRoleClient();
  const { data: updatedProject, error } = await adminClient
    .from("projects")
    .update({
      name: nextName,
      description: nextDescription,
    })
    .eq("id", input.projectId)
    .eq("workspace_id", input.workspaceId)
    .select("*")
    .single();

  if (error || !updatedProject) {
    return {
      status: "error",
      message: error?.message ?? "Could not update project details.",
    };
  }

  const changedFields: string[] = [];

  if (project.name !== updatedProject.name) {
    changedFields.push("name");
  }

  if ((project.description ?? null) !== (updatedProject.description ?? null)) {
    changedFields.push("description");
  }

  await insertActivity(adminClient, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: "project.updated",
    metadata: {
      projectId: input.projectId,
      name: updatedProject.name,
      fields: changedFields,
    },
  });

  revalidateProjectPaths(input.workspaceId, input.projectId);

  return {
    status: "success",
    message: "Project details updated.",
    project: updatedProject as ProjectRow,
  };
}

export async function updateProjectPhaseAction(
  input: UpdateProjectPhaseInput,
): Promise<ProjectActionResult> {
  if (!VALID_PROJECT_PHASES.has(input.phase)) {
    return {
      status: "error",
      message: "Unsupported project phase.",
    };
  }

  const context = await getProjectOwnerContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  const { user, project } = context;

  if (project.phase === input.phase) {
    return {
      status: "success",
      message: "Project phase is already up to date.",
      project,
    };
  }

  const adminClient = createServiceRoleClient();
  const { data: updatedProject, error } = await adminClient
    .from("projects")
    .update({ phase: input.phase })
    .eq("id", input.projectId)
    .eq("workspace_id", input.workspaceId)
    .select("*")
    .single();

  if (error || !updatedProject) {
    return {
      status: "error",
      message: error?.message ?? "Could not update project phase.",
    };
  }

  await insertActivity(adminClient, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: "project.phase_changed",
    metadata: {
      projectId: input.projectId,
      from: project.phase,
      to: updatedProject.phase,
    },
  });

  revalidateProjectPaths(input.workspaceId, input.projectId);

  return {
    status: "success",
    message: "Project phase updated.",
    project: updatedProject as ProjectRow,
  };
}

export async function updateProjectStatusAction(
  input: UpdateProjectStatusInput,
): Promise<ProjectActionResult> {
  if (!VALID_PROJECT_STATUSES.has(input.status)) {
    return {
      status: "error",
      message: "Unsupported project status.",
    };
  }

  const context = await getProjectOwnerContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  const { user, project } = context;

  if (project.status === input.status) {
    return {
      status: "success",
      message: input.status === "archived" ? "Project is already archived." : "Project is already active.",
      project,
    };
  }

  const adminClient = createServiceRoleClient();
  const { data: updatedProject, error } = await adminClient
    .from("projects")
    .update({ status: input.status })
    .eq("id", input.projectId)
    .eq("workspace_id", input.workspaceId)
    .select("*")
    .single();

  if (error || !updatedProject) {
    return {
      status: "error",
      message: error?.message ?? "Could not update project status.",
    };
  }

  await insertActivity(adminClient, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: input.status === "archived" ? "project.archived" : "project.restored",
    metadata: {
      projectId: input.projectId,
      name: updatedProject.name,
    },
  });

  revalidateProjectPaths(input.workspaceId, input.projectId);

  return {
    status: "success",
    message: input.status === "archived" ? "Project archived." : "Project restored.",
    project: updatedProject as ProjectRow,
  };
}

export async function deleteProjectAction(
  input: DeleteProjectInput,
): Promise<ProjectActionResult> {
  const confirmationName = input.confirmationName.trim();
  const context = await getProjectOwnerContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  const { user, project } = context;

  if (!confirmationName || confirmationName !== project.name) {
    return {
      status: "error",
      message: "Enter the current project name to confirm deletion.",
    };
  }

  const adminClient = createServiceRoleClient();
  const { error } = await adminClient
    .from("projects")
    .delete()
    .eq("id", input.projectId)
    .eq("workspace_id", input.workspaceId);

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  await insertActivity(adminClient, {
    workspaceId: input.workspaceId,
    actorId: user.id,
    action: "project.deleted",
    metadata: {
      projectId: input.projectId,
      name: project.name,
      prefix: project.prefix,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/workspace/${input.workspaceId}`);

  return {
    status: "success",
    message: "Project deleted.",
    nextPath: `/workspace/${input.workspaceId}`,
  };
}

export async function addMilestoneAction(
  input: AddMilestoneInput,
): Promise<ProjectActionResult> {
  const nextName = input.name.trim();

  if (!nextName) {
    return {
      status: "error",
      message: "Milestone name is required.",
    };
  }

  const context = await getProjectContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;
  const { data: milestone, error } = await supabase
    .from("milestones")
    .insert({
      project_id: input.projectId,
      name: nextName,
      due_date: input.dueDate || null,
    })
    .select("*")
    .single();

  if (error || !milestone) {
    return {
      status: "error",
      message: error?.message ?? "Could not create milestone.",
    };
  }

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: "milestone.created",
    metadata: {
      milestoneId: milestone.id,
      name: milestone.name,
      dueDate: milestone.due_date,
    },
  });

  revalidateProjectPaths(input.workspaceId, input.projectId);

  return {
    status: "success",
    message: "Milestone added.",
    milestone: milestone as MilestoneRow,
  };
}

export async function deleteMilestoneAction(
  input: DeleteMilestoneInput,
): Promise<ProjectActionResult> {
  const context = await getProjectContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;
  const { data: milestone, error: milestoneError } = await supabase
    .from("milestones")
    .select("*")
    .eq("id", input.milestoneId)
    .eq("project_id", input.projectId)
    .maybeSingle();

  if (milestoneError) {
    return {
      status: "error",
      message: milestoneError.message,
    };
  }

  if (!milestone) {
    return {
      status: "error",
      message: "Milestone not found.",
    };
  }

  const { error } = await supabase
    .from("milestones")
    .delete()
    .eq("id", input.milestoneId)
    .eq("project_id", input.projectId);

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: "milestone.deleted",
    metadata: {
      milestoneId: input.milestoneId,
      name: milestone.name,
    },
  });

  revalidateProjectPaths(input.workspaceId, input.projectId);

  return {
    status: "success",
    message: "Milestone removed.",
    milestoneId: input.milestoneId,
  };
}

export async function addStandupAction(
  input: AddStandupInput,
): Promise<ProjectActionResult> {
  const done = input.done.trim();
  const next = input.next.trim();
  const blockers = input.blockers.trim();

  if (!done && !next && !blockers) {
    return {
      status: "error",
      message: "Add at least one standup field before posting.",
    };
  }

  const context = await getProjectContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;
  const { data: standup, error } = await supabase
    .from("standups")
    .insert({
      project_id: input.projectId,
      user_id: user.id,
      done: done || null,
      next: next || null,
      blockers: blockers || null,
    })
    .select("*")
    .single();

  if (error || !standup) {
    return {
      status: "error",
      message: error?.message ?? "Could not post standup.",
    };
  }

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: "standup.posted",
    metadata: {
      standupId: standup.id,
    },
  });

  revalidateProjectPaths(input.workspaceId, input.projectId);

  return {
    status: "success",
    message: "Standup posted.",
    standup: standup as StandupRow,
  };
}