import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Finish recovery"
      title="Choose a new password"
      formTitle="Choose a new password"
      heroTitle={
        <>
          <span className="block">Set the</span>
          <span className="block text-white/68">new key.</span>
        </>
      }
      heroDescription="Once the recovery link opens this screen with an active recovery session, set a new password and head back into Vince."
      description="Once the recovery link opens this screen with an active recovery session, set a new password and head back into Vince."
      highlights={["Recovery session required", "Session stays secure", "Sign back in immediately"]}
      footer={
        <p className="text-center text-sm text-slate-500">
          Need a fresh link? {" "}
          <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/forgot-password">
            Request another reset
          </Link>
        </p>
      }
      infoEyebrow="What happens next"
      infoDescription="After you set the new password, Vince signs out the recovery session so you can sign back in cleanly with the updated password."
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}