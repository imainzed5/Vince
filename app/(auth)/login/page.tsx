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
      formTitle="Sign in to Vince"
      heroTitle={
        <>
          <span className="block">Welcome</span>
          <span className="block text-white/68">back.</span>
        </>
      }
      heroDescription="Pick up your workspace, projects, notes, and team conversations right where you left off."
      description="No extra onboarding steps. Just back to your team."
      highlights={["Projects stay live", "Workspaces auto-route", "Chat stays in sync"]}
      footer={
          <p className="text-center text-sm text-slate-500">
            No account yet? {" "}
            <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/signup">
              Create one
            </Link>
          </p>
      }
      infoEyebrow="What opens after sign-in"
      infoDescription="Vince routes you back automatically: your current workspace, your workspace list, or the create-or-join screen if you are brand new."
    >
          <form action={loginAction} className="space-y-5">
            {error ? (
              <Alert variant="destructive" className="rounded-[16px] border border-red-200/85 bg-white/72 px-4 py-3 text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_8px_20px_-18px_rgba(15,23,42,0.25)]">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {message ? (
              <Alert className="rounded-[16px] border border-slate-200/85 bg-white/72 px-4 py-3 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_8px_20px_-18px_rgba(15,23,42,0.25)]">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-700">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@team.com"
                className="h-12 rounded-[15px] border border-white/80 bg-white/72 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus-visible:border-blue-400/70 focus-visible:ring-blue-200/80"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password" className="text-sm font-medium text-slate-700">Password</Label>
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
                className="h-12 rounded-[15px] border border-white/80 bg-white/72 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus-visible:border-blue-400/70 focus-visible:ring-blue-200/80"
                required
              />
            </div>
            <AuthSubmitButton idleLabel="Sign in" pendingLabel="Signing in..." />
          </form>
    </AuthShell>
  );
}
