type RouteTimingContextValue = boolean | number | string | null | undefined;

type RouteTimingLogger = {
  measure<T>(label: string, action: () => Promise<T>): Promise<T>;
  finish(context?: Record<string, RouteTimingContextValue>): void;
};

const isRouteTimingEnabled =
  process.env.NODE_ENV !== "production" || process.env.VINCE_ENABLE_ROUTE_TIMING === "1";

function formatDuration(durationMs: number): string {
  return `${durationMs >= 100 ? durationMs.toFixed(0) : durationMs.toFixed(1)}ms`;
}

function formatContextValue(value: RouteTimingContextValue): string {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  return String(value);
}

export function createRouteTimingLogger(route: string): RouteTimingLogger {
  const startedAt = performance.now();
  const segments: Array<{ label: string; durationMs: number }> = [];

  return {
    async measure<T>(label: string, action: () => Promise<T>): Promise<T> {
      if (!isRouteTimingEnabled) {
        return action();
      }

      const segmentStart = performance.now();

      try {
        return await action();
      } finally {
        segments.push({
          label,
          durationMs: performance.now() - segmentStart,
        });
      }
    },

    finish(context) {
      if (!isRouteTimingEnabled) {
        return;
      }

      const parts = [`[route-timing]`, route, `total=${formatDuration(performance.now() - startedAt)}`];

      for (const segment of segments) {
        parts.push(`${segment.label}=${formatDuration(segment.durationMs)}`);
      }

      if (context) {
        for (const [key, value] of Object.entries(context)) {
          if (value !== undefined) {
            parts.push(`${key}=${formatContextValue(value)}`);
          }
        }
      }

      console.info(parts.join(" "));
    },
  };
}