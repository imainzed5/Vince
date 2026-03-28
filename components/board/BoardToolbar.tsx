import { Filter, Keyboard, ListChecks, RotateCcw, Users } from "lucide-react";

import { PRIORITY_CONFIG } from "@/components/board/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TaskPriority } from "@/types";

type BoardToolbarProps = {
  onCreateTask: () => void;
  createDisabled?: boolean;
  assigneeOptions: Array<{ id: string; name: string }>;
  assigneeFilter: string;
  onAssigneeFilterChange: (value: string) => void;
  priorityFilter: TaskPriority | "all";
  onPriorityFilterChange: (value: TaskPriority | "all") => void;
  visibleTaskCount: number;
  totalTaskCount: number;
};

export function BoardToolbar({
  onCreateTask,
  createDisabled = false,
  assigneeOptions,
  assigneeFilter,
  onAssigneeFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  visibleTaskCount,
  totalTaskCount,
}: BoardToolbarProps) {
  const hasActiveFilters = assigneeFilter !== "all" || priorityFilter !== "all";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onCreateTask} disabled={createDisabled}>
          + Add task
        </Button>
        <Button type="button" variant="outline" size="sm" disabled>
          <ListChecks className="size-4" />
          List view
        </Button>
        <div className="flex items-center gap-2 rounded-lg border px-2 py-1">
          <Users className="size-4 text-slate-500" />
          <Select value={assigneeFilter} onValueChange={(value) => onAssigneeFilterChange(value ?? "all")}>
            <SelectTrigger size="sm" className="min-w-40 border-none px-1 shadow-none focus-visible:ring-0">
              <SelectValue placeholder="All assignees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              {assigneeOptions.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 rounded-lg border px-2 py-1">
          <Filter className="size-4 text-slate-500" />
          <Select value={priorityFilter} onValueChange={(value) => onPriorityFilterChange((value ?? "all") as TaskPriority | "all")}>
            <SelectTrigger size="sm" className="min-w-36 border-none px-1 shadow-none focus-visible:ring-0">
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {PRIORITY_CONFIG[priority].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onAssigneeFilterChange("all");
              onPriorityFilterChange("all");
            }}
          >
            <RotateCcw className="size-4" />
            Clear filters
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Showing {visibleTaskCount} of {totalTaskCount}</Badge>
        {createDisabled ? (
          <Badge variant="outline">Archived project</Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <Keyboard className="size-3" />
            Press C to create task
          </Badge>
        )}
      </div>
    </div>
  );
}
