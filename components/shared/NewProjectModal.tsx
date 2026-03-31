"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import { parseProjectTemplateConfig } from "@/lib/pm-config";
import { deriveProjectPrefix, makeUniqueProjectPrefix } from "@/lib/project-prefix";
import { createClient } from "@/lib/supabase/client";
import { insertActivity } from "@/lib/supabase/activity";
import type { Database } from "@/types/database.types";
import type { Project } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type NewProjectModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onCreated?: (project: Project) => void;
};

export function NewProjectModal({
  open,
  onOpenChange,
  workspaceId,
  onCreated,
}: NewProjectModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectTemplates, setProjectTemplates] = useState<Database["public"]["Tables"]["project_templates"]["Row"][]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("none");
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const suggestedPrefix = useMemo(() => deriveProjectPrefix(name), [name]);

  const reset = () => {
    setName("");
    setDescription("");
    setSelectedTemplateId("none");
    setErrorMessage(null);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    let isActive = true;
    setIsLoadingTemplates(true);

    void supabase
      .from("project_templates")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!isActive) {
          return;
        }

        setIsLoadingTemplates(false);

        if (error) {
          toast.error(error.message);
          return;
        }

        setProjectTemplates((data ?? []) as Database["public"]["Tables"]["project_templates"]["Row"][]);
      });

    return () => {
      isActive = false;
    };
  }, [open, supabase, workspaceId]);

  useEffect(() => {
    if (selectedTemplateId === "none") {
      return;
    }

    const selectedTemplate = projectTemplates.find((template) => template.id === selectedTemplateId);

    if (!selectedTemplate) {
      return;
    }

    const templateConfig = parseProjectTemplateConfig(selectedTemplate.config);

    setDescription((current) => (current.trim() ? current : templateConfig.projectDescription));
  }, [projectTemplates, selectedTemplateId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorMessage("Project name is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMessage("Your session has expired. Please sign in again.");
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const { data: existingProjects, error: existingProjectsError } = await supabase
        .from("projects")
        .select("prefix")
        .eq("workspace_id", workspaceId);

      if (existingProjectsError) {
        setErrorMessage(existingProjectsError.message);
        toast.error(existingProjectsError.message);
        return;
      }

      const prefix = makeUniqueProjectPrefix(
        deriveProjectPrefix(trimmedName),
        (existingProjects ?? []).map((project) => project.prefix ?? ""),
      );
      const selectedTemplate = projectTemplates.find((template) => template.id === selectedTemplateId) ?? null;
      const templateConfig = selectedTemplate ? parseProjectTemplateConfig(selectedTemplate.config) : null;

      const payload: Database["public"]["Tables"]["projects"]["Insert"] = {
        workspace_id: workspaceId,
        name: trimmedName,
        prefix,
        description: description.trim() || templateConfig?.projectDescription || null,
        created_by: user.id,
        owner_id: user.id,
        phase: templateConfig?.phase ?? "planning",
        status: "active",
        goal_statement: templateConfig?.goalStatement || null,
        key_outcomes: templateConfig?.keyOutcomes ?? [],
        scope_summary: templateConfig?.scopeSummary || null,
        success_metric: templateConfig?.successMetric || null,
      };

      const { data: project, error } = await supabase
        .from("projects")
        .insert(payload)
        .select("*")
        .single();

      if (error || !project) {
        setErrorMessage(error?.message ?? "Could not create project.");
        toast.error(error?.message ?? "Could not create project.");
        return;
      }

      if (templateConfig?.milestones.length) {
        const { error: milestoneError } = await supabase.from("milestones").insert(
          templateConfig.milestones.map((milestoneName) => ({
            project_id: project.id,
            name: milestoneName,
          })),
        );

        if (milestoneError) {
          toast.error(`Project created, but milestones could not be applied: ${milestoneError.message}`);
        }
      }

      await insertActivity(supabase, {
        workspaceId,
        projectId: project.id,
        actorId: user.id,
        action: "project.created",
        metadata: { projectId: project.id, name: project.name, prefix: project.prefix },
      });

      onCreated?.(project as Project);
      toast.success("Project created successfully.");
      reset();
      onOpenChange(false);
      router.push(`/workspace/${workspaceId}/project/${project.id}/board`);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          reset();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Create a project in this workspace. It will open on the board view after creation.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="new-project-name">Project name</Label>
            <Input
              id="new-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Website Redesign"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-project-description">Description (optional)</Label>
            <Input
              id="new-project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short summary of what this project is about"
            />
          </div>

          <div className="space-y-2">
            <Label>Start from template (optional)</Label>
            <Select value={selectedTemplateId} onValueChange={(value) => setSelectedTemplateId(value ?? "none")}>
              <SelectTrigger>
                <SelectValue placeholder={isLoadingTemplates ? "Loading templates..." : "No template"}>
                  {selectedTemplateId === "none"
                    ? (isLoadingTemplates ? "Loading templates..." : "No template")
                    : projectTemplates.find((template) => template.id === selectedTemplateId)?.name ?? "No template"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {projectTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplateId !== "none" ? (
              (() => {
                const selectedTemplate = projectTemplates.find((template) => template.id === selectedTemplateId);

                if (!selectedTemplate) {
                  return null;
                }

                const templateConfig = parseProjectTemplateConfig(selectedTemplate.config);

                return (
                  <div className="surface-subpanel rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{selectedTemplate.name}</p>
                    <p className="mt-1">{selectedTemplate.description?.trim() || "No template description."}</p>
                    <p className="mt-2">
                      Applies {templateConfig.milestones.length} milestone{templateConfig.milestones.length === 1 ? "" : "s"}, {templateConfig.keyOutcomes.length} outcome{templateConfig.keyOutcomes.length === 1 ? "" : "s"}, project brief fields, and the {templateConfig.phase.replace(/_/g, " ")} phase.
                    </p>
                  </div>
                );
              })()
            ) : null}
          </div>

          <div className="surface-subpanel rounded-lg border border-dashed border-border px-3 py-3 text-sm">
            <p className="font-medium text-foreground">Initial task prefix</p>
            <p className="mt-1 font-mono text-base text-foreground">{suggestedPrefix || "PRJ"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This is auto-generated from the project name. Owners can edit it later from the project overview.
            </p>
          </div>

          {errorMessage ? <p className="text-sm text-red-600 dark:text-red-300">{errorMessage}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
