"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "@/components/ui/sonner";

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
import { createClient } from "@/lib/supabase/client";
import { insertActivity } from "@/lib/supabase/activity";
import { getTaskStatusColumns, withTaskStatusFallbacks } from "@/lib/task-statuses";
import type { Database } from "@/types/database.types";
import type { Task, TaskPriority, TaskStatus, WorkspaceTaskStatusDefinition } from "@/types";

type Assignee = {
  id: string;
  name: string;
};

type ProjectPrefixRecord = {
  prefix: string;
};

type QuickCreateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  projectId: string;
  projectPrefix: string;
  assignees: Assignee[];
  taskStatuses?: WorkspaceTaskStatusDefinition[];
  readOnly?: boolean;
  defaultStatus: TaskStatus;
  onOptimisticCreate: (task: Task) => void;
  onCreateCommit: (tempTaskId: string, task: Task) => void;
  onCreateRollback: (tempTaskId: string) => void;
  onError: (message: string) => void;
};

const PRIORITY_OPTIONS: TaskPriority[] = ["urgent", "high", "medium", "none"];

export function QuickCreateModal({
  open,
  onOpenChange,
  workspaceId,
  projectId,
  projectPrefix,
  assignees,
  taskStatuses = [],
  readOnly = false,
  defaultStatus,
  onOptimisticCreate,
  onCreateCommit,
  onCreateRollback,
  onError,
}: QuickCreateModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const statusColumns = useMemo(
    () => getTaskStatusColumns(withTaskStatusFallbacks(taskStatuses, [defaultStatus])),
    [defaultStatus, taskStatuses],
  );

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [assigneeId, setAssigneeId] = useState<string>("unassigned");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setStatus(defaultStatus);
  }, [defaultStatus, open]);

  const reset = () => {
    setTitle("");
    setPriority("none");
    setAssigneeId("unassigned");
    setValidationError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (readOnly) {
      return;
    }

    if (!title.trim()) {
      setValidationError("Title is required.");
      return;
    }

    setValidationError(null);

    setIsSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        onError("Your session has expired. Please sign in again.");
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("prefix")
        .eq("id", projectId)
        .single();

      if (projectError || !projectData) {
        onError(projectError?.message ?? "Project prefix could not be loaded.");
        toast.error(projectError?.message ?? "Project prefix could not be loaded.");
        return;
      }

      const activePrefix = (projectData as ProjectPrefixRecord).prefix ?? projectPrefix;

      const { data: seqData, error: seqError } = await supabase.rpc("generate_task_identifier", {
        p_project_id: projectId,
        p_prefix: activePrefix,
      });

      const identifier =
        seqError || !seqData ? `${activePrefix}-${String(Date.now()).slice(-6)}` : seqData;

      if (seqError || !seqData) {
        console.error("Falling back to timestamp identifier", seqError);
      }

      const { data: currentTasks } = await supabase
        .from("tasks")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", status);

      const tempTaskId = `temp-${Date.now()}`;
      const optimisticTask: Task = {
        id: tempTaskId,
        project_id: projectId,
        identifier,
        title: title.trim(),
        custom_fields: {},
        description: null,
        status,
        priority,
        assignee_id: assigneeId === "unassigned" ? null : assigneeId,
        due_date: null,
        is_blocked: false,
        blocked_reason: null,
        milestone_id: null,
        position: currentTasks?.length ?? 0,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      onOptimisticCreate(optimisticTask);
      reset();
      onOpenChange(false);

      const insertPayload: Database["public"]["Tables"]["tasks"]["Insert"] = {
        project_id: projectId,
        identifier,
        title: optimisticTask.title,
        custom_fields: {},
        status,
        priority,
        assignee_id: assigneeId === "unassigned" ? null : assigneeId,
        position: optimisticTask.position,
        created_by: user.id,
      };

      const { data: task, error: insertError } = await supabase
        .from("tasks")
        .insert(insertPayload)
        .select("*")
        .single();

      if (insertError || !task) {
        onCreateRollback(tempTaskId);
        onError(insertError?.message ?? "Task creation failed.");
        toast.error(insertError?.message ?? "Task creation failed.");
        return;
      }

      onCreateCommit(tempTaskId, task as Task);

      await insertActivity(supabase, {
        workspaceId,
        projectId,
        actorId: user.id,
        action: "task.created",
        metadata: {
          taskId: task.id,
          identifier: task.identifier,
          title: task.title,
        },
      });

      if (task.assignee_id) {
        await insertActivity(supabase, {
          workspaceId,
          projectId,
          actorId: user.id,
          action: "task.assigned",
          metadata: {
            taskId: task.id,
            identifier: task.identifier,
            assigneeId: task.assignee_id,
          },
        });
      }

      toast.success("Task created successfully.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>
            {readOnly
              ? "This project is archived. Restore it from the overview screen before creating new tasks."
              : `Create a new task for this board. Identifier is auto-generated with the ${projectPrefix} prefix.`}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (validationError) {
                  setValidationError(null);
                }
              }}
              placeholder="Implement drag-and-drop board"
              disabled={readOnly || isSubmitting}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue>{statusColumns.find((column) => column.status === status)?.label ?? "Status"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {statusColumns.map((column) => (
                    <SelectItem key={column.status} value={column.status}>
                      {column.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={(value) => setAssigneeId(value ?? "unassigned")} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {assigneeId === "unassigned"
                      ? "Unassigned"
                      : assignees.find((member) => member.id === assigneeId)?.name ?? "Unknown member"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {assignees.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {validationError ? <p className="text-sm text-red-600">{validationError}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={readOnly || isSubmitting}>
              {readOnly ? "Archived project" : isSubmitting ? "Creating..." : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
