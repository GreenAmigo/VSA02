import { AuthGate } from "@/components/auth-gate";
import { ConsultantWorkspaceOverviewPage } from "@/components/consultant-workspace-pages";

export const dynamic = "force-dynamic";

export default async function WorkspaceCompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  return (
    <AuthGate>
      <ConsultantWorkspaceOverviewPage companyId={companyId} />
    </AuthGate>
  );
}
