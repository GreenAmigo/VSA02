/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Isolation boundaries", () => {
  test("users cannot cross company or project boundaries", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    const admin = t.withIdentity({ tokenIdentifier: "frazer-knight-admin" });

    await expect(vendor.query(api.access.getCompany, { companyId: seeded.companyAId })).rejects.toThrow("Company access denied");
    await expect(vendor.query(api.access.getProject, { projectId: seeded.projectAId })).rejects.toThrow("Project access denied");
    await expect(admin.query(api.access.getCompany, { companyId: seeded.companyBId })).rejects.toThrow("Company access denied");

    const vendorVisibleCompanies = await vendor.query(api.access.listAccessibleCompanies, {});
    expect(vendorVisibleCompanies.map((company) => company._id)).toEqual([seeded.companyBId]);
    expect(vendorVisibleCompanies.map((company) => company.name)).not.toContain("Acme Health");
  });
});
