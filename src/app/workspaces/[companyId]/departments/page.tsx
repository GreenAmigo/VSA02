import { AuthGate } from "@/components/auth-gate";
import { ConsultantWorkspaceDepartmentsPage } from "@/components/consultant-workspace-pages";

export const dynamic = "force-dynamic";

export default async function WorkspaceDepartmentsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  return (
    <AuthGate>
      <ConsultantWorkspaceDepartmentsPage companyId={companyId} />
    </AuthGate>
  );
}
