import { redirect } from "next/navigation";

import { NotesView } from "@/components/notes/NotesView";
import { RealtimeRefreshBridge } from "@/components/shared/RealtimeRefreshBridge";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type NotesPageProps = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
  }>;
};

type Note = Database["public"]["Tables"]["notes"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];

export default async function NotesPage({ params }: NotesPageProps) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data }, { data: project }] = await Promise.all([
    supabase
      .from("notes")
      .select("*")
      .eq("project_id", projectId)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false }),
    supabase
      .from("projects")
      .select("status")
      .eq("id", projectId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  return (
    <>
      <RealtimeRefreshBridge
        name={`project:${projectId}:notes-refresh`}
        subscriptions={[
          { table: "projects", filter: `id=eq.${projectId}` },
          { table: "workspace_members", filter: `workspace_id=eq.${workspaceId}` },
        ]}
      />
      <NotesView
        workspaceId={workspaceId}
        projectId={projectId}
        initialNotes={(data ?? []) as Note[]}
        isReadOnly={(project as Pick<Project, "status"> | null)?.status === "archived"}
      />
    </>
  );
}
