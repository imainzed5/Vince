import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseProjectKeyOutcomes } from "@/lib/pm-config";
import { getTaskStatusLabel, isDoneTaskStatus } from "@/lib/task-statuses";
import { getMemberDisplayName } from "@/lib/utils/displayName";
import { formatCalendarDate } from "@/lib/utils/time";
import type { Database } from "@/types/database.types";

type ActivityRow = Database["public"]["Tables"]["activity_log"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];
type ProjectStatusUpdate = Database["public"]["Tables"]["project_status_updates"]["Row"];
type Standup = Database["public"]["Tables"]["standups"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];

type ProjectSnapshotCardProps = {
  activityItems: ActivityRow[];
  memberNames: Record<string, string>;
  milestones: Milestone[];
  ownerName: string | null;
  project: Project;
  statusUpdates: ProjectStatusUpdate[];
  standups: Standup[];
  taskStatuses: Database["public"]["Tables"]["workspace_task_statuses"]["Row"][];
  tasks: Task[];
};

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

export function ProjectSnapshotCard({
  activityItems,
  memberNames,
  milestones,
  ownerName,
  project,
  statusUpdates,
  standups,
  taskStatuses,
  tasks,
}: ProjectSnapshotCardProps) {
  const completedTasks = tasks.filter((task) => isDoneTaskStatus(task.status, taskStatuses)).length;
  const blockedTasks = tasks.filter((task) => task.is_blocked).length;
  const openTasks = tasks.filter((task) => !isDoneTaskStatus(task.status, taskStatuses));
  const progressPct = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const keyOutcomes = parseProjectKeyOutcomes(project.key_outcomes);
  const milestoneTaskCount = new Map<string, number>();

  for (const task of tasks) {
    if (!task.milestone_id) {
      continue;
    }

    milestoneTaskCount.set(task.milestone_id, (milestoneTaskCount.get(task.milestone_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Shared project snapshot</p>
              <CardTitle>{project.name}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{project.goal_statement || project.scope_summary || project.description || "No project summary provided yet."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{project.phase.replace(/_/g, " ")}</Badge>
              <Badge variant={project.status === "archived" ? "secondary" : "outline"}>{project.status}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="surface-subpanel rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">Owner</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{ownerName ?? "No explicit owner"}</p>
            </div>
            <div className="surface-subpanel rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">Target date</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{formatCalendarDate(project.target_date, { includeYear: true, fallback: "Not set" })}</p>
            </div>
            <div className="surface-subpanel rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">Success metric</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{project.success_metric || "Not defined"}</p>
            </div>
            <div className="surface-subpanel rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{progressPct}% complete</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <section>
                <p className="text-sm font-semibold text-foreground">Planning spine</p>
                <div className="surface-panel mt-3 space-y-3 rounded-xl border p-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Goal</p>
                    <p className="mt-1 text-sm text-foreground">{project.goal_statement || "No goal statement set yet."}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Key outcomes</p>
                    {keyOutcomes.length === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">No key outcomes defined yet.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {keyOutcomes.map((outcome) => (
                          <li key={outcome} className="surface-subpanel rounded-lg border px-3 py-2 text-sm text-foreground">
                            {outcome}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <p className="text-sm font-semibold text-foreground">Current work</p>
                <div className="mt-3 space-y-2">
                  {openTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No open tasks right now.</div>
                  ) : (
                    openTasks.slice(0, 8).map((task) => (
                      <div key={task.id} className="surface-panel rounded-xl border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{task.identifier}</Badge>
                          {task.is_blocked ? <Badge variant="destructive">Blocked</Badge> : null}
                          <Badge variant="secondary">{getTaskStatusLabel(task.status, taskStatuses)}</Badge>
                        </div>
                        <p className="mt-2 font-medium text-foreground">{task.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {task.assignee_id ? getMemberDisplayName(memberNames[task.assignee_id]) : "Unassigned"}
                          {task.due_date ? ` · Due ${formatCalendarDate(task.due_date, { includeYear: true, fallback: "" })}` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <p className="text-sm font-semibold text-foreground">Milestones</p>
                <div className="mt-3 space-y-2">
                  {milestones.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No milestones yet.</div>
                  ) : (
                    milestones.map((milestone) => (
                      <div key={milestone.id} className="surface-panel rounded-xl border p-3">
                        <p className="font-medium text-foreground">{milestone.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatCalendarDate(milestone.due_date, { includeYear: true, fallback: "No target date" })}
                          {` · ${milestoneTaskCount.get(milestone.id) ?? 0} linked tasks`}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <p className="text-sm font-semibold text-foreground">Project status updates</p>
                <div className="mt-3 space-y-2">
                  {statusUpdates.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No status updates shared yet.</div>
                  ) : (
                    statusUpdates.map((statusUpdate) => (
                      <div key={statusUpdate.id} className="surface-panel rounded-xl border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-foreground">{statusUpdate.headline}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {getMemberDisplayName(memberNames[statusUpdate.user_id])} · {formatCalendarDate(statusUpdate.created_at, { includeYear: true, fallback: "Recently" })}
                            </p>
                          </div>
                          <Badge variant="outline" className={getHealthBadgeClass(statusUpdate.health)}>
                            {getHealthLabel(statusUpdate.health)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-foreground">{statusUpdate.summary}</p>
                        {statusUpdate.risks ? <p className="mt-2 text-xs text-amber-800 dark:text-amber-200"><strong>Risks:</strong> {statusUpdate.risks}</p> : null}
                        {statusUpdate.next_steps ? <p className="mt-1 text-xs text-muted-foreground"><strong>Next:</strong> {statusUpdate.next_steps}</p> : null}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <section className="surface-panel rounded-xl border p-4">
                <p className="text-sm font-semibold text-foreground">Delivery snapshot</p>
                <div className="mt-3 space-y-2 text-sm text-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Open tasks</span>
                    <span className="font-medium text-foreground">{openTasks.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-medium text-foreground">{completedTasks}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Blocked</span>
                    <span className="font-medium text-foreground">{blockedTasks}</span>
                  </div>
                </div>
              </section>

              <section className="surface-panel rounded-xl border p-4">
                <p className="text-sm font-semibold text-foreground">Recent standups</p>
                <div className="mt-3 space-y-2 text-sm text-foreground">
                  {standups.length === 0 ? (
                    <p className="text-muted-foreground">No standups shared yet.</p>
                  ) : (
                    standups.map((standup) => (
                      <div key={standup.id} className="surface-subpanel rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">{getMemberDisplayName(memberNames[standup.user_id])}</p>
                        <p className="mt-2"><strong>Done:</strong> {standup.done || "-"}</p>
                        <p><strong>Next:</strong> {standup.next || "-"}</p>
                        <p><strong>Blockers:</strong> {standup.blockers || "-"}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="surface-panel rounded-xl border p-4">
                <p className="text-sm font-semibold text-foreground">Recent activity</p>
                <div className="mt-3 space-y-2 text-sm text-foreground">
                  {activityItems.length === 0 ? (
                    <p className="text-muted-foreground">No activity recorded yet.</p>
                  ) : (
                    activityItems.map((item) => (
                      <div key={item.id} className="surface-subpanel rounded-lg border p-3">
                        <p className="font-medium text-foreground">{item.action.replace(/\./g, " ")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatCalendarDate(item.created_at, { includeYear: true, fallback: "Recently" })}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}