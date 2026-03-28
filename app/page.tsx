import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaceRoute } from "@/lib/workspace";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const destination = await getUserWorkspaceRoute(supabase, user.id);
  redirect(destination.path);
}
