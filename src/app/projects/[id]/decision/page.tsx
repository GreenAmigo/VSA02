import { AuthGate } from "@/components/auth-gate";
import { DecisionPage } from "@/components/project-workflow-ui";

export const dynamic = "force-dynamic";

export default async function ProjectDecisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AuthGate>
      <DecisionPage projectId={id} />
    </AuthGate>
  );
}
