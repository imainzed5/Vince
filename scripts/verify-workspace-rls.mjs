import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function createAnonClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function assertNoRows(label, rows) {
  if ((rows ?? []).length > 0) {
    throw new Error(`${label}: expected zero rows but received ${(rows ?? []).length}`);
  }
}

function assertHasRows(label, rows) {
  if ((rows ?? []).length === 0) {
    throw new Error(`${label}: expected at least one row but received zero`);
  }
}

async function signInUser(url, anonKey, email, password) {
  const client = createAnonClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    throw new Error(`Could not sign in ${email}: ${error?.message ?? "unknown error"}`);
  }

  return client;
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const suffix = `${Date.now()}`;
  const userAPassword = `RlsCheck!${suffix}Aa`;
  const userBPassword = `RlsCheck!${suffix}Bb`;
  const emailA = `rls-check-a-${suffix}@example.test`;
  const emailB = `rls-check-b-${suffix}@example.test`;

  let userAId = null;
  let userBId = null;
  let workspaceAId = null;
  let workspaceBId = null;
  let onboardingWorkspaceId = null;

  try {
    const [{ data: createdA, error: createErrorA }, { data: createdB, error: createErrorB }] = await Promise.all([
      serviceClient.auth.admin.createUser({
        email: emailA,
        password: userAPassword,
        email_confirm: true,
      }),
      serviceClient.auth.admin.createUser({
        email: emailB,
        password: userBPassword,
        email_confirm: true,
      }),
    ]);

    if (createErrorA || !createdA.user) {
      throw new Error(`Could not create validation user A: ${createErrorA?.message ?? "unknown error"}`);
    }

    if (createErrorB || !createdB.user) {
      throw new Error(`Could not create validation user B: ${createErrorB?.message ?? "unknown error"}`);
    }

    userAId = createdA.user.id;
    userBId = createdB.user.id;

    const [{ data: workspaceA, error: workspaceErrorA }, { data: workspaceB, error: workspaceErrorB }] = await Promise.all([
      serviceClient
        .from("workspaces")
        .insert({
          name: `RLS Check A ${suffix}`,
          invite_code: `RL${suffix.slice(-6)}A`,
          created_by: userAId,
        })
        .select("id")
        .single(),
      serviceClient
        .from("workspaces")
        .insert({
          name: `RLS Check B ${suffix}`,
          invite_code: `RL${suffix.slice(-6)}B`,
          created_by: userBId,
        })
        .select("id")
        .single(),
    ]);

    if (workspaceErrorA || !workspaceA) {
      throw new Error(`Could not create workspace A: ${workspaceErrorA?.message ?? "unknown error"}`);
    }

    if (workspaceErrorB || !workspaceB) {
      throw new Error(`Could not create workspace B: ${workspaceErrorB?.message ?? "unknown error"}`);
    }

    workspaceAId = workspaceA.id;
    workspaceBId = workspaceB.id;

    const { error: membershipError } = await serviceClient.from("workspace_members").insert([
      {
        workspace_id: workspaceAId,
        user_id: userAId,
        role: "owner",
      },
      {
        workspace_id: workspaceBId,
        user_id: userBId,
        role: "owner",
      },
    ]);

    if (membershipError) {
      throw new Error(`Could not create memberships: ${membershipError.message}`);
    }

    const [{ data: projectA, error: projectErrorA }, { data: projectB, error: projectErrorB }] = await Promise.all([
      serviceClient
        .from("projects")
        .insert({
          workspace_id: workspaceAId,
          name: `RLS Project A ${suffix}`,
          prefix: `RLA${suffix.slice(-2)}`,
          status: "active",
          phase: "planning",
          created_by: userAId,
        })
        .select("id")
        .single(),
      serviceClient
        .from("projects")
        .insert({
          workspace_id: workspaceBId,
          name: `RLS Project B ${suffix}`,
          prefix: `RLB${suffix.slice(-2)}`,
          status: "active",
          phase: "planning",
          created_by: userBId,
        })
        .select("id")
        .single(),
    ]);

    if (projectErrorA || !projectA) {
      throw new Error(`Could not create project A: ${projectErrorA?.message ?? "unknown error"}`);
    }

    if (projectErrorB || !projectB) {
      throw new Error(`Could not create project B: ${projectErrorB?.message ?? "unknown error"}`);
    }

    const seedResults = await Promise.all([
      serviceClient.from("tasks").insert({
        project_id: projectA.id,
        identifier: `RLS-A-${suffix.slice(-4)}`,
        title: "Seed task A",
        status: "todo",
        priority: "none",
        created_by: userAId,
        position: 0,
      }),
      serviceClient.from("tasks").insert({
        project_id: projectB.id,
        identifier: `RLS-B-${suffix.slice(-4)}`,
        title: "Seed task B",
        status: "todo",
        priority: "none",
        created_by: userBId,
        position: 0,
      }),
      serviceClient.from("notes").insert({
        project_id: projectA.id,
        title: "Note A",
        content: "Workspace A note",
        updated_by: userAId,
      }),
      serviceClient.from("notes").insert({
        project_id: projectB.id,
        title: "Note B",
        content: "Workspace B note",
        updated_by: userBId,
      }),
      serviceClient.from("messages").insert({
        workspace_id: workspaceAId,
        project_id: null,
        user_id: userAId,
        content: "Workspace A message",
      }),
      serviceClient.from("messages").insert({
        workspace_id: workspaceBId,
        project_id: null,
        user_id: userBId,
        content: "Workspace B message",
      }),
      serviceClient.from("activity_log").insert({
        workspace_id: workspaceAId,
        project_id: projectA.id,
        actor_id: userAId,
        action: "rls.validation",
        metadata: { scope: "workspace-a" },
      }),
      serviceClient.from("activity_log").insert({
        workspace_id: workspaceBId,
        project_id: projectB.id,
        actor_id: userBId,
        action: "rls.validation",
        metadata: { scope: "workspace-b" },
      }),
      serviceClient.from("notifications").insert({
        workspace_id: workspaceAId,
        project_id: projectA.id,
        user_id: userAId,
        actor_id: userAId,
        type: "rls.validation",
        title: "Notification A",
        body: "Workspace A notification",
      }),
      serviceClient.from("notifications").insert({
        workspace_id: workspaceBId,
        project_id: projectB.id,
        user_id: userBId,
        actor_id: userBId,
        type: "rls.validation",
        title: "Notification B",
        body: "Workspace B notification",
      }),
      serviceClient.from("chat_read_states").insert({
        workspace_id: workspaceAId,
        project_id: null,
        user_id: userAId,
        scope_key: `workspace:${workspaceAId}`,
      }),
      serviceClient.from("chat_read_states").insert({
        workspace_id: workspaceBId,
        project_id: null,
        user_id: userBId,
        scope_key: `workspace:${workspaceBId}`,
      }),
    ]);

    const seedError = seedResults.find((result) => result.error)?.error;

    if (seedError) {
      throw new Error(`Could not seed validation data: ${seedError.message}`);
    }

    const [clientA, clientB] = await Promise.all([
      signInUser(supabaseUrl, supabaseAnonKey, emailA, userAPassword),
      signInUser(supabaseUrl, supabaseAnonKey, emailB, userBPassword),
    ]);

    const { data: onboardingWorkspace, error: onboardingWorkspaceError } = await clientA
      .rpc("create_workspace_with_owner", {
        p_name: `Onboarding Workspace ${suffix}`,
      })
      .single();

    if (onboardingWorkspaceError || !onboardingWorkspace) {
      throw new Error(
        `Could not create onboarding workspace via RPC: ${onboardingWorkspaceError?.message ?? "unknown error"}`,
      );
    }

    onboardingWorkspaceId = onboardingWorkspace.workspace_id;

    const { data: onboardingInvite, error: onboardingInviteError } = await clientA
      .from("workspaces")
      .select("invite_code")
      .eq("id", onboardingWorkspaceId)
      .single();

    if (onboardingInviteError || !onboardingInvite) {
      throw new Error(
        `Could not read onboarding invite code: ${onboardingInviteError?.message ?? "unknown error"}`,
      );
    }

    const { data: joinedWorkspace, error: joinedWorkspaceError } = await clientB
      .rpc("join_workspace_with_invite_code", {
        p_invite_code: onboardingInvite.invite_code,
      })
      .single();

    if (joinedWorkspaceError || !joinedWorkspace) {
      throw new Error(
        `Could not join onboarding workspace via RPC: ${joinedWorkspaceError?.message ?? "unknown error"}`,
      );
    }

    if (joinedWorkspace.workspace_id !== onboardingWorkspaceId || joinedWorkspace.already_member) {
      throw new Error("Join workspace RPC returned an unexpected result for a first-time member.");
    }

    const { data: joinedWorkspaceAgain, error: joinedWorkspaceAgainError } = await clientB
      .rpc("join_workspace_with_invite_code", {
        p_invite_code: onboardingInvite.invite_code,
      })
      .single();

    if (joinedWorkspaceAgainError || !joinedWorkspaceAgain) {
      throw new Error(
        `Could not re-run onboarding join RPC: ${joinedWorkspaceAgainError?.message ?? "unknown error"}`,
      );
    }

    if (joinedWorkspaceAgain.workspace_id !== onboardingWorkspaceId || !joinedWorkspaceAgain.already_member) {
      throw new Error("Join workspace RPC did not report existing membership on the second call.");
    }

    const [
      ownWorkspacesA,
      foreignWorkspacesA,
      ownMembersA,
      foreignMembersA,
      ownProjectsA,
      foreignProjectsA,
      ownTasksA,
      foreignTasksA,
      ownNotesA,
      foreignNotesA,
      ownMessagesA,
      foreignMessagesA,
      ownActivityA,
      foreignActivityA,
      ownNotificationsA,
      foreignNotificationsA,
      ownReadStatesA,
      foreignReadStatesA,
      ownWorkspacesB,
      foreignWorkspacesB,
      ownNotificationsB,
      foreignNotificationsB,
      ownReadStatesB,
      foreignReadStatesB,
    ] = await Promise.all([
      clientA.from("workspaces").select("id").eq("id", workspaceAId),
      clientA.from("workspaces").select("id").eq("id", workspaceBId),
      clientA.from("workspace_members").select("id").eq("workspace_id", workspaceAId),
      clientA.from("workspace_members").select("id").eq("workspace_id", workspaceBId),
      clientA.from("projects").select("id").eq("workspace_id", workspaceAId),
      clientA.from("projects").select("id").eq("workspace_id", workspaceBId),
      clientA.from("tasks").select("id").eq("project_id", projectA.id),
      clientA.from("tasks").select("id").eq("project_id", projectB.id),
      clientA.from("notes").select("id").eq("project_id", projectA.id),
      clientA.from("notes").select("id").eq("project_id", projectB.id),
      clientA.from("messages").select("id").eq("workspace_id", workspaceAId),
      clientA.from("messages").select("id").eq("workspace_id", workspaceBId),
      clientA.from("activity_log").select("id").eq("workspace_id", workspaceAId),
      clientA.from("activity_log").select("id").eq("workspace_id", workspaceBId),
      clientA.from("notifications").select("id").eq("workspace_id", workspaceAId),
      clientA.from("notifications").select("id").eq("workspace_id", workspaceBId),
      clientA.from("chat_read_states").select("id").eq("workspace_id", workspaceAId),
      clientA.from("chat_read_states").select("id").eq("workspace_id", workspaceBId),
      clientB.from("workspaces").select("id").eq("id", workspaceBId),
      clientB.from("workspaces").select("id").eq("id", workspaceAId),
      clientB.from("notifications").select("id").eq("workspace_id", workspaceBId),
      clientB.from("notifications").select("id").eq("workspace_id", workspaceAId),
      clientB.from("chat_read_states").select("id").eq("workspace_id", workspaceBId),
      clientB.from("chat_read_states").select("id").eq("workspace_id", workspaceAId),
    ]);

    for (const result of [
      ownWorkspacesA,
      foreignWorkspacesA,
      ownMembersA,
      foreignMembersA,
      ownProjectsA,
      foreignProjectsA,
      ownTasksA,
      foreignTasksA,
      ownNotesA,
      foreignNotesA,
      ownMessagesA,
      foreignMessagesA,
      ownActivityA,
      foreignActivityA,
      ownNotificationsA,
      foreignNotificationsA,
      ownReadStatesA,
      foreignReadStatesA,
      ownWorkspacesB,
      foreignWorkspacesB,
      ownNotificationsB,
      foreignNotificationsB,
      ownReadStatesB,
      foreignReadStatesB,
    ]) {
      if (result.error) {
        throw new Error(result.error.message);
      }
    }

    assertHasRows("User A own workspace read", ownWorkspacesA.data);
    assertNoRows("User A foreign workspace read", foreignWorkspacesA.data);
    assertHasRows("User A own workspace_members read", ownMembersA.data);
    assertNoRows("User A foreign workspace_members read", foreignMembersA.data);
    assertHasRows("User A own projects read", ownProjectsA.data);
    assertNoRows("User A foreign projects read", foreignProjectsA.data);
    assertHasRows("User A own tasks read", ownTasksA.data);
    assertNoRows("User A foreign tasks read", foreignTasksA.data);
    assertHasRows("User A own notes read", ownNotesA.data);
    assertNoRows("User A foreign notes read", foreignNotesA.data);
    assertHasRows("User A own messages read", ownMessagesA.data);
    assertNoRows("User A foreign messages read", foreignMessagesA.data);
    assertHasRows("User A own activity read", ownActivityA.data);
    assertNoRows("User A foreign activity read", foreignActivityA.data);
    assertHasRows("User A own notifications read", ownNotificationsA.data);
    assertNoRows("User A foreign notifications read", foreignNotificationsA.data);
    assertHasRows("User A own chat read states read", ownReadStatesA.data);
    assertNoRows("User A foreign chat read states read", foreignReadStatesA.data);
    assertHasRows("User B own workspace read", ownWorkspacesB.data);
    assertNoRows("User B foreign workspace read", foreignWorkspacesB.data);
    assertHasRows("User B own notifications read", ownNotificationsB.data);
    assertNoRows("User B foreign notifications read", foreignNotificationsB.data);
    assertHasRows("User B own chat read states read", ownReadStatesB.data);
    assertNoRows("User B foreign chat read states read", foreignReadStatesB.data);

    console.log("RLS verification passed: cross-workspace reads are blocked for the tested tables.");
  } finally {
    if (onboardingWorkspaceId) {
      await serviceClient.from("workspaces").delete().eq("id", onboardingWorkspaceId);
    }

    if (workspaceAId) {
      await serviceClient.from("workspaces").delete().eq("id", workspaceAId);
    }

    if (workspaceBId) {
      await serviceClient.from("workspaces").delete().eq("id", workspaceBId);
    }

    if (userAId) {
      await serviceClient.auth.admin.deleteUser(userAId);
    }

    if (userBId) {
      await serviceClient.auth.admin.deleteUser(userBId);
    }
  }
}

main().catch((error) => {
  console.error(`RLS verification failed: ${error.message}`);
  process.exitCode = 1;
});