import { redirect } from "next/navigation";

import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { getWorkspaceMemberNames } from "@/lib/supabase/member-names";
import { createClient } from "@/lib/supabase/server";

type WorkspaceActivityPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceActivityPage({ params }: WorkspaceActivityPageProps) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const memberNames = await getWorkspaceMemberNames(workspaceId, {
    id: user.id,
    email: user.email ?? null,
  });

  return <ActivityFeed workspaceId={workspaceId} memberNames={memberNames} />;
}
