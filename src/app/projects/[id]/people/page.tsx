import { AuthGate } from "@/components/auth-gate";
import { PeoplePage } from "@/components/project-workflow-ui";

export const dynamic = "force-dynamic";

export default async function ProjectPeoplePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AuthGate>
      <PeoplePage projectId={id} />
    </AuthGate>
  );
}
