import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { loginAction } from "../actions";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const error = resolvedSearchParams?.error ? decodeURIComponent(resolvedSearchParams.error) : null;
  const message = resolvedSearchParams?.message
    ? decodeURIComponent(resolvedSearchParams.message)
    : null;

  return (
    <AuthShell
      eyebrow="Focused team workspace"
      title="Sign in to Vince"
      description="Pick up your workspace, projects, notes, and team conversations without extra onboarding steps every time you come back."
      highlights={["Projects stay live", "Workspaces route automatically", "Chat and activity stay in sync"]}
      footer={
          <p className="text-center text-sm text-muted-foreground">
            No account yet? {" "}
            <Link className="font-medium text-foreground underline underline-offset-4" href="/signup">
              Create one
            </Link>
          </p>
      }
    >
          <form action={loginAction} className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {message ? (
              <Alert>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@team.com"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password">Password</Label>
                <Link className="text-xs font-medium text-primary underline-offset-4 hover:underline" href="/forgot-password">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                required
              />
            </div>
            <AuthSubmitButton idleLabel="Sign in" pendingLabel="Signing in..." />
          </form>
    </AuthShell>
  );
}
