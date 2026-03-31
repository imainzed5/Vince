"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const WORKSPACE_STORE_KEY = "vince:workspace-store";

type WorkspaceState = {
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: (workspaceId: string | null) => void;
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentWorkspaceId: null,
      setCurrentWorkspaceId: (workspaceId) => set({ currentWorkspaceId: workspaceId }),
    }),
    {
      name: WORKSPACE_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
