/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 3 vendor emailed-link login", () => {
  test("a valid vendor can request and complete a project-scoped magic link", async () => {
    const t = convexTest({ schema, modules });

    const seeded = await t.mutation(internal.access.seedScenario, {
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

    const seeded = await t.mutation(internal.access.seedScenario, {
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

  test("a cross-workspace assignment cannot be used to request a link", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    await t.run(async (ctx) => {
      const assignment = await ctx.db.query("projectVendors")
        .withIndex("by_company_project", (q) => q.eq("companyId", seeded.companyBId).eq("projectId", seeded.projectBId)).first();
      if (!assignment) throw new Error("Missing vendor assignment");
      await ctx.db.patch(assignment._id, { companyId: seeded.companyAId });
    });
    await expect(t.mutation(api.vendorAuth.requestVendorMagicLink, {
      projectId: seeded.projectBId, email: "vendor@northwind.example",
    })).rejects.toThrow("Vendor not assigned to this project");
  });

  test("a link cannot be used after its project changes workspace or its vendor assignment is removed", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const issued = await t.mutation(api.vendorAuth.requestVendorMagicLink, {
      projectId: seeded.projectBId, email: "vendor@northwind.example",
    });
    await t.run(async (ctx) => { await ctx.db.patch(seeded.projectBId, { companyId: seeded.companyAId }); });
    await expect(t.mutation(api.vendorAuth.completeVendorMagicLink, { token: issued.token }))
      .rejects.toThrow("Vendor access denied for this project");
    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.projectBId, { companyId: seeded.companyBId });
      const assignment = await ctx.db.query("projectVendors")
        .withIndex("by_company_project", (q) => q.eq("companyId", seeded.companyBId).eq("projectId", seeded.projectBId)).first();
      if (!assignment) throw new Error("Missing vendor assignment");
      await ctx.db.delete(assignment._id);
    });
    await expect(t.mutation(api.vendorAuth.completeVendorMagicLink, { token: issued.token }))
      .rejects.toThrow("Vendor access denied for this project");
    const token = await t.run((ctx) => ctx.db.query("vendorLoginTokens")
      .withIndex("by_token", (q) => q.eq("token", issued.token)).unique());
    expect(token?.usedAt).toBeUndefined();
  });
});

