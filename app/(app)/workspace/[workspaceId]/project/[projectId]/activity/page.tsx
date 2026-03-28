import { redirect } from "next/navigation";

import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { createClient } from "@/lib/supabase/server";

type ProjectActivityPageProps = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
  }>;
};

export default async function ProjectActivityPage({ params }: ProjectActivityPageProps) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ActivityFeed workspaceId={workspaceId} projectId={projectId} />;
}
