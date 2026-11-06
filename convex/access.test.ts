/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

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
    const previousVercelEnv = process.env.VERCEL_ENV;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      delete process.env.VERCEL_ENV;

      await t.mutation(api.admin.grantConsultantRole, {
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

      if (previousVercelEnv === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousVercelEnv;
      }
    }
  });

  test("Consultant grants cannot run in Production", async () => {
    const t = convexTest({ schema, modules });
    const previousSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousVercelEnv = process.env.VERCEL_ENV;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.VERCEL_ENV = "production";

      await expect(
        t.mutation(api.admin.grantConsultantRole, {
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

      if (previousVercelEnv === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousVercelEnv;
      }
    }
  });

  test("preview-only workspace seed data is disabled in Production and labels records as test data", async () => {
    const t = convexTest({ schema, modules });
    const previousSecret = process.env.CONVEX_PREVIEW_SEED_SECRET;
    const previousVercelEnv = process.env.VERCEL_ENV;

    try {
      process.env.CONVEX_PREVIEW_SEED_SECRET = "test-preview-secret";
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      delete process.env.VERCEL_ENV;

      const result = await t.mutation(api.admin.seedPreviewWorkspaceData, {
        secret: "test-preview-secret",
      });

      expect(result.createdCompanies).toBeGreaterThanOrEqual(3);
      expect(result.label).toBe("test-data");

      await t.mutation(api.admin.grantConsultantRole, {
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

      if (previousVercelEnv === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousVercelEnv;
      }

      if (process.env.CONVEX_CONSULTANT_GRANT_SECRET === "test-consultant-secret") {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      }
    }
  });

  test("preview-only workspace seed data cannot run in Production", async () => {
    const t = convexTest({ schema, modules });
    const previousSecret = process.env.CONVEX_PREVIEW_SEED_SECRET;
    const previousVercelEnv = process.env.VERCEL_ENV;

    try {
      process.env.CONVEX_PREVIEW_SEED_SECRET = "test-preview-secret";
      process.env.VERCEL_ENV = "production";

      await expect(
        t.mutation(api.admin.seedPreviewWorkspaceData, {
          secret: "test-preview-secret",
        }),
      ).rejects.toThrow("Preview/dev seed data is disabled in production");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_PREVIEW_SEED_SECRET;
      } else {
        process.env.CONVEX_PREVIEW_SEED_SECRET = previousSecret;
      }

      if (previousVercelEnv === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousVercelEnv;
      }
    }
  });
});
