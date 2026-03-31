"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Archive, Copy, Link2, LoaderCircle, Plus, Save, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

import { RelativeTimeText } from "@/components/shared/RelativeTimeText";
import { useRealtime } from "@/hooks/useRealtime";
import { copyTextToClipboard } from "@/lib/clipboard";
import { getInFlightTaskStatusKeys, isDoneTaskStatus } from "@/lib/task-statuses";
import { normalizeKeyOutcomes, parseProjectKeyOutcomes, parseProjectTemplateConfig } from "@/lib/pm-config";
import { createClient } from "@/lib/supabase/client";
import {
  addMilestoneAction,
  addProjectStatusUpdateAction,
  addStandupAction,
  createProjectTemplateAction,
  createProjectShareAction,
  deleteProjectTemplateAction,
  deleteMilestoneAction,
  deleteProjectAction,
  revokeProjectShareAction,
  updateProjectBriefAction,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deriveProjectPrefix, normalizeProjectPrefix } from "@/lib/project-prefix";
import { getMemberDisplayName } from "@/lib/utils/displayName";
import { formatCalendarDate } from "@/lib/utils/time";
import type { Database } from "@/types/database.types";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type ProjectShare = Database["public"]["Tables"]["project_shares"]["Row"];
type ProjectStatusUpdate = Database["public"]["Tables"]["project_status_updates"]["Row"];
type ProjectTemplate = Database["public"]["Tables"]["project_templates"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Standup = Database["public"]["Tables"]["standups"]["Row"];
type ProjectStatusHealth = "on_track" | "at_risk" | "off_track";

type MemberOption = {
  id: string;
  name: string;
  role: string;
};

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const index = items.findIndex((item) => item.id === nextItem.id);

  if (index === -1) {
    return [...items, nextItem];
  }

  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

function sortMilestones(items: Milestone[]): Milestone[] {
  return [...items].sort(
    (left, right) => new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime(),
  );
}

function sortStandups(items: Standup[]): Standup[] {
  return [...items]
    .sort((left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime())
    .slice(0, 3);
}

function sortTemplates(items: ProjectTemplate[]): ProjectTemplate[] {
  return [...items].sort(
    (left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime(),
  );
}

function sortStatusUpdates(items: ProjectStatusUpdate[]): ProjectStatusUpdate[] {
  return [...items]
    .sort((left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime())
    .slice(0, 5);
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function getHealthBadgeClass(health: ProjectStatusUpdate["health"]): string {
  if (health === "on_track") {
    return "border-emerald-500/16 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/12 dark:bg-emerald-400/18 dark:text-emerald-200";
  }

  if (health === "at_risk") {
    return "border-amber-500/16 bg-amber-500/10 text-amber-700 dark:border-amber-400/12 dark:bg-amber-400/18 dark:text-amber-200";
  }

  return "border-red-500/16 bg-red-500/10 text-red-700 dark:border-red-400/12 dark:bg-red-400/18 dark:text-red-200";
}

function getHealthLabel(health: ProjectStatusUpdate["health"]): string {
  if (health === "on_track") {
    return "On track";
  }

  if (health === "at_risk") {
    return "At risk";
  }

  return "Off track";
}

type OverviewClientProps = {
  workspaceId: string;
  projectId: string;
  initialProject: Project;
  initialProjectShares: ProjectShare[];
  initialTasks: Task[];
  initialTaskStatuses: Database["public"]["Tables"]["workspace_task_statuses"]["Row"][];
  initialMilestones: Milestone[];
  initialStandups: Standup[];
  initialStatusUpdates: ProjectStatusUpdate[];
  currentUserRole: string;
  memberOptions: MemberOption[];
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
  initialProjectShares,
  initialTasks,
  initialTaskStatuses,
  initialMilestones,
  initialStandups,
  initialStatusUpdates,
  currentUserRole,
  memberOptions,
  memberNames,
  renderedAt,
}: OverviewClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [project, setProject] = useState<Project>(initialProject);
  const [projectShares, setProjectShares] = useState<ProjectShare[]>(initialProjectShares);
  const [statusUpdates, setStatusUpdates] = useState<ProjectStatusUpdate[]>(initialStatusUpdates);
  const [projectTemplates, setProjectTemplates] = useState<ProjectTemplate[]>([]);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [taskStatuses, setTaskStatuses] = useState(initialTaskStatuses);
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [standups, setStandups] = useState<Standup[]>(initialStandups);
  const [hasRemoteProjectUpdate, setHasRemoteProjectUpdate] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialProject.name);
  const [descriptionDraft, setDescriptionDraft] = useState(initialProject.description ?? "");
  const [ownerDraft, setOwnerDraft] = useState(initialProject.owner_id ?? "unassigned");
  const [targetDateDraft, setTargetDateDraft] = useState(initialProject.target_date ?? "");
  const [goalStatementDraft, setGoalStatementDraft] = useState(initialProject.goal_statement ?? "");
  const [successMetricDraft, setSuccessMetricDraft] = useState(initialProject.success_metric ?? "");
  const [scopeSummaryDraft, setScopeSummaryDraft] = useState(initialProject.scope_summary ?? "");
  const [keyOutcomeDrafts, setKeyOutcomeDrafts] = useState<string[]>(parseProjectKeyOutcomes(initialProject.key_outcomes));
  const [newKeyOutcomeDraft, setNewKeyOutcomeDraft] = useState("");
  const [milestoneName, setMilestoneName] = useState("");
  const [milestoneDueDate, setMilestoneDueDate] = useState("");
  const [statusHealthDraft, setStatusHealthDraft] = useState<ProjectStatusHealth>("on_track");
  const [statusHeadlineDraft, setStatusHeadlineDraft] = useState("");
  const [statusSummaryDraft, setStatusSummaryDraft] = useState("");
  const [statusRisksDraft, setStatusRisksDraft] = useState("");
  const [statusNextStepsDraft, setStatusNextStepsDraft] = useState("");
  const [standupDone, setStandupDone] = useState("");
  const [standupNext, setStandupNext] = useState("");
  const [standupBlockers, setStandupBlockers] = useState("");
  const [isStandupModalOpen, setIsStandupModalOpen] = useState(false);
  const [prefixDraft, setPrefixDraft] = useState(initialProject.prefix);
  const [shareExpiryDraft, setShareExpiryDraft] = useState("");
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [templateDescriptionDraft, setTemplateDescriptionDraft] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [pendingMilestoneId, setPendingMilestoneId] = useState<string | null>(null);
  const [isSavingDetails, startSavingDetails] = useTransition();
  const [isSavingBrief, startSavingBrief] = useTransition();
  const [isSavingPrefix, startSavingPrefix] = useTransition();
  const [isUpdatingPhase, startUpdatingPhase] = useTransition();
  const [isUpdatingStatus, startUpdatingStatus] = useTransition();
  const [isCreatingMilestone, startCreatingMilestone] = useTransition();
  const [isDeletingMilestone, startDeletingMilestone] = useTransition();
  const [isPostingStatusUpdate, startPostingStatusUpdate] = useTransition();
  const [isPostingStandup, startPostingStandup] = useTransition();
  const [isCreatingShare, startCreatingShare] = useTransition();
  const [pendingShareId, setPendingShareId] = useState<string | null>(null);
  const [isRevokingShare, startRevokingShare] = useTransition();
  const [isSavingTemplate, startSavingTemplate] = useTransition();
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [isDeletingTemplate, startDeletingTemplate] = useTransition();
  const [isDeletingProject, startDeletingProject] = useTransition();
  const generalDirtyRef = useRef(false);
  const briefDirtyRef = useRef(false);
  const prefixDirtyRef = useRef(false);

  const inFlightStatusKeys = useMemo(() => getInFlightTaskStatusKeys(taskStatuses), [taskStatuses]);
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => isDoneTaskStatus(task.status, taskStatuses)).length;
  const inProgressTasks = tasks.filter((task) => inFlightStatusKeys.includes(task.status)).length;
  const blockedTasks = tasks.filter((task) => task.is_blocked).length;
  const progressPct = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const overdueTasks = tasks.filter(
    (task) =>
      task.due_date &&
      !isDoneTaskStatus(task.status, taskStatuses) &&
      new Date(task.due_date).getTime() < new Date().setHours(0, 0, 0, 0),
  );
  const dueSoonTasks = tasks.filter((task) => {
    if (!task.due_date || isDoneTaskStatus(task.status, taskStatuses)) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(task.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
    return diffDays >= 0 && diffDays <= 3;
  });
  const unassignedTasks = tasks.filter((task) => !task.assignee_id && !isDoneTaskStatus(task.status, taskStatuses));
  const attentionTasks = [...tasks]
    .filter(
      (task) =>
        !isDoneTaskStatus(task.status, taskStatuses) &&
        (task.is_blocked || !task.assignee_id || overdueTasks.some((candidate) => candidate.id === task.id)),
    )
    .sort((left, right) => {
      if (left.is_blocked !== right.is_blocked) {
        return left.is_blocked ? -1 : 1;
      }

      const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue;
    })
    .slice(0, 5);

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
  const hasBriefChanges =
    ownerDraft !== (project.owner_id ?? "unassigned") ||
    targetDateDraft !== (project.target_date ?? "") ||
    (goalStatementDraft.trim() || "") !== (project.goal_statement ?? "") ||
    (successMetricDraft.trim() || "") !== (project.success_metric ?? "") ||
    (scopeSummaryDraft.trim() || "") !== (project.scope_summary ?? "") ||
    !areStringArraysEqual(normalizeKeyOutcomes(keyOutcomeDrafts), parseProjectKeyOutcomes(project.key_outcomes));
  const canDeleteProject = deleteConfirmation.trim() === project.name;
  const latestStatusUpdate = statusUpdates[0] ?? null;

  useEffect(() => {
    generalDirtyRef.current = hasGeneralChanges;
  }, [hasGeneralChanges]);

  useEffect(() => {
    briefDirtyRef.current = hasBriefChanges;
  }, [hasBriefChanges]);

  useEffect(() => {
    prefixDirtyRef.current = normalizeProjectPrefix(prefixDraft) !== project.prefix;
  }, [prefixDraft, project.prefix]);

  useEffect(() => {
    let isActive = true;

    void supabase
      .from("project_templates")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!isActive) {
          return;
        }

        if (error) {
          toast.error(error.message);
          return;
        }

        setProjectTemplates(sortTemplates((data ?? []) as ProjectTemplate[]));
      });

    return () => {
      isActive = false;
    };
  }, [supabase, workspaceId]);

  useEffect(() => {
    setTaskStatuses(initialTaskStatuses);
  }, [initialTaskStatuses]);

  const displayMemberName = (userId: string | null) => {
    if (!userId) {
      return "Unknown member";
    }

    return getMemberDisplayName(memberNames[userId]);
  };

  const syncProject = useCallback((nextProject: Project) => {
    setProject(nextProject);
    setNameDraft(nextProject.name);
    setDescriptionDraft(nextProject.description ?? "");
    setOwnerDraft(nextProject.owner_id ?? "unassigned");
    setTargetDateDraft(nextProject.target_date ?? "");
    setGoalStatementDraft(nextProject.goal_statement ?? "");
    setSuccessMetricDraft(nextProject.success_metric ?? "");
    setScopeSummaryDraft(nextProject.scope_summary ?? "");
    setKeyOutcomeDrafts(parseProjectKeyOutcomes(nextProject.key_outcomes));
    setNewKeyOutcomeDraft("");
    setPrefixDraft(nextProject.prefix);
    setHasRemoteProjectUpdate(false);
  }, []);

  const applyRemoteProject = useCallback((nextProject: Project) => {
    setProject(nextProject);

    if (!generalDirtyRef.current) {
      setNameDraft(nextProject.name);
      setDescriptionDraft(nextProject.description ?? "");
    }

    if (!briefDirtyRef.current) {
      setOwnerDraft(nextProject.owner_id ?? "unassigned");
      setTargetDateDraft(nextProject.target_date ?? "");
      setGoalStatementDraft(nextProject.goal_statement ?? "");
      setSuccessMetricDraft(nextProject.success_metric ?? "");
      setScopeSummaryDraft(nextProject.scope_summary ?? "");
      setKeyOutcomeDrafts(parseProjectKeyOutcomes(nextProject.key_outcomes));
      setNewKeyOutcomeDraft("");
    }

    if (!prefixDirtyRef.current) {
      setPrefixDraft(nextProject.prefix);
    }

    if (generalDirtyRef.current || briefDirtyRef.current || prefixDirtyRef.current) {
      setHasRemoteProjectUpdate(true);
    }
  }, []);

  const setupRealtimeChannel = useCallback(
    (channel: RealtimeChannel) =>
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "projects",
            filter: `id=eq.${projectId}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") {
              toast.error("This project was removed in another session.");
              router.push(`/workspace/${workspaceId}`);
              router.refresh();
              return;
            }

            applyRemoteProject(payload.new as Project);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tasks",
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => {
            const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Task;

            if (payload.eventType === "DELETE") {
              setTasks((current) => current.filter((task) => task.id !== row.id));
              return;
            }

            setTasks((current) => upsertById(current, row));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "milestones",
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => {
            const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Milestone;

            if (payload.eventType === "DELETE") {
              setMilestones((current) => current.filter((milestone) => milestone.id !== row.id));
              setTasks((current) =>
                current.map((task) => (task.milestone_id === row.id ? { ...task, milestone_id: null } : task)),
              );
              return;
            }

            setMilestones((current) => sortMilestones(upsertById(current, row)));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "standups",
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => {
            const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Standup;

            if (payload.eventType === "DELETE") {
              setStandups((current) => current.filter((standup) => standup.id !== row.id));
              return;
            }

            setStandups((current) => sortStandups(upsertById(current, row)));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_status_updates",
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => {
            const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as ProjectStatusUpdate;

            if (payload.eventType === "DELETE") {
              setStatusUpdates((current) => current.filter((item) => item.id !== row.id));
              return;
            }

            setStatusUpdates((current) => sortStatusUpdates(upsertById(current, row)));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_shares",
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => {
            const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as ProjectShare;

            if (payload.eventType === "DELETE") {
              setProjectShares((current) => current.filter((share) => share.id !== row.id));
              return;
            }

            if (payload.eventType === "INSERT") {
              setProjectShares((current) => [row, ...current.filter((share) => share.id !== row.id)]);
              return;
            }

            setProjectShares((current) => current.map((share) => (share.id === row.id ? row : share)).filter((share) => !share.revoked_at));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_templates",
            filter: `workspace_id=eq.${workspaceId}`,
          },
          (payload) => {
            const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as ProjectTemplate;

            if (payload.eventType === "DELETE") {
              setProjectTemplates((current) => current.filter((template) => template.id !== row.id));
              return;
            }

            if (payload.eventType === "INSERT") {
              setProjectTemplates((current) => sortTemplates([row, ...current.filter((template) => template.id !== row.id)]));
              return;
            }

            setProjectTemplates((current) => sortTemplates(current.map((template) => (template.id === row.id ? row : template))));
          },
        ),
    [applyRemoteProject, projectId, router, workspaceId],
  );

  const { connected: realtimeConnected } = useRealtime({
    enabled: Boolean(projectId),
    name: `project:${projectId}:overview`,
    supabase,
    setup: setupRealtimeChannel,
  });

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

  const saveProjectBrief = () => {
    startSavingBrief(async () => {
      const result = await updateProjectBriefAction({
        workspaceId,
        projectId,
        ownerId: ownerDraft === "unassigned" ? "" : ownerDraft,
        targetDate: targetDateDraft,
        goalStatement: goalStatementDraft,
        successMetric: successMetricDraft,
        scopeSummary: scopeSummaryDraft,
        keyOutcomes: normalizeKeyOutcomes(keyOutcomeDrafts),
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

  const addKeyOutcome = () => {
    const nextOutcome = newKeyOutcomeDraft.trim();

    if (!nextOutcome) {
      return;
    }

    setKeyOutcomeDrafts((current) => normalizeKeyOutcomes([...current, nextOutcome]));
    setNewKeyOutcomeDraft("");
  };

  const updateKeyOutcome = (index: number, value: string) => {
    setKeyOutcomeDrafts((current) => current.map((outcome, currentIndex) => (currentIndex === index ? value : outcome)));
  };

  const removeKeyOutcome = (index: number) => {
    setKeyOutcomeDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index));
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

  const postStatusUpdate = () => {
    startPostingStatusUpdate(async () => {
      const result = await addProjectStatusUpdateAction({
        workspaceId,
        projectId,
        health: statusHealthDraft,
        headline: statusHeadlineDraft,
        summary: statusSummaryDraft,
        risks: statusRisksDraft,
        nextSteps: statusNextStepsDraft,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      if (result.statusUpdate) {
        setStatusUpdates((current) => sortStatusUpdates([result.statusUpdate as ProjectStatusUpdate, ...current]));
      }

      setStatusHealthDraft("on_track");
      setStatusHeadlineDraft("");
      setStatusSummaryDraft("");
      setStatusRisksDraft("");
      setStatusNextStepsDraft("");
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

  const copyShareUrl = async (shareUrl: string) => {
    const copied = await copyTextToClipboard(shareUrl);

    if (copied) {
      toast.success("Share link copied to clipboard.");
      return;
    }

    toast.error("Clipboard access was blocked. Focus the tab and try again.");
  };

  const createShareLink = () => {
    startCreatingShare(async () => {
      const result = await createProjectShareAction({
        workspaceId,
        projectId,
        expiresAt: shareExpiryDraft,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      if (result.share) {
        setProjectShares((current) => [result.share as ProjectShare, ...current.filter((share) => share.id !== result.share?.id)]);
      }

      if (result.sharePath) {
        const shareUrl = new URL(result.sharePath, window.location.origin).toString();
        const copied = await copyTextToClipboard(shareUrl);

        toast.success(
          copied
            ? "Share link created and copied to clipboard."
            : "Share link created. Use Copy to copy it if the browser blocked clipboard access.",
        );
      } else {
        toast.success(result.message);
      }

      setShareExpiryDraft("");
      router.refresh();
    });
  };

  const revokeShare = (shareId: string) => {
    setPendingShareId(shareId);

    startRevokingShare(async () => {
      const result = await revokeProjectShareAction({
        workspaceId,
        projectId,
        shareId,
      });

      setPendingShareId(null);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      setProjectShares((current) => current.filter((share) => share.id !== shareId));
      toast.success(result.message);
      router.refresh();
    });
  };

  const saveProjectTemplate = () => {
    startSavingTemplate(async () => {
      const result = await createProjectTemplateAction({
        workspaceId,
        projectId,
        name: templateNameDraft,
        description: templateDescriptionDraft,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      if (result.template) {
        setProjectTemplates((current) => sortTemplates([result.template as ProjectTemplate, ...current.filter((template) => template.id !== result.template?.id)]));
      }

      setTemplateNameDraft("");
      setTemplateDescriptionDraft("");
      toast.success(result.message);
      router.refresh();
    });
  };

  const deleteTemplate = (templateId: string, templateName: string) => {
    const confirmed = window.confirm(`Delete the template \"${templateName}\"?`);

    if (!confirmed) {
      return;
    }

    setPendingTemplateId(templateId);

    startDeletingTemplate(async () => {
      const result = await deleteProjectTemplateAction({
        workspaceId,
        projectId,
        templateId,
      });

      setPendingTemplateId(null);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      setProjectTemplates((current) => current.filter((template) => template.id !== templateId));
      toast.success(result.message);
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
          <Badge variant="outline">{realtimeConnected ? "Live" : "Connecting..."}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {project.description?.trim() || "Project overview, milestones, standups, and lifecycle controls."}
        </p>
        {hasRemoteProjectUpdate ? (
          <p className="text-xs text-amber-700">
            A teammate updated this project while you were editing. Your local draft is preserved until you save or refresh.
          </p>
        ) : null}
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface-panel rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total tasks</p>
          <p className="text-2xl font-semibold">{totalTasks}</p>
        </div>
        <div className="surface-panel rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Completed</p>
          <p className="text-2xl font-semibold">{completedTasks}</p>
        </div>
        <div className="surface-panel rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">In progress</p>
          <p className="text-2xl font-semibold">{inProgressTasks}</p>
        </div>
        <div className="surface-panel rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Blocked</p>
          <p className="text-2xl font-semibold">{blockedTasks}</p>
        </div>
      </section>

      <section className="surface-panel rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Project brief</p>
            <p className="text-xs text-muted-foreground">Define the owner, delivery target, success metric, and scope in one place.</p>
          </div>
          <Badge variant="outline">Planning spine</Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Project owner</Label>
            <Select value={ownerDraft} onValueChange={(value) => setOwnerDraft(value ?? "unassigned")} disabled={!isOwner || isSavingBrief || isDeletingProject}>
              <SelectTrigger className="w-full">
                <SelectValue>{ownerDraft === "unassigned" ? "No explicit owner" : displayMemberName(ownerDraft)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">No explicit owner</SelectItem>
                {memberOptions.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-target-date">Target date</Label>
            <Input
              id="project-target-date"
              type="date"
              value={targetDateDraft}
              onChange={(event) => setTargetDateDraft(event.target.value)}
              disabled={!isOwner || isSavingBrief || isDeletingProject}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-success-metric">Success metric</Label>
            <Input
              id="project-success-metric"
              value={successMetricDraft}
              onChange={(event) => setSuccessMetricDraft(event.target.value)}
              disabled={!isOwner || isSavingBrief || isDeletingProject}
              placeholder="Launch landing page with stakeholder approval"
            />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="project-goal-statement">Goal statement</Label>
            <textarea
              id="project-goal-statement"
              value={goalStatementDraft}
              onChange={(event) => setGoalStatementDraft(event.target.value)}
              className="surface-subpanel min-h-[96px] w-full resize-y rounded-lg border border-border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={!isOwner || isSavingBrief || isDeletingProject}
              placeholder="State the concrete outcome this project exists to deliver."
            />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="project-scope-summary">Scope summary</Label>
            <textarea
              id="project-scope-summary"
              value={scopeSummaryDraft}
              onChange={(event) => setScopeSummaryDraft(event.target.value)}
              className="surface-subpanel min-h-[120px] w-full resize-y rounded-lg border border-border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={!isOwner || isSavingBrief || isDeletingProject}
              placeholder="Capture the intended outcome, the boundaries of this project, and what success looks like."
            />
          </div>

          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="project-key-outcome">Key outcomes</Label>
              <Badge variant="outline">{normalizeKeyOutcomes(keyOutcomeDrafts).length}/5</Badge>
            </div>

            {keyOutcomeDrafts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Add the few concrete outcomes that should be true when this project lands.
              </div>
            ) : (
              <div className="space-y-2">
                {keyOutcomeDrafts.map((outcome, index) => (
                  <div key={`${index}-${outcome}`} className="flex flex-wrap gap-2">
                    <Input
                      value={outcome}
                      onChange={(event) => updateKeyOutcome(index, event.target.value)}
                      disabled={!isOwner || isSavingBrief || isDeletingProject}
                      placeholder={`Outcome ${index + 1}`}
                    />
                    <Button type="button" variant="outline" onClick={() => removeKeyOutcome(index)} disabled={!isOwner || isSavingBrief || isDeletingProject}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Input
                id="project-key-outcome"
                value={newKeyOutcomeDraft}
                onChange={(event) => setNewKeyOutcomeDraft(event.target.value)}
                disabled={!isOwner || isSavingBrief || isDeletingProject || normalizeKeyOutcomes(keyOutcomeDrafts).length >= 5}
                placeholder="Add a key outcome"
              />
              <Button type="button" variant="outline" onClick={addKeyOutcome} disabled={!isOwner || isSavingBrief || isDeletingProject || !newKeyOutcomeDraft.trim() || normalizeKeyOutcomes(keyOutcomeDrafts).length >= 5}>
                Add outcome
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {project.owner_id ? `Current owner: ${displayMemberName(project.owner_id)}` : "No explicit owner assigned yet."}
          </div>
          <Button type="button" onClick={saveProjectBrief} disabled={!isOwner || !hasBriefChanges || isSavingBrief}>
            {isSavingBrief ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save brief
          </Button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="surface-panel rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Latest status</p>
              <p className="text-xs text-muted-foreground">Capture the current project health for the team and stakeholders.</p>
            </div>
            {latestStatusUpdate ? (
              <Badge variant="outline" className={getHealthBadgeClass(latestStatusUpdate.health)}>
                {getHealthLabel(latestStatusUpdate.health)}
              </Badge>
            ) : (
              <Badge variant="outline">No updates</Badge>
            )}
          </div>

          {latestStatusUpdate ? (
            <div className="surface-subpanel rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-foreground">{latestStatusUpdate.headline}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {displayMemberName(latestStatusUpdate.user_id)} · <RelativeTimeText value={latestStatusUpdate.created_at} initialReferenceTime={renderedAt} />
                  </p>
                </div>
                <Badge variant="outline" className={getHealthBadgeClass(latestStatusUpdate.health)}>
                  {getHealthLabel(latestStatusUpdate.health)}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-foreground">{latestStatusUpdate.summary}</p>
              {latestStatusUpdate.risks ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
                  <p className="font-medium">Risks</p>
                  <p className="mt-1 whitespace-pre-wrap">{latestStatusUpdate.risks}</p>
                </div>
              ) : null}
              {latestStatusUpdate.next_steps ? (
                <div className="surface-subpanel rounded-lg border border-border p-3 text-sm text-foreground">
                  <p className="font-medium text-foreground">Next steps</p>
                  <p className="mt-1 whitespace-pre-wrap">{latestStatusUpdate.next_steps}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No project status updates yet.
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Recent updates</p>
              <Badge variant="outline">{statusUpdates.length} shown</Badge>
            </div>
            {statusUpdates.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Recent updates will appear here.</div>
            ) : (
              statusUpdates.map((statusUpdate) => (
                <article key={statusUpdate.id} className="surface-subpanel rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{statusUpdate.headline}</p>
                    <Badge variant="outline" className={getHealthBadgeClass(statusUpdate.health)}>
                      {getHealthLabel(statusUpdate.health)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {displayMemberName(statusUpdate.user_id)} · <RelativeTimeText value={statusUpdate.created_at} initialReferenceTime={renderedAt} />
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm text-foreground">{statusUpdate.summary}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="surface-panel rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Post status update</p>
              <p className="text-xs text-muted-foreground">Share the current state, major risk, and next move in one place.</p>
            </div>
            <Badge variant="outline">Owner update</Badge>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Health</Label>
              <Select value={statusHealthDraft} onValueChange={(value) => setStatusHealthDraft((value ?? "on_track") as ProjectStatusHealth)} disabled={!isOwner || isPostingStatusUpdate || isDeletingProject}>
                <SelectTrigger className="w-full">
                  <SelectValue>{getHealthLabel(statusHealthDraft)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on_track">On track</SelectItem>
                  <SelectItem value="at_risk">At risk</SelectItem>
                  <SelectItem value="off_track">Off track</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-headline">Headline</Label>
              <Input
                id="status-headline"
                value={statusHeadlineDraft}
                onChange={(event) => setStatusHeadlineDraft(event.target.value)}
                placeholder="What changed since the last update?"
                disabled={!isOwner || isPostingStatusUpdate || isDeletingProject}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-summary">Summary</Label>
              <textarea
                id="status-summary"
                value={statusSummaryDraft}
                onChange={(event) => setStatusSummaryDraft(event.target.value)}
                className="surface-subpanel min-h-[110px] w-full resize-y rounded-lg border border-border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                placeholder="Summarize progress, the delivery picture, and what the team should know now."
                disabled={!isOwner || isPostingStatusUpdate || isDeletingProject}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-risks">Risks</Label>
              <textarea
                id="status-risks"
                value={statusRisksDraft}
                onChange={(event) => setStatusRisksDraft(event.target.value)}
                className="surface-subpanel min-h-[88px] w-full resize-y rounded-lg border border-border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                placeholder="Call out blockers, dependencies, or uncertainty."
                disabled={!isOwner || isPostingStatusUpdate || isDeletingProject}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-next-steps">Next steps</Label>
              <textarea
                id="status-next-steps"
                value={statusNextStepsDraft}
                onChange={(event) => setStatusNextStepsDraft(event.target.value)}
                className="surface-subpanel min-h-[88px] w-full resize-y rounded-lg border border-border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                placeholder="What happens next and what should the team watch for?"
                disabled={!isOwner || isPostingStatusUpdate || isDeletingProject}
              />
            </div>

            {!isOwner ? (
              <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Only workspace owners can post project status updates.
              </div>
            ) : null}

            <Button type="button" onClick={postStatusUpdate} disabled={!isOwner || isPostingStatusUpdate || !statusHeadlineDraft.trim() || !statusSummaryDraft.trim()}>
              {isPostingStatusUpdate ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
              Post status update
            </Button>
          </div>
        </section>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="surface-panel rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Attention queue</p>
              <p className="text-xs text-muted-foreground">Highlight the work most likely to stall delivery.</p>
            </div>
            <Badge variant="outline">{attentionTasks.length} items</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="surface-subpanel rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{overdueTasks.length}</p>
            </div>
            <div className="surface-subpanel rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Due soon</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{dueSoonTasks.length}</p>
            </div>
            <div className="surface-subpanel rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Unassigned</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{unassignedTasks.length}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {attentionTasks.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No urgent attention items right now.</p>
            ) : (
              attentionTasks.map((task) => (
                <div key={task.id} className="surface-subpanel rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{task.identifier}</Badge>
                    {task.is_blocked ? <Badge variant="destructive">Blocked</Badge> : null}
                    {!task.assignee_id ? <Badge variant="secondary">Unassigned</Badge> : null}
                    {overdueTasks.some((candidate) => candidate.id === task.id) ? <Badge variant="destructive">Overdue</Badge> : null}
                  </div>
                  <p className="mt-2 font-medium text-foreground">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.assignee_id ? `Owner: ${displayMemberName(task.assignee_id)}` : "No assignee"}
                    {task.due_date ? ` · Due ${formatDate(task.due_date)}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <section className="surface-panel rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Client sharing</p>
              <p className="text-xs text-muted-foreground">Create read-only share links for project snapshots.</p>
            </div>
            <Badge variant="outline">{projectShares.length} active</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-[220px_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="share-expiry">Expires on</Label>
              <Input id="share-expiry" type="date" value={shareExpiryDraft} onChange={(event) => setShareExpiryDraft(event.target.value)} disabled={!isOwner || isCreatingShare} />
            </div>
            <Button type="button" onClick={createShareLink} disabled={!isOwner || isCreatingShare}>
              {isCreatingShare ? <LoaderCircle className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              Create share link
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {projectShares.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No active client share links yet.</div>
            ) : (
              projectShares.map((share) => {
                const shareBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
                const shareUrl = shareBaseUrl
                  ? new URL(`/share/${share.share_token}`, shareBaseUrl).toString()
                  : `/share/${share.share_token}`;

                return (
                  <div key={share.id} className="surface-subpanel rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{shareUrl}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Created <RelativeTimeText value={share.created_at} initialReferenceTime={renderedAt} />
                          {share.expires_at ? ` · Expires ${formatDate(share.expires_at)}` : " · No expiry"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => void copyShareUrl(shareUrl)}>
                          <Copy className="size-4" />
                          Copy
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => revokeShare(share.id)} disabled={!isOwner || (isRevokingShare && pendingShareId === share.id)}>
                          {isRevokingShare && pendingShareId === share.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                          Revoke
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="surface-panel rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Project templates</p>
              <p className="text-xs text-muted-foreground">Save this project setup as a reusable kickoff template.</p>
            </div>
            <Badge variant="outline">{projectTemplates.length} templates</Badge>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                value={templateNameDraft}
                onChange={(event) => setTemplateNameDraft(event.target.value)}
                placeholder={`${project.name} template`}
                disabled={!isOwner || isSavingTemplate || isDeletingProject}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">Template description</Label>
              <Input
                id="template-description"
                value={templateDescriptionDraft}
                onChange={(event) => setTemplateDescriptionDraft(event.target.value)}
                placeholder="Describe when this template should be used"
                disabled={!isOwner || isSavingTemplate || isDeletingProject}
              />
            </div>
            <Button type="button" onClick={saveProjectTemplate} disabled={!isOwner || isSavingTemplate || !templateNameDraft.trim()}>
              {isSavingTemplate ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save as template
            </Button>
          </div>
        </section>

        <section className="surface-panel rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Available templates</p>
              <p className="text-xs text-muted-foreground">These templates appear when creating a new project in this workspace.</p>
            </div>
          </div>

          <div className="space-y-3">
            {projectTemplates.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No templates saved yet.</div>
            ) : (
              projectTemplates.map((template) => {
                const templateConfig = parseProjectTemplateConfig(template.config);

                return (
                  <div key={template.id} className="surface-subpanel rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{template.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {template.description?.trim() || "No template description."}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{templateConfig.phase.replace(/_/g, " ")}</Badge>
                          <Badge variant="outline">{templateConfig.milestones.length} milestones</Badge>
                          {templateConfig.goalStatement ? <Badge variant="outline">Goal</Badge> : null}
                          {templateConfig.keyOutcomes.length ? <Badge variant="outline">{templateConfig.keyOutcomes.length} outcomes</Badge> : null}
                          {templateConfig.successMetric ? <Badge variant="outline">Success metric</Badge> : null}
                          {templateConfig.scopeSummary ? <Badge variant="outline">Scope summary</Badge> : null}
                        </div>
                      </div>
                      {isOwner ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => deleteTemplate(template.id, template.name)}
                          disabled={isDeletingTemplate && pendingTemplateId === template.id}
                        >
                          {isDeletingTemplate && pendingTemplateId === template.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </section>

      <section className="surface-panel rounded-lg border p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Project details</p>
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
              className="surface-subpanel min-h-[108px] w-full resize-y rounded-lg border border-border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
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

      <section className="surface-panel rounded-lg border p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Task prefix</p>
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

      <section className="surface-panel rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Phase</p>
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

      <section className="surface-panel rounded-lg border p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Project lifecycle</p>
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

      <section className="surface-panel rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Progress</p>
          <Badge variant="outline">{progressPct}%</Badge>
        </div>
        <div className="h-3 rounded-full bg-muted">
          <div className="h-3 rounded-full bg-emerald-500" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {completedTasks} of {totalTasks} tasks completed
        </p>
      </section>

      <section className="surface-panel rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Milestones</p>
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
              <li key={milestone.id} className="surface-subpanel flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{milestone.name}</p>
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

      <section className="surface-panel rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Recent standups</p>
          <Button type="button" onClick={() => setIsStandupModalOpen(true)}>
            + Post standup
          </Button>
        </div>

        {standups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No standups yet.</p>
        ) : (
          <ul className="space-y-2">
            {standups.map((standup) => (
              <li key={standup.id} className="surface-subpanel rounded-md border p-3 text-sm">
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

      <section className="surface-panel rounded-lg border p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Team members on this project</p>
        {teamAssignees.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignees yet.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {teamAssignees.map((assigneeId) => (
              <div key={assigneeId} className="surface-subpanel inline-flex items-center gap-2 rounded-full border px-2 py-1 text-sm">
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
        <section className="rounded-lg border border-red-200 bg-red-50/40 p-4 dark:border-red-500/25 dark:bg-red-500/10">
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
