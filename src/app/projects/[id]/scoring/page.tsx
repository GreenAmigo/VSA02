import { AuthGate } from "@/components/auth-gate";
import { ScoringPage } from "@/components/project-workflow-ui";

export const dynamic = "force-dynamic";

export default async function ProjectScoringPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AuthGate>
      <ScoringPage projectId={id} />
    </AuthGate>
  );
}
