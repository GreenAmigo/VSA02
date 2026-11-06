import { AuthGate } from "@/components/auth-gate";
import { ConsultantWorkspaceProjectDetailPage } from "@/components/consultant-workspace-pages";

export const dynamic = "force-dynamic";

export default async function WorkspaceProjectDetailPage({ params }: { params: Promise<{ companyId: string; projectId: string }> }) {
  const { companyId, projectId } = await params;

  return (
    <AuthGate>
      <ConsultantWorkspaceProjectDetailPage companyId={companyId} projectId={projectId} />
    </AuthGate>
  );
}
