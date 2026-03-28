"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Bell, CheckCheck } from "lucide-react";

import { RelativeTimeText } from "@/components/shared/RelativeTimeText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/hooks/useRealtime";
import type { Database } from "@/types/database.types";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

type NotificationInboxProps = {
  workspaceId: string;
};

function getNotificationHref(notification: NotificationRow): string {
  if (notification.type.startsWith("chat.")) {
    return notification.project_id
      ? `/workspace/${notification.workspace_id}/project/${notification.project_id}/chat`
      : `/workspace/${notification.workspace_id}/chat`;
  }

  if (notification.project_id) {
    return `/workspace/${notification.workspace_id}/project/${notification.project_id}/board`;
  }

  return `/workspace/${notification.workspace_id}`;
}

export function NotificationInbox({ workspaceId }: NotificationInboxProps) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  const loadNotifications = useCallback(
    async (userId: string) => {
      setIsLoading(true);

      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(24);

      setNotifications((data ?? []) as NotificationRow[]);
      setIsLoading(false);
    },
    [supabase, workspaceId],
  );

  useEffect(() => {
    const loadCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      void loadNotifications(user.id);
    };

    void loadCurrentUser();
  }, [loadNotifications, supabase]);

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!currentUserId) {
        return;
      }

      const readAt = new Date().toISOString();

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId ? { ...notification, read_at: readAt } : notification,
        ),
      );

      const { error } = await supabase
        .from("notifications")
        .update({ read_at: readAt })
        .eq("id", notificationId)
        .eq("user_id", currentUserId);

      if (error) {
        await loadNotifications(currentUserId);
      }
    },
    [currentUserId, loadNotifications, supabase],
  );

  const markAllRead = useCallback(async () => {
    if (!currentUserId || unreadCount === 0) {
      return;
    }

    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) => ({ ...notification, read_at: notification.read_at ?? readAt })));

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("workspace_id", workspaceId)
      .eq("user_id", currentUserId)
      .is("read_at", null);

    if (error) {
      await loadNotifications(currentUserId);
    }
  }, [currentUserId, loadNotifications, supabase, unreadCount, workspaceId]);

  const setupNotificationChannel = useCallback(
    (channel: RealtimeChannel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: currentUserId ? `user_id=eq.${currentUserId}` : undefined,
        },
        (payload) => {
          const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as NotificationRow;

          if (!row || row.workspace_id !== workspaceId) {
            return;
          }

          setNotifications((current) => {
            if (payload.eventType === "DELETE") {
              return current.filter((notification) => notification.id !== row.id);
            }

            if (payload.eventType === "INSERT") {
              if (current.some((notification) => notification.id === row.id)) {
                return current;
              }

              return [row, ...current].slice(0, 24);
            }

            return current.map((notification) => (notification.id === row.id ? row : notification));
          });
        },
      ),
    [currentUserId, workspaceId],
  );

  useRealtime({
    enabled: Boolean(currentUserId),
    name: `workspace:${workspaceId}:notifications`,
    supabase,
    setup: setupNotificationChannel,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" className="gap-2" />
        }
      >
        <Bell className="size-4" />
        Notifications
        {unreadCount > 0 ? <Badge>{unreadCount}</Badge> : null}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>Task updates, mentions, and reminders for this workspace.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            You are all caught up.
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-lg border p-3 ${notification.read_at ? "bg-white" : "bg-blue-50/60"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                      {!notification.read_at ? <Badge variant="secondary">Unread</Badge> : null}
                    </div>
                    {notification.body ? (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{notification.body}</p>
                    ) : null}
                    <RelativeTimeText value={notification.created_at} className="text-xs text-muted-foreground" />
                  </div>
                  {!notification.read_at ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => void markRead(notification.id)}>
                      Mark read
                    </Button>
                  ) : null}
                </div>

                <div className="mt-3">
                  <Link href={getNotificationHref(notification)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                    Open related view
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "No unread notifications"}
          </div>
          <Button type="button" variant="outline" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}