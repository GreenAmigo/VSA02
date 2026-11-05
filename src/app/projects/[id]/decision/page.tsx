import { AuthGate } from "@/components/auth-gate";
import { DecisionPage } from "@/components/project-workflow-ui";

export default function ProjectDecisionPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <AuthGate>
      <DecisionPage projectId={params.id} />
    </AuthGate>
  );
}
