import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { forgotPasswordAction } from "@/app/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ForgotPasswordPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const resolvedSearchParams = await searchParams;
  const error = resolvedSearchParams?.error ? decodeURIComponent(resolvedSearchParams.error) : null;
  const message = resolvedSearchParams?.message
    ? decodeURIComponent(resolvedSearchParams.message)
    : null;

  return (
    <AuthShell
      eyebrow="Recover access"
      title="Reset your password"
      description="Enter the email tied to your Vince account and we will send a password recovery link to that inbox."
      highlights={["Recovery link by email", "No workspace data lost", "Back in quickly"]}
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Remembered it? {" "}
          <Link className="font-medium text-foreground underline underline-offset-4" href="/login">
            Back to sign in
          </Link>
        </p>
      }
    >
      <form action={forgotPasswordAction} className="space-y-4">
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
        <AuthSubmitButton idleLabel="Send recovery link" pendingLabel="Sending link..." />
      </form>
    </AuthShell>
  );
}