import { assertValidPriorityValue, assertValidScoreValue } from "../src/lib/security.ts";

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
