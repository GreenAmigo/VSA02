import { AuthGate } from "@/components/auth-gate";
import { RequirementsPage } from "@/components/project-workflow-ui";

export default function ProjectRequirementsPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <AuthGate>
      <RequirementsPage projectId={params.id} />
    </AuthGate>
  );
}
