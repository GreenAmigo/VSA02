/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Vendor restrictions", () => {
  test("vendors are rejected outside their assigned project and company", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    await expect(vendor.query(api.access.getCompany, { companyId: seeded.companyAId })).rejects.toThrow("Company access denied");
    await expect(vendor.query(api.access.getProject, { projectId: seeded.projectAId })).rejects.toThrow("Project access denied");
    await expect(vendor.query(api.access.listProjectRequirements, { projectId: seeded.projectAId })).rejects.toThrow("Project access denied");

    await expect(
      vendor.mutation(api.vendorAuth.requestVendorMagicLink, {
        projectId: seeded.projectAId,
        email: "vendor@northwind.example",
      }),
    ).rejects.toThrow("Vendor not assigned to this project");
  });
});

