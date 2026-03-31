import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { useRealtime } from "@/hooks/useRealtime";
import { getRealtimeNewRow, getRealtimeOldRow } from "@/lib/supabase/realtime-payload";
import type { Task, TaskDependency } from "@/types";
import type { Database } from "@/types/database.types";

type UseTasksOptions = {
  projectId: string;
  supabase: SupabaseClient<Database>;
  onError?: (message: string) => void;
};

export function useTasks({ projectId, supabase, onError }: UseTasksOptions) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);

    const [{ data, error }, { data: dependencyData, error: dependencyError }] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("task_dependencies")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
    ]);

    if (error) {
      onError?.(error.message);
    }

    if (dependencyError) {
      onError?.(dependencyError.message);
    }

    setTasks((data ?? []) as Task[]);
    setDependencies((dependencyData ?? []) as TaskDependency[]);
    setIsLoading(false);
  }, [onError, projectId, supabase]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const setupTaskChannel = useCallback(
    (channel: RealtimeChannel) =>
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tasks",
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => {
            setTasks((current) => {
              if (payload.eventType === "DELETE") {
                const removed = getRealtimeOldRow<Task>(payload, "useTasks.tasks.delete", ["id"]);

                if (!removed) {
                  return current;
                }

                return current.filter((task) => task.id !== removed.id);
              }

              if (payload.eventType === "INSERT") {
                const added = getRealtimeNewRow<Task>(payload, "useTasks.tasks.insert", [
                  "id",
                  "project_id",
                  "status",
                  "identifier",
                  "title",
                ]);

                if (!added) {
                  return current;
                }

                if (current.some((task) => task.id === added.id)) {
                  return current;
                }

                const withoutTemp = current.filter(
                  (task) =>
                    !(task.id.startsWith("temp-") && task.identifier === added.identifier && task.title === added.title),
                );

                return [...withoutTemp, added];
              }

              const updated = getRealtimeNewRow<Task>(payload, "useTasks.tasks.update", [
                "id",
                "project_id",
                "status",
                "identifier",
                "title",
              ]);

              if (!updated) {
                return current;
              }

              return current.map((task) => (task.id === updated.id ? { ...task, ...updated } : task));
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "task_dependencies",
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => {
            setDependencies((current) => {
              if (payload.eventType === "DELETE") {
                const removed = getRealtimeOldRow<TaskDependency>(payload, "useTasks.dependencies.delete", ["id"]);

                if (!removed) {
                  return current;
                }

                return current.filter((dependency) => dependency.id !== removed.id);
              }

              if (payload.eventType === "INSERT") {
                const inserted = getRealtimeNewRow<TaskDependency>(payload, "useTasks.dependencies.insert", [
                  "id",
                  "project_id",
                  "blocked_task_id",
                  "blocking_task_id",
                ]);

                if (!inserted) {
                  return current;
                }

                if (current.some((dependency) => dependency.id === inserted.id)) {
                  return current;
                }

                return [...current, inserted];
              }

              const updated = getRealtimeNewRow<TaskDependency>(payload, "useTasks.dependencies.update", [
                "id",
                "project_id",
                "blocked_task_id",
                "blocking_task_id",
              ]);

              if (!updated) {
                return current;
              }

              return current.map((dependency) => (dependency.id === updated.id ? updated : dependency));
            });
          },
        ),
    [projectId],
  );

  const { connected } = useRealtime({
    enabled: Boolean(projectId),
    name: `project:${projectId}:tasks`,
    supabase,
    setup: setupTaskChannel,
  });

  return {
    dependencies,
    tasks,
    setDependencies,
    setTasks,
    isLoading,
    refetch: fetchTasks,
    connected,
  };
}
