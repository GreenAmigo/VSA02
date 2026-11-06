import { AuthGate } from "@/components/auth-gate";
import { ConsultantWorkspaceProjectsPage } from "@/components/consultant-workspace-pages";

export const dynamic = "force-dynamic";

export default async function WorkspaceProjectsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  return (
    <AuthGate>
      <ConsultantWorkspaceProjectsPage companyId={companyId} />
    </AuthGate>
  );
}
