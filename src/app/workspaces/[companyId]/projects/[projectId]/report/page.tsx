import { AuthGate } from "@/components/auth-gate";
import { ProjectReportPage } from "@/components/project-report-page";

export const dynamic = "force-dynamic";

export default async function WorkspaceProjectReportRoute({ params }: { params: Promise<{ companyId: string; projectId: string }> }) {
  const { companyId, projectId } = await params;

  return (
    <AuthGate>
      <ProjectReportPage companyId={companyId} projectId={projectId} />
    </AuthGate>
  );
}
