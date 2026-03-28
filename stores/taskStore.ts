"use client";

import { create } from "zustand";

type TaskState = {
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;
};

export const useTaskStore = create<TaskState>((set) => ({
  selectedTaskId: null,
  setSelectedTaskId: (taskId) => set({ selectedTaskId: taskId }),
}));
