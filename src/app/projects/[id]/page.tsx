import { AuthGate } from "@/components/auth-gate";
import { ProjectOverviewPage } from "@/components/project-workflow-ui";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AuthGate>
      <ProjectOverviewPage projectId={id} />
    </AuthGate>
  );
}
