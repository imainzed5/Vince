import { redirect } from "next/navigation";

type ProjectIndexPageProps = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
  }>;
};

export default async function ProjectIndexPage({ params }: ProjectIndexPageProps) {
  const { workspaceId, projectId } = await params;

  redirect(`/workspace/${workspaceId}/project/${projectId}/board`);
}
