import { AuthGate } from "@/components/auth-gate";
import { ProjectListPage } from "@/components/project-workflow-ui";

export default function ProjectsPage() {
  return (
    <AuthGate>
      <ProjectListPage />
    </AuthGate>
  );
}
