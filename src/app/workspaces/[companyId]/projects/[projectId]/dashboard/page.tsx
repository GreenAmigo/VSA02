import { AuthGate } from "@/components/auth-gate";
import { ProjectDashboardPage } from "@/components/project-dashboard-page";

export const dynamic = "force-dynamic";

export default async function WorkspaceProjectDashboardRoute({ params }: { params: Promise<{ companyId: string; projectId: string }> }) {
  const { companyId, projectId } = await params;

  return (
    <AuthGate>
      <ProjectDashboardPage companyId={companyId} projectId={projectId} />
    </AuthGate>
  );
}
