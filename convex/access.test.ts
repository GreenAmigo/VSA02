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

  test("preview login sync maps the live WorkOS email to the Maxwell Knight admin membership", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const identity = t.withIdentity({
      tokenIdentifier: "workos_user_frazer_preview",
      email: "frazerknight@hotmail.com",
      name: "Frazer Knight",
    });

    await identity.mutation(api.admin.ensurePreviewAdminMembership, {
      companySlug: "maxwell-knight-ltd",
      email: "frazerknight@hotmail.com",
      displayName: "Frazer Knight",
    });

    const company = await identity.query(api.access.getCompany, { companyId: seeded.companyCId });
    const members = await identity.query(api.admin.listCompanyMembers, { companyId: seeded.companyCId });

    expect(company.name).toBe("Maxwell Knight Ltd");
    expect(members.some((member) => member.userId === "workos_user_frazer_preview")).toBe(true);
  });

  test("preview admin sync is blocked in production", async () => {
    const t = convexTest({ schema, modules });
    const previous = process.env.VERCEL_ENV;

    try {
      process.env.VERCEL_ENV = "production";

      await expect(
        t.withIdentity({
          tokenIdentifier: "workos_user_frazer_preview",
          email: "frazerknight@hotmail.com",
          name: "Frazer Knight",
        }).mutation(api.admin.ensurePreviewAdminMembership, {
          companySlug: "maxwell-knight-ltd",
          email: "frazerknight@hotmail.com",
          displayName: "Frazer Knight",
        }),
      ).rejects.toThrow("Preview admin sync is disabled in production");
    } finally {
      if (previous === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previous;
      }
    }
  });
});
