/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("admin console actions", () => {
  test("company and project creation creates the expected company and project membership records", async () => {
    const t = convexTest({ schema, modules });
    const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });

    const company = await admin.mutation(api.admin.createCompany, {
      name: "Acme Health",
      ssoProvider: "microsoft-entra",
    });

    const project = await admin.mutation(api.admin.createProject, {
      companyId: company.companyId,
      name: "HR Platform Vendor Selection",
    });

    const members = await admin.query(api.admin.listCompanyMembers, { companyId: company.companyId });
    const projectMembers = await admin.query(api.admin.listProjectMembers, { projectId: project.projectId });

    expect(company.name).toBe("Acme Health");
    expect(project.companyId).toBe(company.companyId);
    expect(members.some((member) => member.role === "company-admin")).toBe(true);
    expect(projectMembers.some((member) => member.role === "company-admin")).toBe(true);
  });

  test("project vendor and scorer assignment creates project-scoped rows", async () => {
    const t = convexTest({ schema, modules });
    const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });

    const company = await admin.mutation(api.admin.createCompany, {
      name: "Acme Health",
      ssoProvider: "microsoft-entra",
    });

    const project = await admin.mutation(api.admin.createProject, {
      companyId: company.companyId,
      name: "HR Platform",
    });

    const vendor = await admin.mutation(api.admin.addProjectVendor, {
      companyId: company.companyId,
      projectId: project.projectId,
      displayName: "Northwind Labs",
      email: "vendor@northwind.example",
    });

    const scorer = await admin.mutation(api.admin.addProjectScorer, {
      companyId: company.companyId,
      projectId: project.projectId,
      displayName: "Sam Lee",
      email: "sam@acme.example",
      role: "individual",
    });

    expect(vendor.displayName).toBe("Northwind Labs");
    expect(scorer.displayName).toBe("Sam Lee");
    expect(vendor.role).toBe("vendor");
    expect(scorer.role).toBe("company-scorer");
  });
});
