import { redirect } from "next/navigation";

import OverviewClient from "./OverviewClient";
import { getWorkspaceMemberNames } from "@/lib/supabase/member-names";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type OverviewPageProps = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
  }>;
};

type Project = Database["public"]["Tables"]["projects"]["Row"];
type ProjectShare = Database["public"]["Tables"]["project_shares"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Standup = Database["public"]["Tables"]["standups"]["Row"];
type WorkspaceMembership = Database["public"]["Tables"]["workspace_members"]["Row"];
type MemberOption = { id: string; name: string; role: string };

export default async function OverviewPage({ params }: OverviewPageProps) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: project }, { data: tasks }, { data: milestones }, { data: standups }, { data: members }, { data: projectShares }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("tasks").select("*").eq("project_id", projectId),
    supabase.from("milestones").select("*").eq("project_id", projectId),
    supabase
      .from("standups")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase.from("workspace_members").select("*").eq("workspace_id", workspaceId),
    supabase
      .from("project_shares")
      .select("*")
      .eq("project_id", projectId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (!project) {
    return <main className="p-6 text-sm text-red-700">Unable to load project overview.</main>;
  }

  const memberNames = await getWorkspaceMemberNames(workspaceId, {
    id: user.id,
    email: user.email ?? null,
  });
  const workspaceMembers = (members ?? []) as WorkspaceMembership[];
  const memberOptions: MemberOption[] = workspaceMembers.map((member) => ({
    id: member.user_id,
    name: memberNames[member.user_id] ?? `User ${member.user_id.slice(0, 8)}`,
    role: member.role,
  }));
  const membership = workspaceMembers.find((member) => member.user_id === user.id) ?? null;

  return (
    <OverviewClient
      workspaceId={workspaceId}
      projectId={projectId}
      initialProject={project as Project}
      initialProjectShares={(projectShares ?? []) as ProjectShare[]}
      initialTasks={(tasks ?? []) as Task[]}
      initialMilestones={(milestones ?? []) as Milestone[]}
      initialStandups={(standups ?? []) as Standup[]}
      currentUserRole={(membership as WorkspaceMembership | null)?.role ?? "member"}
      memberOptions={memberOptions}
      memberNames={memberNames}
    />
  );
}
