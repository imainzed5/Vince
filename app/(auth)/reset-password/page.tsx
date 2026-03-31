import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Finish recovery"
      title="Choose a new password"
      description="Once the recovery link opens this screen with an active recovery session, set a new password and head back into Vince."
      highlights={["Recovery session required", "Session stays secure", "Sign back in immediately"]}
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Need a fresh link? {" "}
          <Link className="font-medium text-foreground underline underline-offset-4" href="/forgot-password">
            Request another reset
          </Link>
        </p>
      }
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}