import { AuthGate } from "@/components/auth-gate";
import { WorkspaceImportForm } from "@/components/workspace-import";

export const dynamic = "force-dynamic";

export default function WorkspaceBulkImportPage() {
  return (
    <AuthGate>
      <WorkspaceImportForm />
    </AuthGate>
  );
}
