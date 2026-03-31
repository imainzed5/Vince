"use client";

import { create } from "zustand";

import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  isAppearanceMode,
  type AppearanceMode,
} from "@/lib/appearance";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "vince:sidebar-collapsed";

function applyAppearance(mode: AppearanceMode) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.appearance = mode;
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.documentElement.style.colorScheme = mode === "dark" ? "dark" : "light";
}

function readStoredAppearance(): AppearanceMode {
  if (typeof window === "undefined") {
    return DEFAULT_APPEARANCE;
  }

  const storedValue = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);

  if (isAppearanceMode(storedValue)) {
    return storedValue;
  }

  return DEFAULT_APPEARANCE;
}

function readStoredSidebarCollapsed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

type UIState = {
  appearance: AppearanceMode;
  hasHydratedAppearance: boolean;
  hasHydratedSidebar: boolean;
  isQuickTaskModalOpen: boolean;
  isSidebarCollapsed: boolean;
  hydrateAppearance: () => void;
  hydrateSidebar: () => void;
  setAppearance: (mode: AppearanceMode) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  toggleAppearance: () => void;
  openQuickTaskModal: () => void;
  closeQuickTaskModal: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  appearance: DEFAULT_APPEARANCE,
  hasHydratedAppearance: false,
  hasHydratedSidebar: false,
  isQuickTaskModalOpen: false,
  isSidebarCollapsed: false,
  hydrateAppearance: () => {
    const appearance = readStoredAppearance();

    applyAppearance(appearance);

    set({ appearance, hasHydratedAppearance: true });
  },
  hydrateSidebar: () => {
    const isSidebarCollapsed = readStoredSidebarCollapsed();

    set({ hasHydratedSidebar: true, isSidebarCollapsed });
  },
  setAppearance: (appearance) => {
    applyAppearance(appearance);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance);
    }

    set({ appearance, hasHydratedAppearance: true });
  },
  setSidebarCollapsed: (isSidebarCollapsed) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
    }

    set({ hasHydratedSidebar: true, isSidebarCollapsed });
  },
  toggleSidebarCollapsed: () =>
    set((state) => {
      const isSidebarCollapsed = !state.isSidebarCollapsed;

      if (typeof window !== "undefined") {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
      }

      return {
        hasHydratedSidebar: true,
        isSidebarCollapsed,
      };
    }),
  toggleAppearance: () =>
    set((state) => {
      const nextAppearance = state.appearance === "dark" ? "light" : "dark";

      applyAppearance(nextAppearance);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(APPEARANCE_STORAGE_KEY, nextAppearance);
      }

      return {
        appearance: nextAppearance,
        hasHydratedAppearance: true,
      };
    }),
  openQuickTaskModal: () => set({ isQuickTaskModalOpen: true }),
  closeQuickTaskModal: () => set({ isQuickTaskModalOpen: false }),
}));
