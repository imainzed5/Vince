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
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getCurrentUserProfileSnapshot,
} from "@/lib/supabase/user-profiles";
import { useRealtime } from "@/hooks/useRealtime";
import type { Database } from "@/types/database.types";
import type { UserNotificationPreferences } from "@/types";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

type NotificationInboxProps = {
  workspaceId: string;
};

const NOTIFICATION_PREVIEW_LIMIT = 5;

function isReminder(notification: NotificationRow): boolean {
  return notification.type.startsWith("task.due") || notification.type === "task.overdue" || notification.type === "task.blocked_stale";
}

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

function isNotificationVisible(
  notification: NotificationRow,
  notificationPreferences: UserNotificationPreferences,
): boolean {
  if (notification.type.startsWith("chat.")) {
    return notificationPreferences.chatMentions;
  }

  if (isReminder(notification)) {
    return notificationPreferences.taskReminders;
  }

  return true;
}

export function NotificationInbox({ workspaceId }: NotificationInboxProps) {
  const supabase = useMemo(() => createClient(), []);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notificationPreferences, setNotificationPreferences] =
    useState<UserNotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const visibleNotifications = notifications.filter((notification) =>
    isNotificationVisible(notification, notificationPreferences),
  );
  const previewNotifications = visibleNotifications.slice(0, NOTIFICATION_PREVIEW_LIMIT);
  const hasOverflow = visibleNotifications.length > NOTIFICATION_PREVIEW_LIMIT;
  const unreadCount = visibleNotifications.filter((notification) => !notification.read_at).length;

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

      const profileSnapshot = await getCurrentUserProfileSnapshot(supabase, user);

      setCurrentUserId(user.id);
      setNotificationPreferences(profileSnapshot.notificationPreferences);
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
    const unreadVisibleIds = visibleNotifications
      .filter((notification) => !notification.read_at)
      .map((notification) => notification.id);

    setNotifications((current) =>
      current.map((notification) =>
        unreadVisibleIds.includes(notification.id)
          ? { ...notification, read_at: notification.read_at ?? readAt }
          : notification,
      ),
    );

    const results = await Promise.all(
      unreadVisibleIds.map((notificationId) =>
        supabase
          .from("notifications")
          .update({ read_at: readAt })
          .eq("id", notificationId)
          .eq("user_id", currentUserId),
      ),
    );

    if (results.some((result) => result.error)) {
      await loadNotifications(currentUserId);
    }
  }, [currentUserId, loadNotifications, supabase, unreadCount, visibleNotifications]);

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

  const handleNotificationNavigate = useCallback(
    (notification: NotificationRow) => {
      setPopoverOpen(false);

      if (!notification.read_at) {
        void markRead(notification.id);
      }
    },
    [markRead],
  );

  const openNotificationCenter = useCallback(() => {
    setPopoverOpen(false);
    setDialogOpen(true);
  }, []);

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger
          render={<Button type="button" variant="outline" size="icon-lg" className="relative" aria-label="Open notifications" />}
        >
          <Bell className="size-4" />
          <span className="sr-only">Open notifications</span>
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="end" side="bottom" sideOffset={10} className="w-[min(24rem,calc(100vw-1rem))] rounded-2xl border border-border bg-background p-0 text-foreground shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-xs text-muted-foreground">Task updates, mentions, and reminders.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
            </div>
          ) : previewNotifications.length === 0 ? (
            <div className="p-4">
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                You are all caught up.
              </div>
            </div>
          ) : (
            <div className="max-h-[26rem] space-y-2 overflow-y-auto p-4">
              {previewNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-xl border p-3 ${notification.read_at ? "surface-panel" : "border-blue-200 bg-blue-50/60 dark:border-blue-500/25 dark:bg-blue-500/12"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{notification.title}</p>
                        {isReminder(notification) ? <Badge variant="outline">Reminder</Badge> : null}
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
                    <Link
                      href={getNotificationHref(notification)}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => handleNotificationNavigate(notification)}
                    >
                      Open related view
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <div className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "No unread notifications"}
            </div>
            {hasOverflow ? (
              <Button type="button" variant="outline" size="sm" onClick={openNotificationCenter}>
                View all
              </Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>Task updates, mentions, and reminders for this workspace.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            You are all caught up.
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {visibleNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-lg border p-3 ${notification.read_at ? "surface-panel" : "border-blue-200 bg-blue-50/60 dark:border-blue-500/25 dark:bg-blue-500/12"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{notification.title}</p>
                      {isReminder(notification) ? <Badge variant="outline">Reminder</Badge> : null}
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
                  <Link
                    href={getNotificationHref(notification)}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    onClick={() => {
                      setDialogOpen(false);

                      if (!notification.read_at) {
                        void markRead(notification.id);
                      }
                    }}
                  >
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
    </>
  );
}