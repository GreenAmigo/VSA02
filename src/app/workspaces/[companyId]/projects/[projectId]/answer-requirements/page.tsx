import { AuthGate } from "@/components/auth-gate";
import { VendorProjectAnswerRequirementsPage } from "@/components/consultant-workspace-pages";

export const dynamic = "force-dynamic";

export default async function VendorAnswerRequirementsRoute({
  params,
}: {
  params: Promise<{ companyId: string; projectId: string }>;
}) {
  const { companyId, projectId } = await params;

  return (
    <AuthGate>
      <VendorProjectAnswerRequirementsPage companyId={companyId} projectId={projectId} />
    </AuthGate>
  );
}
