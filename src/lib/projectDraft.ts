export function normalizeProjectName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function getProjectDraftError(companyId: string | null, rawName: string): string | null {
  if (!companyId) {
    return "Select a company before creating a project.";
  }

  const name = normalizeProjectName(rawName);
  if (!name) {
    return "Project name is required.";
  }

  if (name.length < 3) {
    return "Project name must be at least 3 characters long.";
  }

  return null;
}
