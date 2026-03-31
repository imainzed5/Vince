import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { DevTimingPanel } from "@/components/shared/dev-timing-panel";
import { BrowserRouteTimingBridge } from "@/components/shared/route-timing-bridge";
import { createRouteTimingLogger } from "@/lib/observability/route-timing";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfileSnapshot } from "@/lib/supabase/user-profiles";
import { getUserWorkspaceRoute } from "@/lib/workspace";
import type { Project } from "@/types";

type AppLayoutProps = {
  children: React.ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const timing = createRouteTimingLogger("app/(app)/layout");
  let outcome = "render";
  let activeWorkspaceId: string | null = null;
  let projectCount = 0;

  try {
    const supabase = await timing.measure("createClient", createClient);
    const {
      data: { user },
    } = await timing.measure("auth.getUser", () => supabase.auth.getUser());

    if (!user) {
      outcome = "redirect_login";
      redirect("/login");
    }

    const currentUserProfile = await timing.measure("load_profile", () => getCurrentUserProfileSnapshot(supabase, user));
    const destination = await timing.measure("resolve_workspace_route", () => getUserWorkspaceRoute(supabase, user.id));
    const workspaceId = destination.kind === "single" ? destination.workspaceId : null;
    let projects: Project[] = [];

    activeWorkspaceId = workspaceId;

    if (workspaceId) {
      const { data } = await timing.measure("load_sidebar_projects", () =>
        supabase
          .from("projects")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: true }),
      );

      projects = (data ?? []) as Project[];
      projectCount = projects.length;
    }

    return (
      <div className="min-h-screen bg-background text-foreground md:flex">
        <BrowserRouteTimingBridge name="app-shell-route" context={{ workspaceId, projectCount: projects.length }} />
        <DevTimingPanel />
        <AppSidebar
          workspaceId={workspaceId}
          projects={projects}
          currentUser={{
            id: user.id,
            email: user.email ?? null,
            displayName: currentUserProfile.displayName,
            sidebarPreferences: currentUserProfile.sidebarPreferences,
          }}
        />
        <div className="flex-1">{children}</div>
      </div>
    );
  } finally {
    timing.finish({
      outcome,
      workspaceId: activeWorkspaceId,
      projectCount,
    });
  }
}
