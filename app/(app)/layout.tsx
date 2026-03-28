import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaceRoute } from "@/lib/workspace";
import type { Project } from "@/types";

type AppLayoutProps = {
  children: React.ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const destination = await getUserWorkspaceRoute(supabase, user.id);
  const workspaceId = destination.kind === "single" ? destination.workspaceId : null;
  let projects: Project[] = [];

  if (workspaceId) {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    projects = (data ?? []) as Project[];
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 md:flex">
      <AppSidebar workspaceId={workspaceId} projects={projects} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
