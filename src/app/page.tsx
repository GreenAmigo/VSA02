import { AuthGate } from "@/components/auth-gate";
import { ConsultantWorkspaceDirectoryPage } from "@/components/consultant-workspace-pages";

export default function Home() {
  return (
    <AuthGate>
      <ConsultantWorkspaceDirectoryPage />
    </AuthGate>
  );
}
