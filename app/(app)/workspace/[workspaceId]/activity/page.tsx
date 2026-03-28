import { redirect } from "next/navigation";

import { ActivityFeed } from "@/components/activity/ActivityFeed";
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

  return <ActivityFeed workspaceId={workspaceId} />;
}
