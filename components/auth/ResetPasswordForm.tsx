"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const syncRecoveryState = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      setIsReady(Boolean(session));
      setIsChecking(false);
    };

    void syncRecoveryState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) {
        return;
      }

      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setIsReady(Boolean(session));
        setIsChecking(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.trim().length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setIsSubmitting(false);
      setErrorMessage(error.message);
      return;
    }

    await supabase.auth.signOut();
    toast.success("Password updated.");
    router.replace("/login?message=Password%20updated.%20Sign%20in%20with%20your%20new%20password.");
  };

  if (isChecking) {
    return <div className="h-28 animate-pulse rounded-2xl border bg-muted/40" />;
  }

  if (!isReady) {
    return (
      <Alert variant="destructive" className="rounded-[16px] border border-red-200/85 bg-white/72 px-4 py-3 text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_8px_20px_-18px_rgba(15,23,42,0.25)]">
        <AlertDescription>
          This recovery link is missing or has expired. Request a new password reset from the sign-in page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {errorMessage ? (
        <Alert variant="destructive" className="rounded-[16px] border border-red-200/85 bg-white/72 px-4 py-3 text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_8px_20px_-18px_rgba(15,23,42,0.25)]">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="reset-password" className="text-sm font-medium text-slate-700">New password</Label>
        <Input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          placeholder="At least 8 characters"
          className="h-12 rounded-[15px] border border-white/80 bg-white/72 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus-visible:border-blue-400/70 focus-visible:ring-blue-200/80"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reset-confirm-password" className="text-sm font-medium text-slate-700">Confirm new password</Label>
        <Input
          id="reset-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          placeholder="Repeat your new password"
          className="h-12 rounded-[15px] border border-white/80 bg-white/72 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus-visible:border-blue-400/70 focus-visible:ring-blue-200/80"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </div>
      <Button className="h-12 w-full rounded-[15px] border border-blue-500/55 bg-[linear-gradient(180deg,#5c9bff_0%,#3b82f6_14%,#2563eb_100%)] text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_18px_30px_-18px_rgba(37,99,235,0.88)] transition-transform hover:brightness-[1.03] active:translate-y-[1px] disabled:border-blue-300/40 disabled:shadow-none" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Updating password..." : "Set new password"}
      </Button>
    </form>
  );
}