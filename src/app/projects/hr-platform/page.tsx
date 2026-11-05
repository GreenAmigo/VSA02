import { AuthGate } from "@/components/auth-gate";
import { ProjectOverviewPage } from "@/components/project-workflow-ui";

export default function ProjectOverviewRoute() {
  return (
    <AuthGate>
      <ProjectOverviewPage projectId="hr-platform" />
    </AuthGate>
  );
}
