"use client";

import { create } from "zustand";

type UIState = {
  isQuickTaskModalOpen: boolean;
  openQuickTaskModal: () => void;
  closeQuickTaskModal: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  isQuickTaskModalOpen: false,
  openQuickTaskModal: () => set({ isQuickTaskModalOpen: true }),
  closeQuickTaskModal: () => set({ isQuickTaskModalOpen: false }),
}));
