import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { useRealtime } from "@/hooks/useRealtime";
import type { Task } from "@/types";
import type { Database } from "@/types/database.types";

type UseTasksOptions = {
  projectId: string;
  supabase: SupabaseClient<Database>;
  onError?: (message: string) => void;
};

export function useTasks({ projectId, supabase, onError }: UseTasksOptions) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      onError?.(error.message);
    }

    setTasks((data ?? []) as Task[]);
    setIsLoading(false);
  }, [onError, projectId, supabase]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const setupTaskChannel = useCallback(
    (channel: RealtimeChannel) =>
      channel.on(
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
              const removed = payload.old as Task;
              return current.filter((task) => task.id !== removed.id);
            }

            if (payload.eventType === "INSERT") {
              const added = payload.new as Task;

              if (current.some((task) => task.id === added.id)) {
                return current;
              }

              const withoutTemp = current.filter(
                (task) =>
                  !(task.id.startsWith("temp-") && task.identifier === added.identifier && task.title === added.title),
              );

              return [...withoutTemp, added];
            }

            const updated = payload.new as Task;
            return current.map((task) => (task.id === updated.id ? { ...task, ...updated } : task));
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
    tasks,
    setTasks,
    isLoading,
    refetch: fetchTasks,
    connected,
  };
}
