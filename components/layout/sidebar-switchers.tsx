"use client";

import Link from "next/link";
import { ChevronsUpDown, FolderKanban, Layers3, Search, Star } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Project, Workspace } from "@/types";

type WorkspaceSwitcherSection = {
  key: string;
  label: string;
  items: Workspace[];
};

type ProjectSwitcherSection = {
  key: string;
  label: string;
  items: Project[];
};

type CompactWorkspaceSwitcherProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  triggerClassName: string;
  hasSelectedWorkspace: boolean;
  workspaceDisplayName: string;
  workspaceMonogram: string;
  workspaceChatUnreadCount: number;
  orderedWorkspaces: Workspace[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  sections: WorkspaceSwitcherSection[];
  resolvedWorkspaceId: string | null;
  pinnedWorkspaceIds: Set<string>;
  recentWorkspaceIds: Set<string>;
  onSelectWorkspace: (workspaceId: string) => void;
  onTogglePinnedWorkspace: (workspaceId: string) => void;
  onCreateOrJoin: () => void;
};

type CompactProjectSwitcherProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  triggerClassName: string;
  workspaceDisplayName: string;
  activeProject: Project | null;
  activeProjectId: string | null;
  resolvedWorkspaceId: string;
  orderedProjects: Project[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  sections: ProjectSwitcherSection[];
  pinnedProjectIds: Set<string>;
  onSelectProject: (projectId: string, destination: "board" | "overview") => void;
  onTogglePinnedProject: (projectId: string) => void;
  onNewProject: () => void;
  projectPhaseDot: Record<string, string>;
};

function getInitials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "VI";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function handleSwitcherItemKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    return;
  }

  const container = event.currentTarget.closest("[data-switcher-list='true']");

  if (!container) {
    return;
  }

  const items = Array.from(container.querySelectorAll<HTMLElement>("[data-switcher-item='true']"));
  const currentIndex = items.indexOf(event.currentTarget);

  if (currentIndex === -1 || items.length === 0) {
    return;
  }

  event.preventDefault();

  if (event.key === "Home") {
    items[0]?.focus();
    return;
  }

  if (event.key === "End") {
    items.at(-1)?.focus();
    return;
  }

  const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
  const nextIndex = (currentIndex + direction + items.length) % items.length;
  items[nextIndex]?.focus();
}

function focusSwitcherItemFromPanel(container: HTMLElement | null, target: "first" | "last") {
  if (!container) {
    return;
  }

  const items = Array.from(container.querySelectorAll<HTMLElement>("[data-switcher-item='true']"));

  if (items.length === 0) {
    return;
  }

  if (target === "first") {
    items[0]?.focus();
    return;
  }

  items.at(-1)?.focus();
}

export function CompactWorkspaceSwitcher({
  isOpen,
  onOpenChange,
  triggerRef,
  triggerClassName,
  hasSelectedWorkspace,
  workspaceDisplayName,
  workspaceMonogram,
  workspaceChatUnreadCount,
  orderedWorkspaces,
  searchQuery,
  onSearchQueryChange,
  sections,
  resolvedWorkspaceId,
  pinnedWorkspaceIds,
  recentWorkspaceIds,
  onSelectWorkspace,
  onTogglePinnedWorkspace,
  onCreateOrJoin,
}: CompactWorkspaceSwitcherProps) {
  const workspaceSwitcherLabel = hasSelectedWorkspace
    ? `${workspaceDisplayName} workspace switcher`
    : "Workspace switcher";

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <button ref={triggerRef} type="button" aria-label={workspaceSwitcherLabel} className={triggerClassName}>
            {hasSelectedWorkspace ? (
              <Avatar size="sm">
                <AvatarFallback>{workspaceMonogram}</AvatarFallback>
              </Avatar>
            ) : (
              <Layers3 className="size-4" />
            )}
            <span className="absolute bottom-1 right-1 rounded-full bg-white/88 p-0.5 text-sidebar-foreground/60 shadow-[0_4px_10px_-8px_rgba(15,23,42,0.6)] dark:bg-[#1b2028] dark:text-sidebar-foreground/72">
              <ChevronsUpDown className="size-2.5" />
            </span>
            {workspaceChatUnreadCount > 0 ? <span className="absolute left-2 top-2 size-2 rounded-full bg-sidebar-primary" /> : null}
          </button>
        }
      />
      <PopoverContent side="right" sideOffset={14} className="w-80 rounded-[24px] p-2.5">
        <div className="px-2 pb-2 pt-1">
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-white/48">Workspace switcher</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{workspaceDisplayName}</p>
          {orderedWorkspaces.length > 7 ? (
            <div className="relative mt-3" data-switcher-panel="true">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/34" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "Home") {
                    event.preventDefault();
                    focusSwitcherItemFromPanel(event.currentTarget.closest("[data-switcher-panel='true']"), "first");
                  }

                  if (event.key === "End") {
                    event.preventDefault();
                    focusSwitcherItemFromPanel(event.currentTarget.closest("[data-switcher-panel='true']"), "last");
                  }
                }}
                placeholder="Search workspaces"
                className="h-9 rounded-[16px] border-white/10 bg-white/8 pl-9 text-sm text-white placeholder:text-white/34 focus-visible:border-white/16 focus-visible:ring-white/20 dark:bg-white/6"
              />
            </div>
          ) : null}
        </div>
        {sections.length > 0 ? (
          <div data-switcher-panel="true" className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {sections.map((section) => (
              <div key={section.key}>
                <p className="px-2 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-white/34">
                  {section.label}
                </p>
                <div data-switcher-list="true" className="space-y-1">
                  {section.items.map((workspace) => {
                    const href = `/workspace/${workspace.id}`;
                    const isCurrentWorkspace = resolvedWorkspaceId === workspace.id;
                    const isPinnedWorkspace = pinnedWorkspaceIds.has(workspace.id);
                    const isRecentWorkspace = recentWorkspaceIds.has(workspace.id);
                    const workspaceMetaLabel = isPinnedWorkspace
                      ? "Pinned workspace"
                      : isRecentWorkspace
                        ? "Recent workspace"
                        : "Workspace";

                    return (
                      <div
                        key={workspace.id}
                        className={cn(
                          "group flex items-center gap-2 rounded-[18px] border border-transparent px-2 py-2 text-white/82 transition-[background-color,border-color,color] duration-150",
                          isCurrentWorkspace && "border-white/10 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
                        )}
                      >
                        <Link
                          href={href}
                          data-switcher-item="true"
                          onClick={() => {
                            onSelectWorkspace(workspace.id);
                            onOpenChange(false);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              onOpenChange(false);
                              return;
                            }

                            handleSwitcherItemKeyDown(event);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] px-1 py-0.5 text-left text-white/82 transition-[background-color,border-color,color,transform,box-shadow] duration-150 motion-safe:ease-out motion-safe:hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)] hover:text-white"
                        >
                          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[0.65rem] font-semibold text-white">
                            {getInitials(workspace.name).slice(0, 2)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{workspace.name}</p>
                            <p className="mt-0.5 text-[0.68rem] text-white/46">{workspaceMetaLabel}</p>
                          </div>
                          {isCurrentWorkspace ? <span className="text-[0.68rem] font-medium text-white/54">Open</span> : null}
                        </Link>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onTogglePinnedWorkspace(workspace.id);
                          }}
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white/44 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)]"
                          aria-label={isPinnedWorkspace ? `Unpin ${workspace.name}` : `Pin ${workspace.name}`}
                        >
                          <Star className={cn("size-4", isPinnedWorkspace && "fill-current text-amber-300")} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-white/10 bg-white/4 px-3 py-4 text-sm leading-6 text-white/58">
            {searchQuery ? "No workspaces match that search." : "No workspaces found yet."}
          </div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Link
            href="/dashboard"
            onClick={() => onOpenChange(false)}
            className="flex h-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/6 text-[0.76rem] font-medium text-white/82 transition-[background-color,border-color,color,transform] duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)] hover:border-white/14 hover:bg-white/10 hover:text-white motion-safe:hover:-translate-y-px"
          >
            All workspaces
          </Link>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onCreateOrJoin();
            }}
            className="flex h-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/6 text-[0.76rem] font-medium text-white/82 transition-[background-color,border-color,color,transform] duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)] hover:border-white/14 hover:bg-white/10 hover:text-white motion-safe:hover:-translate-y-px"
          >
            Create or join
          </button>
        </div>
        <p className="mt-2 px-2 text-[0.66rem] text-white/40">Keyboard: Arrow keys move focus, Home and End jump, Escape closes.</p>
      </PopoverContent>
    </Popover>
  );
}

export function CompactProjectSwitcher({
  isOpen,
  onOpenChange,
  triggerRef,
  triggerClassName,
  workspaceDisplayName,
  activeProject,
  activeProjectId,
  resolvedWorkspaceId,
  orderedProjects,
  searchQuery,
  onSearchQueryChange,
  sections,
  pinnedProjectIds,
  onSelectProject,
  onTogglePinnedProject,
  onNewProject,
  projectPhaseDot,
}: CompactProjectSwitcherProps) {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <button
            ref={triggerRef}
            type="button"
            aria-label={activeProject ? `${activeProject.name} project switcher` : `Project switcher for ${workspaceDisplayName}`}
            className={triggerClassName}
          >
            {activeProject ? (
              <span className="relative inline-flex size-7 items-center justify-center rounded-full bg-white/80 text-[0.65rem] font-semibold text-sidebar-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:bg-white/8 dark:text-sidebar-foreground/86 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                {getInitials(activeProject.name).slice(0, 2)}
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-white dark:ring-[#121317]",
                    projectPhaseDot[activeProject.phase] ?? "bg-slate-400",
                  )}
                />
              </span>
            ) : (
              <FolderKanban className="size-4" />
            )}
            <span className="absolute bottom-1 right-1 rounded-full bg-white/88 p-0.5 text-sidebar-foreground/60 shadow-[0_4px_10px_-8px_rgba(15,23,42,0.6)] dark:bg-[#1b2028] dark:text-sidebar-foreground/72">
              <ChevronsUpDown className="size-2.5" />
            </span>
          </button>
        }
      />
      <PopoverContent side="right" sideOffset={14} className="w-80 rounded-[24px] p-2.5">
        <div className="px-2 pb-2 pt-1">
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-white/48">Project switcher</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{workspaceDisplayName}</p>
          {orderedProjects.length > 7 ? (
            <div className="relative mt-3" data-switcher-panel="true">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/34" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "Home") {
                    event.preventDefault();
                    focusSwitcherItemFromPanel(event.currentTarget.closest("[data-switcher-panel='true']"), "first");
                  }

                  if (event.key === "End") {
                    event.preventDefault();
                    focusSwitcherItemFromPanel(event.currentTarget.closest("[data-switcher-panel='true']"), "last");
                  }
                }}
                placeholder="Search projects"
                className="h-9 rounded-[16px] border-white/10 bg-white/8 pl-9 text-sm text-white placeholder:text-white/34 focus-visible:border-white/16 focus-visible:ring-white/20 dark:bg-white/6"
              />
            </div>
          ) : null}
        </div>
        {sections.length > 0 ? (
          <div data-switcher-panel="true" className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {sections.map((section) => (
              <div key={section.key}>
                <p className="px-2 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-white/34">
                  {section.label}
                </p>
                <div data-switcher-list="true" className="space-y-1">
                  {section.items.map((project) => {
                    const boardHref = `/workspace/${resolvedWorkspaceId}/project/${project.id}/board`;
                    const isCurrentProject = activeProjectId === project.id;
                    const isPinnedProject = pinnedProjectIds.has(project.id);

                    return (
                      <div
                        key={project.id}
                        className={cn(
                          "group flex items-center gap-2 rounded-[18px] border border-transparent px-2 py-2 text-white/82 transition-[background-color,border-color,color] duration-150",
                          isCurrentProject && "border-white/10 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
                        )}
                      >
                        <Link
                          href={boardHref}
                          onClick={() => {
                            onSelectProject(project.id, "board");
                            onOpenChange(false);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              onOpenChange(false);
                              return;
                            }

                            handleSwitcherItemKeyDown(event);
                          }}
                          data-switcher-item="true"
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] px-1 py-0.5 text-left text-white/82 transition-[background-color,border-color,color,transform] duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)] hover:text-white motion-safe:hover:-translate-y-px"
                        >
                          <span className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[0.65rem] font-semibold text-white">
                            {getInitials(project.name).slice(0, 2)}
                            <span
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-[rgba(15,18,24,0.96)]",
                                projectPhaseDot[project.phase] ?? "bg-slate-400",
                              )}
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{project.name}</p>
                            <p className="mt-0.5 text-[0.68rem] text-white/46">
                              {isPinnedProject ? "Pinned project" : project.status === "archived" ? "Archived" : project.phase.replaceAll("_", " ")}
                            </p>
                          </div>
                          {isCurrentProject ? <span className="text-[0.68rem] font-medium text-white/54">Open</span> : null}
                        </Link>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onTogglePinnedProject(project.id);
                            }}
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white/44 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)]"
                            aria-label={isPinnedProject ? `Unpin ${project.name}` : `Pin ${project.name}`}
                          >
                            <Star className={cn("size-4", isPinnedProject && "fill-current text-amber-300")} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onOpenChange(false);
                              onSelectProject(project.id, "overview");
                            }}
                            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full px-2 text-[0.66rem] font-medium text-white/56 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)]"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-white/10 bg-white/4 px-3 py-4 text-sm leading-6 text-white/58">
            {searchQuery ? "No projects match that search." : "This workspace has no projects yet."}
          </div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Link
            href={`/workspace/${resolvedWorkspaceId}`}
            onClick={() => onOpenChange(false)}
            className="flex h-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/6 text-[0.76rem] font-medium text-white/82 transition-[background-color,border-color,color,transform] duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)] hover:border-white/14 hover:bg-white/10 hover:text-white motion-safe:hover:-translate-y-px"
          >
            Workspace
          </Link>
          <button
            type="button"
            className="flex h-9 items-center justify-center rounded-[16px] border border-white/10 bg-white/6 text-[0.76rem] font-medium text-white/82 transition-[background-color,border-color,color,transform] duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(15,18,24,0.96)] hover:border-white/14 hover:bg-white/10 hover:text-white motion-safe:hover:-translate-y-px"
            onClick={() => {
              onOpenChange(false);
              onNewProject();
            }}
          >
            New project
          </button>
        </div>
        <p className="mt-2 px-2 text-[0.66rem] text-white/40">Keyboard: Arrow keys move focus, Home and End jump, Escape closes.</p>
      </PopoverContent>
    </Popover>
  );
}