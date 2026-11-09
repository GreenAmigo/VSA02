/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 2 access checks", () => {
  test("a user can only see companies and projects they belong to", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "frazer-knight-admin" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    const adminCompanies = await admin.query(api.access.listAccessibleCompanies, {});
    const vendorCompanies = await vendor.query(api.access.listAccessibleCompanies, {});
    const vendorProject = await vendor.query(api.access.getProject, { projectId: seeded.projectBId });

    expect(adminCompanies.map((company) => company._id)).toContain(seeded.companyCId);
    expect(vendorCompanies.map((company) => company._id)).not.toContain(seeded.companyAId);
    expect(vendorCompanies.map((company) => company._id)).toContain(seeded.companyBId);
    expect(vendorProject._id).toBe(seeded.projectBId);
  });

  test("Maxwell Knight admin can access their company and is rejected from other projects", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "frazer-knight-admin" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    const accessibleCompanies = await admin.query(api.access.listAccessibleCompanies, {});
    const myCompany = await admin.query(api.access.getCompany, { companyId: seeded.companyCId });

    expect(accessibleCompanies.map((company) => company._id)).toContain(seeded.companyCId);
    expect(myCompany.name).toBe("Maxwell Knight Ltd");
    await expect(vendor.query(api.access.getCompany, { companyId: seeded.companyCId })).rejects.toThrow("Company access denied");
  });

  test("a trusted developer can grant the VS Consultant role across all workspaces", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const previousSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "development";

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "workos_user_frazer_preview",
        email: "frazerknight@hotmail.com",
        displayName: "Frazer Knight",
      });

      const identity = t.withIdentity({
        tokenIdentifier: "workos_user_frazer_preview",
        email: "frazerknight@hotmail.com",
        name: "Frazer Knight",
      });

      const company = await identity.query(api.access.getCompany, { companyId: seeded.companyAId });
      const companies = await identity.query(api.access.listAccessibleCompanies, {});
      const project = await identity.query(api.access.getProject, { projectId: seeded.projectBId });

      expect(company.name).toBe("Acme Health");
      expect(companies.some((item) => item._id === seeded.companyAId)).toBe(true);
      expect(companies.some((item) => item._id === seeded.companyBId)).toBe(true);
      expect(project._id).toBe(seeded.projectBId);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });

  test("Consultant grants cannot run in Production", async () => {
    const t = convexTest({ schema, modules });
    const previousSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "production";

      await expect(
        t.mutation(internal.admin.grantConsultantRole, {
          secret: "test-consultant-secret",
          userId: "workos_user_frazer_preview",
          email: "frazerknight@hotmail.com",
          displayName: "Frazer Knight",
        }),
      ).rejects.toThrow("Consultant role grants are disabled in production");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });

  test("missing APP_ENVIRONMENT blocks the grant guard as production", async () => {
    const t = convexTest({ schema, modules });
    const previousSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      delete process.env.APP_ENVIRONMENT;

      await expect(
        t.mutation(internal.admin.grantConsultantRole, {
          secret: "test-consultant-secret",
          userId: "missing-env-user",
          email: "missing-env@example.com",
          displayName: "Missing Env User",
        }),
      ).rejects.toThrow("Consultant role grants are disabled in production");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });

  test("a company admin receives only their workspace and is rejected from consultant access", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const previousGrantSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "development";

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "workos_user_frank_preview",
        email: "frank@maxwellknight.co.uk",
        displayName: "Frank Maxwell",
      });

      const consultantIdentity = t.withIdentity({
        tokenIdentifier: "workos_user_frank_preview",
        email: "frank@maxwellknight.co.uk",
        name: "Frank Maxwell",
      });

      const consultantVisibleCompanies = await consultantIdentity.query(api.access.listAccessibleCompanies, {});
      expect(consultantVisibleCompanies.map((company) => company._id)).toEqual(
        expect.arrayContaining([seeded.companyAId, seeded.companyBId, seeded.companyCId]),
      );

      await t.mutation(internal.admin.linkWorkOSUserToCompanyAdmin, {
        secret: "test-consultant-secret",
        companyId: seeded.companyAId,
        seededUserId: "acme-admin",
        workosUserId: "workos_user_frank_preview",
        email: "frank@maxwellknight.co.uk",
        displayName: "Frank Maxwell",
      });

      const companyAdminIdentity = t.withIdentity({
        tokenIdentifier: "workos_user_frank_preview",
        email: "frank@maxwellknight.co.uk",
        name: "Frank Maxwell",
      });

      const access = await companyAdminIdentity.query(api.access.getCurrentUserAccess, {});
      const visibleCompanies = await companyAdminIdentity.query(api.access.listAccessibleCompanies, {});

      expect(access.role).toBe("company-admin");
      expect(visibleCompanies.map((company) => company._id)).toEqual([seeded.companyAId]);
      await expect(companyAdminIdentity.query(api.access.getCompany, { companyId: seeded.companyBId })).rejects.toThrow("Company access denied");
      await expect(companyAdminIdentity.query(api.admin.listCompanyMembers, { companyId: seeded.companyBId })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
      await expect(companyAdminIdentity.mutation(api.admin.createProject, { companyId: seeded.companyBId, name: "Blocked project" })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    } finally {
      if (previousGrantSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousGrantSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });

  test("preview-only workspace seed data is disabled in Production and labels records as test data", async () => {
    const t = convexTest({ schema, modules });
    const previousSecret = process.env.CONVEX_PREVIEW_SEED_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_PREVIEW_SEED_SECRET = "test-preview-secret";
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "preview";

      const result = await t.mutation(internal.admin.seedPreviewWorkspaceData, {
        secret: "test-preview-secret",
      });

      expect(result.createdCompanies).toBeGreaterThanOrEqual(3);
      expect(result.label).toBe("test-data");

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "seeded-consultant-user",
        email: "seeded-consultant@example.com",
        displayName: "Seeded Consultant",
      });

      const consultant = t.withIdentity({
        tokenIdentifier: "seeded-consultant-user",
        email: "seeded-consultant@example.com",
        name: "Seeded Consultant",
      });

      const companies = await consultant.query(api.access.listAccessibleCompanies, {});
      expect(companies.length).toBeGreaterThanOrEqual(3);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_PREVIEW_SEED_SECRET;
      } else {
        process.env.CONVEX_PREVIEW_SEED_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }

      if (process.env.CONVEX_CONSULTANT_GRANT_SECRET === "test-consultant-secret") {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      }
    }
  });

  test("preview-only workspace seed data cannot run in Production", async () => {
    const t = convexTest({ schema, modules });
    const previousSecret = process.env.CONVEX_PREVIEW_SEED_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_PREVIEW_SEED_SECRET = "test-preview-secret";
      process.env.APP_ENVIRONMENT = "production";

      await expect(
        t.mutation(internal.admin.seedPreviewWorkspaceData, {
          secret: "test-preview-secret",
        }),
      ).rejects.toThrow("Preview/dev seed data is disabled in production");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_PREVIEW_SEED_SECRET;
      } else {
        process.env.CONVEX_PREVIEW_SEED_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });

  test("granting a VS Consultant records an activity log entry", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const previousSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "preview";

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "audit-consultant-user",
        email: "audit@consultant.example",
        displayName: "Audit Consultant",
        companyId: seeded.companyAId,
      });

      const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });
      const logs = await admin.query(api.admin.listActivityLogs, { companyId: seeded.companyAId });

      expect(logs.some((log) => log.action === "grant_vs_consultant_role")).toBe(true);
      expect(logs.some((log) => log.details.includes("audit-consultant-user"))).toBe(true);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });
});
