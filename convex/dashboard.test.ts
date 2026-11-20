/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 7 dashboard totals", () => {
  test("does not count a partly migrated answer that may conflict with an older one", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "A", companyBName: "B", projectAName: "A project", projectBName: "B project",
    });
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ", text: "Requirement", type: "user-story", priority: 9 }],
      confirm: true,
    });
    await admin.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor", requirementId: "REQ", score: 1,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("scores", {
        companyId: seeded.companyBId, projectId: seeded.projectBId,
        vendorUserId: "old-contact", requirementId: "REQ", score: 0, enteredBy: "old-contact", enteredAt: 1,
      });
    });
    const dashboard = await admin.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId });
    expect(dashboard.migrationRequired).toBe(true);
    expect(dashboard.rows[0]).toMatchObject({ total: 0, scoredCount: 0, missingCount: 1 });
    const panel = await t.withIdentity({ tokenIdentifier: "northwind-vendor" }).query(
      api.scores.listVendorAnswerRequirements, { projectId: seeded.projectBId },
    );
    expect(panel.migrationRequired).toBe(true);
    expect(panel.rows.find((row) => row.requirementId === "REQ")?.score).toBeNull();
  });

  test("conflicting organisation answers are excluded, even after the contact leaves", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "A", companyBName: "B", projectAName: "A project", projectBName: "B project",
    });
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ", text: "Requirement", type: "user-story", priority: 9 }],
      confirm: true,
    });
    await admin.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor", requirementId: "REQ", score: 1,
    });
    const vendorId = await t.run(async (ctx) => {
      const member = await ctx.db.query("companyMembers")
        .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "northwind-vendor")).unique();
      if (!member?.vendorId) throw new Error("Missing test organisation");
      await ctx.db.insert("scores", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, vendorId: member.vendorId,
        vendorUserId: "old-contact", requirementId: "REQ", score: 1, enteredBy: "old-contact", enteredAt: 1,
      });
      await ctx.db.patch(member._id, { isActive: false });
      return member.vendorId;
    });
    const dashboard = await admin.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId });
    const row = dashboard.rows.find((entry) => entry.vendorId === vendorId);
    expect(row).toMatchObject({ vendorUserId: null, hasConflicts: true, total: 0, scoredCount: 0, missingCount: 1 });
  });

  test("a matching name does not authorize dashboard access", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    for (const name of ["Beta Admin", "Beta Scorer"]) {
      const outsider = t.withIdentity({ tokenIdentifier: "unrelated-user", email: "unrelated@example.com", name });
      await expect(outsider.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId }))
        .rejects.toThrow("Project access denied");
    }
  });

  test("the project dashboard calculates weighted totals from real requirements and scope-checked score rows", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [
        { id: "REQ-201", text: "Deliver on time", type: "user-story", priority: 9 },
        { id: "REQ-202", text: "Support full traceability", type: "nfr", priority: 3 },
        { id: "REQ-203", text: "Optional feature", type: "user-story", priority: 1 },
      ],
      confirm: true,
    });

    await scorer.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-201",
      score: 1,
      comment: "Good",
    });

    await scorer.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-202",
      score: 0,
      comment: "Needs work",
    });

    await scorer.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-203",
      score: 1,
      comment: "Good",
    });

    await vendor.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-201",
      score: 1,
      comment: "Self-score",
    });

    await t.run(async (ctx) => {
      const legacyMember = await ctx.db.query("projectMembers")
        .withIndex("by_project_user", (q) => q.eq("projectId", seeded.projectBId).eq("userId", "northwind-vendor"))
        .unique();
      if (!legacyMember) throw new Error("Missing test membership");
      await ctx.db.patch(legacyMember._id, { role: "company-scorer" });
      await ctx.db.insert("projectMembers", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, userId: "unassigned-vendor",
        role: "vendor", displayName: "Unassigned vendor", isActive: true, createdAt: Date.now(),
      });
    });

    const dashboard = await scorer.query(api.dashboard.getProjectDashboard, {
      projectId: seeded.projectBId,
    });

    expect(dashboard.leadingVendorUserId).toBe("northwind-vendor");
    expect(dashboard.rows).toHaveLength(1);
    expect(dashboard.rows[0].vendorUserId).toBe("northwind-vendor");
    expect(dashboard.rows[0].userStoryTotal).toBe(10);
    expect(dashboard.rows[0].nfrTotal).toBe(0);
    expect(dashboard.rows[0].total).toBe(9);
    expect(dashboard.rows[0].unmetCount).toBe(1);
    expect(dashboard.rows[0].missingCount).toBe(0);

    await expect(
      vendor.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId }),
    ).rejects.toThrow("Project access denied");

    await expect(
      scorer.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectAId }),
    ).rejects.toThrow("Project access denied");
  });
});

