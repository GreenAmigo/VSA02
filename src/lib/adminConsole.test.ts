import { describe, expect, it } from "vitest";

type CompanySummary = {
  companyId: string;
  companyName: string;
  activeMembers: number;
  pendingMembers: number;
  activeProjects: number;
  totalVendors: number;
  totalScorers: number;
  openRequirements: number;
  needsAttention: number;
};

type WorkspaceSummary = {
  totalCompanies: number;
  totalProjects: number;
  totalPeople: number;
  totalVendors: number;
  workspaces: Array<{
    companyId: string;
    companyName: string;
    projectCount: number;
    peopleCount: number;
    vendorCount: number;
  }>;
};

function buildCompanyAdminSummary(
  company: { id: string; name: string } | null,
  members: Array<{ companyId: string; status: string }>,
  projects: Array<{ id: string; companyId: string; name: string; createdAt: string }>,
  vendors: Array<{ companyId: string; projectId: string }>,
  scorers: Array<{ companyId: string; projectId: string }>,
  requirements: Array<{ status?: string }>,
  deadlines: Array<{ status?: string }> = [],
): CompanySummary {
  const companyId = company?.id ?? "";
  const activeMembers = members.filter((member) => member.companyId === companyId && member.status === "active").length;
  const pendingMembers = members.filter((member) => member.companyId === companyId && member.status === "pending").length;
  const activeProjects = projects.filter((project) => project.companyId === companyId).length;
  const totalVendors = vendors.filter((vendor) => vendor.companyId === companyId).length;
  const totalScorers = scorers.filter((scorer) => scorer.companyId === companyId).length;
  const openRequirements = requirements.filter((requirement) => requirement.status !== "withdrawn").length;
  const needsAttention = deadlines.filter((deadline) => deadline.status !== "submitted").length;

  return {
    companyId,
    companyName: company?.name ?? "Unknown company",
    activeMembers,
    pendingMembers,
    activeProjects,
    totalVendors,
    totalScorers,
    openRequirements,
    needsAttention,
  };
}

function buildWorkspaceSummary(
  companies: Array<{ id: string; name: string }>,
  projects: Array<{ id: string; companyId: string }>,
  people: Array<{ id: string; companyId: string; teamName?: string }>,
  vendors: Array<{ id: string; companyId: string }>,
): WorkspaceSummary {
  const workspaces = companies.map((company) => ({
    companyId: company.id,
    companyName: company.name,
    projectCount: projects.filter((project) => project.companyId === company.id).length,
    peopleCount: people.filter((person) => person.companyId === company.id).length,
    vendorCount: vendors.filter((vendor) => vendor.companyId === company.id).length,
  }));

  return {
    totalCompanies: companies.length,
    totalProjects: projects.length,
    totalPeople: people.length,
    totalVendors: vendors.length,
    workspaces,
  };
}

describe("admin summary", () => {
  it("counts the active company health metrics", () => {
    const company = { id: "cmp-acme", name: "Acme Health" };
    const members = [
      { companyId: "cmp-acme", status: "active" },
      { companyId: "cmp-acme", status: "active" },
      { companyId: "cmp-acme", status: "pending" },
    ];

    const summary = buildCompanyAdminSummary(
      company,
      members,
      [
        { id: "cmp-acme-proj-hr-platform", companyId: "cmp-acme", name: "HR Platform Vendor Selection", createdAt: "2026-10-12" },
        { id: "cmp-acme-proj-ops", companyId: "cmp-acme", name: "Operations Review", createdAt: "2026-10-14" },
      ],
      [
        { companyId: "cmp-acme", projectId: "cmp-acme-proj-hr-platform" },
        { companyId: "cmp-acme", projectId: "cmp-acme-proj-hr-platform" },
      ],
      [
        { companyId: "cmp-acme", projectId: "cmp-acme-proj-hr-platform" },
        { companyId: "cmp-acme", projectId: "cmp-acme-proj-ops" },
      ],
      [
        { status: "active" },
        { status: "withdrawn" },
      ],
      [],
    );

    expect(summary.companyName).toBe("Acme Health");
    expect(summary.activeMembers).toBe(2);
    expect(summary.pendingMembers).toBe(1);
    expect(summary.activeProjects).toBe(2);
    expect(summary.totalVendors).toBe(2);
    expect(summary.totalScorers).toBe(2);
    expect(summary.openRequirements).toBe(1);
    expect(summary.needsAttention).toBe(0);
  });

  it("summarises the consultant workspace dashboard by company", () => {
    const summary = buildWorkspaceSummary(
      [
        { id: "cmp-acme", name: "Acme Health" },
        { id: "cmp-beta", name: "Beta Logistics" },
      ],
      [
        { id: "proj-1", companyId: "cmp-acme" },
        { id: "proj-2", companyId: "cmp-acme" },
        { id: "proj-3", companyId: "cmp-beta" },
      ],
      [
        { id: "person-1", companyId: "cmp-acme" },
        { id: "person-2", companyId: "cmp-acme", teamName: "Procurement" },
        { id: "person-3", companyId: "cmp-beta" },
      ],
      [
        { id: "vendor-1", companyId: "cmp-acme" },
        { id: "vendor-2", companyId: "cmp-acme" },
        { id: "vendor-3", companyId: "cmp-beta" },
      ],
    );

    expect(summary.totalCompanies).toBe(2);
    expect(summary.totalProjects).toBe(3);
    expect(summary.totalPeople).toBe(3);
    expect(summary.totalVendors).toBe(3);
    expect(summary.workspaces[0]).toMatchObject({
      companyId: "cmp-acme",
      companyName: "Acme Health",
      projectCount: 2,
      peopleCount: 2,
      vendorCount: 2,
    });
  });
});
