"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { getRealtimeChangedRow } from "@/lib/supabase/realtime-payload";
import { getMemberDisplayName } from "@/lib/utils/displayName";
import type {
  Project,
  Task,
  TaskDependency,
  Workspace,
  WorkspaceTaskStatusDefinition,
} from "@/types";
import type { Database } from "@/types/database.types";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type WorkspaceMemberRow = Database["public"]["Tables"]["workspace_members"]["Row"];

type MemberOption = {
  id: string;
  name: string;
  role: string;
};

type UseMyTasksLiveDataOptions = {
  currentUserId: string;
  initialDependencies: TaskDependency[];
  initialTasks: Task[];
  workspaces: Workspace[];
  projects: Project[];
  milestones: Milestone[];
  membersByWorkspace: Record<string, MemberOption[]>;
  taskStatusesByWorkspace: Record<string, WorkspaceTaskStatusDefinition[]>;
};

type MyTasksDataState = {
  dependencyItems: TaskDependency[];
  tasks: Task[];
  workspaceItems: Workspace[];
  projectItems: Project[];
  milestoneItems: Milestone[];
  workspaceMembers: Record<string, MemberOption[]>;
  workspaceTaskStatuses: Record<string, WorkspaceTaskStatusDefinition[]>;
};

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const index = items.findIndex((item) => item.id === nextItem.id);

  if (index === -1) {
    return [...items, nextItem];
  }

  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

function fallbackMemberName(): string {
  return getMemberDisplayName(null);
}

export function useMyTasksLiveData({
  currentUserId,
  initialDependencies,
  initialTasks,
  workspaces,
  projects,
  milestones,
  membersByWorkspace,
  taskStatusesByWorkspace,
}: UseMyTasksLiveDataOptions) {
  const router = useRouter();
  const supabase = createClient();
  const [dataState, setDataState] = useState<MyTasksDataState>({
    dependencyItems: initialDependencies,
    tasks: initialTasks,
    workspaceItems: workspaces,
    projectItems: projects,
    milestoneItems: milestones,
    workspaceMembers: membersByWorkspace,
    workspaceTaskStatuses: taskStatusesByWorkspace,
  });
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    setDataState({
      dependencyItems: initialDependencies,
      tasks: initialTasks,
      workspaceItems: workspaces,
      projectItems: projects,
      milestoneItems: milestones,
      workspaceMembers: membersByWorkspace,
      workspaceTaskStatuses: taskStatusesByWorkspace,
    });
  }, [
    initialDependencies,
    initialTasks,
    membersByWorkspace,
    milestones,
    projects,
    taskStatusesByWorkspace,
    workspaces,
  ]);

  const workspaceIds = useMemo(
    () => dataState.workspaceItems.map((workspace) => workspace.id),
    [dataState.workspaceItems],
  );
  const projectIds = useMemo(
    () => dataState.projectItems.map((project) => project.id),
    [dataState.projectItems],
  );

  useEffect(() => {
    if (!workspaceIds.length) {
      setRealtimeConnected(false);
      return;
    }

    const channel = supabase.channel(`my-tasks:${currentUserId}`);

    const handleWorkspaceChange = (payload: RealtimePostgresChangesPayload<Workspace>) => {
      const row = getRealtimeChangedRow<Workspace>(payload, "useMyTasksLiveData.workspaces", ["id", "name"]);

      if (!row) {
        return;
      }

      setDataState((current) => ({
        ...current,
        workspaceItems:
          payload.eventType === "DELETE"
            ? current.workspaceItems.filter((workspace) => workspace.id !== row.id)
            : upsertById(current.workspaceItems, row).sort(
                (left, right) =>
                  new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime(),
              ),
      }));
    };

    const handleProjectChange = (payload: RealtimePostgresChangesPayload<Project>) => {
      const row = getRealtimeChangedRow<Project>(payload, "useMyTasksLiveData.projects", [
        "id",
        "workspace_id",
        "name",
      ]);

      if (!row) {
        return;
      }

      setDataState((current) => {
        if (payload.eventType === "DELETE") {
          return {
            ...current,
            projectItems: current.projectItems.filter((project) => project.id !== row.id),
            tasks: current.tasks.filter((task) => task.project_id !== row.id),
            milestoneItems: current.milestoneItems.filter((milestone) => milestone.project_id !== row.id),
          };
        }

        return {
          ...current,
          projectItems: upsertById(current.projectItems, row).sort(
            (left, right) =>
              new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime(),
          ),
        };
      });
    };

    const handleTaskChange = (payload: RealtimePostgresChangesPayload<Task>) => {
      const row = getRealtimeChangedRow<Task>(payload, "useMyTasksLiveData.tasks", [
        "id",
        "project_id",
        "status",
        "priority",
        "title",
        "identifier",
      ]);

      if (!row) {
        return;
      }

      if (payload.eventType === "DELETE") {
        setSelectedTaskId((current) => (current === row.id ? null : current));
      }

      setDataState((current) => {
        if (payload.eventType === "DELETE") {
          return {
            ...current,
            tasks: current.tasks.filter((task) => task.id !== row.id),
          };
        }

        const nextTasks = upsertById(current.tasks, row).sort(
          (left, right) =>
            new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime(),
        );

        return {
          ...current,
          tasks: nextTasks,
        };
      });
    };

    const handleMilestoneChange = (payload: RealtimePostgresChangesPayload<Milestone>) => {
      const row = getRealtimeChangedRow<Milestone>(payload, "useMyTasksLiveData.milestones", [
        "id",
        "project_id",
        "name",
      ]);

      if (!row) {
        return;
      }

      setDataState((current) => {
        if (payload.eventType === "DELETE") {
          return {
            ...current,
            milestoneItems: current.milestoneItems.filter((milestone) => milestone.id !== row.id),
            tasks: current.tasks.map((task) =>
              task.milestone_id === row.id ? { ...task, milestone_id: null } : task,
            ),
          };
        }

        return {
          ...current,
          milestoneItems: upsertById(current.milestoneItems, row).sort(
            (left, right) =>
              new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime(),
          ),
        };
      });
    };

    const handleDependencyChange = (payload: RealtimePostgresChangesPayload<TaskDependency>) => {
      const row = getRealtimeChangedRow<TaskDependency>(payload, "useMyTasksLiveData.dependencies", [
        "id",
        "project_id",
        "blocked_task_id",
        "blocking_task_id",
      ]);

      if (!row) {
        return;
      }

      setDataState((current) => {
        if (payload.eventType === "DELETE") {
          return {
            ...current,
            dependencyItems: current.dependencyItems.filter((dependency) => dependency.id !== row.id),
          };
        }

        return {
          ...current,
          dependencyItems: current.dependencyItems.some((dependency) => dependency.id === row.id)
            ? current.dependencyItems.map((dependency) => (dependency.id === row.id ? row : dependency))
            : [...current.dependencyItems, row],
        };
      });
    };

    const handleWorkspaceMemberChange = (payload: RealtimePostgresChangesPayload<WorkspaceMemberRow>) => {
      const row = getRealtimeChangedRow<WorkspaceMemberRow>(
        payload,
        "useMyTasksLiveData.workspaceMembers",
        ["workspace_id", "user_id", "role"],
      );

      if (!row) {
        return;
      }

      if (row.user_id === currentUserId) {
        router.refresh();
        return;
      }

      setDataState((current) => {
        const currentMembers = current.workspaceMembers[row.workspace_id] ?? [];

        if (payload.eventType === "DELETE") {
          return {
            ...current,
            workspaceMembers: {
              ...current.workspaceMembers,
              [row.workspace_id]: currentMembers.filter((member) => member.id !== row.user_id),
            },
          };
        }

        const nextMember: MemberOption = {
          id: row.user_id,
          role: row.role,
          name: currentMembers.find((member) => member.id === row.user_id)?.name ?? fallbackMemberName(),
        };
        const nextMembers = currentMembers.some((member) => member.id === row.user_id)
          ? currentMembers.map((member) => (member.id === row.user_id ? nextMember : member))
          : [...currentMembers, nextMember];

        return {
          ...current,
          workspaceMembers: {
            ...current.workspaceMembers,
            [row.workspace_id]: nextMembers,
          },
        };
      });
    };

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "workspace_members",
        filter: `user_id=eq.${currentUserId}`,
      },
      () => {
        router.refresh();
      },
    );

    for (const workspaceId of workspaceIds) {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "workspaces",
            filter: `id=eq.${workspaceId}`,
          },
          handleWorkspaceChange,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "projects",
            filter: `workspace_id=eq.${workspaceId}`,
          },
          handleProjectChange,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "workspace_members",
            filter: `workspace_id=eq.${workspaceId}`,
          },
          handleWorkspaceMemberChange,
        );
    }

    for (const projectId of projectIds) {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tasks",
            filter: `project_id=eq.${projectId}`,
          },
          handleTaskChange,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "milestones",
            filter: `project_id=eq.${projectId}`,
          },
          handleMilestoneChange,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "task_dependencies",
            filter: `project_id=eq.${projectId}`,
          },
          handleDependencyChange,
        );
    }

    channel.subscribe((status) => {
      setRealtimeConnected(status === "SUBSCRIBED");
    });

    return () => {
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, projectIds, router, supabase, workspaceIds]);

  const updateTask = (updatedTask: Task) => {
    setDataState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task)),
    }));
  };

  const addTaskIfMissing = (createdTask: Task) => {
    setDataState((current) => ({
      ...current,
      tasks: current.tasks.some((task) => task.id === createdTask.id)
        ? current.tasks
        : [...current.tasks, createdTask],
    }));
  };

  const removeTask = (taskId: string) => {
    setSelectedTaskId((current) => (current === taskId ? null : current));
    setDataState((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
    }));
  };

  return {
    ...dataState,
    realtimeConnected,
    selectedTaskId,
    setSelectedTaskId,
    updateTask,
    addTaskIfMissing,
    removeTask,
  };
}