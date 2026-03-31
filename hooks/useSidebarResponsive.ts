"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { useUIStore } from "@/stores/uiStore";

const SIDEBAR_WIDTH_STORAGE_KEY = "vince:sidebar-width";
const SIDEBAR_AUTO_OVERRIDE_STORAGE_KEY = "vince:sidebar-auto-override";
const AUTO_COLLAPSE_BREAKPOINT = 1220;
const MIN_SIDEBAR_WIDTH = 288;
const MAX_SIDEBAR_WIDTH = 420;
const DEFAULT_SIDEBAR_WIDTH = 320;

function readStoredSidebarWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_SIDEBAR_WIDTH;
  }

  const value = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));

  if (Number.isFinite(value)) {
    return Math.min(Math.max(value, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
  }

  return DEFAULT_SIDEBAR_WIDTH;
}

function readStoredSidebarAutoOverride(): "auto" | "expanded" | "collapsed" {
  if (typeof window === "undefined") {
    return "auto";
  }

  const value = window.localStorage.getItem(SIDEBAR_AUTO_OVERRIDE_STORAGE_KEY);

  if (value === "expanded" || value === "collapsed") {
    return value;
  }

  return "auto";
}

export function useSidebarResponsive() {
  const hasHydratedSidebar = useUIStore((state) => state.hasHydratedSidebar);
  const hydrateSidebar = useUIStore((state) => state.hydrateSidebar);
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [sidebarAutoOverride, setSidebarAutoOverride] = useState<"auto" | "expanded" | "collapsed">("auto");
  const lastAutoCollapseMatchRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!hasHydratedSidebar) {
      hydrateSidebar();
    }
  }, [hasHydratedSidebar, hydrateSidebar]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSidebarWidth(readStoredSidebarWidth());
    setSidebarAutoOverride(readStoredSidebarAutoOverride());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_AUTO_OVERRIDE_STORAGE_KEY, sidebarAutoOverride);
  }, [sidebarAutoOverride]);

  useEffect(() => {
    if (!hasHydratedSidebar || typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${AUTO_COLLAPSE_BREAKPOINT}px)`);

    const applyResponsiveSidebar = (matches: boolean) => {
      const previousMatches = lastAutoCollapseMatchRef.current;
      const crossedBreakpoint = previousMatches !== null && previousMatches !== matches;

      if (crossedBreakpoint) {
        setSidebarAutoOverride("auto");
      }

      lastAutoCollapseMatchRef.current = matches;

      if (sidebarAutoOverride === "expanded") {
        if (isSidebarCollapsed) {
          setSidebarCollapsed(false);
        }

        return;
      }

      if (sidebarAutoOverride === "collapsed") {
        if (!isSidebarCollapsed) {
          setSidebarCollapsed(true);
        }

        return;
      }

      if (matches !== isSidebarCollapsed) {
        setSidebarCollapsed(matches);
      }
    };

    applyResponsiveSidebar(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      applyResponsiveSidebar(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [hasHydratedSidebar, isSidebarCollapsed, setSidebarCollapsed, sidebarAutoOverride]);

  const handleSidebarToggle = useCallback(() => {
    const nextCollapsed = !isSidebarCollapsed;

    setSidebarCollapsed(nextCollapsed);
    setSidebarAutoOverride(nextCollapsed ? "collapsed" : "expanded");
  }, [isSidebarCollapsed, setSidebarCollapsed]);

  const handleSidebarResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!hasHydratedSidebar || isSidebarCollapsed) {
        return;
      }

      const startX = event.clientX;
      const startWidth = sidebarWidth;

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        const nextWidth = Math.min(
          Math.max(startWidth + (pointerEvent.clientX - startX), MIN_SIDEBAR_WIDTH),
          MAX_SIDEBAR_WIDTH,
        );
        setSidebarWidth(nextWidth);
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [hasHydratedSidebar, isSidebarCollapsed, sidebarWidth],
  );

  return {
    isCompactSidebar: hasHydratedSidebar ? isSidebarCollapsed : false,
    sidebarWidth,
    handleSidebarResizeStart,
    handleSidebarToggle,
  };
}