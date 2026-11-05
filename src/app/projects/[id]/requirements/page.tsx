import { AuthGate } from "@/components/auth-gate";
import { RequirementsPage } from "@/components/project-workflow-ui";

export const dynamic = "force-dynamic";

export default async function ProjectRequirementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AuthGate>
      <RequirementsPage projectId={id} />
    </AuthGate>
  );
}
