"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildBrowserTimingLabel,
  emitBrowserTimingEntry,
  formatDuration,
  isBrowserRouteTimingEnabled,
  type TimingContextValue,
} from "@/lib/observability/browser-route-timing";

type BrowserRouteTimingBridgeProps = {
  name: string;
  context?: Record<string, TimingContextValue>;
};

type BrowserMountTimingMarkProps = {
  name: string;
  context?: Record<string, TimingContextValue>;
};

export function BrowserRouteTimingBridge({ name, context }: BrowserRouteTimingBridgeProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sequenceRef = useRef(0);
  const routeKey = useMemo(() => {
    const search = searchParams?.toString() ?? "";

    return search ? `${pathname}?${search}` : pathname;
  }, [pathname, searchParams]);

  useLayoutEffect(() => {
    if (!isBrowserRouteTimingEnabled) {
      return;
    }

    sequenceRef.current += 1;

    const sequence = sequenceRef.current;
    const commitAt = performance.now();
    const navigationEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    let firstFrameId = 0;
    let secondFrameId = 0;

    firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        const settledAt = performance.now();
        const metrics: Record<string, string> = {
          sequence: String(sequence),
          commitSinceNav: formatDuration(commitAt),
          settledAfterCommit: formatDuration(settledAt - commitAt),
          settledSinceNav: formatDuration(settledAt),
        };

        if (navigationEntry) {
          metrics.navType = navigationEntry.type;
        }

        emitBrowserTimingEntry({
          id: `${name}-${sequence}-${Math.round(settledAt)}`,
          kind: "route",
          name,
          route: routeKey,
          timestamp: settledAt,
          metrics,
          context,
          label: buildBrowserTimingLabel({
            prefix: "[browser-route-timing]",
            name,
            metrics: {
              ...metrics,
              route: routeKey,
            },
            context,
          }),
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
    };
  }, [context, name, routeKey]);

  return null;
}

export function BrowserMountTimingMark({ name, context }: BrowserMountTimingMarkProps) {
  const hasLoggedRef = useRef(false);
  const initialContextRef = useRef(context);

  useLayoutEffect(() => {
    if (!isBrowserRouteTimingEnabled || hasLoggedRef.current) {
      return;
    }

    hasLoggedRef.current = true;

    const mountedAt = performance.now();
    let firstFrameId = 0;
    let secondFrameId = 0;

    firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        const paintedAt = performance.now();
        const metrics: Record<string, string> = {
          mountedSinceNav: formatDuration(mountedAt),
          paintedAfterMount: formatDuration(paintedAt - mountedAt),
          paintedSinceNav: formatDuration(paintedAt),
        };

        emitBrowserTimingEntry({
          id: `${name}-${Math.round(paintedAt)}`,
          kind: "mount",
          name,
          timestamp: paintedAt,
          metrics,
          context: initialContextRef.current,
          label: buildBrowserTimingLabel({
            prefix: "[browser-mount-timing]",
            name,
            metrics,
            context: initialContextRef.current,
          }),
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
    };
  }, [name]);

  return null;
}