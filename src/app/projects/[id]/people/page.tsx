import { AuthGate } from "@/components/auth-gate";
import { PeoplePage } from "@/components/project-workflow-ui";

export default function ProjectPeoplePage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <AuthGate>
      <PeoplePage projectId={params.id} />
    </AuthGate>
  );
}
