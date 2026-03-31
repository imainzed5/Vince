"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { useRealtime } from "@/hooks/useRealtime";
import { createClient } from "@/lib/supabase/client";

type RealtimeRefreshSubscription = {
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  table: string;
  filter?: string;
};

type RealtimeRefreshBridgeProps = {
  name: string;
  subscriptions: RealtimeRefreshSubscription[];
  debounceMs?: number;
  enabled?: boolean;
};

export function RealtimeRefreshBridge({
  name,
  subscriptions,
  debounceMs = 200,
  enabled = true,
}: RealtimeRefreshBridgeProps) {
  const router = useRouter();
  const supabase = createClient();
  const timeoutRef = useRef<number | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      router.refresh();
    }, debounceMs);
  }, [debounceMs, router]);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const setup = useCallback(
    (channel: RealtimeChannel) => {
      let configuredChannel = channel;

      for (const subscription of subscriptions) {
        configuredChannel = configuredChannel.on(
          "postgres_changes",
          {
            event: subscription.event ?? "*",
            schema: "public",
            table: subscription.table,
            filter: subscription.filter,
          },
          () => {
            scheduleRefresh();
          },
        );
      }

      return configuredChannel;
    },
    [scheduleRefresh, subscriptions],
  );

  useRealtime({
    enabled: enabled && subscriptions.length > 0,
    name,
    supabase,
    setup,
  });

  return null;
}