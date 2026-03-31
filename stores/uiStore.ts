"use client";

import { create } from "zustand";

import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  isAppearanceMode,
  type AppearanceMode,
} from "@/lib/appearance";

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

type UIState = {
  appearance: AppearanceMode;
  hasHydratedAppearance: boolean;
  isQuickTaskModalOpen: boolean;
  hydrateAppearance: () => void;
  setAppearance: (mode: AppearanceMode) => void;
  toggleAppearance: () => void;
  openQuickTaskModal: () => void;
  closeQuickTaskModal: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  appearance: DEFAULT_APPEARANCE,
  hasHydratedAppearance: false,
  isQuickTaskModalOpen: false,
  hydrateAppearance: () => {
    const appearance = readStoredAppearance();

    applyAppearance(appearance);

    set({ appearance, hasHydratedAppearance: true });
  },
  setAppearance: (appearance) => {
    applyAppearance(appearance);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance);
    }

    set({ appearance, hasHydratedAppearance: true });
  },
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
