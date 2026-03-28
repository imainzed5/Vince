import { redirect } from "next/navigation";

import { ChatView } from "@/components/chat/ChatView";
import { getWorkspaceMemberNames } from "@/lib/supabase/member-names";
import { createClient } from "@/lib/supabase/server";

type WorkspaceChatPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceChatPage({ params }: WorkspaceChatPageProps) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const memberNames = await getWorkspaceMemberNames(workspaceId, {
    id: user.id,
    email: user.email ?? null,
  });

  return <ChatView workspaceId={workspaceId} projectId={null} memberNames={memberNames} />;
}
