import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { ProjectSnapshotCard } from "@/components/shared/ProjectSnapshotCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkspaceMemberNames } from "@/lib/supabase/member-names";
import { getMemberDisplayName } from "@/lib/utils/displayName";
import type { Database } from "@/types/database.types";

type SharePageProps = {
  params: Promise<{
    shareToken: string;
  }>;
};

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

export default async function SharedProjectPage({ params }: SharePageProps) {
  const { shareToken } = await params;
  const supabase = createServiceRoleClient();
  const { data: share } = await supabase
    .from("project_shares")
    .select("*")
    .eq("share_token", shareToken)
    .is("revoked_at", null)
    .maybeSingle();

  if (!share) {
    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Share link unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This project snapshot link is invalid, expired, or has been revoked.
          </CardContent>
        </Card>
      </main>
    );
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Share link expired</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This project snapshot link has expired. Ask the project owner for a new shared link.
          </CardContent>
        </Card>
      </main>
    );
  }

  const [{ data: project }, { data: tasks }, { data: milestones }, { data: standups }, { data: statusUpdates }, { data: activity }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", share.project_id).single(),
    supabase.from("tasks").select("*").eq("project_id", share.project_id).order("position", { ascending: true }),
    supabase.from("milestones").select("*").eq("project_id", share.project_id).order("created_at", { ascending: true }),
    supabase.from("standups").select("*").eq("project_id", share.project_id).order("created_at", { ascending: false }).limit(3),
    supabase.from("project_status_updates").select("*").eq("project_id", share.project_id).order("created_at", { ascending: false }).limit(3),
    supabase.from("activity_log").select("*").eq("project_id", share.project_id).order("created_at", { ascending: false }).limit(8),
  ]);

  if (!project) {
    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Project unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The shared project could not be loaded.
          </CardContent>
        </Card>
      </main>
    );
  }

  const { data: taskStatuses } = await supabase
    .from("workspace_task_statuses")
    .select("*")
    .eq("workspace_id", project.workspace_id)
    .order("position", { ascending: true });

  const memberNames = await getWorkspaceMemberNames(project.workspace_id);
  const ownerName = project.owner_id ? getMemberDisplayName(memberNames[project.owner_id]) : null;

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <ProjectSnapshotCard
        activityItems={(activity ?? []) as Database["public"]["Tables"]["activity_log"]["Row"][]}
        memberNames={memberNames}
        milestones={(milestones ?? []) as Database["public"]["Tables"]["milestones"]["Row"][]}
        ownerName={ownerName}
        project={project as Database["public"]["Tables"]["projects"]["Row"]}
        statusUpdates={(statusUpdates ?? []) as Database["public"]["Tables"]["project_status_updates"]["Row"][]}
        standups={(standups ?? []) as Database["public"]["Tables"]["standups"]["Row"][]}
        taskStatuses={(taskStatuses ?? []) as Database["public"]["Tables"]["workspace_task_statuses"]["Row"][]}
        tasks={(tasks ?? []) as Database["public"]["Tables"]["tasks"]["Row"][]}
      />
    </main>
  );
}