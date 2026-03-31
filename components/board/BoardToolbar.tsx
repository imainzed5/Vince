import { Bookmark, Filter, Keyboard, LayoutGrid, ListChecks, RotateCcw, Save, Trash2, Users } from "lucide-react";

import { PRIORITY_CONFIG } from "@/components/board/config";
import type { ProjectAttentionFilter, ProjectListSortOption } from "@/lib/pm-config";
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
  onViewModeChange: (value: "board" | "list") => void;
  createDisabled?: boolean;
  assigneeOptions: Array<{ id: string; name: string }>;
  assigneeFilter: string;
  onAssigneeFilterChange: (value: string) => void;
  priorityFilter: TaskPriority | "all";
  onPriorityFilterChange: (value: TaskPriority | "all") => void;
  milestoneOptions: Array<{ id: string; name: string }>;
  milestoneFilter: string;
  onMilestoneFilterChange: (value: string) => void;
  attentionFilter: ProjectAttentionFilter;
  onAttentionFilterChange: (value: ProjectAttentionFilter) => void;
  sortOption: ProjectListSortOption;
  onSortOptionChange: (value: ProjectListSortOption) => void;
  savedViews: Array<{ id: string; name: string }>;
  selectedSavedViewId: string;
  onSavedViewSelect: (value: string) => void;
  onSaveCurrentView: () => void;
  onDeleteSavedView: () => void;
  isSavingView?: boolean;
  isDeletingView?: boolean;
  visibleTaskCount: number;
  totalTaskCount: number;
  viewMode: "board" | "list";
};

const ATTENTION_LABELS: Record<ProjectAttentionFilter, string> = {
  all: "All attention",
  blocked: "Blocked",
  overdue: "Overdue",
  due_soon: "Due soon",
  blocking_others: "Blocking others",
};

const SORT_LABELS: Record<ProjectListSortOption, string> = {
  board_order: "Board order",
  due_date: "Due date",
  priority: "Priority",
  newest: "Newest",
};

export function BoardToolbar({
  onCreateTask,
  onViewModeChange,
  createDisabled = false,
  assigneeOptions,
  assigneeFilter,
  onAssigneeFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  milestoneOptions,
  milestoneFilter,
  onMilestoneFilterChange,
  attentionFilter,
  onAttentionFilterChange,
  sortOption,
  onSortOptionChange,
  savedViews,
  selectedSavedViewId,
  onSavedViewSelect,
  onSaveCurrentView,
  onDeleteSavedView,
  isSavingView = false,
  isDeletingView = false,
  visibleTaskCount,
  totalTaskCount,
  viewMode,
}: BoardToolbarProps) {
  const hasActiveFilters =
    assigneeFilter !== "all" ||
    priorityFilter !== "all" ||
    milestoneFilter !== "all" ||
    attentionFilter !== "all" ||
    sortOption !== "board_order";

  return (
    <div className="surface-panel flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 shadow-sm dark:shadow-none">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onCreateTask} disabled={createDisabled}>
          + Add task
        </Button>
        <div className="surface-subpanel inline-flex items-center rounded-lg border p-1">
          <Button type="button" variant={viewMode === "board" ? "secondary" : "ghost"} size="sm" onClick={() => onViewModeChange("board")}>
            <LayoutGrid className="size-4" />
            Board
          </Button>
          <Button type="button" variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" onClick={() => onViewModeChange("list")}>
            <ListChecks className="size-4" />
            List
          </Button>
        </div>
        <div className="surface-subpanel flex items-center gap-2 rounded-lg border px-2 py-1">
          <Users className="size-4 text-muted-foreground" />
          <Select value={assigneeFilter} onValueChange={(value) => onAssigneeFilterChange(value ?? "all")}>
            <SelectTrigger size="sm" className="min-w-40 border-none px-1 shadow-none focus-visible:ring-0">
              <SelectValue placeholder="All assignees">
                {assigneeFilter === "all"
                  ? "All assignees"
                  : assigneeOptions.find((member) => member.id === assigneeFilter)?.name ?? "Unknown member"}
              </SelectValue>
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
        <div className="surface-subpanel flex items-center gap-2 rounded-lg border px-2 py-1">
          <Filter className="size-4 text-muted-foreground" />
          <Select value={priorityFilter} onValueChange={(value) => onPriorityFilterChange((value ?? "all") as TaskPriority | "all")}>
            <SelectTrigger size="sm" className="min-w-36 border-none px-1 shadow-none focus-visible:ring-0">
              <SelectValue placeholder="All priorities">
                {priorityFilter === "all" ? "All priorities" : PRIORITY_CONFIG[priorityFilter].label}
              </SelectValue>
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
        <div className="surface-subpanel flex items-center gap-2 rounded-lg border px-2 py-1">
          <Filter className="size-4 text-muted-foreground" />
          <Select value={attentionFilter} onValueChange={(value) => onAttentionFilterChange((value ?? "all") as ProjectAttentionFilter)}>
            <SelectTrigger size="sm" className="min-w-36 border-none px-1 shadow-none focus-visible:ring-0">
              <SelectValue placeholder="Attention">{ATTENTION_LABELS[attentionFilter]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All attention</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="due_soon">Due soon</SelectItem>
              <SelectItem value="blocking_others">Blocking others</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="surface-subpanel flex items-center gap-2 rounded-lg border px-2 py-1">
          <Bookmark className="size-4 text-muted-foreground" />
          <Select value={milestoneFilter} onValueChange={(value) => onMilestoneFilterChange(value ?? "all")}>
            <SelectTrigger size="sm" className="min-w-36 border-none px-1 shadow-none focus-visible:ring-0">
              <SelectValue placeholder="All milestones">
                {milestoneFilter === "all"
                  ? "All milestones"
                  : milestoneOptions.find((milestone) => milestone.id === milestoneFilter)?.name ?? "Unknown milestone"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All milestones</SelectItem>
              {milestoneOptions.map((milestone) => (
                <SelectItem key={milestone.id} value={milestone.id}>
                  {milestone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-background/60 px-2 py-1">
          <Select value={sortOption} onValueChange={(value) => onSortOptionChange((value ?? "board_order") as ProjectListSortOption)}>
            <SelectTrigger size="sm" className="min-w-36 border-none px-1 shadow-none focus-visible:ring-0">
              <SelectValue placeholder="Sort">{SORT_LABELS[sortOption]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="board_order">Board order</SelectItem>
              <SelectItem value="due_date">Due date</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-background/60 px-2 py-1">
          <Bookmark className="size-4 text-muted-foreground" />
          <Select value={selectedSavedViewId} onValueChange={(value) => onSavedViewSelect(value ?? "none")}>
            <SelectTrigger size="sm" className="min-w-40 border-none px-1 shadow-none focus-visible:ring-0">
              <SelectValue placeholder="Current view">
                {selectedSavedViewId === "none"
                  ? "Current view"
                  : savedViews.find((view) => view.id === selectedSavedViewId)?.name ?? "Current view"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Current view</SelectItem>
              {savedViews.map((view) => (
                <SelectItem key={view.id} value={view.id}>
                  {view.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onSaveCurrentView} disabled={isSavingView}>
          {isSavingView ? <RotateCcw className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save view
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDeleteSavedView} disabled={isDeletingView || selectedSavedViewId === "none"}>
          {isDeletingView ? <RotateCcw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Delete view
        </Button>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onAssigneeFilterChange("all");
              onPriorityFilterChange("all");
              onMilestoneFilterChange("all");
              onAttentionFilterChange("all");
              onSortOptionChange("board_order");
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
