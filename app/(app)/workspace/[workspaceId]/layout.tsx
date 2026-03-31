import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";

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
      <header className="surface-shell border-b px-6 py-4 supports-[backdrop-filter]:backdrop-blur-xl">
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
                className="surface-subpanel h-9 w-full rounded-lg border border-border px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <button
                type="submit"
                aria-label="Search workspace"
                className="surface-subpanel surface-subpanel-hover inline-flex size-9 items-center justify-center rounded-lg border border-border text-sm font-medium transition-colors"
              >
                <Search className="size-4" />
                <span className="sr-only">Search workspace</span>
              </button>
            </form>
            <NotificationInbox workspaceId={workspaceId} />
            <Link
              href="/dashboard"
              className="surface-subpanel surface-subpanel-hover inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium transition-colors"
            >
              <ArrowLeft className="mr-2 size-4" />
              Workspaces
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
