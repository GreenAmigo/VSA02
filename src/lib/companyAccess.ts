export type CompanyRole = "company-admin" | "company-scorer" | "vendor";
export type MembershipStatus = "active" | "pending";
export type SsoProvider = "temporary-login" | "microsoft-entra" | "google-workspace" | "saml" | "oidc";

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
  ssoProvider: SsoProvider | null;
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

export type VendorProjectAssignment = {
  id: string;
  companyId: string;
  projectId: string;
  userId: string;
  displayName: string;
  email: string;
  status: "invited" | "active" | "submitted";
};

export type ScorerAssignment = {
  id: string;
  companyId: string;
  projectId: string;
  userId: string;
  displayName: string;
  email: string;
  role: "individual" | "department";
  departmentName?: string;
  status: "not-started" | "in-progress" | "submitted";
};

export const demoCompanies: Company[] = [
  {
    id: "cmp-acme",
    name: "Acme Health",
    adminUserId: "u-company-admin",
    ssoProvider: "microsoft-entra",
    createdAt: "2026-10-01",
  },
  {
    id: "cmp-beta",
    name: "Beta Logistics",
    adminUserId: "u-beta-admin",
    ssoProvider: "google-workspace",
    createdAt: "2026-10-06",
  },
];

export const ssoProviderOptions: { value: SsoProvider; label: string; description: string }[] = [
  { value: "temporary-login", label: "Temporary login", description: "Good for local demos and early rollout." },
  { value: "microsoft-entra", label: "Microsoft Entra ID", description: "Best for Microsoft 365 shops and enterprise staff." },
  { value: "google-workspace", label: "Google Workspace", description: "Good fit for Google-based company accounts." },
  { value: "saml", label: "SAML", description: "For custom enterprise IdPs and legacy setups." },
  { value: "oidc", label: "OIDC", description: "Flexible standard for modern identity providers." },
];

export function getSsoProviderLabel(provider: SsoProvider | null): string {
  if (!provider) {
    return "SSO not configured";
  }

  const match = ssoProviderOptions.find((option) => option.value === provider);
  return match?.label ?? provider;
}

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

export function buildVendorAssignment(
  companyId: string,
  projectId: string,
  displayName: string,
  email: string,
): VendorProjectAssignment {
  return {
    id: `vendor-${companyId}-${projectId}-${displayName.toLowerCase().replace(/\s+/g, "-")}`,
    companyId,
    projectId,
    userId: `vendor-${displayName.toLowerCase().replace(/\s+/g, "-")}`,
    displayName,
    email,
    status: "invited",
  };
}

export function buildScorerAssignment(
  companyId: string,
  projectId: string,
  displayName: string,
  email: string,
  role: "individual" | "department",
  departmentName?: string,
): ScorerAssignment {
  return {
    id: `scorer-${companyId}-${projectId}-${displayName.toLowerCase().replace(/\s+/g, "-")}`,
    companyId,
    projectId,
    userId: `scorer-${displayName.toLowerCase().replace(/\s+/g, "-")}`,
    displayName,
    email,
    role,
    departmentName,
    status: "not-started",
  };
}

export function assertProjectAccess(
  user: SessionUser | null,
  companyId: string,
  projectId: string,
  allowedProjectUsers: string[] = [],
): void {
  if (!user) {
    throw new Error("Not signed in");
  }

  if (user.companyId !== companyId) {
    throw new Error("Project access denied: wrong company");
  }

  if (user.role === "vendor") {
    if (!allowedProjectUsers.includes(user.userId)) {
      throw new Error("This vendor is not assigned to the selected project");
    }
  }

  if (projectId.trim().length === 0) {
    throw new Error("Project not selected");
  }
}
