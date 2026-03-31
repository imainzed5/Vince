import { redirect } from "next/navigation";

import { AccountSettingsView } from "@/components/shared/AccountSettingsView";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfileSnapshot } from "@/lib/supabase/user-profiles";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profileSnapshot = await getCurrentUserProfileSnapshot(supabase, user);

  return (
    <AccountSettingsView
      email={user.email ?? null}
      initialDisplayName={profileSnapshot.displayName}
      initialNotificationPreferences={profileSnapshot.notificationPreferences}
      initialTimezone={profileSnapshot.timezone}
    />
  );
}
