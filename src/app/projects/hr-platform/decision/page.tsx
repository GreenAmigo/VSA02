import { AuthGate } from "@/components/auth-gate";
import { DecisionPage } from "@/components/project-workflow-ui";

export default function ProjectDecisionRoute() {
  return (
    <AuthGate>
      <DecisionPage projectId="hr-platform" />
    </AuthGate>
  );
}
