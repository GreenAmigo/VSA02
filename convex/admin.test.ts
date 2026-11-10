/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

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

  test("re-importing a workspace by the same stable id does not create duplicate companies", async () => {
    const t = convexTest({ schema, modules });
    const workspace = {
      id: "acme-health-seed",
      slug: "acme-health",
      name: "Acme Health",
      domain: "acme.example",
      projects: [{
        id: "proj-acme-hr",
        name: "HR Platform",
        status: "Active" as const,
        vendorCount: 1,
        scorerCount: 1,
        requirementCount: 1,
        leadingVendor: "Northwind Labs",
      }],
      people: [{
        id: "person-acme-admin",
        name: "Frank Maxwell",
        role: "company-admin",
        team: "Operations",
        project: "HR Platform",
      }],
      vendors: [{
        id: "vendor-northwind",
        name: "Northwind Labs",
        status: "Active" as const,
        project: "HR Platform",
        score: 88,
      }],
      requirements: [{
        id: "REQ-101",
        title: "Recruitment workflow reporting",
        type: "Functional" as const,
        priority: "High" as const,
        status: "Active" as const,
      }],
      scores: [{
        scorer: "Frank Maxwell",
        vendor: "Northwind Labs",
        score: 88,
        status: "Submitted" as const,
      }],
    };

    const previousAppEnvironment = process.env.APP_ENVIRONMENT;
    const previousSeedSecret = process.env.CONVEX_PREVIEW_SEED_SECRET;

    try {
      process.env.APP_ENVIRONMENT = "development";
      process.env.CONVEX_PREVIEW_SEED_SECRET = "test-preview-seed-secret";

      await t.mutation(api.workspaceSeed.importWorkspaceBundle, { workspaces: [workspace] });
      await t.mutation(api.workspaceSeed.importWorkspaceBundle, { workspaces: [{ ...workspace, slug: "acme-health-v2" }] });

      const seededIdentity = t.withIdentity({
        tokenIdentifier: "seed-import",
        email: "seed-import@example.com",
        name: "Seed Importer",
      });

      const companies = await seededIdentity.query(api.access.listAccessibleCompanies, {});
      const acmeCompanies = companies.filter((company) => company.name === "Acme Health");
      expect(acmeCompanies).toHaveLength(1);

      const sameUserSeed = await t.mutation(internal.admin.seedPreviewWorkspaceData, {
        secret: "test-preview-seed-secret",
      });
      const reSeedList = await seededIdentity.query(api.access.listAccessibleCompanies, {});
      const reSeedAcme = reSeedList.filter((company) => company.name === "Acme Health");

      expect(sameUserSeed.createdCompanies).toBeGreaterThan(0);
      expect(reSeedAcme).toHaveLength(1);
    } finally {
      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }

      if (previousSeedSecret === undefined) {
        delete process.env.CONVEX_PREVIEW_SEED_SECRET;
      } else {
        process.env.CONVEX_PREVIEW_SEED_SECRET = previousSeedSecret;
      }
    }
  });
});

