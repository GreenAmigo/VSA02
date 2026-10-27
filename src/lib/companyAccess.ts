export type CompanyRole = "company-admin" | "company-scorer" | "vendor";

export type SessionUser = {
  userId: string;
  companyId: string;
  role: CompanyRole;
  displayName: string;
};

export type Company = {
  id: string;
  name: string;
  adminUserId: string;
};

export const demoCompanies: Company[] = [
  {
    id: "cmp-acme",
    name: "Acme Health",
    adminUserId: "u-company-admin",
  },
  {
    id: "cmp-beta",
    name: "Beta Logistics",
    adminUserId: "u-beta-admin",
  },
];

export function canAccessCompany(user: SessionUser | null, companyId: string): boolean {
  if (!user) {
    return false;
  }

  return user.companyId === companyId;
}

export function assertCompanyAccess(user: SessionUser | null, companyId: string): void {
  if (!user) {
    throw new Error("Not signed in");
  }

  if (user.companyId !== companyId) {
    throw new Error("Company access denied");
  }
}

export function getAllowedProjectScope(user: SessionUser | null): string[] {
  if (!user) {
    return [];
  }

  if (user.role === "vendor") {
    return [`${user.companyId}:vendor-only`];
  }

  return [`${user.companyId}:full-access`];
}
