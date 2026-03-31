"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type AuthSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
};

export function AuthSubmitButton({ idleLabel, pendingLabel }: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      className="h-12 w-full rounded-[15px] border border-blue-500/55 bg-[linear-gradient(180deg,#5c9bff_0%,#3b82f6_14%,#2563eb_100%)] text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_18px_30px_-18px_rgba(37,99,235,0.88)] transition-transform hover:brightness-[1.03] active:translate-y-[1px] disabled:border-blue-300/40 disabled:shadow-none"
      type="submit"
      disabled={pending}
    >
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}