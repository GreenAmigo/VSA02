export type CompanyRole = "company-admin" | "company-scorer" | "vendor";
export type MembershipStatus = "active" | "pending";

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
  ssoProvider: string | null;
  createdAt: string;
};

export type CompanyMembership = {
  id: string;
  companyId: string;
  userId: string;
  email: string;
  displayName: string;
  role: CompanyRole;
  status: MembershipStatus;
};

export const demoCompanies: Company[] = [
  {
    id: "cmp-acme",
    name: "Acme Health",
    adminUserId: "u-company-admin",
    ssoProvider: "temporary-login",
    createdAt: "2026-10-01",
  },
  {
    id: "cmp-beta",
    name: "Beta Logistics",
    adminUserId: "u-beta-admin",
    ssoProvider: null,
    createdAt: "2026-10-06",
  },
];

export const demoMembers: CompanyMembership[] = [
  {
    id: "mem-1",
    companyId: "cmp-acme",
    userId: "u-company-admin",
    email: "priya@acme.example",
    displayName: "Priya Singh",
    role: "company-admin",
    status: "active",
  },
  {
    id: "mem-2",
    companyId: "cmp-acme",
    userId: "u-scorer",
    email: "sam@acme.example",
    displayName: "Sam Lee",
    role: "company-scorer",
    status: "active",
  },
  {
    id: "mem-3",
    companyId: "cmp-beta",
    userId: "u-beta-admin",
    email: "nina@beta.example",
    displayName: "Nina Foster",
    role: "company-admin",
    status: "active",
  },
  {
    id: "mem-4",
    companyId: "cmp-beta",
    userId: "u-vendor",
    email: "vendor@northwind.example",
    displayName: "Northwind Labs",
    role: "vendor",
    status: "pending",
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

export function assertCompanyAdmin(user: SessionUser | null): void {
  if (!user) {
    throw new Error("Not signed in");
  }

  if (user.role !== "company-admin") {
    throw new Error("Only company admins can manage this company");
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

export function buildCompanyMembership(
  companyId: string,
  displayName: string,
  email: string,
  role: CompanyRole,
): CompanyMembership {
  return {
    id: `mem-${companyId}-${displayName.toLowerCase().replace(/\s+/g, "-")}`,
    companyId,
    userId: `user-${displayName.toLowerCase().replace(/\s+/g, "-")}`,
    email,
    displayName,
    role,
    status: "pending",
  };
}
