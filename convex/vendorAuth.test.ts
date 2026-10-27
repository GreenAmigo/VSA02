/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 3 vendor emailed-link login", () => {
  test("a valid vendor can request and complete a project-scoped magic link", async () => {
    const t = convexTest({ schema, modules });

    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const issued = await t.mutation(api.vendorAuth.requestVendorMagicLink, {
      projectId: seeded.projectBId,
      email: "vendor@northwind.example",
    });

    const signedInVendor = await t.mutation(api.vendorAuth.completeVendorMagicLink, {
      token: issued.token,
    });

    expect(signedInVendor.companyId).toBe(seeded.companyBId);
    expect(signedInVendor.projectId).toBe(seeded.projectBId);
    expect(signedInVendor.userId).toBe("northwind-vendor");
    expect(signedInVendor.role).toBe("vendor");
  });

  test("a vendor cannot request or use a magic link for the wrong project", async () => {
    const t = convexTest({ schema, modules });

    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    await expect(
      t.mutation(api.vendorAuth.requestVendorMagicLink, {
        projectId: seeded.projectAId,
        email: "vendor@northwind.example",
      }),
    ).rejects.toThrow("Vendor not assigned to this project");

    const issued = await t.mutation(api.vendorAuth.requestVendorMagicLink, {
      projectId: seeded.projectBId,
      email: "vendor@northwind.example",
    });

    await expect(
      t.mutation(api.vendorAuth.completeVendorMagicLink, { token: "missing-token" }),
    ).rejects.toThrow("Magic link is invalid or expired");

    const completed = await t.mutation(api.vendorAuth.completeVendorMagicLink, {
      token: issued.token,
    });

    await expect(
      t.mutation(api.vendorAuth.completeVendorMagicLink, { token: issued.token }),
    ).rejects.toThrow("Magic link has already been used");

    expect(completed.projectId).toBe(seeded.projectBId);
    expect(completed.email).toBe("vendor@northwind.example");
  });
});
