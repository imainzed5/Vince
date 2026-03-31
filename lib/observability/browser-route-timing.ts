export type TimingContextValue = boolean | number | string | null | undefined;

export type BrowserTimingKind = "route" | "mount";

export type BrowserTimingEntry = {
  id: string;
  kind: BrowserTimingKind;
  name: string;
  label: string;
  route?: string;
  timestamp: number;
  metrics: Record<string, string>;
  context?: Record<string, TimingContextValue>;
};

declare global {
  interface Window {
    __vinceBrowserTimingEntries?: BrowserTimingEntry[];
  }
}

export const BROWSER_TIMING_EVENT_NAME = "vince:browser-timing";

const BROWSER_TIMING_BUFFER_LIMIT = 40;

export const isBrowserRouteTimingEnabled =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_VINCE_ENABLE_BROWSER_ROUTE_TIMING === "1";

export const isDevTimingPanelEnabled = process.env.NODE_ENV !== "production";

export function formatDuration(durationMs: number): string {
  return `${durationMs >= 100 ? durationMs.toFixed(0) : durationMs.toFixed(1)}ms`;
}

export function formatContextParts(context?: Record<string, TimingContextValue>): string[] {
  if (!context) {
    return [];
  }

  return Object.entries(context)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value === null ? "null" : String(value)}`);
}

export function buildBrowserTimingLabel({
  prefix,
  name,
  metrics,
  context,
}: {
  prefix: string;
  name: string;
  metrics: Record<string, string>;
  context?: Record<string, TimingContextValue>;
}): string {
  const parts = [prefix, name];

  for (const [key, value] of Object.entries(metrics)) {
    parts.push(`${key}=${value}`);
  }

  parts.push(...formatContextParts(context));

  return parts.join(" ");
}

export function emitBrowserTimingEntry(entry: BrowserTimingEntry) {
  if (!isBrowserRouteTimingEnabled || typeof window === "undefined") {
    return;
  }

  const currentEntries = window.__vinceBrowserTimingEntries ?? [];
  const nextEntries = [...currentEntries, entry].slice(-BROWSER_TIMING_BUFFER_LIMIT);

  window.__vinceBrowserTimingEntries = nextEntries;
  window.dispatchEvent(new CustomEvent<BrowserTimingEntry>(BROWSER_TIMING_EVENT_NAME, { detail: entry }));
  console.info(entry.label);
}

export function getBufferedBrowserTimingEntries(): BrowserTimingEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  return window.__vinceBrowserTimingEntries ?? [];
}

export function clearBufferedBrowserTimingEntries() {
  if (typeof window === "undefined") {
    return;
  }

  window.__vinceBrowserTimingEntries = [];
}