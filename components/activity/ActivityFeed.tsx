"use client";

import { useCallback, useEffect, useState } from "react";

import { ActivityItem } from "@/components/activity/ActivityItem";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getRealtimeNewRow } from "@/lib/supabase/realtime-payload";
import { getCurrentUserProfileSnapshot } from "@/lib/supabase/user-profiles";
import { getDisplayNameFromEmail, getMemberDisplayName } from "@/lib/utils/displayName";
import type { Database } from "@/types/database.types";

type ActivityRow = Database["public"]["Tables"]["activity_log"]["Row"];

type ActivityFeedProps = {
  memberNames?: Record<string, string>;
  workspaceId: string;
  projectId?: string | null;
};

const PAGE_SIZE = 20;

function fallbackName(actorId: string | null): string {
  if (!actorId) {
    return "System";
  }

  return getMemberDisplayName(null);
}

export function ActivityFeed({ workspaceId, projectId = null, memberNames = {} }: ActivityFeedProps) {
  const supabase = createClient();
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState("You");

  const loadChunk = useCallback(
    async (nextOffset: number, append: boolean) => {
      let query = supabase
        .from("activity_log")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(nextOffset, nextOffset + PAGE_SIZE - 1);

      if (projectId) {
        query = query.eq("project_id", projectId);
      }

      const { data } = await query;
      const rows = (data ?? []) as ActivityRow[];

      setHasMore(rows.length === PAGE_SIZE);
      setOffset(nextOffset + rows.length);
      setItems((current) => (append ? [...current, ...rows] : rows));
      setIsLoading(false);
    },
    [projectId, supabase, workspaceId],
  );

  useEffect(() => {
    const loadCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const profileSnapshot = await getCurrentUserProfileSnapshot(supabase, user);

      setCurrentUserId(user.id);
      setCurrentUserName(profileSnapshot.displayName || getDisplayNameFromEmail(user.email));
    };

    void loadCurrentUser();
  }, [supabase]);

  useEffect(() => {
    setIsLoading(true);
    void loadChunk(0, false);
  }, [loadChunk]);

  useEffect(() => {
    const channel = supabase
      .channel(`activity:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_log",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const inserted = getRealtimeNewRow<ActivityRow>(payload, "ActivityFeed.activity.insert", [
            "id",
            "workspace_id",
            "action",
          ]);

          if (!inserted) {
            return;
          }

          if (projectId && inserted.project_id !== projectId) {
            return;
          }

          setItems((current) => [inserted, ...current]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [projectId, supabase, workspaceId]);

  return (
    <section className="space-y-3 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-muted-foreground">Workspace events in real time.</p>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          <div className="surface-panel h-14 animate-pulse rounded-lg border" />
          <div className="surface-panel h-14 animate-pulse rounded-lg border" />
          <div className="surface-panel h-14 animate-pulse rounded-lg border" />
        </div>
      ) : items.length === 0 ? (
        <div className="surface-panel rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No activity yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <ActivityItem
              key={item.id}
              id={item.id}
              action={item.action}
              metadata={item.metadata}
              actorName={
                item.actor_id && item.actor_id === currentUserId
                  ? currentUserName
                  : item.actor_id
                    ? memberNames[item.actor_id] ?? fallbackName(item.actor_id)
                    : fallbackName(item.actor_id)
              }
              created_at={item.created_at}
            />
          ))}
        </ul>
      )}

      {hasMore ? (
        <Button type="button" variant="outline" onClick={() => void loadChunk(offset, true)}>
          Load more
        </Button>
      ) : null}
    </section>
  );
}
