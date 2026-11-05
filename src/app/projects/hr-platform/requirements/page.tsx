import { AuthGate } from "@/components/auth-gate";
import { RequirementsPage } from "@/components/project-workflow-ui";

export default function ProjectRequirementsRoute() {
  return (
    <AuthGate>
      <RequirementsPage projectId="hr-platform" />
    </AuthGate>
  );
}
