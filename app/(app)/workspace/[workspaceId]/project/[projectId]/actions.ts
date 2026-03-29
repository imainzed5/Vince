"use server";

import { randomBytes } from "crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { insertNotifications } from "@/lib/collaboration";
import { insertActivity } from "@/lib/supabase/activity";
import { isValidProjectPrefix, normalizeProjectPrefix } from "@/lib/project-prefix";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type MilestoneRow = Database["public"]["Tables"]["milestones"]["Row"];
type ProjectShareRow = Database["public"]["Tables"]["project_shares"]["Row"];
type StandupRow = Database["public"]["Tables"]["standups"]["Row"];
type TaskDependencyRow = Database["public"]["Tables"]["task_dependencies"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type ProjectPhase = ProjectRow["phase"];
type ProjectStatus = ProjectRow["status"];

type ProjectActionResult = {
  status: "success" | "error";
  dependency?: TaskDependencyRow;
  dependencyId?: string;
  message: string;
  nextPath?: string;
  prefix?: string;
  project?: ProjectRow;
  milestone?: MilestoneRow;
  milestoneId?: string;
  share?: ProjectShareRow;
  shareId?: string;
  sharePath?: string;
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

type UpdateProjectBriefInput = {
  workspaceId: string;
  projectId: string;
  ownerId: string;
  targetDate: string;
  successMetric: string;
  scopeSummary: string;
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

type AddTaskDependencyInput = {
  workspaceId: string;
  projectId: string;
  blockedTaskId: string;
  blockingTaskId: string;
};

type RemoveTaskDependencyInput = {
  workspaceId: string;
  projectId: string;
  dependencyId: string;
};

type CreateProjectShareInput = {
  workspaceId: string;
  projectId: string;
  expiresAt: string;
};

type RevokeProjectShareInput = {
  workspaceId: string;
  projectId: string;
  shareId: string;
};

const VALID_PROJECT_PHASES = new Set<ProjectPhase>(["planning", "in_progress", "in_review", "done"]);
const VALID_PROJECT_STATUSES = new Set<ProjectStatus>(["active", "archived"]);

function createShareToken() {
  return randomBytes(24).toString("hex");
}

function buildSharePath(shareToken: string) {
  return `/share/${shareToken}`;
}

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

export async function updateProjectBriefAction(
  input: UpdateProjectBriefInput,
): Promise<ProjectActionResult> {
  const ownerId = input.ownerId.trim() || null;
  const targetDate = input.targetDate.trim() || null;
  const successMetric = input.successMetric.trim() || null;
  const scopeSummary = input.scopeSummary.trim() || null;

  const context = await getProjectOwnerContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user, project } = context;

  if (ownerId) {
    const { data: ownerMembership } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", input.workspaceId)
      .eq("user_id", ownerId)
      .maybeSingle();

    if (!ownerMembership) {
      return {
        status: "error",
        message: "Select a project owner from this workspace.",
      };
    }
  }

  if (
    (project.owner_id ?? null) === ownerId &&
    (project.target_date ?? null) === targetDate &&
    (project.success_metric ?? null) === successMetric &&
    (project.scope_summary ?? null) === scopeSummary
  ) {
    return {
      status: "success",
      message: "Project brief is already up to date.",
      project,
    };
  }

  const adminClient = createServiceRoleClient();
  const { data: updatedProject, error } = await adminClient
    .from("projects")
    .update({
      owner_id: ownerId,
      target_date: targetDate,
      success_metric: successMetric,
      scope_summary: scopeSummary,
    })
    .eq("id", input.projectId)
    .eq("workspace_id", input.workspaceId)
    .select("*")
    .single();

  if (error || !updatedProject) {
    return {
      status: "error",
      message: error?.message ?? "Could not update project brief.",
    };
  }

  const changedFields: string[] = [];

  if ((project.owner_id ?? null) !== (updatedProject.owner_id ?? null)) {
    changedFields.push("owner");
  }

  if ((project.target_date ?? null) !== (updatedProject.target_date ?? null)) {
    changedFields.push("targetDate");
  }

  if ((project.success_metric ?? null) !== (updatedProject.success_metric ?? null)) {
    changedFields.push("successMetric");
  }

  if ((project.scope_summary ?? null) !== (updatedProject.scope_summary ?? null)) {
    changedFields.push("scopeSummary");
  }

  await insertActivity(adminClient, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: "project.brief_updated",
    metadata: {
      projectId: input.projectId,
      fields: changedFields,
      ownerId: updatedProject.owner_id,
      targetDate: updatedProject.target_date,
    },
  });

  revalidateProjectPaths(input.workspaceId, input.projectId);

  return {
    status: "success",
    message: "Project brief updated.",
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

export async function addTaskDependencyAction(
  input: AddTaskDependencyInput,
): Promise<ProjectActionResult> {
  const context = await getProjectContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  if (input.blockedTaskId === input.blockingTaskId) {
    return {
      status: "error",
      message: "A task cannot depend on itself.",
    };
  }

  const { supabase, user } = context;
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", input.projectId)
    .in("id", [input.blockedTaskId, input.blockingTaskId]);

  if (tasksError) {
    return {
      status: "error",
      message: tasksError.message,
    };
  }

  const taskRows = (tasks ?? []) as TaskRow[];
  const blockedTask = taskRows.find((task) => task.id === input.blockedTaskId);
  const blockingTask = taskRows.find((task) => task.id === input.blockingTaskId);

  if (!blockedTask || !blockingTask) {
    return {
      status: "error",
      message: "Both tasks must belong to this project.",
    };
  }

  const { data: reverseDependency } = await supabase
    .from("task_dependencies")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("blocking_task_id", input.blockedTaskId)
    .eq("blocked_task_id", input.blockingTaskId)
    .maybeSingle();

  if (reverseDependency) {
    return {
      status: "error",
      message: "This dependency would create a loop.",
    };
  }

  const { data: dependency, error } = await supabase
    .from("task_dependencies")
    .insert({
      project_id: input.projectId,
      blocked_task_id: input.blockedTaskId,
      blocking_task_id: input.blockingTaskId,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !dependency) {
    return {
      status: "error",
      message: error?.code === "23505" ? "That dependency already exists." : error?.message ?? "Could not add dependency.",
    };
  }

  await supabase.from("tasks").update({ is_blocked: true }).eq("id", blockedTask.id);

  await Promise.all([
    insertActivity(supabase, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actorId: user.id,
      action: "task.dependency_added",
      metadata: {
        taskId: blockedTask.id,
        identifier: blockedTask.identifier,
        blockedTaskId: blockedTask.id,
        blockedIdentifier: blockedTask.identifier,
        blockingTaskId: blockingTask.id,
        blockingIdentifier: blockingTask.identifier,
      },
    }),
    blockedTask.assignee_id
      ? insertNotifications(supabase, [
          {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            recipientUserId: blockedTask.assignee_id,
            actorId: user.id,
            type: "task.blocked_by",
            title: `${blockedTask.identifier} is blocked by ${blockingTask.identifier}`,
            body: blockingTask.title,
            metadata: {
              taskId: blockedTask.id,
              blockedTaskId: blockedTask.id,
              blockingTaskId: blockingTask.id,
              blockingIdentifier: blockingTask.identifier,
            },
          },
        ])
      : Promise.resolve(),
  ]);

  revalidateProjectPaths(input.workspaceId, input.projectId);

  return {
    status: "success",
    message: `Dependency added: ${blockedTask.identifier} now depends on ${blockingTask.identifier}.`,
    dependency: dependency as TaskDependencyRow,
  };
}

export async function removeTaskDependencyAction(
  input: RemoveTaskDependencyInput,
): Promise<ProjectActionResult> {
  const context = await getProjectContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;
  const { data: dependency, error: dependencyError } = await supabase
    .from("task_dependencies")
    .select("*")
    .eq("id", input.dependencyId)
    .eq("project_id", input.projectId)
    .maybeSingle();

  if (dependencyError) {
    return {
      status: "error",
      message: dependencyError.message,
    };
  }

  if (!dependency) {
    return {
      status: "error",
      message: "Dependency not found.",
    };
  }

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", input.projectId)
    .in("id", [dependency.blocked_task_id, dependency.blocking_task_id]);

  const taskRows = (tasks ?? []) as TaskRow[];
  const blockedTask = taskRows.find((task) => task.id === dependency.blocked_task_id);
  const blockingTask = taskRows.find((task) => task.id === dependency.blocking_task_id);

  const { error } = await supabase
    .from("task_dependencies")
    .delete()
    .eq("id", input.dependencyId)
    .eq("project_id", input.projectId);

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  if (blockedTask) {
    const { data: remainingDependencies } = await supabase
      .from("task_dependencies")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("blocked_task_id", blockedTask.id);

    if ((remainingDependencies?.length ?? 0) === 0 && !blockedTask.blocked_reason) {
      await supabase.from("tasks").update({ is_blocked: false }).eq("id", blockedTask.id);
    }
  }

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: "task.dependency_removed",
    metadata: {
      taskId: blockedTask?.id ?? dependency.blocked_task_id,
      blockedTaskId: dependency.blocked_task_id,
      blockingTaskId: dependency.blocking_task_id,
      blockedIdentifier: blockedTask?.identifier,
      blockingIdentifier: blockingTask?.identifier,
    },
  });

  revalidateProjectPaths(input.workspaceId, input.projectId);

  return {
    status: "success",
    message: "Dependency removed.",
    dependencyId: dependency.id,
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

export async function createProjectShareAction(
  input: CreateProjectShareInput,
): Promise<ProjectActionResult> {
  const context = await getProjectOwnerContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user, project } = context;
  const shareToken = createShareToken();
  const expiresAt = input.expiresAt.trim() || null;
  const { data: share, error } = await supabase
    .from("project_shares")
    .insert({
      project_id: input.projectId,
      share_token: shareToken,
      created_by: user.id,
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error || !share) {
    return {
      status: "error",
      message: error?.message ?? "Could not create share link.",
    };
  }

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: "project.share_created",
    metadata: {
      projectId: input.projectId,
      projectName: project.name,
      shareId: share.id,
      expiresAt: share.expires_at,
    },
  });

  revalidateProjectPaths(input.workspaceId, input.projectId);

  return {
    status: "success",
    message: "Share link created.",
    share: share as ProjectShareRow,
    sharePath: buildSharePath(share.share_token),
  };
}

export async function revokeProjectShareAction(
  input: RevokeProjectShareInput,
): Promise<ProjectActionResult> {
  const context = await getProjectOwnerContext(input.workspaceId, input.projectId);

  if (context.status === "error") {
    return context;
  }

  const { supabase, user } = context;
  const { data: share, error } = await supabase
    .from("project_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.shareId)
    .eq("project_id", input.projectId)
    .is("revoked_at", null)
    .select("*")
    .single();

  if (error || !share) {
    return {
      status: "error",
      message: error?.message ?? "Could not revoke share link.",
    };
  }

  await insertActivity(supabase, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorId: user.id,
    action: "project.share_revoked",
    metadata: {
      projectId: input.projectId,
      shareId: share.id,
    },
  });

  revalidateProjectPaths(input.workspaceId, input.projectId);

  return {
    status: "success",
    message: "Share link revoked.",
    shareId: share.id,
  };
}