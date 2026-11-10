import { AuthGate } from "@/components/auth-gate";
import { ConsultantActivityLogPage } from "@/components/consultant-workspace-pages";

export const dynamic = "force-dynamic";

export default function WorkspaceActivityPage() {
  return (
    <AuthGate>
      <ConsultantActivityLogPage />
    </AuthGate>
  );
}
