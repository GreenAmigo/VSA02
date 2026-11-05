import { AuthGate } from "@/components/auth-gate";
import { CreateProjectPage } from "@/components/project-workflow-ui";

export default function NewProjectPage() {
  return (
    <AuthGate>
      <CreateProjectPage />
    </AuthGate>
  );
}
