import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getProjectInWorkspace } from "@/lib/workspace";

type ProjectLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    workspaceId: string;
    projectId: string;
  }>;
};

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const project = await getProjectInWorkspace(supabase, workspaceId, projectId);

  if (!project) {
    redirect(`/workspace/${workspaceId}`);
  }

  return children;
}
