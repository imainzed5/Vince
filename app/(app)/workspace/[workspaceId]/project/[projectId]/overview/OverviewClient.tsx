"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Archive, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

import { RelativeTimeText } from "@/components/shared/RelativeTimeText";
import {
  addMilestoneAction,
  addStandupAction,
  deleteMilestoneAction,
  deleteProjectAction,
  updateProjectDetailsAction,
  updateProjectPhaseAction,
  updateProjectPrefixAction,
  updateProjectStatusAction,
} from "../actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deriveProjectPrefix, normalizeProjectPrefix } from "@/lib/project-prefix";
import { formatCalendarDate } from "@/lib/utils/time";
import type { Database } from "@/types/database.types";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Standup = Database["public"]["Tables"]["standups"]["Row"];

type OverviewClientProps = {
  workspaceId: string;
  projectId: string;
  initialProject: Project;
  initialTasks: Task[];
  initialMilestones: Milestone[];
  initialStandups: Standup[];
  currentUserRole: string;
  memberNames: Record<string, string>;
  renderedAt?: number;
};

const PHASES: Array<{ value: string; label: string }> = [
  { value: "planning", label: "Planning" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "done", label: "Done" },
];

function initials(value: string): string {
  return value.slice(0, 2).toUpperCase();
}

function formatDate(value: string | null): string {
  return formatCalendarDate(value, {
    fallback: "No due date",
    includeYear: true,
  });
}

export default function OverviewClient({
  workspaceId,
  projectId,
  initialProject,
  initialTasks,
  initialMilestones,
  initialStandups,
  currentUserRole,
  memberNames,
  renderedAt,
}: OverviewClientProps) {
  const router = useRouter();
  const [project, setProject] = useState<Project>(initialProject);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [standups, setStandups] = useState<Standup[]>(initialStandups);
  const [nameDraft, setNameDraft] = useState(initialProject.name);
  const [descriptionDraft, setDescriptionDraft] = useState(initialProject.description ?? "");
  const [milestoneName, setMilestoneName] = useState("");
  const [milestoneDueDate, setMilestoneDueDate] = useState("");
  const [standupDone, setStandupDone] = useState("");
  const [standupNext, setStandupNext] = useState("");
  const [standupBlockers, setStandupBlockers] = useState("");
  const [isStandupModalOpen, setIsStandupModalOpen] = useState(false);
  const [prefixDraft, setPrefixDraft] = useState(initialProject.prefix);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [pendingMilestoneId, setPendingMilestoneId] = useState<string | null>(null);
  const [isSavingDetails, startSavingDetails] = useTransition();
  const [isSavingPrefix, startSavingPrefix] = useTransition();
  const [isUpdatingPhase, startUpdatingPhase] = useTransition();
  const [isUpdatingStatus, startUpdatingStatus] = useTransition();
  const [isCreatingMilestone, startCreatingMilestone] = useTransition();
  const [isDeletingMilestone, startDeletingMilestone] = useTransition();
  const [isPostingStandup, startPostingStandup] = useTransition();
  const [isDeletingProject, startDeletingProject] = useTransition();

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const inProgressTasks = tasks.filter((task) => task.status === "in_progress").length;
  const blockedTasks = tasks.filter((task) => task.is_blocked).length;
  const progressPct = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const milestoneTaskCount = useMemo(() => {
    const map = new Map<string, number>();

    for (const task of tasks) {
      if (!task.milestone_id) {
        continue;
      }

      map.set(task.milestone_id, (map.get(task.milestone_id) ?? 0) + 1);
    }

    return map;
  }, [tasks]);

  const teamAssignees = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.assignee_id).filter(Boolean) as string[])),
    [tasks],
  );
  const isOwner = currentUserRole === "owner";
  const suggestedPrefix = useMemo(() => deriveProjectPrefix(project.name), [project.name]);
  const hasGeneralChanges =
    nameDraft.trim() !== project.name || (descriptionDraft.trim() || "") !== (project.description ?? "");
  const canDeleteProject = deleteConfirmation.trim() === project.name;

  const displayMemberName = (userId: string | null) => {
    if (!userId) {
      return "Unknown member";
    }

    return memberNames[userId] ?? `User ${userId.slice(0, 8)}`;
  };

  const syncProject = (nextProject: Project) => {
    setProject(nextProject);
    setNameDraft(nextProject.name);
    setDescriptionDraft(nextProject.description ?? "");
    setPrefixDraft(nextProject.prefix);
  };

  const saveProjectDetails = () => {
    startSavingDetails(async () => {
      const result = await updateProjectDetailsAction({
        workspaceId,
        projectId,
        name: nameDraft,
        description: descriptionDraft,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      if (result.project) {
        syncProject(result.project);
      }

      toast.success(result.message);
      router.refresh();
    });
  };

  const setPhase = (phase: Project["phase"]) => {
    startUpdatingPhase(async () => {
      const result = await updateProjectPhaseAction({
        workspaceId,
        projectId,
        phase,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      if (result.project) {
        syncProject(result.project);
      }

      toast.success(result.message);
      router.refresh();
    });
  };

  const savePrefix = () => {
    startSavingPrefix(async () => {
      const result = await updateProjectPrefixAction({
        workspaceId,
        projectId,
        prefix: prefixDraft,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      if (result.prefix) {
        setProject((current) => ({ ...current, prefix: result.prefix ?? current.prefix }));
      }
      setPrefixDraft(result.prefix ?? prefixDraft);
      toast.success(result.message);
      router.refresh();
    });
  };

  const setStatus = (status: Project["status"]) => {
    startUpdatingStatus(async () => {
      const result = await updateProjectStatusAction({
        workspaceId,
        projectId,
        status,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      if (result.project) {
        syncProject(result.project);
      }

      toast.success(result.message);
      router.refresh();
    });
  };

  const addMilestone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!milestoneName.trim()) {
      return;
    }

    startCreatingMilestone(async () => {
      const result = await addMilestoneAction({
        workspaceId,
        projectId,
        name: milestoneName,
        dueDate: milestoneDueDate,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      if (result.milestone) {
        setMilestones((current) => [...current, result.milestone as Milestone]);
      }

      setMilestoneName("");
      setMilestoneDueDate("");
      toast.success(result.message);
      router.refresh();
    });
  };

  const removeMilestone = (milestone: Milestone) => {
    const confirmed = window.confirm(`Remove the milestone \"${milestone.name}\"?`);

    if (!confirmed) {
      return;
    }

    setPendingMilestoneId(milestone.id);

    startDeletingMilestone(async () => {
      const result = await deleteMilestoneAction({
        workspaceId,
        projectId,
        milestoneId: milestone.id,
      });

      setPendingMilestoneId(null);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      setMilestones((current) => current.filter((item) => item.id !== milestone.id));
      setTasks((current) =>
        current.map((task) =>
          task.milestone_id === milestone.id ? { ...task, milestone_id: null } : task,
        ),
      );
      toast.success(result.message);
      router.refresh();
    });
  };

  const postStandup = () => {
    startPostingStandup(async () => {
      const result = await addStandupAction({
        workspaceId,
        projectId,
        done: standupDone,
        next: standupNext,
        blockers: standupBlockers,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      if (result.standup) {
        setStandups((current) => [result.standup as Standup, ...current].slice(0, 3));
      }

      setStandupDone("");
      setStandupNext("");
      setStandupBlockers("");
      setIsStandupModalOpen(false);
      toast.success(result.message);
      router.refresh();
    });
  };

  const deleteProject = () => {
    startDeletingProject(async () => {
      const result = await deleteProjectAction({
        workspaceId,
        projectId,
        confirmationName: deleteConfirmation,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.push(result.nextPath ?? `/workspace/${workspaceId}`);
      router.refresh();
    });
  };

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <Badge variant="outline">{project.prefix}</Badge>
          <Badge variant={project.status === "archived" ? "secondary" : "outline"}>
            {project.status === "archived" ? "Archived" : "Active"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {project.description?.trim() || "Project overview, milestones, standups, and lifecycle controls."}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-muted-foreground">Total tasks</p>
          <p className="text-2xl font-semibold">{totalTasks}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-muted-foreground">Completed</p>
          <p className="text-2xl font-semibold">{completedTasks}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-muted-foreground">In progress</p>
          <p className="text-2xl font-semibold">{inProgressTasks}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-muted-foreground">Blocked</p>
          <p className="text-2xl font-semibold">{blockedTasks}</p>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Project details</p>
            <p className="text-xs text-muted-foreground">Update the project name and description used across the workspace.</p>
          </div>
          <Badge variant="outline">{isOwner ? "Owner controls" : "Read only"}</Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              disabled={!isOwner || isSavingDetails || isDeletingProject}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <textarea
              id="project-description"
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              className="min-h-[108px] w-full resize-y rounded-lg border border-slate-200 p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={!isOwner || isSavingDetails || isDeletingProject}
              placeholder="Capture the intent, scope, or delivery goal for this project."
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Owners can edit project metadata, lifecycle, and destructive actions from this screen.
          </p>
          <Button type="button" onClick={saveProjectDetails} disabled={!isOwner || !hasGeneralChanges || isSavingDetails}>
            {isSavingDetails ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save details
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Task prefix</p>
            <p className="text-xs text-muted-foreground">
              Task identifiers in this project are generated from this prefix.
            </p>
          </div>
          <Badge variant="outline">{project.prefix}</Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-[220px_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="project-prefix">Project prefix</Label>
            <Input
              id="project-prefix"
              value={prefixDraft}
              onChange={(event) => setPrefixDraft(normalizeProjectPrefix(event.target.value))}
              disabled={!isOwner || isSavingPrefix || isDeletingProject}
              maxLength={6}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={savePrefix}
            disabled={!isOwner || isSavingPrefix || isDeletingProject || normalizeProjectPrefix(prefixDraft) === project.prefix}
          >
            {isSavingPrefix ? "Saving..." : "Save prefix"}
          </Button>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Suggested prefix: {suggestedPrefix}. Only workspace owners can change the saved prefix.
        </p>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Phase</p>
            <p className="text-xs text-muted-foreground">Keep the project phase aligned with the actual delivery stage.</p>
          </div>
          <Badge variant="outline">{project.phase.replace(/_/g, " ")}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {PHASES.map((phase) => (
            <Button
              key={phase.value}
              type="button"
              variant={project.phase === phase.value ? "secondary" : "outline"}
              size="sm"
              onClick={() => setPhase(phase.value as Project["phase"])}
              disabled={!isOwner || isUpdatingPhase || isDeletingProject}
            >
              {phase.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Project lifecycle</p>
            <p className="text-xs text-muted-foreground">Archive finished work, restore it later, or keep the project active.</p>
          </div>
          <Badge variant={project.status === "archived" ? "secondary" : "outline"}>
            {project.status === "archived" ? "Archived" : "Active"}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStatus(project.status === "archived" ? "active" : "archived")}
            disabled={!isOwner || isUpdatingStatus || isDeletingProject}
          >
            <Archive className="size-4" />
            {project.status === "archived" ? "Restore project" : "Archive project"}
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Progress</p>
          <Badge variant="outline">{progressPct}%</Badge>
        </div>
        <div className="h-3 rounded-full bg-slate-200">
          <div className="h-3 rounded-full bg-emerald-500" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {completedTasks} of {totalTasks} tasks completed
        </p>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Milestones</p>
        </div>

        <form className="mb-3 grid gap-2 md:grid-cols-[1fr_180px_auto]" onSubmit={addMilestone}>
          <Input
            value={milestoneName}
            onChange={(event) => setMilestoneName(event.target.value)}
            placeholder="Milestone name"
            disabled={isCreatingMilestone}
            required
          />
          <Input
            value={milestoneDueDate}
            onChange={(event) => setMilestoneDueDate(event.target.value)}
            type="date"
            disabled={isCreatingMilestone}
          />
          <Button type="submit" disabled={isCreatingMilestone}>
            <Plus className="size-4" />
            {isCreatingMilestone ? "Adding..." : "Add milestone"}
          </Button>
        </form>

        {milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No milestones yet.</p>
        ) : (
          <ul className="space-y-2">
            {milestones.map((milestone) => (
              <li key={milestone.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{milestone.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(milestone.due_date)} · {milestoneTaskCount.get(milestone.id) ?? 0} tasks
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isDeletingMilestone && pendingMilestoneId === milestone.id}
                  onClick={() => removeMilestone(milestone)}
                >
                  {isDeletingMilestone && pendingMilestoneId === milestone.id ? "Removing..." : "Remove"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Recent standups</p>
          <Button type="button" onClick={() => setIsStandupModalOpen(true)}>
            + Post standup
          </Button>
        </div>

        {standups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No standups yet.</p>
        ) : (
          <ul className="space-y-2">
            {standups.map((standup) => (
              <li key={standup.id} className="rounded-md border p-3 text-sm">
                <p className="mb-1 text-xs text-muted-foreground">
                  {displayMemberName(standup.user_id)} · {" "}
                  <RelativeTimeText
                    value={standup.created_at}
                    initialReferenceTime={renderedAt}
                  />
                </p>
                <p>
                  <strong>Done:</strong> {standup.done || "-"}
                </p>
                <p>
                  <strong>Next:</strong> {standup.next || "-"}
                </p>
                <p>
                  <strong>Blockers:</strong> {standup.blockers || "-"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-800">Team members on this project</p>
        {teamAssignees.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignees yet.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {teamAssignees.map((assigneeId) => (
              <div key={assigneeId} className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-sm">
                <Avatar size="sm">
                  <AvatarFallback>{initials(displayMemberName(assigneeId))}</AvatarFallback>
                </Avatar>
                <span>{displayMemberName(assigneeId)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {isOwner ? (
        <section className="rounded-lg border border-red-200 bg-red-50/40 p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-red-900">Delete project</p>
            <p className="text-xs text-red-800/80">
              This permanently removes the project, its tasks, milestones, notes, standups, chat, and activity entries.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="project-delete-confirmation">Type the project name to confirm</Label>
              <Input
                id="project-delete-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder={project.name}
                disabled={isDeletingProject}
              />
            </div>

            <Button
              type="button"
              variant="destructive"
              onClick={deleteProject}
              disabled={!canDeleteProject || isDeletingProject}
            >
              {isDeletingProject ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete project
            </Button>
          </div>
        </section>
      ) : null}

      <Dialog open={isStandupModalOpen} onOpenChange={setIsStandupModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post standup</DialogTitle>
            <DialogDescription>Share your update with the team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-sm font-medium">What did you do?</p>
              <textarea
                value={standupDone}
                onChange={(event) => setStandupDone(event.target.value)}
                className="h-20 w-full rounded-md border p-2 text-sm"
              />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">What&apos;s next?</p>
              <textarea
                value={standupNext}
                onChange={(event) => setStandupNext(event.target.value)}
                className="h-20 w-full rounded-md border p-2 text-sm"
              />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Any blockers?</p>
              <textarea
                value={standupBlockers}
                onChange={(event) => setStandupBlockers(event.target.value)}
                className="h-20 w-full rounded-md border p-2 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" disabled={isPostingStandup} onClick={() => void postStandup()}>
              {isPostingStandup ? "Posting..." : "Post standup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
