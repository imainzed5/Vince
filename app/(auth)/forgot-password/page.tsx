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
      formTitle="Reset your password"
      heroTitle={
        <>
          <span className="block">Get back</span>
          <span className="block text-white/68">in fast.</span>
        </>
      }
      heroDescription="Enter the email tied to your Vince account and we will send a secure recovery link to that inbox."
      description="Enter the email tied to your Vince account and we will send a password recovery link to that inbox."
      highlights={["Recovery link by email", "No workspace data lost", "Back in quickly"]}
      footer={
        <p className="text-center text-sm text-slate-500">
          Remembered it? {" "}
          <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/login">
            Back to sign in
          </Link>
        </p>
      }
      infoEyebrow="What happens next"
      infoDescription="Open the recovery link from your inbox, choose a new password, then sign back into Vince with the updated credentials."
    >
      <form action={forgotPasswordAction} className="space-y-5">
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
        <AuthSubmitButton idleLabel="Send recovery link" pendingLabel="Sending link..." />
      </form>
    </AuthShell>
  );
}