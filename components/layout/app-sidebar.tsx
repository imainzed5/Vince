"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Activity,
  ChevronsUpDown,
  CheckSquare2,
  Command,
  FolderKanban,
  KanbanSquare,
  Layers3,
  LifeBuoy,
  LogOut,
  MessageCircleMore,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Star,
  SlidersHorizontal,
  Users2,
} from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { NewProjectModal } from "@/components/shared/NewProjectModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRealtime } from "@/hooks/useRealtime";
import { DEFAULT_SIDEBAR_PREFERENCES, normalizeSidebarPreferences } from "@/lib/supabase/user-profiles";
import { getUnreadChatCount } from "@/lib/collaboration";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { Project, UserSidebarPreferences, Workspace } from "@/types";

const workspaceNav = [
  { key: "workspace", label: "Workspaces", requiresWorkspace: false, icon: Layers3 },
  { key: "dashboard", label: "Dashboard", requiresWorkspace: true, icon: FolderKanban },
  { key: "my-tasks", label: "My Tasks", requiresWorkspace: false, icon: CheckSquare2 },
  { key: "activity", label: "Activity Feed", requiresWorkspace: true, icon: Activity },
  { key: "chat", label: "Chat", requiresWorkspace: true, icon: MessageCircleMore },
  { key: "members", label: "Members", requiresWorkspace: true, icon: Users2 },
  { key: "settings", label: "Workspace settings", requiresWorkspace: true, icon: SlidersHorizontal },
] as const;

const projectTabs = [
  { slug: "board", label: "Board", icon: KanbanSquare },
  { slug: "overview", label: "Overview", icon: FolderKanban },
  { slug: "notes", label: "Notes", icon: NotebookPen },
  { slug: "chat", label: "Chat", icon: MessageCircleMore },
  { slug: "activity", label: "Activity", icon: Activity },
] as const;

const projectPhaseDot: Record<string, string> = {
  planning: "bg-slate-400",
  in_progress: "bg-blue-500",
  in_review: "bg-amber-500",
  done: "bg-emerald-500",
};

type AppSidebarProps = {
  currentUser: {
    id: string;
    email: string | null;
    displayName: string;
    sidebarPreferences: UserSidebarPreferences;
  };
  workspaceId: string | null;
  projects: Project[];
};

type WorkspaceNavKey = (typeof workspaceNav)[number]["key"];

const MAX_RECENT_WORKSPACES = 6;
const SIDEBAR_WIDTH_STORAGE_KEY = "vince:sidebar-width";
const SIDEBAR_AUTO_OVERRIDE_STORAGE_KEY = "vince:sidebar-auto-override";
const AUTO_COLLAPSE_BREAKPOINT = 1220;
const MIN_SIDEBAR_WIDTH = 288;
const MAX_SIDEBAR_WIDTH = 420;
const DEFAULT_SIDEBAR_WIDTH = 320;

type SwitcherSection<T> = {
  key: string;
  label: string;
  items: T[];
};

function readStoredSidebarWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_SIDEBAR_WIDTH;
  }

  const value = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));

  if (Number.isFinite(value)) {
    return Math.min(Math.max(value, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
  }

  return DEFAULT_SIDEBAR_WIDTH;
}

function readStoredSidebarAutoOverride(): "auto" | "expanded" | "collapsed" {
  if (typeof window === "undefined") {
    return "auto";
  }

  const value = window.localStorage.getItem(SIDEBAR_AUTO_OVERRIDE_STORAGE_KEY);

  if (value === "expanded" || value === "collapsed") {
    return value;
  }

  return "auto";
}

function buildSwitcherSections<T>({
  groups,
}: {
  groups: Array<{ key: string; label: string; items: T[] }>;
}): SwitcherSection<T>[] {
  return groups.filter((group) => group.items.length > 0);
}

function handleSwitcherItemKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    return;
  }

  const container = event.currentTarget.closest("[data-switcher-list='true']");

  if (!container) {
    return;
  }

  const items = Array.from(container.querySelectorAll<HTMLElement>("[data-switcher-item='true']"));
  const currentIndex = items.indexOf(event.currentTarget);

  if (currentIndex === -1 || items.length === 0) {
    return;
  }

  event.preventDefault();

  if (event.key === "Home") {
    items[0]?.focus();
    return;
  }

  if (event.key === "End") {
    items.at(-1)?.focus();
    return;
  }

  const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
  const nextIndex = (currentIndex + direction + items.length) % items.length;
  items[nextIndex]?.focus();
}
function focusSwitcherItemFromPanel(container: HTMLElement | null, target: "first" | "last") {
  if (!container) {
    return;
  }

  const items = Array.from(container.querySelectorAll<HTMLElement>("[data-switcher-item='true']"));

  if (items.length === 0) {
    return;
  }

  if (target === "first") {
    items[0]?.focus();
    return;
  }

  items.at(-1)?.focus();
}

function getInitials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "VI";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function CompactRailTooltip({ children, label }: { children: React.ReactElement; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger delay={120} render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar({ currentUser, workspaceId, projects }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ workspaceId?: string }>();
  const routeWorkspaceId = typeof params.workspaceId === "string" ? params.workspaceId : null;
  const hasHydratedSidebar = useUIStore((state) => state.hasHydratedSidebar);
  const hydrateSidebar = useUIStore((state) => state.hydrateSidebar);
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const storedWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const resolvedWorkspaceId = routeWorkspaceId ?? workspaceId ?? storedWorkspaceId;
  const supabase = useMemo(() => createClient(), []);
  const workspaceRequestRef = useRef(0);

  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceMemberCount, setWorkspaceMemberCount] = useState<number | null>(null);
  const [workspaceProjectCount, setWorkspaceProjectCount] = useState<number | null>(null);
  const [userWorkspaces, setUserWorkspaces] = useState<Workspace[]>([]);
  const [sidebarPreferences, setSidebarPreferences] = useState<UserSidebarPreferences>(() =>
    normalizeSidebarPreferences(currentUser.sidebarPreferences),
  );
  const [workspaceProjects, setWorkspaceProjects] = useState<Project[]>(projects);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isWorkspaceSwitcherOpen, setIsWorkspaceSwitcherOpen] = useState(false);
  const [isProjectSwitcherOpen, setIsProjectSwitcherOpen] = useState(false);
  const [isSwitcherPaletteOpen, setIsSwitcherPaletteOpen] = useState(false);
  const [isCompactRailOnboardingOpen, setIsCompactRailOnboardingOpen] = useState(false);
  const [switcherPaletteQuery, setSwitcherPaletteQuery] = useState("");
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [workspaceChatUnreadCount, setWorkspaceChatUnreadCount] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [sidebarAutoOverride, setSidebarAutoOverride] = useState<"auto" | "expanded" | "collapsed">("auto");
  const currentUserId = currentUser.id;
  const workspaceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const projectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const switcherPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarPreferencesRef = useRef(sidebarPreferences);
  const lastAutoCollapseMatchRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!hasHydratedSidebar) {
      hydrateSidebar();
    }
  }, [hasHydratedSidebar, hydrateSidebar]);

  const isCompactSidebar = hasHydratedSidebar ? isSidebarCollapsed : false;

  useEffect(() => {
    const normalized = normalizeSidebarPreferences(currentUser.sidebarPreferences);
    setSidebarPreferences(normalized);
  }, [currentUser.sidebarPreferences]);

  useEffect(() => {
    sidebarPreferencesRef.current = sidebarPreferences;
  }, [sidebarPreferences]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSidebarWidth(readStoredSidebarWidth());
    setSidebarAutoOverride(readStoredSidebarAutoOverride());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_AUTO_OVERRIDE_STORAGE_KEY, sidebarAutoOverride);
  }, [sidebarAutoOverride]);

  useEffect(() => {
    if (!hasHydratedSidebar || typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${AUTO_COLLAPSE_BREAKPOINT}px)`);

    const applyResponsiveSidebar = (matches: boolean) => {
      const previousMatches = lastAutoCollapseMatchRef.current;
      const crossedBreakpoint = previousMatches !== null && previousMatches !== matches;

      if (crossedBreakpoint) {
        setSidebarAutoOverride("auto");
      }

      lastAutoCollapseMatchRef.current = matches;

      if (sidebarAutoOverride === "expanded") {
        if (isSidebarCollapsed) {
          setSidebarCollapsed(false);
        }
        return;
      }

      if (sidebarAutoOverride === "collapsed") {
        if (!isSidebarCollapsed) {
          setSidebarCollapsed(true);
        }
        return;
      }

      if (matches !== isSidebarCollapsed) {
        setSidebarCollapsed(matches);
      }
    };

    applyResponsiveSidebar(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      applyResponsiveSidebar(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [hasHydratedSidebar, isSidebarCollapsed, setSidebarCollapsed, sidebarAutoOverride]);

  useEffect(() => {
    if (isSwitcherPaletteOpen) {
      window.setTimeout(() => switcherPaletteInputRef.current?.focus(), 0);
      return;
    }

    setSwitcherPaletteQuery("");
  }, [isSwitcherPaletteOpen]);

  useEffect(() => {
    if (isCompactSidebar && !sidebarPreferences.hasSeenCompactRailOnboarding) {
      setIsCompactRailOnboardingOpen(true);
    }
  }, [isCompactSidebar, sidebarPreferences.hasSeenCompactRailOnboarding]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSwitcherPaletteOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const projectMatch = useMemo(() => {
    if (!resolvedWorkspaceId) {
      return null;
    }

    const regex = new RegExp(
      `^/workspace/${resolvedWorkspaceId}/project/([^/]+)(?:/(board|overview|notes|chat|activity))?`,
    );
    return pathname.match(regex);
  }, [pathname, resolvedWorkspaceId]);

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
    const nextWorkspaceId = routeWorkspaceId ?? workspaceId ?? null;

    if (!nextWorkspaceId || nextWorkspaceId === storedWorkspaceId) {
      return;
    }

    setCurrentWorkspaceId(nextWorkspaceId);
  }, [routeWorkspaceId, setCurrentWorkspaceId, storedWorkspaceId, workspaceId]);

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

  useEffect(() => {
    async function loadUserWorkspaces() {
      if (!currentUserId) {
        setUserWorkspaces([]);
        return;
      }

      const { data: memberships } = await supabase
        .from("workspace_members")
        .select("workspace_id, joined_at")
        .eq("user_id", currentUserId)
        .order("joined_at", { ascending: true });

      const workspaceIds = memberships?.map((membership) => membership.workspace_id).filter(Boolean) ?? [];

      if (workspaceIds.length === 0) {
        setUserWorkspaces([]);
        return;
      }

      const { data: workspaces } = await supabase.from("workspaces").select("*").in("id", workspaceIds);

      const workspacesById = new Map((workspaces ?? []).map((workspace) => [workspace.id, workspace as Workspace]));
      setUserWorkspaces(workspaceIds.map((id) => workspacesById.get(id)).filter((workspace): workspace is Workspace => Boolean(workspace)));
    }

    void loadUserWorkspaces();
  }, [currentUserId, supabase]);

  const persistSidebarPreferences = useCallback(
    async (nextPreferences: UserSidebarPreferences) => {
      sidebarPreferencesRef.current = nextPreferences;
      setSidebarPreferences(nextPreferences);

      if (!currentUserId) {
        return;
      }

      await supabase
        .from("user_profiles")
        .upsert(
          {
            user_id: currentUserId,
            sidebar_preferences: nextPreferences,
          },
          { onConflict: "user_id" },
        );
    },
    [currentUserId, supabase],
  );

  const updateSidebarPreferences = useCallback(
    (updater: (current: UserSidebarPreferences) => UserSidebarPreferences) => {
      const nextPreferences = updater(sidebarPreferencesRef.current ?? DEFAULT_SIDEBAR_PREFERENCES);

      void persistSidebarPreferences(nextPreferences);

      return nextPreferences;
    },
    [persistSidebarPreferences],
  );

  const rememberRecentWorkspace = useCallback(
    (workspaceId: string) => {
      updateSidebarPreferences((current) => ({
        ...current,
        recentWorkspaceIds: [workspaceId, ...current.recentWorkspaceIds.filter((id) => id !== workspaceId)].slice(
          0,
          MAX_RECENT_WORKSPACES,
        ),
      }));
    },
    [updateSidebarPreferences],
  );

  const togglePinnedWorkspace = useCallback(
    (workspaceId: string) => {
      updateSidebarPreferences((current) => ({
        ...current,
        pinnedWorkspaceIds: current.pinnedWorkspaceIds.includes(workspaceId)
          ? current.pinnedWorkspaceIds.filter((id) => id !== workspaceId)
          : [workspaceId, ...current.pinnedWorkspaceIds.filter((id) => id !== workspaceId)],
      }));
    },
    [updateSidebarPreferences],
  );

  const rememberRecentProject = useCallback(
    (workspaceKey: string, projectId: string) => {
      updateSidebarPreferences((current) => ({
        ...current,
        recentProjectIdsByWorkspace: {
          ...current.recentProjectIdsByWorkspace,
          [workspaceKey]: [
            projectId,
            ...(current.recentProjectIdsByWorkspace[workspaceKey] ?? []).filter((id) => id !== projectId),
          ].slice(0, MAX_RECENT_WORKSPACES),
        },
      }));
    },
    [updateSidebarPreferences],
  );

  const togglePinnedProject = useCallback(
    (workspaceKey: string, projectId: string) => {
      updateSidebarPreferences((current) => {
        const currentPinned = current.pinnedProjectIdsByWorkspace[workspaceKey] ?? [];

        return {
          ...current,
          pinnedProjectIdsByWorkspace: {
            ...current.pinnedProjectIdsByWorkspace,
            [workspaceKey]: currentPinned.includes(projectId)
              ? currentPinned.filter((id) => id !== projectId)
              : [projectId, ...currentPinned.filter((id) => id !== projectId)],
          },
        };
      });
    },
    [updateSidebarPreferences],
  );

  const markCompactRailOnboardingSeen = useCallback(() => {
    if (sidebarPreferencesRef.current.hasSeenCompactRailOnboarding) {
      setIsCompactRailOnboardingOpen(false);
      return;
    }

    updateSidebarPreferences((current) => ({
      ...current,
      hasSeenCompactRailOnboarding: true,
    }));
    setIsCompactRailOnboardingOpen(false);
  }, [updateSidebarPreferences]);

  const handleSidebarToggle = useCallback(() => {
    const nextCollapsed = !isSidebarCollapsed;

    setSidebarCollapsed(nextCollapsed);

    // Any direct toggle is a manual override; responsive auto mode resumes only after a breakpoint crossing.
    setSidebarAutoOverride(nextCollapsed ? "collapsed" : "expanded");
  }, [isSidebarCollapsed, setSidebarCollapsed]);

  const handleWorkspaceSwitcherOpenChange = useCallback((open: boolean) => {
    setIsWorkspaceSwitcherOpen(open);

    if (!open) {
      setWorkspaceSearchQuery("");
      window.setTimeout(() => workspaceTriggerRef.current?.focus(), 0);
    }
  }, []);

  const handleProjectSwitcherOpenChange = useCallback((open: boolean) => {
    setIsProjectSwitcherOpen(open);

    if (!open) {
      setProjectSearchQuery("");
      window.setTimeout(() => projectTriggerRef.current?.focus(), 0);
    }
  }, []);

  const handleSidebarResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isCompactSidebar) {
      return;
    }

    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const nextWidth = Math.min(Math.max(startWidth + (pointerEvent.clientX - startX), MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
      setSidebarWidth(nextWidth);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [isCompactSidebar, sidebarWidth]);

  useEffect(() => {
    setIsWorkspaceSwitcherOpen(false);
    setIsProjectSwitcherOpen(false);
  }, [pathname, isCompactSidebar]);

  useEffect(() => {
    if (resolvedWorkspaceId) {
      rememberRecentWorkspace(resolvedWorkspaceId);
    }
  }, [rememberRecentWorkspace, resolvedWorkspaceId]);

  const activeProjectId = projectMatch?.[1] ?? null;

  useEffect(() => {
    if (resolvedWorkspaceId && activeProjectId) {
      rememberRecentProject(resolvedWorkspaceId, activeProjectId);
    }
  }, [activeProjectId, rememberRecentProject, resolvedWorkspaceId]);
  const activeProject = workspaceProjects.find((project) => project.id === activeProjectId) ?? null;
  const hasSelectedWorkspace = Boolean(resolvedWorkspaceId);
  const pinnedWorkspaceIdSet = useMemo(() => new Set(sidebarPreferences.pinnedWorkspaceIds), [sidebarPreferences.pinnedWorkspaceIds]);
  const recentWorkspaceIdSet = useMemo(() => new Set(sidebarPreferences.recentWorkspaceIds), [sidebarPreferences.recentWorkspaceIds]);
  const orderedWorkspaces = useMemo(() => {
    const originalOrder = new Map(userWorkspaces.map((workspace, index) => [workspace.id, index]));
    const pinnedOrder = new Map(sidebarPreferences.pinnedWorkspaceIds.map((id, index) => [id, index]));
    const recentOrder = new Map(sidebarPreferences.recentWorkspaceIds.map((id, index) => [id, index]));

    return [...userWorkspaces].sort((left, right) => {
      const leftPinned = pinnedOrder.has(left.id);
      const rightPinned = pinnedOrder.has(right.id);

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      if (leftPinned && rightPinned) {
        return (pinnedOrder.get(left.id) ?? 0) - (pinnedOrder.get(right.id) ?? 0);
      }

      const leftRecent = recentOrder.has(left.id);
      const rightRecent = recentOrder.has(right.id);

      if (leftRecent !== rightRecent) {
        return leftRecent ? -1 : 1;
      }

      if (leftRecent && rightRecent) {
        return (recentOrder.get(left.id) ?? 0) - (recentOrder.get(right.id) ?? 0);
      }

      return (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0);
    });
  }, [sidebarPreferences.pinnedWorkspaceIds, sidebarPreferences.recentWorkspaceIds, userWorkspaces]);
  const pinnedProjectIds = useMemo(
    () => (resolvedWorkspaceId ? sidebarPreferences.pinnedProjectIdsByWorkspace[resolvedWorkspaceId] ?? [] : []),
    [resolvedWorkspaceId, sidebarPreferences.pinnedProjectIdsByWorkspace],
  );
  const recentProjectIds = useMemo(
    () => (resolvedWorkspaceId ? sidebarPreferences.recentProjectIdsByWorkspace[resolvedWorkspaceId] ?? [] : []),
    [resolvedWorkspaceId, sidebarPreferences.recentProjectIdsByWorkspace],
  );
  const pinnedProjectIdSet = useMemo(() => new Set(pinnedProjectIds), [pinnedProjectIds]);
  const recentProjectIdSet = useMemo(() => new Set(recentProjectIds), [recentProjectIds]);
  const orderedProjects = useMemo(() => {
    const originalOrder = new Map(workspaceProjects.map((project, index) => [project.id, index]));
    const pinnedOrder = new Map(pinnedProjectIds.map((id, index) => [id, index]));
    const recentOrder = new Map(recentProjectIds.map((id, index) => [id, index]));

    return [...workspaceProjects].sort((left, right) => {
      const leftPinned = pinnedOrder.has(left.id);
      const rightPinned = pinnedOrder.has(right.id);

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      if (leftPinned && rightPinned) {
        return (pinnedOrder.get(left.id) ?? 0) - (pinnedOrder.get(right.id) ?? 0);
      }

      const leftRecent = recentOrder.has(left.id);
      const rightRecent = recentOrder.has(right.id);

      if (leftRecent !== rightRecent) {
        return leftRecent ? -1 : 1;
      }

      if (leftRecent && rightRecent) {
        return (recentOrder.get(left.id) ?? 0) - (recentOrder.get(right.id) ?? 0);
      }

      return (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0);
    });
  }, [pinnedProjectIds, recentProjectIds, workspaceProjects]);
  const normalizedWorkspaceQuery = workspaceSearchQuery.trim().toLowerCase();
  const normalizedProjectQuery = projectSearchQuery.trim().toLowerCase();
  const filteredWorkspaces = useMemo(
    () =>
      orderedWorkspaces.filter((workspace) =>
        workspace.name.toLowerCase().includes(normalizedWorkspaceQuery),
      ),
    [normalizedWorkspaceQuery, orderedWorkspaces],
  );
  const filteredProjects = useMemo(
    () =>
      orderedProjects.filter((project) => project.name.toLowerCase().includes(normalizedProjectQuery)),
    [normalizedProjectQuery, orderedProjects],
  );
  const workspaceSwitcherSections = useMemo(
    () =>
      buildSwitcherSections<Workspace>({
        groups: [
          {
            key: "pinned",
            label: "Pinned",
            items: filteredWorkspaces.filter((workspace) => pinnedWorkspaceIdSet.has(workspace.id)),
          },
          {
            key: "recent",
            label: "Recent",
            items: filteredWorkspaces.filter(
              (workspace) => recentWorkspaceIdSet.has(workspace.id) && !pinnedWorkspaceIdSet.has(workspace.id),
            ),
          },
          {
            key: "all",
            label: "All workspaces",
            items: filteredWorkspaces.filter(
              (workspace) => !pinnedWorkspaceIdSet.has(workspace.id) && !recentWorkspaceIdSet.has(workspace.id),
            ),
          },
        ],
      }),
    [filteredWorkspaces, pinnedWorkspaceIdSet, recentWorkspaceIdSet],
  );
  const projectSwitcherSections = useMemo(
    () =>
      buildSwitcherSections<Project>({
        groups: [
          {
            key: "current",
            label: "Current",
            items: filteredProjects.filter((project) => project.id === activeProjectId),
          },
          {
            key: "recent",
            label: "Recent",
            items: filteredProjects.filter(
              (project) => project.id !== activeProjectId && recentProjectIdSet.has(project.id),
            ),
          },
          {
            key: "all",
            label: "All projects",
            items: filteredProjects.filter(
              (project) => project.id !== activeProjectId && !recentProjectIdSet.has(project.id),
            ),
          },
        ],
      }),
    [activeProjectId, filteredProjects, recentProjectIdSet],
  );
  const paletteResults = useMemo(() => {
    const workspaceResults = filteredWorkspaces.slice(0, 6).map((workspace) => ({
      id: `workspace:${workspace.id}`,
      label: workspace.name,
      meta: pinnedWorkspaceIdSet.has(workspace.id) ? "Pinned workspace" : "Workspace",
      onSelect: () => {
        setCurrentWorkspaceId(workspace.id);
        rememberRecentWorkspace(workspace.id);
        router.push(`/workspace/${workspace.id}`);
        setIsSwitcherPaletteOpen(false);
      },
    }));
    const projectResults = resolvedWorkspaceId
      ? filteredProjects.slice(0, 6).map((project) => ({
          id: `project:${project.id}`,
          label: project.name,
          meta: pinnedProjectIdSet.has(project.id) ? "Pinned project" : project.phase.replaceAll("_", " "),
          onSelect: () => {
            rememberRecentProject(resolvedWorkspaceId, project.id);
            router.push(`/workspace/${resolvedWorkspaceId}/project/${project.id}/board`);
            setIsSwitcherPaletteOpen(false);
          },
        }))
      : [];

    const combined = [
      ...workspaceResults,
      ...projectResults,
      {
        id: "action:create-workspace",
        label: "Create or join workspace",
        meta: "Action",
        onSelect: () => {
          router.push("/create-workspace");
          setIsSwitcherPaletteOpen(false);
        },
      },
      {
        id: "action:help",
        label: "Open Help",
        meta: "Action",
        onSelect: () => {
          router.push("/help");
          setIsSwitcherPaletteOpen(false);
        },
      },
    ];

    const normalizedPaletteQuery = switcherPaletteQuery.trim().toLowerCase();

    if (!normalizedPaletteQuery) {
      return combined;
    }

    return combined.filter(
      (item) =>
        item.label.toLowerCase().includes(normalizedPaletteQuery) ||
        item.meta.toLowerCase().includes(normalizedPaletteQuery),
    );
  }, [
    filteredProjects,
    filteredWorkspaces,
    pinnedProjectIdSet,
    pinnedWorkspaceIdSet,
    rememberRecentProject,
    rememberRecentWorkspace,
    resolvedWorkspaceId,
    router,
    setCurrentWorkspaceId,
    switcherPaletteQuery,
  ]);

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
    "rounded-[26px] border border-white/80 bg-white/72 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.88)] supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:backdrop-blur-xl dark:border-white/6 dark:bg-white/4 dark:shadow-[0_28px_52px_-34px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] dark:supports-[backdrop-filter]:bg-black/26";
  const sectionLabelClassName =
    "px-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/38 dark:text-sidebar-foreground/44";
  const compactActiveItemClassName =
    "border-sidebar-primary/40 bg-sidebar-primary/14 text-sidebar-foreground shadow-[0_18px_28px_-22px_rgba(59,130,246,0.95)] motion-safe:-translate-y-px before:absolute before:-left-2 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary dark:border-sidebar-primary/30 dark:bg-sidebar-primary/16 dark:shadow-[0_20px_34px_-24px_rgba(37,99,235,0.95)]";
  const compactTileClassName = (active: boolean) =>
    cn(
      "relative flex h-10 w-full items-center justify-center rounded-[18px] border border-white/75 bg-white/56 text-sidebar-foreground/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition-[background-color,border-color,color,box-shadow,transform] duration-200 motion-safe:ease-out motion-safe:hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar hover:border-white hover:bg-white/78 hover:text-sidebar-foreground dark:border-white/8 dark:bg-white/4 dark:text-sidebar-foreground/72 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:border-white/12 dark:hover:bg-white/7",
      active && compactActiveItemClassName,
    );

  const getUtilityLinkClassName = (active: boolean, compact = false) =>
    cn(
      buttonVariants({
        variant: "ghost",
        size: "sm",
        className:
          "h-8 flex-1 rounded-full border border-white/80 bg-white/60 px-3 text-[0.78rem] font-medium text-sidebar-foreground/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition-[background-color,border-color,color,box-shadow,transform] duration-200 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar hover:border-white hover:bg-white/88 hover:text-sidebar-foreground active:translate-y-0 dark:border-white/6 dark:bg-white/4 dark:text-sidebar-foreground/66 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:border-white/10 dark:hover:bg-white/7",
      }),
      compact && "relative h-9 w-full flex-none justify-center overflow-visible rounded-[18px] px-0",
      active && !compact &&
        "border-sidebar-border/70 bg-white/92 text-sidebar-foreground shadow-[0_12px_24px_-20px_rgba(15,23,42,0.45),inset_0_1px_0_rgba(255,255,255,0.94)] hover:bg-white/92 dark:bg-white/8 dark:shadow-[0_20px_34px_-26px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:bg-white/8",
      active && compact && compactActiveItemClassName,
    );

  const getNavItemClassName = ({
    active,
    compact,
    isLocked,
    withTrailing,
  }: {
    active: boolean;
    compact: boolean;
    isLocked: boolean;
    withTrailing: boolean;
  }) =>
    cn(
      buttonVariants({
        variant: "ghost",
        className:
          "h-10 rounded-[18px] border border-transparent px-3.5 text-[0.92rem] font-medium shadow-none transition-[background-color,border-color,color,box-shadow,transform] duration-200 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar active:translate-y-0",
      }),
      compact && "relative mx-auto size-10 justify-center overflow-visible px-0",
      compact ? "justify-center" : withTrailing ? "justify-between" : "justify-start",
      active && !compact
        ? "border-sidebar-border/70 bg-white/84 text-sidebar-foreground shadow-[0_14px_26px_-22px_rgba(15,23,42,0.5),inset_0_1px_0_rgba(255,255,255,0.95)] hover:bg-white/84 dark:bg-white/8 dark:shadow-[0_20px_36px_-28px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:bg-white/8"
        : "text-sidebar-foreground/62 hover:border-white hover:bg-white/64 hover:text-sidebar-foreground dark:text-sidebar-foreground/66 dark:hover:border-white/10 dark:hover:bg-white/6",
      active && compact && compactActiveItemClassName,
      isLocked &&
        "cursor-not-allowed border-transparent bg-transparent text-sidebar-foreground/34 opacity-100 hover:border-transparent hover:bg-transparent hover:text-sidebar-foreground/34",
    );

  const getProjectLinkClassName = (active: boolean, compact = false) =>
    cn(
      buttonVariants({
        variant: "ghost",
        className:
          "h-10 rounded-[18px] border border-transparent px-3.5 text-[0.9rem] font-medium shadow-none transition-[background-color,border-color,color,box-shadow,transform] duration-200 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar active:translate-y-0",
      }),
      compact ? "relative size-10 justify-center overflow-visible px-0" : "w-full justify-start gap-2.5",
      "text-sidebar-foreground/68",
      active && !compact
        ? "border-sidebar-border/70 bg-white/84 text-sidebar-foreground shadow-[0_14px_26px_-22px_rgba(15,23,42,0.5),inset_0_1px_0_rgba(255,255,255,0.95)] hover:bg-white/84 dark:bg-white/8 dark:shadow-[0_20px_36px_-28px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:bg-white/8"
        : "hover:border-white hover:bg-white/64 hover:text-sidebar-foreground dark:hover:border-white/10 dark:hover:bg-white/6",
      active && compact && compactActiveItemClassName,
    );

  const workspaceDisplayName = workspaceName ?? "Workspace";
  const workspaceMonogram = hasSelectedWorkspace ? getInitials(workspaceDisplayName) : "?";
  const isWorkspaceHomeActive = Boolean(resolvedWorkspaceId) && pathname === `/workspace/${resolvedWorkspaceId}`;
  const workspaceSwitcherLabel = hasSelectedWorkspace ? `${workspaceDisplayName} workspace switcher` : "Workspace switcher";
  const collapseToggle = (
    <button
      type="button"
      aria-label={isCompactSidebar ? "Expand sidebar" : "Collapse sidebar"}
      onClick={handleSidebarToggle}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full border border-white/70 bg-white/55 text-sidebar-foreground/58 transition-colors hover:border-white hover:bg-white/78 hover:text-sidebar-foreground dark:border-white/8 dark:bg-white/4 dark:text-sidebar-foreground/62 dark:hover:border-white/12 dark:hover:bg-white/7",
        isCompactSidebar ? "relative" : "absolute right-0",
      )}
    >
      {isCompactSidebar ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
    </button>
  );

  return (
    <TooltipProvider delay={120} closeDelay={0}>
      <aside
        className={cn(
          "relative hidden shrink-0 border-r border-sidebar-border/55 bg-sidebar/88 py-5 text-sidebar-foreground transition-[width,padding] duration-300 md:sticky md:top-0 md:block md:h-screen md:overflow-y-auto md:supports-[backdrop-filter]:bg-sidebar/72 md:supports-[backdrop-filter]:backdrop-blur-2xl dark:border-sidebar-border/90 dark:bg-sidebar dark:supports-[backdrop-filter]:bg-sidebar/92",
          isCompactSidebar ? "w-[5.5rem] px-2.5" : "w-80 px-4",
        )}
        style={!isCompactSidebar ? { width: sidebarWidth } : undefined}
      >
        {!isCompactSidebar ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onPointerDown={handleSidebarResizeStart}
            className="absolute right-0 top-0 hidden h-full w-2 -translate-x-1/2 cursor-col-resize md:block"
          />
        ) : null}
        <div className={cn("flex min-h-full flex-col", isCompactSidebar ? "gap-1.5" : "gap-3")}>
        <div className={cn("relative flex h-7 items-center", isCompactSidebar ? "justify-center" : "justify-center px-1")}>
          {!isCompactSidebar ? (
            <div className="absolute left-1 flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-rose-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]" />
              <span className="size-2.5 rounded-full bg-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]" />
              <span className="size-2.5 rounded-full bg-emerald-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]" />
            </div>
          ) : null}
          {!isCompactSidebar ? (
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-sidebar-foreground/34">Vince</p>
          ) : null}
          {isCompactSidebar ? <CompactRailTooltip label="Expand sidebar">{collapseToggle}</CompactRailTooltip> : collapseToggle}
        </div>

        <div className={cn(panelClassName, isCompactSidebar ? "p-1.5" : "p-4")}>
          {isCompactSidebar ? (
            <div className="flex flex-col items-center gap-1.5">
              <Popover open={isWorkspaceSwitcherOpen} onOpenChange={handleWorkspaceSwitcherOpenChange}>
                <PopoverTrigger
                  render={
                    <button
                      ref={workspaceTriggerRef}
                      type="button"
                      aria-label={hasSelectedWorkspace ? `${workspaceDisplayName} workspace switcher` : workspaceSwitcherLabel}
                      className={cn(
                        compactTileClassName(isWorkspaceHomeActive || isWorkspaceSwitcherOpen),
                        isWorkspaceSwitcherOpen && "ring-2 ring-sidebar-primary/45 ring-offset-2 ring-offset-sidebar",
                      )}
                    >
                      {hasSelectedWorkspace ? (
                        <Avatar size="sm">
                          <AvatarFallback>{workspaceMonogram}</AvatarFallback>
                        </Avatar>
                      ) : (
                        <Layers3 className="size-4" />
                      )}
                      <span className="absolute bottom-1 right-1 rounded-full bg-white/88 p-0.5 text-sidebar-foreground/60 shadow-[0_4px_10px_-8px_rgba(15,23,42,0.6)] dark:bg-[#1b2028] dark:text-sidebar-foreground/72">
                        <ChevronsUpDown className="size-2.5" />
                      </span>
                      {workspaceChatUnreadCount > 0 ? (
                        <span className="absolute left-2 top-2 size-2 rounded-full bg-sidebar-primary" />
                      ) : null}
                    </button>
                  }
                />
                <PopoverContent side="right" sideOffset={14} className="w-80 rounded-[24px] p-2.5">
                  <div className="px-2 pb-2 pt-1">
                    <p className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-white/48">Workspace switcher</p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{workspaceDisplayName}</p>
                    {orderedWorkspaces.length > 7 ? (
                      <div className="relative mt-3" data-switcher-panel="true">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/34" />
                        <Input
                          value={workspaceSearchQuery}
                          onChange={(event) => setWorkspaceSearchQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowDown" || event.key === "Home") {
                              event.preventDefault();
                              focusSwitcherItemFromPanel(event.currentTarget.closest("[data-switcher-panel='true']"), "first");
                            }

                            if (event.key === "End") {
                              event.preventDefault();
                              focusSwitcherItemFromPanel(event.currentTarget.closest("[data-switcher-panel='true']"), "last");
                            }
                          }}
                          placeholder="Search workspaces"
                          className="h-9 rounded-[16px] border-white/10 bg-white/8 pl-9 text-sm text-white placeholder:text-white/34 focus-visible:border-white/16 focus-visible:ring-white/20 dark:bg-white/6"
                        />
                      </div>
                    ) : null}
                  </div>
                  {workspaceSwitcherSections.length > 0 ? (
                    <div data-switcher-panel="true" className="max-h-80 space-y-3 overflow-y-auto pr-1">
                      {workspaceSwitcherSections.map((section) => (
                        <div key={section.key}>
                          <p className="px-2 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-white/34">
                            {section.label}
                          </p>
                          <div data-switcher-list="true" className="space-y-1">
                            {section.items.map((workspace) => {
                              const href = `/workspace/${workspace.id}`;
                              const isCurrentWorkspace = resolvedWorkspaceId === workspace.id;
                              const isPinnedWorkspace = pinnedWorkspaceIdSet.has(workspace.id);
                              const isRecentWorkspace = recentWorkspaceIdSet.has(workspace.id);
                              const workspaceMetaLabel = isPinnedWorkspace
                                ? "Pinned workspace"
                                : isRecentWorkspace
                                  ? "Recent workspace"
                                  : "Workspace";

                              return (
                                <div
                                  key={workspace.id}
                                  className={cn(
                                    "group flex items-center gap-2 rounded-[18px] border border-transparent px-2 py-2 text-white/82 transition-[background-color,border-color,color] duration-150",
                                    isCurrentWorkspace && "border-white/10 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
                                  )}
                                >
                                  <Link
                                    href={href}
                                    data-switcher-item="true"
                                    onClick={() => {
                                      setCurrentWorkspaceId(workspace.id);
                                      rememberRecentWorkspace(workspace.id);
                                      handleWorkspaceSwitcherOpenChange(false);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Escape") {
                                        event.preventDefault();
                                        handleWorkspaceSwitcherOpenChange(false);
                                        return;
                                      }

                                      handleSwitcherItemKeyDown(event);
                                    }}
                                    className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] px-1 py-0.5 text-left text-white/82 transition-[background-color,border-color,color,transform,box-shadow] duration-150 motion-safe:ease-out motion-safe:hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)] hover:text-white"
                                  >
                                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[0.65rem] font-semibold text-white">
                                      {getInitials(workspace.name).slice(0, 2)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium">{workspace.name}</p>
                                      <p className="mt-0.5 text-[0.68rem] text-white/46">{workspaceMetaLabel}</p>
                                    </div>
                                    {isCurrentWorkspace ? <span className="text-[0.68rem] font-medium text-white/54">Open</span> : null}
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      togglePinnedWorkspace(workspace.id);
                                    }}
                                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white/44 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)]"
                                    aria-label={isPinnedWorkspace ? `Unpin ${workspace.name}` : `Pin ${workspace.name}`}
                                  >
                                    <Star className={cn("size-4", isPinnedWorkspace && "fill-current text-amber-300")} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-white/10 bg-white/4 px-3 py-4 text-sm leading-6 text-white/58">
                      {workspaceSearchQuery ? "No workspaces match that search." : "No workspaces found yet."}
                    </div>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <Link
                      href="/dashboard"
                      onClick={() => handleWorkspaceSwitcherOpenChange(false)}
                      className="flex h-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/6 text-[0.76rem] font-medium text-white/82 transition-[background-color,border-color,color,transform] duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)] hover:border-white/14 hover:bg-white/10 hover:text-white motion-safe:hover:-translate-y-px"
                    >
                      All workspaces
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        handleWorkspaceSwitcherOpenChange(false);
                        router.push("/create-workspace");
                      }}
                      className="flex h-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/6 text-[0.76rem] font-medium text-white/82 transition-[background-color,border-color,color,transform] duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)] hover:border-white/14 hover:bg-white/10 hover:text-white motion-safe:hover:-translate-y-px"
                    >
                      Create or join
                    </button>
                  </div>
                  <p className="mt-2 px-2 text-[0.66rem] text-white/40">Keyboard: Arrow keys move focus, Home and End jump, Escape closes.</p>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/38">Current workspace</p>
                  {isWorkspaceLoading ? (
                    <div className="space-y-2 pt-2">
                      <div className="h-5 w-40 animate-pulse rounded-full bg-white/80 dark:bg-white/8" />
                      <div className="h-4 w-28 animate-pulse rounded-full bg-white/65 dark:bg-white/6" />
                    </div>
                  ) : !hasSelectedWorkspace ? (
                    <p className="pt-2 text-sm leading-6 text-sidebar-foreground/56">
                      Select a workspace from the workspace list to view its members, projects, and live updates.
                    </p>
                  ) : (
                    <>
                      <p className="truncate pt-2 text-[1.05rem] font-semibold text-sidebar-foreground">{workspaceDisplayName}</p>
                      <p className="pt-1 text-sm text-sidebar-foreground/56">
                        {(workspaceMemberCount ?? 0).toLocaleString()} members · {(workspaceProjectCount ?? 0).toLocaleString()} projects
                      </p>
                    </>
                  )}
                </div>
                {hasSelectedWorkspace ? (
                  <span className="rounded-full border border-white/80 bg-white/78 px-2.5 py-1 text-[0.68rem] font-medium text-sidebar-foreground/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:border-white/6 dark:bg-white/6 dark:text-sidebar-foreground/52 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    Live
                  </span>
                ) : null}
              </div>

              {hasSelectedWorkspace && !isWorkspaceLoading ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-[20px] border border-white/75 bg-white/64 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-white/6 dark:bg-white/4 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Members</p>
                    <p className="mt-1 text-sm font-semibold text-sidebar-foreground">{(workspaceMemberCount ?? 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/75 bg-white/64 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-white/6 dark:bg-white/4 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Projects</p>
                    <p className="mt-1 text-sm font-semibold text-sidebar-foreground">{(workspaceProjectCount ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link href="/dashboard" className={getUtilityLinkClassName(pathname === "/dashboard")}>Workspace list</Link>
                <Link href="/create-workspace" className={getUtilityLinkClassName(pathname === "/create-workspace")}>Create or join</Link>
                <button
                  type="button"
                  onClick={() => setIsSwitcherPaletteOpen(true)}
                  className={cn(getUtilityLinkClassName(isSwitcherPaletteOpen), "col-span-2 justify-between")}
                >
                  <span className="inline-flex items-center gap-2">
                    <Command className="size-4" />
                    Quick switch
                  </span>
                  <span className="text-[0.68rem] font-medium text-sidebar-foreground/42">Ctrl/Cmd K</span>
                </button>
              </div>
            </>
          )}
        </div>

        <div className={cn(panelClassName, isCompactSidebar ? "p-1.5" : "p-2")}>
          {!isCompactSidebar ? (
            <div className="mb-2 flex items-center justify-between">
              <h2 className={sectionLabelClassName}>Workspace</h2>
              {workspaceChatUnreadCount > 0 ? (
                <Badge className="border-transparent bg-sidebar-primary/10 px-2 text-[0.68rem] font-medium text-sidebar-primary shadow-none hover:bg-sidebar-primary/10">
                  {workspaceChatUnreadCount} unread
                </Badge>
              ) : null}
            </div>
          ) : null}

          <nav className="space-y-1">
            {workspaceNav.map((item) => {
              const Icon = item.icon;
              const href = getWorkspaceNavHref(item.key);
              const active = isWorkspaceNavActive(item.key);
              const isLocked = item.requiresWorkspace && !hasSelectedWorkspace;
              const sharedClassName = getNavItemClassName({
                active,
                compact: isCompactSidebar,
                isLocked,
                withTrailing: item.key === "chat" && !isLocked && workspaceChatUnreadCount > 0,
              });

              const content = (
                <>
                  <span className={cn("inline-flex items-center", isCompactSidebar ? "justify-center" : "gap-2.5")}>
                    <Icon className="size-4" />
                    {!isCompactSidebar ? item.label : null}
                  </span>
                  {!isCompactSidebar && item.key === "chat" && !isLocked && workspaceChatUnreadCount > 0 ? (
                    <Badge className="border-transparent bg-sidebar-primary/10 px-2 text-[0.68rem] font-medium text-sidebar-primary shadow-none hover:bg-sidebar-primary/10">
                      {workspaceChatUnreadCount}
                    </Badge>
                  ) : null}
                  {isCompactSidebar && item.key === "chat" && !isLocked && workspaceChatUnreadCount > 0 ? (
                    <span className="absolute right-2 top-2 size-2 rounded-full bg-sidebar-primary" />
                  ) : null}
                </>
              );

              const tooltipLabel = isLocked ? `${item.label} · Select a workspace first` : item.label;

              if (href) {
                const link = (
                  <Link href={href} className={sharedClassName} aria-label={tooltipLabel}>
                    {content}
                  </Link>
                );

                return isCompactSidebar ? (
                  <div key={item.key} className="flex justify-center">
                    <CompactRailTooltip label={tooltipLabel}>{link}</CompactRailTooltip>
                  </div>
                ) : (
                  <div key={item.key}>{link}</div>
                );
              }

              const lockedItem = (
                <div aria-disabled="true" className={sharedClassName}>
                  {content}
                </div>
              );

              return isCompactSidebar ? (
                <div key={item.key} className="flex justify-center">
                  <CompactRailTooltip label={tooltipLabel}>{lockedItem}</CompactRailTooltip>
                </div>
              ) : (
                <div key={item.key}>{lockedItem}</div>
              );
            })}
          </nav>
        </div>

        <div className={cn(panelClassName, isCompactSidebar ? "p-1.5" : "p-2")}>
          {!isCompactSidebar ? (
            <div className="mb-2 flex items-center justify-between">
              <h3 className={sectionLabelClassName}>Projects</h3>
              {hasSelectedWorkspace ? (
                <span className="pr-2 text-[0.72rem] font-medium text-sidebar-foreground/42">{workspaceProjects.length.toLocaleString()}</span>
              ) : null}
            </div>
          ) : null}

          {isCompactSidebar ? (
            <div className="space-y-1.5">
              {resolvedWorkspaceId ? (
                <Popover open={isProjectSwitcherOpen} onOpenChange={handleProjectSwitcherOpenChange}>
                  <PopoverTrigger
                    render={
                      <button
                        ref={projectTriggerRef}
                        type="button"
                        aria-label={activeProject ? `${activeProject.name} project switcher` : `Project switcher for ${workspaceDisplayName}`}
                        className={cn(
                          compactTileClassName(Boolean(activeProjectId) || isProjectSwitcherOpen),
                          isProjectSwitcherOpen && "ring-2 ring-sidebar-primary/45 ring-offset-2 ring-offset-sidebar",
                        )}
                      >
                        {activeProject ? (
                          <span className="relative inline-flex size-7 items-center justify-center rounded-full bg-white/80 text-[0.65rem] font-semibold text-sidebar-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:bg-white/8 dark:text-sidebar-foreground/86 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                            {getInitials(activeProject.name).slice(0, 2)}
                            <span
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-white dark:ring-[#121317]",
                                projectPhaseDot[activeProject.phase] ?? "bg-slate-400",
                              )}
                            />
                          </span>
                        ) : (
                          <FolderKanban className="size-4" />
                        )}
                        <span className="absolute bottom-1 right-1 rounded-full bg-white/88 p-0.5 text-sidebar-foreground/60 shadow-[0_4px_10px_-8px_rgba(15,23,42,0.6)] dark:bg-[#1b2028] dark:text-sidebar-foreground/72">
                          <ChevronsUpDown className="size-2.5" />
                        </span>
                      </button>
                    }
                  />
                  <PopoverContent side="right" sideOffset={14} className="w-80 rounded-[24px] p-2.5">
                    <div className="px-2 pb-2 pt-1">
                      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-white/48">Project switcher</p>
                      <p className="mt-1 truncate text-sm font-semibold text-white">{workspaceDisplayName}</p>
                      {orderedProjects.length > 7 ? (
                        <div className="relative mt-3" data-switcher-panel="true">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/34" />
                          <Input
                            value={projectSearchQuery}
                            onChange={(event) => setProjectSearchQuery(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowDown" || event.key === "Home") {
                                event.preventDefault();
                                focusSwitcherItemFromPanel(event.currentTarget.closest("[data-switcher-panel='true']"), "first");
                              }

                              if (event.key === "End") {
                                event.preventDefault();
                                focusSwitcherItemFromPanel(event.currentTarget.closest("[data-switcher-panel='true']"), "last");
                              }
                            }}
                            placeholder="Search projects"
                            className="h-9 rounded-[16px] border-white/10 bg-white/8 pl-9 text-sm text-white placeholder:text-white/34 focus-visible:border-white/16 focus-visible:ring-white/20 dark:bg-white/6"
                          />
                        </div>
                      ) : null}
                    </div>
                    {projectSwitcherSections.length > 0 ? (
                      <div data-switcher-panel="true" className="max-h-80 space-y-3 overflow-y-auto pr-1">
                        {projectSwitcherSections.map((section) => (
                          <div key={section.key}>
                            <p className="px-2 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-white/34">
                              {section.label}
                            </p>
                            <div data-switcher-list="true" className="space-y-1">
                              {section.items.map((project) => {
                                const boardHref = `/workspace/${resolvedWorkspaceId}/project/${project.id}/board`;
                                const overviewHref = `/workspace/${resolvedWorkspaceId}/project/${project.id}/overview`;
                                const isCurrentProject = activeProjectId === project.id;
                                const isPinnedProject = pinnedProjectIdSet.has(project.id);

                                return (
                                  <div
                                    key={project.id}
                                    className={cn(
                                      "group flex items-center gap-2 rounded-[18px] border border-transparent px-2 py-2 text-white/82 transition-[background-color,border-color,color] duration-150",
                                      isCurrentProject && "border-white/10 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
                                    )}
                                  >
                                    <Link
                                      href={boardHref}
                                      onClick={() => {
                                        rememberRecentProject(resolvedWorkspaceId, project.id);
                                        handleProjectSwitcherOpenChange(false);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Escape") {
                                          event.preventDefault();
                                          handleProjectSwitcherOpenChange(false);
                                          return;
                                        }

                                        handleSwitcherItemKeyDown(event);
                                      }}
                                      data-switcher-item="true"
                                      className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] px-1 py-0.5 text-left text-white/82 transition-[background-color,border-color,color,transform] duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)] hover:text-white motion-safe:hover:-translate-y-px"
                                    >
                                      <span className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[0.65rem] font-semibold text-white">
                                        {getInitials(project.name).slice(0, 2)}
                                        <span
                                          className={cn(
                                            "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-[rgba(15,18,24,0.96)]",
                                            projectPhaseDot[project.phase] ?? "bg-slate-400",
                                          )}
                                        />
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{project.name}</p>
                                        <p className="mt-0.5 text-[0.68rem] text-white/46">
                                          {isPinnedProject ? "Pinned project" : project.status === "archived" ? "Archived" : project.phase.replaceAll("_", " ")}
                                        </p>
                                      </div>
                                      {isCurrentProject ? <span className="text-[0.68rem] font-medium text-white/54">Open</span> : null}
                                    </Link>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          togglePinnedProject(resolvedWorkspaceId, project.id);
                                        }}
                                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white/44 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)]"
                                        aria-label={isPinnedProject ? `Unpin ${project.name}` : `Pin ${project.name}`}
                                      >
                                        <Star className={cn("size-4", isPinnedProject && "fill-current text-amber-300")} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          rememberRecentProject(resolvedWorkspaceId, project.id);
                                          handleProjectSwitcherOpenChange(false);
                                          router.push(overviewHref);
                                        }}
                                        className="inline-flex h-8 shrink-0 items-center justify-center rounded-full px-2 text-[0.66rem] font-medium text-white/56 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)]"
                                      >
                                        View
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-white/10 bg-white/4 px-3 py-4 text-sm leading-6 text-white/58">
                        {projectSearchQuery ? "No projects match that search." : "This workspace has no projects yet."}
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <Link
                        href={`/workspace/${resolvedWorkspaceId}`}
                        onClick={() => handleProjectSwitcherOpenChange(false)}
                        className="flex h-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/6 text-[0.76rem] font-medium text-white/82 transition-[background-color,border-color,color,transform] duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)] hover:border-white/14 hover:bg-white/10 hover:text-white motion-safe:hover:-translate-y-px"
                      >
                        Workspace
                      </Link>
                      <button
                        type="button"
                        className="flex h-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/6 text-[0.76rem] font-medium text-white/82 transition-[background-color,border-color,color,transform] duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)] hover:border-white/14 hover:bg-white/10 hover:text-white motion-safe:hover:-translate-y-px"
                        onClick={() => {
                          handleProjectSwitcherOpenChange(false);
                          setIsProjectModalOpen(true);
                        }}
                      >
                        New project
                      </button>
                    </div>
                    <p className="mt-2 px-2 text-[0.66rem] text-white/40">Keyboard: Arrow keys move focus, Home and End jump, Escape closes.</p>
                  </PopoverContent>
                </Popover>
              ) : (
                <CompactRailTooltip label="Select a workspace first">
                  <div aria-disabled="true" className={cn(compactTileClassName(false), "cursor-not-allowed text-sidebar-foreground/34") }>
                    <FolderKanban className="size-4" />
                  </div>
                </CompactRailTooltip>
              )}

              {resolvedWorkspaceId && activeProject ? (
                <div className="space-y-1">
                  {projectTabs.map((tab) => {
                    const Icon = tab.icon;
                    const href = `/workspace/${resolvedWorkspaceId}/project/${activeProject.id}/${tab.slug}`;
                    const active = pathname === href;

                    return (
                      <CompactRailTooltip key={tab.slug} label={`${tab.label} · ${activeProject.name}`}>
                        <Link
                          href={href}
                          className={getNavItemClassName({ active, compact: true, isLocked: false, withTrailing: false })}
                          aria-label={`${tab.label} view`}
                        >
                          <Icon className="size-4" />
                        </Link>
                      </CompactRailTooltip>
                    );
                  })}
                </div>
              ) : null}

            </div>
          ) : (
            <>
              <div className="space-y-1">
                {orderedProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={resolvedWorkspaceId ? `/workspace/${resolvedWorkspaceId}/project/${project.id}/board` : "/dashboard"}
                    onClick={() => {
                      if (resolvedWorkspaceId) {
                        rememberRecentProject(resolvedWorkspaceId, project.id);
                      }
                    }}
                    className={getProjectLinkClassName(activeProjectId === project.id)}
                  >
                    <span className={`size-2 rounded-full ${projectPhaseDot[project.phase] ?? "bg-slate-400"}`} />
                    <span className="truncate">{project.name}</span>
                    {pinnedProjectIdSet.has(project.id) ? (
                      <Star className="ml-auto size-3.5 fill-current text-amber-400" />
                    ) : null}
                    {project.status === "archived" ? (
                      <span className="ml-auto text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Archived</span>
                    ) : null}
                  </Link>
                ))}
                {!hasSelectedWorkspace ? (
                  <p className="rounded-[20px] border border-dashed border-sidebar-border/60 bg-white/34 px-3 py-3 text-sm leading-6 text-sidebar-foreground/52 dark:bg-white/3 dark:text-sidebar-foreground/46">
                    Pick a workspace first before opening or creating projects.
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                disabled={!resolvedWorkspaceId}
                className="mt-2 w-full rounded-[18px] border border-dashed border-sidebar-border/65 bg-white/42 px-3.5 py-2.5 text-left text-sm font-medium text-sidebar-foreground/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition-[background-color,border-color,color,box-shadow] duration-200 enabled:cursor-pointer enabled:hover:border-white enabled:hover:bg-white/72 enabled:hover:text-sidebar-foreground dark:bg-white/4 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:enabled:hover:border-white/10 dark:enabled:hover:bg-white/7"
                onClick={() => setIsProjectModalOpen(true)}
              >
                + New project
              </button>
            </>
          )}
        </div>

        {resolvedWorkspaceId && activeProject && !isCompactSidebar ? (
          <div className={cn(panelClassName, "p-2")}>
            <div className="mb-2 px-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/38">Project views</p>
              <p className="mt-1 truncate text-sm font-semibold text-sidebar-foreground">{activeProject.name}</p>
            </div>
            <div className="space-y-1">
              {projectTabs.map((tab) => {
                const Icon = tab.icon;
                const href = `/workspace/${resolvedWorkspaceId}/project/${activeProject.id}/${tab.slug}`;
                const active = pathname === href;

                return (
                  <Link
                    key={tab.slug}
                    href={href}
                    className={getNavItemClassName({ active, compact: false, isLocked: false, withTrailing: false })}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className={cn(panelClassName, isCompactSidebar ? "p-1.5" : "p-3")}>
          <div
            className={cn(
              "rounded-[22px] border border-white/75 bg-white/64 shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] dark:border-white/6 dark:bg-white/4 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
              isCompactSidebar ? "flex justify-center p-1.5" : "flex items-center gap-3 p-3",
            )}
          >
            {isCompactSidebar ? (
              <CompactRailTooltip label={currentUser.displayName}>
                <div className="flex justify-center">
                  <Avatar>
                    <AvatarFallback>{getInitials(currentUser.displayName)}</AvatarFallback>
                  </Avatar>
                </div>
              </CompactRailTooltip>
            ) : (
              <Avatar>
                <AvatarFallback>{getInitials(currentUser.displayName)}</AvatarFallback>
              </Avatar>
            )}
            {!isCompactSidebar ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-sidebar-foreground">{currentUser.displayName}</p>
                <p className="truncate text-xs text-sidebar-foreground/52">{currentUser.email ?? "Signed-in account"}</p>
              </div>
            ) : null}
          </div>
          <div className={cn(isCompactSidebar ? "mt-1.5 grid grid-cols-1 gap-1.5" : "mt-2 grid grid-cols-2 gap-2")}>
            {isCompactSidebar ? (
              <CompactRailTooltip label="Help">
                <Link href="/help" className={getUtilityLinkClassName(pathname === "/help", true)} aria-label="Help">
                  <span className="inline-flex items-center justify-center">
                    <LifeBuoy className="size-4" />
                  </span>
                </Link>
              </CompactRailTooltip>
            ) : (
              <Link href="/help" className={getUtilityLinkClassName(pathname === "/help")}>
                <span className="inline-flex items-center gap-2">
                  <LifeBuoy className="size-4" />
                  Help
                </span>
              </Link>
            )}
            {isCompactSidebar ? (
              <CompactRailTooltip label="Account">
                <Link href="/settings" className={getUtilityLinkClassName(pathname === "/settings", true)} aria-label="Account settings">
                  <span className="inline-flex items-center justify-center">
                    <Settings2 className="size-4" />
                  </span>
                </Link>
              </CompactRailTooltip>
            ) : (
              <Link href="/settings" className={getUtilityLinkClassName(pathname === "/settings")}>
                <span className="inline-flex items-center gap-2">
                  <Settings2 className="size-4" />
                  Account
                </span>
              </Link>
            )}
            <form action={logoutAction} className={cn(!isCompactSidebar && "col-span-2")}>
              {isCompactSidebar ? (
                <CompactRailTooltip label="Sign out">
                  <button type="submit" className={cn(getUtilityLinkClassName(false, true), "w-full")} aria-label="Sign out">
                    <span className="inline-flex items-center justify-center">
                      <LogOut className="size-4" />
                    </span>
                  </button>
                </CompactRailTooltip>
              ) : (
                <button type="submit" className={cn(getUtilityLinkClassName(false), "w-full")}>
                  <span className="inline-flex items-center gap-2">
                    <LogOut className="size-4" />
                    Sign out
                  </span>
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {resolvedWorkspaceId ? (
        <NewProjectModal
          open={isProjectModalOpen}
          onOpenChange={setIsProjectModalOpen}
          workspaceId={resolvedWorkspaceId}
          onCreated={handleProjectCreated}
        />
      ) : null}
      <Dialog open={isSwitcherPaletteOpen} onOpenChange={setIsSwitcherPaletteOpen}>
        <DialogContent className="max-w-lg rounded-[24px] border border-white/10 bg-[#0f1218] p-0 text-white shadow-[0_28px_60px_-28px_rgba(0,0,0,0.82)]">
          <DialogHeader className="border-b border-white/8 px-5 py-4">
            <DialogTitle>Quick switch</DialogTitle>
            <DialogDescription>Jump between workspaces, projects, and common actions.</DialogDescription>
          </DialogHeader>
          <div className="px-5 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/34" />
              <Input
                ref={switcherPaletteInputRef}
                value={switcherPaletteQuery}
                onChange={(event) => setSwitcherPaletteQuery(event.target.value)}
                placeholder="Search workspaces, projects, or actions"
                className="h-11 rounded-[16px] border-white/10 bg-white/6 pl-10 text-sm text-white placeholder:text-white/34 focus-visible:border-white/16 focus-visible:ring-white/20 dark:bg-white/6"
              />
            </div>
            <div className="mt-4 max-h-80 space-y-1 overflow-y-auto pr-1">
              {paletteResults.length > 0 ? (
                paletteResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.onSelect}
                    className="flex w-full items-center justify-between rounded-[16px] border border-transparent bg-white/4 px-3 py-2.5 text-left text-white/82 transition-[background-color,border-color,color,transform] duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/24 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1218] hover:border-white/10 hover:bg-white/8 hover:text-white motion-safe:hover:-translate-y-px"
                  >
                    <span className="truncate text-sm font-medium">{item.label}</span>
                    <span className="ml-3 shrink-0 text-[0.7rem] uppercase tracking-[0.16em] text-white/38">{item.meta}</span>
                  </button>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-white/10 bg-white/4 px-3 py-5 text-sm text-white/54">
                  No matches for that search.
                </div>
              )}
            </div>
            <p className="mt-3 text-[0.68rem] text-white/38">Shortcut: Ctrl/Cmd + K</p>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isCompactRailOnboardingOpen} onOpenChange={setIsCompactRailOnboardingOpen}>
        <DialogContent className="max-w-md rounded-[24px] border border-white/10 bg-[#0f1218] text-white shadow-[0_28px_60px_-28px_rgba(0,0,0,0.82)]">
          <DialogHeader>
            <DialogTitle>Compact rail</DialogTitle>
            <DialogDescription>
              The collapsed sidebar keeps workspace and project switching one click away. Hover for labels, use the switchers for pinning, and press Ctrl/Cmd + K to jump faster.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-white/74">
            <p>Workspace and project chips now surface recent and pinned items.</p>
            <p>Unread chat stays visible on the workspace chip in compact mode.</p>
          </div>
          <button
            type="button"
            onClick={markCompactRailOnboardingSeen}
            className="mt-2 inline-flex h-10 items-center justify-center rounded-[16px] border border-white/10 bg-white/8 px-4 text-sm font-medium text-white transition-colors hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28"
          >
            Continue
          </button>
        </DialogContent>
      </Dialog>
      </aside>
    </TooltipProvider>
  );
}
