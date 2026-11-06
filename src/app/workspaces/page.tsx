import { AuthGate } from "@/components/auth-gate";
import { ConsultantWorkspaceDirectoryPage } from "@/components/consultant-workspace-pages";

export const dynamic = "force-dynamic";

export default function WorkspacesPage() {
  return (
    <AuthGate>
      <ConsultantWorkspaceDirectoryPage />
    </AuthGate>
  );
}
