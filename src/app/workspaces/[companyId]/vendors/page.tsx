import { AuthGate } from "@/components/auth-gate";
import { ConsultantWorkspaceVendorsPage } from "@/components/consultant-workspace-pages";

export const dynamic = "force-dynamic";

export default async function WorkspaceVendorsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  return (
    <AuthGate>
      <ConsultantWorkspaceVendorsPage companyId={companyId} />
    </AuthGate>
  );
}
