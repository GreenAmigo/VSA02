import { AuthGate } from "@/components/auth-gate";
import { ScoringPage } from "@/components/project-workflow-ui";

export default function ProjectScoringPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <AuthGate>
      <ScoringPage projectId={params.id} />
    </AuthGate>
  );
}
