import { useMemo } from "react";

import type { Workspace } from "@/types";

export function useWorkspace(workspaces: Workspace[], workspaceId: string | null) {
  return useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
    [workspaceId, workspaces],
  );
}
