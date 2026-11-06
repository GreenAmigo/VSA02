import { AuthGate } from "@/components/auth-gate";
import { ConsultantWorkspaceScoringPage } from "@/components/consultant-workspace-pages";

export const dynamic = "force-dynamic";

export default async function WorkspaceScoringPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  return (
    <AuthGate>
      <ConsultantWorkspaceScoringPage companyId={companyId} />
    </AuthGate>
  );
}
