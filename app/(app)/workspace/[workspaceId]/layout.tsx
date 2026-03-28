import Link from "next/link";
import { redirect } from "next/navigation";

import { NotificationInbox } from "@/components/shared/NotificationInbox";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleWorkspace } from "@/lib/workspace";

type WorkspaceLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workspace = await getAccessibleWorkspace(supabase, workspaceId);

  if (!workspace) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Workspace</p>
            <h1 className="text-xl font-semibold">{workspace.name}</h1>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <form action={`/workspace/${workspaceId}`} className="flex w-full max-w-md items-center gap-2 sm:w-auto sm:flex-1">
              <input
                type="search"
                name="q"
                placeholder="Search tasks, notes, and chat"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                Search
              </button>
            </form>
            <NotificationInbox workspaceId={workspaceId} />
            <Link
              href="/dashboard"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              Back to workspaces
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
