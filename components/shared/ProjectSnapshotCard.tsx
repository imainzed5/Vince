import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCalendarDate } from "@/lib/utils/time";
import type { Database } from "@/types/database.types";

type ActivityRow = Database["public"]["Tables"]["activity_log"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];
type Standup = Database["public"]["Tables"]["standups"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];

type ProjectSnapshotCardProps = {
  activityItems: ActivityRow[];
  memberNames: Record<string, string>;
  milestones: Milestone[];
  ownerName: string | null;
  project: Project;
  standups: Standup[];
  tasks: Task[];
};

export function ProjectSnapshotCard({
  activityItems,
  memberNames,
  milestones,
  ownerName,
  project,
  standups,
  tasks,
}: ProjectSnapshotCardProps) {
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const blockedTasks = tasks.filter((task) => task.is_blocked).length;
  const openTasks = tasks.filter((task) => task.status !== "done");
  const progressPct = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
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
              <p className="mt-1 text-sm text-muted-foreground">{project.scope_summary || project.description || "No project summary provided yet."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{project.phase.replace(/_/g, " ")}</Badge>
              <Badge variant={project.status === "archived" ? "secondary" : "outline"}>{project.status}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Owner</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{ownerName ?? "No explicit owner"}</p>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Target date</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatCalendarDate(project.target_date, { includeYear: true, fallback: "Not set" })}</p>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Success metric</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{project.success_metric || "Not defined"}</p>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{progressPct}% complete</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <section>
                <p className="text-sm font-semibold text-slate-800">Current work</p>
                <div className="mt-3 space-y-2">
                  {openTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No open tasks right now.</div>
                  ) : (
                    openTasks.slice(0, 8).map((task) => (
                      <div key={task.id} className="rounded-xl border bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{task.identifier}</Badge>
                          {task.is_blocked ? <Badge variant="destructive">Blocked</Badge> : null}
                          <Badge variant="secondary">{task.status.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="mt-2 font-medium text-slate-900">{task.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {task.assignee_id ? memberNames[task.assignee_id] ?? `User ${task.assignee_id.slice(0, 8)}` : "Unassigned"}
                          {task.due_date ? ` · Due ${formatCalendarDate(task.due_date, { includeYear: true, fallback: "" })}` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <p className="text-sm font-semibold text-slate-800">Milestones</p>
                <div className="mt-3 space-y-2">
                  {milestones.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No milestones yet.</div>
                  ) : (
                    milestones.map((milestone) => (
                      <div key={milestone.id} className="rounded-xl border bg-slate-50 p-3">
                        <p className="font-medium text-slate-900">{milestone.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatCalendarDate(milestone.due_date, { includeYear: true, fallback: "No target date" })}
                          {` · ${milestoneTaskCount.get(milestone.id) ?? 0} linked tasks`}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <section className="rounded-xl border bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">Delivery snapshot</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Open tasks</span>
                    <span className="font-medium text-slate-900">{openTasks.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-medium text-slate-900">{completedTasks}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Blocked</span>
                    <span className="font-medium text-slate-900">{blockedTasks}</span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">Recent standups</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  {standups.length === 0 ? (
                    <p className="text-muted-foreground">No standups shared yet.</p>
                  ) : (
                    standups.map((standup) => (
                      <div key={standup.id} className="rounded-lg border bg-white p-3">
                        <p className="text-xs text-muted-foreground">{memberNames[standup.user_id] ?? `User ${standup.user_id.slice(0, 8)}`}</p>
                        <p className="mt-2"><strong>Done:</strong> {standup.done || "-"}</p>
                        <p><strong>Next:</strong> {standup.next || "-"}</p>
                        <p><strong>Blockers:</strong> {standup.blockers || "-"}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-xl border bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">Recent activity</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  {activityItems.length === 0 ? (
                    <p className="text-muted-foreground">No activity recorded yet.</p>
                  ) : (
                    activityItems.map((item) => (
                      <div key={item.id} className="rounded-lg border bg-white p-3">
                        <p className="font-medium text-slate-900">{item.action.replace(/\./g, " ")}</p>
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