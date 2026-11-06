import { AuthGate } from "@/components/auth-gate";
import { ConsultantWorkspacePeoplePage } from "@/components/consultant-workspace-pages";

export const dynamic = "force-dynamic";

export default async function WorkspacePeoplePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  return (
    <AuthGate>
      <ConsultantWorkspacePeoplePage companyId={companyId} />
    </AuthGate>
  );
}
