import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signupAction } from "../actions";

type SignupPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const resolvedSearchParams = await searchParams;
  const error = resolvedSearchParams?.error ? decodeURIComponent(resolvedSearchParams.error) : null;

  return (
    <AuthShell
      eyebrow="Get your team moving"
      title="Create your account"
      formTitle="Create your account"
      heroTitle={
        <>
          <span className="block">Start</span>
          <span className="block text-white/68">together.</span>
        </>
      }
      heroDescription="Set up your account, then create or join a workspace with one invite code. Vince handles the rest automatically."
      description="Takes 30 seconds. Your workspace is one invite code away."
      highlights={["Create or join instantly", "Boards stay lightweight", "Built for small teams"]}
      footer={
        <p className="text-center text-sm text-slate-500">
          Already have an account? {" "}
          <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/login">
            Sign in
          </Link>
        </p>
      }
      infoEyebrow="What opens after sign-in"
      infoDescription="Vince routes you back automatically: your current workspace, your workspace list, or the create-or-join screen if you are brand new."
    >
          <form action={signupAction} className="space-y-5">
            {error ? (
              <Alert variant="destructive" className="rounded-[16px] border border-red-200/85 bg-white/72 px-4 py-3 text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_8px_20px_-18px_rgba(15,23,42,0.25)]">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-sm font-medium text-slate-700">Display name</Label>
              <Input
                id="displayName"
                name="displayName"
                type="text"
                autoComplete="nickname"
                maxLength={60}
                placeholder="Alex Carter"
                className="h-12 rounded-[15px] border border-white/80 bg-white/72 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus-visible:border-blue-400/70 focus-visible:ring-blue-200/80"
                required
              />
            </div>
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
              <Label htmlFor="password" className="text-sm font-medium text-slate-700">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                placeholder="Use at least 8 characters"
                className="h-12 rounded-[15px] border border-white/80 bg-white/72 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus-visible:border-blue-400/70 focus-visible:ring-blue-200/80"
                required
              />
              <p className="text-xs leading-6 text-slate-400">
                After sign-up, Vince either signs you in immediately or asks you to confirm your email before continuing.
              </p>
            </div>
            <AuthSubmitButton idleLabel="Create account" pendingLabel="Creating account..." />
          </form>
    </AuthShell>
  );
}
