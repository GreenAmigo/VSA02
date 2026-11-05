import { describe, expect, it } from "vitest";

import {
  buildCompanyAdminSummary,
  demoCompanies,
  demoMembers,
} from "./companyAccess.ts";

describe("admin summary", () => {
  it("counts the active company health metrics", () => {
    const summary = buildCompanyAdminSummary(
      demoCompanies[0],
      demoMembers,
      [
        { id: "cmp-acme-proj-hr-platform", companyId: "cmp-acme", name: "HR Platform Vendor Selection", createdAt: "2026-10-12" },
        { id: "cmp-acme-proj-ops", companyId: "cmp-acme", name: "Operations Review", createdAt: "2026-10-14" },
      ],
      [
        { id: "vendor-acme-1", companyId: "cmp-acme", projectId: "cmp-acme-proj-hr-platform", userId: "vendor-northwind", displayName: "Northwind Labs", email: "vendor@northwind.example", status: "invited" },
        { id: "vendor-acme-2", companyId: "cmp-acme", projectId: "cmp-acme-proj-hr-platform", userId: "vendor-summit", displayName: "Summit Systems", email: "vendor@summit.example", status: "active" },
      ],
      [
        { id: "scorer-acme-1", companyId: "cmp-acme", projectId: "cmp-acme-proj-hr-platform", userId: "scorer-priya", displayName: "Priya Singh", email: "priya@acme.example", role: "individual", status: "in-progress" },
        { id: "scorer-acme-2", companyId: "cmp-acme", projectId: "cmp-acme-proj-ops", userId: "scorer-ops", displayName: "Operations Team", email: "ops@acme.example", role: "department", departmentName: "Operations", status: "not-started" },
      ],
      [
        { id: "REQ-101", text: "Support HR workflows", type: "user-story", priority: 9, status: "active", updatedAt: "2026-10-12T00:00:00.000Z" },
        { id: "REQ-102", text: "Audit access", type: "nfr", priority: 3, status: "withdrawn", updatedAt: "2026-10-12T00:00:00.000Z" },
      ],
      [],
    );

    expect(summary.companyName).toBe("Acme Health");
    expect(summary.activeMembers).toBe(2);
    expect(summary.pendingMembers).toBe(0);
    expect(summary.activeProjects).toBe(2);
    expect(summary.totalVendors).toBe(2);
    expect(summary.totalScorers).toBe(2);
    expect(summary.openRequirements).toBe(1);
    expect(summary.needsAttention).toBe(0);
  });
});
