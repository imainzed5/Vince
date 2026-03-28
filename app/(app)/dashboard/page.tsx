import { redirect } from "next/navigation";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  const workspaceIds = (memberships ?? []).map((membership) => membership.workspace_id);

  let workspaces: Workspace[] = [];

  if (workspaceIds.length > 0) {
    const { data } = await supabase
      .from("workspaces")
      .select("*")
      .in("id", workspaceIds)
      .order("created_at", { ascending: true });

    workspaces = (data ?? []) as Workspace[];
  }

  if (!workspaces.length) {
    return (
      <main className="p-6">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>No workspaces yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create your first workspace or join an existing one to start tracking projects, tasks, and team activity.
            </p>
            <Link
              href="/create-workspace"
              className={buttonVariants()}
            >
              Create or join workspace
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="space-y-4 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Your workspaces</h1>
          <p className="text-sm text-muted-foreground">Select a workspace to continue, or add another one.</p>
        </div>
        <Link href="/create-workspace" className={buttonVariants({ variant: "outline" })}>
          Create or join workspace
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {workspaces.map((workspace) => (
          <Link key={workspace.id} href={`/workspace/${workspace.id}`}>
            <Card className="h-full transition hover:border-slate-400 hover:shadow-sm">
              <CardHeader>
                <CardTitle className="truncate text-lg">{workspace.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Open workspace</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </main>
  );
}
