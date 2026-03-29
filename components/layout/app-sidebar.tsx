"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { MessageCircleMore } from "lucide-react";

import { NewProjectModal } from "@/components/shared/NewProjectModal";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { useRealtime } from "@/hooks/useRealtime";
import { getUnreadChatCount } from "@/lib/collaboration";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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
  const workspaceRequestRef = useRef(0);

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

  const loadWorkspaceData = useCallback(
    async (currentWorkspaceId: string) => {
      const requestId = ++workspaceRequestRef.current;

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

      if (requestId !== workspaceRequestRef.current) {
        return;
      }

      setWorkspaceName(workspaceData?.name ?? null);
      setWorkspaceMemberCount(memberCount ?? 0);
      setWorkspaceProjectCount(projectCount ?? 0);
      setWorkspaceProjects((projectData ?? []) as Project[]);
      setIsWorkspaceLoading(false);
    },
    [supabase],
  );

  useEffect(() => {
    if (!resolvedWorkspaceId) {
      workspaceRequestRef.current += 1;
      setWorkspaceName(null);
      setWorkspaceMemberCount(null);
      setWorkspaceProjectCount(null);
      setWorkspaceProjects(projects);
      setIsWorkspaceLoading(false);
      return;
    }

    void loadWorkspaceData(resolvedWorkspaceId);
  }, [loadWorkspaceData, projects, resolvedWorkspaceId]);

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

  const refreshWorkspaceStructure = useCallback(() => {
    if (!resolvedWorkspaceId) {
      return;
    }

    void loadWorkspaceData(resolvedWorkspaceId);
  }, [loadWorkspaceData, resolvedWorkspaceId]);

  const setupWorkspaceStructureChannel = useCallback(
    (channel: RealtimeChannel) =>
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "workspaces",
            filter: resolvedWorkspaceId ? `id=eq.${resolvedWorkspaceId}` : undefined,
          },
          () => {
            refreshWorkspaceStructure();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "workspace_members",
            filter: resolvedWorkspaceId ? `workspace_id=eq.${resolvedWorkspaceId}` : undefined,
          },
          () => {
            refreshWorkspaceStructure();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "projects",
            filter: resolvedWorkspaceId ? `workspace_id=eq.${resolvedWorkspaceId}` : undefined,
          },
          () => {
            refreshWorkspaceStructure();
          },
        ),
    [refreshWorkspaceStructure, resolvedWorkspaceId],
  );

  useRealtime({
    enabled: Boolean(resolvedWorkspaceId),
    name: resolvedWorkspaceId ? `workspace:${resolvedWorkspaceId}:sidebar-structure` : "workspace:sidebar-structure",
    supabase,
    setup: setupWorkspaceStructureChannel,
  });

  const panelClassName =
    "rounded-[26px] border border-white/80 bg-white/72 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.88)] supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:backdrop-blur-xl";
  const sectionLabelClassName =
    "px-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/38";

  const getUtilityLinkClassName = (active: boolean) =>
    cn(
      buttonVariants({
        variant: "ghost",
        size: "sm",
        className:
          "h-8 flex-1 rounded-full border border-white/80 bg-white/60 px-3 text-[0.78rem] font-medium text-sidebar-foreground/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition-[background-color,border-color,color,box-shadow] duration-200 hover:border-white hover:bg-white/88 hover:text-sidebar-foreground active:translate-y-0",
      }),
      active &&
        "border-sidebar-border/70 bg-white/92 text-sidebar-foreground shadow-[0_12px_24px_-20px_rgba(15,23,42,0.45),inset_0_1px_0_rgba(255,255,255,0.94)] hover:bg-white/92",
    );

  const getNavItemClassName = ({
    active,
    isLocked,
    withTrailing,
  }: {
    active: boolean;
    isLocked: boolean;
    withTrailing: boolean;
  }) =>
    cn(
      buttonVariants({
        variant: "ghost",
        className:
          "h-10 rounded-[18px] border border-transparent px-3.5 text-[0.92rem] font-medium shadow-none transition-[background-color,border-color,color,box-shadow] duration-200 active:translate-y-0",
      }),
      withTrailing ? "justify-between" : "justify-start",
      active
        ? "border-sidebar-border/70 bg-white/84 text-sidebar-foreground shadow-[0_14px_26px_-22px_rgba(15,23,42,0.5),inset_0_1px_0_rgba(255,255,255,0.95)] hover:bg-white/84"
        : "text-sidebar-foreground/68 hover:border-white hover:bg-white/64 hover:text-sidebar-foreground",
      isLocked &&
        "cursor-not-allowed border-transparent bg-transparent text-sidebar-foreground/34 opacity-100 hover:border-transparent hover:bg-transparent hover:text-sidebar-foreground/34",
    );

  const getProjectLinkClassName = (active: boolean) =>
    cn(
      buttonVariants({
        variant: "ghost",
        className:
          "h-10 rounded-[18px] border border-transparent px-3.5 text-[0.9rem] font-medium shadow-none transition-[background-color,border-color,color,box-shadow] duration-200 active:translate-y-0",
      }),
      "w-full justify-start gap-2.5 text-sidebar-foreground/68",
      active
        ? "border-sidebar-border/70 bg-white/84 text-sidebar-foreground shadow-[0_14px_26px_-22px_rgba(15,23,42,0.5),inset_0_1px_0_rgba(255,255,255,0.95)] hover:bg-white/84"
        : "hover:border-white hover:bg-white/64 hover:text-sidebar-foreground",
    );

  return (
    <aside className="hidden w-80 shrink-0 border-r border-sidebar-border/55 bg-sidebar/88 px-4 py-5 text-sidebar-foreground md:sticky md:top-0 md:block md:h-screen md:overflow-y-auto md:supports-[backdrop-filter]:bg-sidebar/72 md:supports-[backdrop-filter]:backdrop-blur-2xl">
      <div className="flex min-h-full flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-rose-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]" />
            <span className="size-2.5 rounded-full bg-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]" />
            <span className="size-2.5 rounded-full bg-emerald-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]" />
          </div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-sidebar-foreground/34">Vince</p>
        </div>

        <div className={cn(panelClassName, "p-4")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/38">
                Current workspace
              </p>
              {isWorkspaceLoading ? (
                <div className="space-y-2 pt-2">
                  <div className="h-5 w-40 animate-pulse rounded-full bg-white/80" />
                  <div className="h-4 w-28 animate-pulse rounded-full bg-white/65" />
                </div>
              ) : !hasSelectedWorkspace ? (
                <p className="pt-2 text-sm leading-6 text-sidebar-foreground/56">
                  Select a workspace from the workspace list to view its members, projects, and live updates.
                </p>
              ) : (
                <>
                  <p className="truncate pt-2 text-[1.05rem] font-semibold text-sidebar-foreground">
                    {workspaceName ?? "Workspace"}
                  </p>
                  <p className="pt-1 text-sm text-sidebar-foreground/56">
                    {(workspaceMemberCount ?? 0).toLocaleString()} members · {(workspaceProjectCount ?? 0).toLocaleString()} projects
                  </p>
                </>
              )}
            </div>
            {hasSelectedWorkspace ? (
              <span className="rounded-full border border-white/80 bg-white/78 px-2.5 py-1 text-[0.68rem] font-medium text-sidebar-foreground/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]">
                Live
              </span>
            ) : null}
          </div>

          {hasSelectedWorkspace && !isWorkspaceLoading ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[20px] border border-white/75 bg-white/64 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Members</p>
                <p className="mt-1 text-sm font-semibold text-sidebar-foreground">
                  {(workspaceMemberCount ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-[20px] border border-white/75 bg-white/64 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Projects</p>
                <p className="mt-1 text-sm font-semibold text-sidebar-foreground">
                  {(workspaceProjectCount ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex gap-2">
            <Link href="/dashboard" className={getUtilityLinkClassName(pathname === "/dashboard")}>
              Workspace list
            </Link>
            <Link href="/create-workspace" className={getUtilityLinkClassName(pathname === "/create-workspace")}>
              Create or join
            </Link>
          </div>
        </div>

        <div className={cn(panelClassName, "p-2")}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className={sectionLabelClassName}>Workspace</h2>
            {workspaceChatUnreadCount > 0 ? (
              <Badge className="border-transparent bg-sidebar-primary/10 px-2 text-[0.68rem] font-medium text-sidebar-primary shadow-none hover:bg-sidebar-primary/10">
                {workspaceChatUnreadCount} unread
              </Badge>
            ) : null}
          </div>

          <nav className="space-y-1">
            {workspaceNav.map((item) => {
              const href = getWorkspaceNavHref(item.key);
              const active = isWorkspaceNavActive(item.key);
              const isLocked = item.requiresWorkspace && !hasSelectedWorkspace;
              const sharedClassName = getNavItemClassName({
                active,
                isLocked,
                withTrailing: item.key === "chat" && !isLocked && workspaceChatUnreadCount > 0,
              });

              const content = (
                <>
                  <span className="inline-flex items-center gap-2.5">
                    {item.key === "chat" ? <MessageCircleMore className="size-4" /> : null}
                    {item.label}
                  </span>
                  {item.key === "chat" && !isLocked && workspaceChatUnreadCount > 0 ? (
                    <Badge className="border-transparent bg-sidebar-primary/10 px-2 text-[0.68rem] font-medium text-sidebar-primary shadow-none hover:bg-sidebar-primary/10">
                      {workspaceChatUnreadCount}
                    </Badge>
                  ) : null}
                </>
              );

              return (
                <div key={item.key}>
                  {href ? (
                    <Link href={href} className={sharedClassName}>
                      {content}
                    </Link>
                  ) : (
                    <div aria-disabled="true" title="Select a workspace first" className={sharedClassName}>
                      {content}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className={cn(panelClassName, "p-2")}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className={sectionLabelClassName}>Projects</h3>
            {hasSelectedWorkspace ? (
              <span className="pr-2 text-[0.72rem] font-medium text-sidebar-foreground/42">
                {workspaceProjects.length.toLocaleString()}
              </span>
            ) : null}
          </div>

          <div className="space-y-1">
            {workspaceProjects.map((project) => (
              <Link
                key={project.id}
                href={resolvedWorkspaceId ? `/workspace/${resolvedWorkspaceId}/project/${project.id}/board` : "/dashboard"}
                className={getProjectLinkClassName(activeProjectId === project.id)}
              >
                <span className={`size-2 rounded-full ${projectPhaseDot[project.phase] ?? "bg-slate-400"}`} />
                <span className="truncate">{project.name}</span>
                {project.status === "archived" ? (
                  <span className="ml-auto text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">
                    Archived
                  </span>
                ) : null}
              </Link>
            ))}
            {!hasSelectedWorkspace ? (
              <p className="rounded-[20px] border border-dashed border-sidebar-border/60 bg-white/34 px-3 py-3 text-sm leading-6 text-sidebar-foreground/52">
                Pick a workspace first before opening or creating projects.
              </p>
            ) : null}
          </div>

          <button
            type="button"
            disabled={!resolvedWorkspaceId}
            className="mt-2 w-full rounded-[18px] border border-dashed border-sidebar-border/65 bg-white/42 px-3.5 py-2.5 text-left text-sm font-medium text-sidebar-foreground/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition-[background-color,border-color,color,box-shadow] duration-200 enabled:cursor-pointer enabled:hover:border-white enabled:hover:bg-white/72 enabled:hover:text-sidebar-foreground"
            onClick={() => setIsProjectModalOpen(true)}
          >
            + New project
          </button>
        </div>

        {resolvedWorkspaceId && activeProject ? (
          <div className={cn(panelClassName, "p-2")}>
            <div className="mb-2 px-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/38">
                Project views
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-sidebar-foreground">{activeProject.name}</p>
            </div>
            <div className="space-y-1">
              {projectTabs.map((tab) => {
                const href = `/workspace/${resolvedWorkspaceId}/project/${activeProject.id}/${tab.slug}`;
                const active = pathname === href;

                return (
                  <Link key={tab.slug} href={href} className={getNavItemClassName({ active, isLocked: false, withTrailing: false })}>
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

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
