"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { MessageCircleMore } from "lucide-react";

import { NewProjectModal } from "@/components/shared/NewProjectModal";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { useRealtime } from "@/hooks/useRealtime";
import { getUnreadChatCount } from "@/lib/collaboration";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/types";

const workspaceNav = [
  { key: "workspace", label: "Workspaces", requiresWorkspace: false },
  { key: "dashboard", label: "Dashboard", requiresWorkspace: true },
  { key: "my-tasks", label: "My Tasks", requiresWorkspace: false },
  { key: "activity", label: "Activity Feed", requiresWorkspace: true },
  { key: "chat", label: "Chat", requiresWorkspace: true },
  { key: "members", label: "Members", requiresWorkspace: true },
  { key: "settings", label: "Settings", requiresWorkspace: true },
] as const;

const projectTabs = [
  { slug: "board", label: "Board" },
  { slug: "overview", label: "Overview" },
  { slug: "notes", label: "Notes" },
  { slug: "chat", label: "Chat" },
  { slug: "activity", label: "Activity" },
] as const;

const projectPhaseDot: Record<string, string> = {
  planning: "bg-slate-400",
  in_progress: "bg-blue-500",
  in_review: "bg-amber-500",
  done: "bg-emerald-500",
};

type AppSidebarProps = {
  workspaceId: string | null;
  projects: Project[];
};

type WorkspaceNavKey = (typeof workspaceNav)[number]["key"];

export function AppSidebar({ workspaceId, projects }: AppSidebarProps) {
  const pathname = usePathname();
  const params = useParams<{ workspaceId?: string }>();
  const routeWorkspaceId = typeof params.workspaceId === "string" ? params.workspaceId : null;
  const resolvedWorkspaceId = routeWorkspaceId ?? workspaceId;
  const supabase = useMemo(() => createClient(), []);

  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceMemberCount, setWorkspaceMemberCount] = useState<number | null>(null);
  const [workspaceProjectCount, setWorkspaceProjectCount] = useState<number | null>(null);
  const [workspaceProjects, setWorkspaceProjects] = useState<Project[]>(projects);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [workspaceChatUnreadCount, setWorkspaceChatUnreadCount] = useState(0);

  const projectMatch = useMemo(() => {
    if (!resolvedWorkspaceId) {
      return null;
    }

    const regex = new RegExp(
      `^/workspace/${resolvedWorkspaceId}/project/([^/]+)(?:/(board|overview|notes|chat|activity))?`,
    );
    return pathname.match(regex);
  }, [pathname, resolvedWorkspaceId]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id ?? null);
    };

    void loadCurrentUser();
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaceData(currentWorkspaceId: string) {
      setIsWorkspaceLoading(true);

      const [{ data: workspaceData }, { count: memberCount }, { count: projectCount }, { data: projectData }] =
        await Promise.all([
          supabase.from("workspaces").select("name").eq("id", currentWorkspaceId).maybeSingle(),
          supabase
            .from("workspace_members")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", currentWorkspaceId),
          supabase
            .from("projects")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", currentWorkspaceId),
          supabase
            .from("projects")
            .select("*")
            .eq("workspace_id", currentWorkspaceId)
            .order("created_at", { ascending: true }),
        ]);

      if (!cancelled) {
        setWorkspaceName(workspaceData?.name ?? null);
        setWorkspaceMemberCount(memberCount ?? 0);
        setWorkspaceProjectCount(projectCount ?? 0);
        setWorkspaceProjects((projectData ?? []) as Project[]);
        setIsWorkspaceLoading(false);
      }
    }

    if (!resolvedWorkspaceId) {
      setWorkspaceName(null);
      setWorkspaceMemberCount(null);
      setWorkspaceProjectCount(null);
      setWorkspaceProjects(projects);
      setIsWorkspaceLoading(false);
      return;
    }

    void loadWorkspaceData(resolvedWorkspaceId);

    return () => {
      cancelled = true;
    };
  }, [projects, resolvedWorkspaceId, supabase]);

  const activeProjectId = projectMatch?.[1] ?? null;
  const activeProject = workspaceProjects.find((project) => project.id === activeProjectId) ?? null;
  const hasSelectedWorkspace = Boolean(resolvedWorkspaceId);

  const getWorkspaceNavHref = (key: WorkspaceNavKey): string | null => {
    if (key === "dashboard") {
      return resolvedWorkspaceId ? `/workspace/${resolvedWorkspaceId}` : null;
    }

    if (key === "workspace") {
      return "/dashboard";
    }

    if (key === "my-tasks") {
      return resolvedWorkspaceId ? `/my-tasks?workspaceId=${resolvedWorkspaceId}` : "/my-tasks";
    }

    if (!resolvedWorkspaceId) {
      return null;
    }

    return `/workspace/${resolvedWorkspaceId}/${key}`;
  };

  const isWorkspaceNavActive = (key: WorkspaceNavKey): boolean => {
    if (key === "dashboard") {
      return Boolean(resolvedWorkspaceId) && pathname === `/workspace/${resolvedWorkspaceId}`;
    }

    if (key === "workspace") {
      return pathname === "/dashboard";
    }

    if (key === "my-tasks") {
      return pathname === "/my-tasks";
    }

    return Boolean(resolvedWorkspaceId) && pathname === `/workspace/${resolvedWorkspaceId}/${key}`;
  };

  const handleProjectCreated = (project: Project) => {
    setWorkspaceProjects((current) => [...current, project]);
    setWorkspaceProjectCount((current) => (typeof current === "number" ? current + 1 : 1));
  };

  const refreshWorkspaceChatUnread = useCallback(async () => {
    if (!resolvedWorkspaceId || !currentUserId) {
      setWorkspaceChatUnreadCount(0);
      return;
    }

    const nextCount = await getUnreadChatCount(supabase, {
      workspaceId: resolvedWorkspaceId,
      projectId: null,
      userId: currentUserId,
    });

    setWorkspaceChatUnreadCount(nextCount);
  }, [currentUserId, resolvedWorkspaceId, supabase]);

  useEffect(() => {
    void refreshWorkspaceChatUnread();
  }, [refreshWorkspaceChatUnread]);

  const setupMessagesChannel = useCallback(
    (channel: RealtimeChannel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: resolvedWorkspaceId ? `workspace_id=eq.${resolvedWorkspaceId}` : undefined,
        },
        (payload) => {
          const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as {
            project_id: string | null;
          };

          if (row?.project_id !== null) {
            return;
          }

          void refreshWorkspaceChatUnread();
        },
      ),
    [refreshWorkspaceChatUnread, resolvedWorkspaceId],
  );

  useRealtime({
    enabled: Boolean(resolvedWorkspaceId && currentUserId),
    name: resolvedWorkspaceId ? `workspace:${resolvedWorkspaceId}:sidebar-messages` : "workspace:sidebar-messages",
    supabase,
    setup: setupMessagesChannel,
  });

  const setupReadStateChannel = useCallback(
    (channel: RealtimeChannel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_read_states",
          filter: currentUserId ? `user_id=eq.${currentUserId}` : undefined,
        },
        () => {
          void refreshWorkspaceChatUnread();
        },
      ),
    [currentUserId, refreshWorkspaceChatUnread],
  );

  useRealtime({
    enabled: Boolean(resolvedWorkspaceId && currentUserId),
    name: resolvedWorkspaceId ? `workspace:${resolvedWorkspaceId}:sidebar-read-state` : "workspace:sidebar-read-state",
    supabase,
    setup: setupReadStateChannel,
  });

  return (
    <aside className="hidden w-80 border-r bg-white p-4 md:block">
      <div className="mb-4 rounded-lg border bg-slate-50 p-4">
        <p className="text-sm text-muted-foreground">Workspace</p>
        {isWorkspaceLoading ? (
          <div className="space-y-2 pt-1">
            <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
          </div>
        ) : !hasSelectedWorkspace ? (
          <p className="pt-1 text-sm text-muted-foreground">
            Select a workspace from the workspace list to view its members, projects, and live updates.
          </p>
        ) : (
          <>
            <p className="truncate text-base font-semibold">{workspaceName ?? "Workspace"}</p>
            <p className="text-xs text-muted-foreground">
              {(workspaceMemberCount ?? 0).toLocaleString()} members · {(workspaceProjectCount ?? 0).toLocaleString()} projects
            </p>
          </>
        )}

        <div className="mt-3 flex gap-2">
          <Link
            href="/dashboard"
            className={buttonVariants({
              variant: pathname === "/dashboard" ? "secondary" : "outline",
              size: "sm",
              className: "flex-1",
            })}
          >
            Workspace list
          </Link>
          <Link
            href="/create-workspace"
            className={buttonVariants({
              variant: pathname === "/create-workspace" ? "secondary" : "outline",
              size: "sm",
              className: "flex-1",
            })}
          >
            Create or join
          </Link>
        </div>
      </div>

      <nav className="mb-6 space-y-2">
        {workspaceNav.map((item) => {
          const href = getWorkspaceNavHref(item.key);
          const active = isWorkspaceNavActive(item.key);
          const isLocked = item.requiresWorkspace && !hasSelectedWorkspace;
          const sharedClassName = buttonVariants({
            variant: active ? "secondary" : "ghost",
            className: [
              "w-full",
              item.key === "chat" && !isLocked && workspaceChatUnreadCount > 0 ? "justify-between" : "justify-start",
              isLocked
                ? "cursor-not-allowed text-slate-400 opacity-60 hover:bg-transparent hover:text-slate-400"
                : null,
            ].filter(Boolean).join(" "),
          });

          const content = (
            <>
              <span className="inline-flex items-center gap-2">
                {item.key === "chat" ? <MessageCircleMore className="size-4" /> : null}
                {item.label}
              </span>
              {item.key === "chat" && !isLocked && workspaceChatUnreadCount > 0 ? <Badge>{workspaceChatUnreadCount}</Badge> : null}
            </>
          );

          return (
            <div key={item.key}>
              {href ? (
                <Link href={href} className={sharedClassName}>
                  {content}
                </Link>
              ) : (
                <div
                  aria-disabled="true"
                  title="Select a workspace first"
                  className={sharedClassName}
                >
                  {content}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Projects</h3>
      </div>
      <div className="space-y-1">
        {workspaceProjects.map((project) => (
          <Link
            key={project.id}
            href={resolvedWorkspaceId ? `/workspace/${resolvedWorkspaceId}/project/${project.id}/board` : "/dashboard"}
            className={buttonVariants({
              variant: activeProjectId === project.id ? "secondary" : "ghost",
              className: "w-full justify-start gap-2",
            })}
          >
            <span className={`size-2 rounded-full ${projectPhaseDot[project.phase] ?? "bg-slate-400"}`} />
            <span className="truncate">{project.name}</span>
            {project.status === "archived" ? (
              <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Archived
              </span>
            ) : null}
          </Link>
        ))}
        {!hasSelectedWorkspace ? (
          <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
            Pick a workspace first before opening or creating projects.
          </p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={!resolvedWorkspaceId}
        className="mt-2 w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-sm text-slate-500 enabled:cursor-pointer enabled:hover:bg-slate-50"
        onClick={() => setIsProjectModalOpen(true)}
      >
        + New project
      </button>

      {resolvedWorkspaceId && activeProject ? (
        <div className="mt-6 space-y-2 border-t pt-4">
          <p className="truncate text-sm font-semibold text-slate-800">{activeProject.name}</p>
          {projectTabs.map((tab) => {
            const href = `/workspace/${resolvedWorkspaceId}/project/${activeProject.id}/${tab.slug}`;
            const active = pathname === href;

            return (
              <Link
                key={tab.slug}
                href={href}
                className={buttonVariants({
                  variant: active ? "secondary" : "ghost",
                  className: "w-full justify-start",
                })}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      ) : null}

      {resolvedWorkspaceId ? (
        <NewProjectModal
          open={isProjectModalOpen}
          onOpenChange={setIsProjectModalOpen}
          workspaceId={resolvedWorkspaceId}
          onCreated={handleProjectCreated}
        />
      ) : null}
    </aside>
  );
}
