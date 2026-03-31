"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { useRealtime } from "@/hooks/useRealtime";
import { getUnreadChatCount } from "@/lib/collaboration";
import { createClient } from "@/lib/supabase/client";
import { getRealtimeChangedRow } from "@/lib/supabase/realtime-payload";
import {
  DEFAULT_SIDEBAR_PREFERENCES,
  normalizeSidebarPreferences,
} from "@/lib/supabase/user-profiles";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { Project, UserSidebarPreferences, Workspace } from "@/types";

const MAX_RECENT_WORKSPACES = 6;

type SidebarCurrentUser = {
  id: string;
  email: string | null;
  displayName: string;
  sidebarPreferences: UserSidebarPreferences;
};

type UseSidebarWorkspaceDataOptions = {
  currentUser: SidebarCurrentUser;
  routeWorkspaceId: string | null;
  workspaceId: string | null;
  projects: Project[];
};

export function useSidebarWorkspaceData({
  currentUser,
  routeWorkspaceId,
  workspaceId,
  projects,
}: UseSidebarWorkspaceDataOptions) {
  const storedWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const resolvedWorkspaceId = routeWorkspaceId ?? workspaceId ?? storedWorkspaceId;
  const currentUserId = currentUser.id;
  const supabase = createClient();
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
  const [workspaceChatUnreadCount, setWorkspaceChatUnreadCount] = useState(0);
  const sidebarPreferencesRef = useRef(sidebarPreferences);

  useEffect(() => {
    const normalized = normalizeSidebarPreferences(currentUser.sidebarPreferences);
    setSidebarPreferences(normalized);
  }, [currentUser.sidebarPreferences]);

  useEffect(() => {
    sidebarPreferencesRef.current = sidebarPreferences;
  }, [sidebarPreferences]);

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
      setUserWorkspaces(
        workspaceIds
          .map((id) => workspacesById.get(id))
          .filter((workspace): workspace is Workspace => Boolean(workspace)),
      );
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
    (nextWorkspaceId: string) => {
      updateSidebarPreferences((current) => ({
        ...current,
        recentWorkspaceIds: [
          nextWorkspaceId,
          ...current.recentWorkspaceIds.filter((id) => id !== nextWorkspaceId),
        ].slice(0, MAX_RECENT_WORKSPACES),
      }));
    },
    [updateSidebarPreferences],
  );

  const togglePinnedWorkspace = useCallback(
    (nextWorkspaceId: string) => {
      updateSidebarPreferences((current) => ({
        ...current,
        pinnedWorkspaceIds: current.pinnedWorkspaceIds.includes(nextWorkspaceId)
          ? current.pinnedWorkspaceIds.filter((id) => id !== nextWorkspaceId)
          : [nextWorkspaceId, ...current.pinnedWorkspaceIds.filter((id) => id !== nextWorkspaceId)],
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
      return;
    }

    updateSidebarPreferences((current) => ({
      ...current,
      hasSeenCompactRailOnboarding: true,
    }));
  }, [updateSidebarPreferences]);

  const handleProjectCreated = useCallback((project: Project) => {
    setWorkspaceProjects((current) => [...current, project]);
    setWorkspaceProjectCount((current) => (typeof current === "number" ? current + 1 : 1));
  }, []);

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
          const row = getRealtimeChangedRow<{ project_id: string | null }>(
            payload,
            "useSidebarWorkspaceData.workspaceMessages",
            ["project_id"],
          );

          if (!row || row.project_id !== null) {
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

  return {
    resolvedWorkspaceId,
    setCurrentWorkspaceId,
    workspaceName,
    workspaceMemberCount,
    workspaceProjectCount,
    userWorkspaces,
    sidebarPreferences,
    workspaceProjects,
    isWorkspaceLoading,
    workspaceChatUnreadCount,
    rememberRecentWorkspace,
    togglePinnedWorkspace,
    rememberRecentProject,
    togglePinnedProject,
    markCompactRailOnboardingSeen,
    handleProjectCreated,
  };
}