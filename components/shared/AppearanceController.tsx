"use client";

import { useEffect } from "react";

import { APPEARANCE_STORAGE_KEY } from "@/lib/appearance";
import { useUIStore } from "@/stores/uiStore";

export function AppearanceController() {
  useEffect(() => {
    const { hydrateAppearance } = useUIStore.getState();

    hydrateAppearance();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === APPEARANCE_STORAGE_KEY) {
        useUIStore.getState().hydrateAppearance();
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
}