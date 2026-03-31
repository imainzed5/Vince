"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Clock3, Trash2, X } from "lucide-react";

import {
  BROWSER_TIMING_EVENT_NAME,
  clearBufferedBrowserTimingEntries,
  getBufferedBrowserTimingEntries,
  isDevTimingPanelEnabled,
  type BrowserTimingEntry,
} from "@/lib/observability/browser-route-timing";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_ENTRIES = 12;

function getKindLabel(kind: BrowserTimingEntry["kind"]): string {
  return kind === "route" ? "Route" : "Mount";
}

export function DevTimingPanel() {
  const [entries, setEntries] = useState<BrowserTimingEntry[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    if (!isDevTimingPanelEnabled) {
      return;
    }

    setEntries(getBufferedBrowserTimingEntries());

    const handleEntry = (event: Event) => {
      const customEvent = event as CustomEvent<BrowserTimingEntry>;

      setEntries((current) => [...current, customEvent.detail].slice(-MAX_VISIBLE_ENTRIES));
    };

    window.addEventListener(BROWSER_TIMING_EVENT_NAME, handleEntry as EventListener);

    return () => {
      window.removeEventListener(BROWSER_TIMING_EVENT_NAME, handleEntry as EventListener);
    };
  }, []);

  const visibleEntries = useMemo(() => [...entries].reverse(), [entries]);

  if (!isDevTimingPanelEnabled) {
    return null;
  }

  if (isHidden) {
    return (
      <button
        type="button"
        onClick={() => setIsHidden(false)}
        className="fixed bottom-4 right-4 z-[90] inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/92 px-3 py-2 text-sm font-medium text-slate-900 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)] backdrop-blur transition-colors hover:bg-white dark:border-white/10 dark:bg-slate-950/88 dark:text-white dark:hover:bg-slate-950"
      >
        <Clock3 className="size-4" />
        Timing
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[90] w-[22rem] max-w-[calc(100vw-2rem)] rounded-[22px] border border-slate-300/70 bg-white/92 text-slate-950 shadow-[0_24px_70px_-34px_rgba(15,23,42,0.45)] backdrop-blur xl:w-[24rem] dark:border-white/10 dark:bg-slate-950/88 dark:text-white">
      <div className="flex items-center gap-2 border-b border-slate-200/80 px-3.5 py-3 dark:border-white/10">
        <div className="inline-flex size-8 items-center justify-center rounded-full bg-sky-500/12 text-sky-700 dark:bg-sky-400/16 dark:text-sky-200">
          <Clock3 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Timing debug</p>
          <p className="truncate text-[0.7rem] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Dev-only browser timing stream
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed((current) => !current)}
          className="inline-flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          aria-label={isCollapsed ? "Expand timing panel" : "Collapse timing panel"}
        >
          {isCollapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <button
          type="button"
          onClick={() => {
            clearBufferedBrowserTimingEntries();
            setEntries([]);
          }}
          className="inline-flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          aria-label="Clear timing entries"
        >
          <Trash2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setIsHidden(true)}
          className="inline-flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          aria-label="Hide timing panel"
        >
          <X className="size-4" />
        </button>
      </div>

      {!isCollapsed ? (
        <div className="space-y-3 p-3.5">
          {visibleEntries.length > 0 ? (
            <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              {visibleEntries.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-[18px] border border-slate-200/80 bg-slate-50/88 p-3 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{entry.name}</p>
                      <p className="truncate pt-0.5 text-[0.72rem] text-slate-500 dark:text-slate-400">{entry.route ?? "Current view"}</p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[0.66rem] font-semibold uppercase tracking-[0.14em]",
                        entry.kind === "route"
                          ? "bg-sky-500/12 text-sky-700 dark:bg-sky-400/18 dark:text-sky-200"
                          : "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/18 dark:text-emerald-200",
                      )}
                    >
                      {getKindLabel(entry.kind)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(entry.metrics).map(([key, value]) => (
                      <span
                        key={key}
                        className="rounded-full bg-white px-2 py-1 text-[0.68rem] font-medium text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:bg-white/8 dark:text-slate-200"
                      >
                        {key}: {value}
                      </span>
                    ))}
                  </div>

                  {entry.context ? (
                    <div className="mt-2 grid gap-1 text-[0.72rem] text-slate-500 dark:text-slate-400">
                      {Object.entries(entry.context)
                        .filter(([, value]) => value !== undefined)
                        .map(([key, value]) => (
                          <p key={key} className="truncate">
                            {key}: {value === null ? "null" : String(value)}
                          </p>
                        ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-slate-300/80 bg-slate-50/80 px-3 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/4 dark:text-slate-400">
              No timing entries yet. Navigate within the authenticated app to populate the panel.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}