export type ValidScore = 0 | 1;
export type ValidPriority = 9 | 3 | 1 | 0;

export function assertValidScoreValue(value: unknown): ValidScore {
  const numericValue = Number(value);
  if (numericValue === 0 || numericValue === 1) {
    return numericValue as ValidScore;
  }

  throw new Error("Scores can only be 0 or 1.");
}

export function assertValidPriorityValue(value: unknown): ValidPriority {
  const numericValue = Number(String(value ?? "").replace(/[^0-9]/g, ""));
  if ([9, 3, 1, 0].includes(numericValue)) {
    return numericValue as ValidPriority;
  }

  throw new Error("Requirement priorities can only be 9, 3, 1 or 0.");
}

export type AuditUser = {
  userId: string;
  companyId: string;
  role: "company-admin" | "company-scorer" | "vendor";
};

export type AuditProjectAssignment = {
  userId: string;
  companyId: string;
  projectId: string;
  role: "company-admin" | "company-scorer" | "vendor";
};

export function assertCompanyAccess(user: AuditUser | null, companyId: string): void {
  if (!user) {
    throw new Error("Not signed in");
  }

  if (user.companyId !== companyId) {
    throw new Error("Company access denied");
  }
}

export function assertProjectAccess(
  user: AuditUser | null,
  companyId: string,
  projectId: string,
  allowedAssignments: AuditProjectAssignment[] = [],
): void {
  assertCompanyAccess(user, companyId);

  if (!user) {
    return;
  }

  if (user.role === "vendor") {
    const assignment = allowedAssignments.find((item) => item.userId === user.userId && item.projectId === projectId);
    if (!assignment || assignment.role !== "vendor") {
      throw new Error("This vendor is not assigned to the selected project");
    }
  }
}

export function assertUserRole(user: AuditUser | null, allowedRoles: Array<AuditUser["role"]>): void {
  if (!user) {
    throw new Error("Not signed in");
  }

  if (!allowedRoles.includes(user.role)) {
    throw new Error("Role not allowed for this operation");
  }
}

export function assertSafeRequirementImportRow(row: {
  requirementId: string;
  text: string;
  priority: number;
  type: "user-story" | "nfr";
}): void {
  if (!row.requirementId.trim()) {
    throw new Error("Requirement id is required");
  }

  if (!row.text.trim()) {
    throw new Error("Requirement text is required");
  }

  assertValidPriorityValue(row.priority);
  assertValidScoreValue(0);
}

export function assertSafeScore(value: number): 0 | 1 {
  return assertValidScoreValue(value);
}

export function assertSafePriority(value: number): 9 | 3 | 1 | 0 {
  return assertValidPriorityValue(value);
}
