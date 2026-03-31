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
      title="Create your Vince account"
      description="Set up your account, then create or join a workspace with one invite code. Vince will route you into the right next step automatically."
      highlights={["Create or join instantly", "Project boards stay lightweight", "Built for small teams"]}
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Already have an account? {" "}
          <Link className="font-medium text-foreground underline underline-offset-4" href="/login">
            Sign in
          </Link>
        </p>
      }
    >
          <form action={signupAction} className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                placeholder="Use at least 8 characters"
                required
              />
              <p className="text-xs text-muted-foreground">
                After sign-up, Vince either signs you in immediately or asks you to confirm your email before continuing.
              </p>
            </div>
            <AuthSubmitButton idleLabel="Create account" pendingLabel="Creating account..." />
          </form>
    </AuthShell>
  );
}
