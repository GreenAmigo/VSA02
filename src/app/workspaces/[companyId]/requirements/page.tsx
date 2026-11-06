import { AuthGate } from "@/components/auth-gate";
import { ConsultantWorkspaceRequirementsPage } from "@/components/consultant-workspace-pages";

export const dynamic = "force-dynamic";

export default async function WorkspaceRequirementsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  return (
    <AuthGate>
      <ConsultantWorkspaceRequirementsPage companyId={companyId} />
    </AuthGate>
  );
}
