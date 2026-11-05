import { AuthGate } from "@/components/auth-gate";
import { ScoringPage } from "@/components/project-workflow-ui";

export default function ProjectScoringRoute() {
  return (
    <AuthGate>
      <ScoringPage projectId="hr-platform" />
    </AuthGate>
  );
}
