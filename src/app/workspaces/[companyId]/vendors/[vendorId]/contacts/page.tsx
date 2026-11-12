import { AuthGate } from "@/components/auth-gate";
import { ConsultantWorkspaceVendorContactsPage } from "@/components/consultant-workspace-pages";

export const dynamic = "force-dynamic";

export default async function VendorContactsPage({ params }: { params: Promise<{ companyId: string; vendorId: string }> }) {
  const { companyId, vendorId } = await params;

  return (
    <AuthGate>
      <ConsultantWorkspaceVendorContactsPage companyId={companyId} vendorId={vendorId} />
    </AuthGate>
  );
}
