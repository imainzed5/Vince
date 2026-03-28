import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaceRoute } from "@/lib/workspace";

import { createWorkspaceAction, joinWorkspaceAction } from "./actions";

type CreateWorkspacePageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function CreateWorkspacePage({
  searchParams,
}: CreateWorkspacePageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const destination = await getUserWorkspaceRoute(supabase, user.id);
  const hasExistingWorkspaces = destination.kind !== "none";
  const backHref = hasExistingWorkspaces ? destination.path : null;
  const backLabel = destination.kind === "single" ? "Back to workspace" : "Back to workspaces";

  const error = resolvedSearchParams?.error ? decodeURIComponent(resolvedSearchParams.error) : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-2xl font-semibold">
                {hasExistingWorkspaces ? "Create or join a workspace" : "Get started"}
              </CardTitle>
              <CardDescription>
                {hasExistingWorkspaces
                  ? "Create another workspace or join one with an invite code."
                  : "Create a new workspace or join one with an invite code."}
              </CardDescription>
            </div>
            {backHref ? (
              <Link href={backHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {backLabel}
              </Link>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <form action={createWorkspaceAction} className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="name">Workspace Name</Label>
              <Input id="name" name="name" placeholder="Acme Product Team" required />
            </div>
            <Button type="submit" className="w-full">
              Create workspace
            </Button>
          </form>

          <div className="my-5 border-t" />

          <form action={joinWorkspaceAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inviteCode">Join an existing workspace</Label>
              <Input id="inviteCode" name="inviteCode" placeholder="Enter invite code" required />
            </div>
            <Button type="submit" variant="outline" className="w-full">
              Join workspace
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
