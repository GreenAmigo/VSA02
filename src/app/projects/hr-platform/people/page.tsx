import { AuthGate } from "@/components/auth-gate";
import { PeoplePage } from "@/components/project-workflow-ui";

export default function ProjectPeopleRoute() {
  return (
    <AuthGate>
      <PeoplePage projectId="hr-platform" />
    </AuthGate>
  );
}
