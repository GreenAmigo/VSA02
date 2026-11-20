/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("vendor answer backfill", () => {
  test("reports every answer across page boundaries without changing unresolved rows", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "A", companyBName: "B", projectAName: "A project", projectBName: "B project",
    });
    const answerIds = await t.run(async (ctx) => {
      const ids = [];
      for (let i = 0; i < 51; i++) {
        const requirementId = `REQ-${String(i).padStart(2, "0")}`;
        await ctx.db.insert("requirements", {
          companyId: seeded.companyBId, projectId: seeded.projectBId, requirementId,
          text: "Requirement", type: "user-story", priority: 9, status: "active", createdAt: 1,
        });
        ids.push(await ctx.db.insert("scores", {
          companyId: seeded.companyBId, projectId: seeded.projectBId,
          vendorUserId: i === 50 ? "unlinked-contact" : "northwind-vendor",
          requirementId, score: 1, enteredBy: "contact", enteredAt: 1,
        }));
      }
      return ids;
    });
    const previous = process.env.APP_ENVIRONMENT;
    try {
      process.env.APP_ENVIRONMENT = "preview";
      const first = await t.mutation(internal.vendorAnswerBackfill.backfillVendorAnswerOrganizations, {
        projectId: seeded.projectBId, linksRepaired: true,
      });
      expect(first.isDone).toBe(false);
      const second = await t.mutation(internal.vendorAnswerBackfill.backfillVendorAnswerOrganizations, {
        projectId: seeded.projectBId, linksRepaired: true, cursor: first.continueCursor,
      });
      expect(second.isDone).toBe(true);
      expect([...first.changes, ...second.changes].map((item) => item.answer.answerId)).toEqual(answerIds.slice(0, 50));
      expect([...first.unresolved, ...second.unresolved].map((item) => item.answer.answerId)).toEqual([answerIds[50]]);
      expect((await t.run((ctx) => ctx.db.get(answerIds[50])))?.vendorId).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.APP_ENVIRONMENT;
      else process.env.APP_ENVIRONMENT = previous;
    }
  });

  test("reports duplicates and unmatched answers without changing existing snapshots", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "A", companyBName: "B", projectAName: "A project", projectBName: "B project",
    });
    const setup = await t.run(async (ctx) => {
      const membership = await ctx.db.query("companyMembers")
        .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "northwind-vendor")).unique();
      if (!membership?.vendorId) throw new Error("Missing test organisation");
      await ctx.db.insert("companyMembers", {
        companyId: seeded.companyBId, userId: "replacement", displayName: "Replacement", role: "vendor",
        vendorId: membership.vendorId, isActive: false, createdAt: 1,
      });
      await ctx.db.insert("requirements", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, requirementId: "REQ",
        text: "A requirement", type: "user-story", priority: 9, status: "active", createdAt: 1,
      });
      const first = await ctx.db.insert("scores", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "northwind-vendor",
        requirementId: "REQ", score: 1, comment: "first", enteredBy: "northwind-vendor", enteredAt: 10,
      });
      const second = await ctx.db.insert("scores", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "replacement",
        requirementId: "REQ", score: 0, comment: "second", enteredBy: "replacement", enteredAt: 20,
      });
      const unmatched = await ctx.db.insert("scores", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "unlinked",
        requirementId: "REQ", score: 1, enteredBy: "unlinked", enteredAt: 30,
      });
      return { vendorId: membership.vendorId, first, second, unmatched };
    });
    const previous = process.env.APP_ENVIRONMENT;
    try {
      process.env.APP_ENVIRONMENT = "preview";
      await expect(t.mutation(internal.vendorAnswerBackfill.backfillVendorAnswerOrganizations, {
        projectId: seeded.projectBId, linksRepaired: false,
      })).rejects.toThrow("Repair and review the contact links");
      const report = await t.mutation(internal.vendorAnswerBackfill.backfillVendorAnswerOrganizations, {
        projectId: seeded.projectBId, linksRepaired: true,
      });
      expect(report.changes.map((change) => change.answer.answerId)).toEqual(expect.arrayContaining([setup.first, setup.second]));
      expect(report.unresolved).toContainEqual(expect.objectContaining({ answer: expect.objectContaining({ answerId: setup.unmatched }) }));
      expect(report.conflicts).toContainEqual(expect.objectContaining({
        vendorId: setup.vendorId, requirementId: "REQ",
        answers: expect.arrayContaining([
          expect.objectContaining({ answerId: setup.first, score: 1, comment: "first", enteredAt: 10 }),
          expect.objectContaining({ answerId: setup.second, score: 0, comment: "second", enteredAt: 20 }),
        ]),
      }));
      await t.run(async (ctx) => {
        const other = await ctx.db.insert("vendorOrganizations", {
          companyId: seeded.companyBId, name: "Other", status: "active",
          createdByUserId: "admin", createdAt: 1, updatedAt: 1,
        });
        const member = await ctx.db.query("companyMembers")
          .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "northwind-vendor")).unique();
        if (!member) throw new Error("Missing test contact");
        await ctx.db.patch(member._id, { vendorId: other });
      });
      const again = await t.mutation(internal.vendorAnswerBackfill.backfillVendorAnswerOrganizations, {
        projectId: seeded.projectBId, linksRepaired: true,
      });
      expect(again.changes).toEqual([]);
      expect(again.conflicts).toHaveLength(1);
      expect((await t.run((ctx) => ctx.db.get(setup.first)))?.vendorId).toBe(setup.vendorId);
      process.env.APP_ENVIRONMENT = "production";
      await expect(t.mutation(internal.vendorAnswerBackfill.backfillVendorAnswerOrganizations, {
        projectId: seeded.projectBId, linksRepaired: true,
      })).rejects.toThrow("only available in development or preview");
    } finally {
      if (previous === undefined) delete process.env.APP_ENVIRONMENT;
      else process.env.APP_ENVIRONMENT = previous;
    }
  });
});
