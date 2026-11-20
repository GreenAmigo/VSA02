/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 8 deadline and reminder logic", () => {
  test("a matching name does not authorize deadline access", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    for (const name of ["Beta Admin", "Beta Scorer"]) {
      const outsider = t.withIdentity({ tokenIdentifier: "unrelated-user", email: "unrelated@example.com", name });
      await expect(outsider.query(api.deadlines.listProjectDeadlines, { projectId: seeded.projectBId }))
        .rejects.toThrow("Project access denied");
    }
  });

  test("vendor deadlines use active contacts of assigned organisations", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    const assignmentId = await t.run(async (ctx) => {
      const member = await ctx.db.query("projectMembers")
        .withIndex("by_project_user", (q) => q.eq("projectId", seeded.projectBId).eq("userId", "northwind-vendor")).unique();
      const assignment = await ctx.db.query("projectVendors")
        .withIndex("by_company_project", (q) => q.eq("companyId", seeded.companyBId).eq("projectId", seeded.projectBId)).first();
      if (!member || !assignment) throw new Error("Missing test setup");
      await ctx.db.delete(member._id);
      return assignment._id;
    });
    const args = { projectId: seeded.projectBId, targetType: "vendor" as const, targetUserId: "northwind-vendor", dueAt: Date.now() + 10000 };
    await expect(scorer.mutation(api.deadlines.upsertProjectDeadline, args)).resolves.toMatchObject({ targetUserId: "northwind-vendor" });
    expect(await vendor.query(api.deadlines.listProjectDeadlines, { projectId: seeded.projectBId })).toHaveLength(1);
    await t.run(async (ctx) => { await ctx.db.delete(assignmentId); });
    await expect(scorer.mutation(api.deadlines.upsertProjectDeadline, args)).rejects.toThrow("Target user is not a vendor on this project");
    await expect(vendor.query(api.deadlines.listProjectDeadlines, { projectId: seeded.projectBId })).rejects.toThrow("Project access denied");
  });

  test("a vendor with different subject and token identifier can only read and submit their own deadline", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    await t.run(async (ctx) => {
      const member = await ctx.db.query("companyMembers")
        .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "northwind-vendor")).unique();
      if (!member?.vendorId) throw new Error("Missing vendor contact");
      await ctx.db.insert("companyMembers", {
        companyId: seeded.companyBId, vendorId: member.vendorId, userId: "another-contact",
        email: "other@example.com", displayName: "Other Contact", role: "vendor", isActive: true, createdAt: Date.now(),
      });
    });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    for (const userId of ["northwind-vendor", "another-contact"]) {
      await scorer.mutation(api.deadlines.upsertProjectDeadline, {
        projectId: seeded.projectBId, targetType: "vendor", targetUserId: userId, dueAt: Date.now() + 10000,
      });
    }
    const vendor = t.withIdentity({ subject: "northwind-vendor", tokenIdentifier: "issuer|northwind-vendor" });
    const rows = await vendor.query(api.deadlines.listProjectDeadlines, { projectId: seeded.projectBId });
    expect(rows.map((row) => row.targetUserId)).toEqual(["northwind-vendor"]);
    await expect(vendor.mutation(api.deadlines.markDeadlineSubmitted, {
      projectId: seeded.projectBId, targetType: "vendor", targetUserId: "another-contact",
    })).rejects.toThrow("Project access denied");
    await expect(vendor.mutation(api.deadlines.markDeadlineSubmitted, {
      projectId: seeded.projectBId, targetType: "scorer", targetUserId: "northwind-vendor",
    })).rejects.toThrow("Project access denied");
    await expect(vendor.mutation(api.deadlines.markDeadlineSubmitted, {
      projectId: seeded.projectBId, targetType: "vendor", targetUserId: "northwind-vendor",
    })).resolves.toMatchObject({ status: "submitted" });
  });

  test("scorers and vendors can see their deadline state, and vendors can only update their own submitted status", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    const vendorDeadline = await scorer.mutation(api.deadlines.upsertProjectDeadline, {
      projectId: seeded.projectBId,
      targetType: "vendor",
      targetUserId: "northwind-vendor",
      dueAt: Date.now() + 1000 * 60 * 60 * 24,
    });

    expect(vendorDeadline.targetUserId).toBe("northwind-vendor");
    expect(vendorDeadline.status).toBe("not-started");

    const vendorRows = await vendor.query(api.deadlines.listProjectDeadlines, {
      projectId: seeded.projectBId,
    });

    expect(vendorRows).toHaveLength(1);
    expect(vendorRows[0].targetType).toBe("vendor");
    expect(vendorRows[0].status).toBe("not-started");

    const updated = await vendor.mutation(api.deadlines.markDeadlineSubmitted, {
      projectId: seeded.projectBId,
      targetType: "vendor",
      targetUserId: "northwind-vendor",
    });

    expect(updated.status).toBe("submitted");
    expect(updated.submittedAt).toBeTypeOf("number");

    const allRows: ReadonlyArray<{ targetUserId: string; status: string }> = await scorer.query(api.deadlines.listProjectDeadlines, {
      projectId: seeded.projectBId,
    });

    expect(allRows.some((row: { targetUserId: string; status: string }) => row.targetUserId === "northwind-vendor" && row.status === "submitted")).toBe(true);

    await expect(
      vendor.mutation(api.deadlines.markDeadlineSubmitted, {
        projectId: seeded.projectBId,
        targetType: "vendor",
        targetUserId: "beta-scorer",
      }),
    ).rejects.toThrow("Project access denied");
  });
});

