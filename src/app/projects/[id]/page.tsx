import { AuthGate } from "@/components/auth-gate";
import { ProjectOverviewPage } from "@/components/project-workflow-ui";

export default function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <AuthGate>
      <ProjectOverviewPage projectId={params.id} />
    </AuthGate>
  );
}
