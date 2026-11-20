/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("vendor history backfill", () => {
  test("reports duplicate scorer history and uses the answer snapshot for amendments", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "A", companyBName: "B", projectAName: "A project", projectBName: "B project",
    });
    const data = await t.run(async (ctx) => {
      const member = await ctx.db.query("companyMembers")
        .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "northwind-vendor")).unique();
      if (!member?.vendorId) throw new Error("Missing test organisation");
      const vendorId = member.vendorId;
      await ctx.db.insert("companyMembers", {
        companyId: seeded.companyBId, userId: "old-contact", displayName: "Old Contact",
        role: "vendor", vendorId, isActive: false, createdAt: 1,
      });
      for (const vendorUserId of ["northwind-vendor", "old-contact"]) {
        await ctx.db.insert("scorerScores", {
          companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId,
          scorerScopeKey: "individual:scorer", scorerScopeLabel: "Scorer", scorerScopeType: "individual",
          requirementId: "REQ", score: 1, enteredByUserId: "scorer", enteredByDisplayName: "Scorer", enteredAt: 1, updatedAt: 1,
        });
      }
      await ctx.db.insert("scores", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "northwind-vendor",
        vendorId, requirementId: "REQ", score: 1, enteredBy: "northwind-vendor", enteredAt: 1,
      });
      const amendment = await ctx.db.insert("scoreAmendments", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "northwind-vendor",
        requirementId: "REQ", originalScore: 0, newScore: 1,
        amendedByUserId: "admin", amendedByDisplayName: "Admin", reason: "Correction", amendedAt: 2,
      });
      return { vendorId, amendment, memberId: member._id };
    });
    const previous = process.env.APP_ENVIRONMENT;
    try {
      process.env.APP_ENVIRONMENT = "preview";
      const duplicateReport = await t.mutation(internal.vendorHistoryBackfill.backfillVendorHistoryOrganizations, {
        projectId: seeded.projectBId, recordType: "scorerScores", linksRepaired: true,
      });
      expect(duplicateReport.changes).toEqual([]);
      expect(duplicateReport.conflicts).toHaveLength(1);
      expect(duplicateReport.conflicts[0].records).toHaveLength(2);
      await t.run(async (ctx) => {
        const other = await ctx.db.insert("vendorOrganizations", {
          companyId: seeded.companyBId, name: "Other", status: "active", createdByUserId: "admin", createdAt: 1, updatedAt: 1,
        });
        await ctx.db.patch(data.memberId, { vendorId: other });
      });
      const historyReport = await t.mutation(internal.vendorHistoryBackfill.backfillVendorHistoryOrganizations, {
        projectId: seeded.projectBId, recordType: "scoreAmendments", linksRepaired: true,
      });
      expect(historyReport.changes).toHaveLength(1);
      expect(historyReport.changes[0].vendorId).toBe(data.vendorId);
      expect((await t.run((ctx) => ctx.db.get(data.amendment)))?.vendorId).toBe(data.vendorId);
      process.env.APP_ENVIRONMENT = "production";
      await expect(t.mutation(internal.vendorHistoryBackfill.backfillVendorHistoryOrganizations, {
        projectId: seeded.projectBId, recordType: "projectViews", linksRepaired: true,
      })).rejects.toThrow("only available in development or preview");
    } finally {
      if (previous === undefined) delete process.env.APP_ENVIRONMENT;
      else process.env.APP_ENVIRONMENT = previous;
    }
  });
});
