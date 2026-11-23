/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest({ schema, modules });
  const seeded = await t.mutation(internal.access.seedScenario, {
    companyAName: "Acme Health", companyBName: "Beta Logistics", projectAName: "HR Platform", projectBName: "Supply Chain",
  });
  const vendorId = await t.run(async (ctx) => {
    const member = await ctx.db.query("companyMembers")
      .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "northwind-vendor")).unique();
    if (!member?.vendorId) throw new Error("Missing test organisation");
    return member.vendorId;
  });
  return { t, seeded, vendorId };
}

describe("Phase 6b project dashboard", () => {
  test("scorers' totals match a hand-worked example and the comparison grid exactly", async () => {
    const { t, seeded, vendorId } = await seed();
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [
        { id: "R1", text: "Must user story", type: "user-story", priority: 9 },
        { id: "R2", text: "Should user story", type: "user-story", priority: 3 },
        { id: "N1", text: "Must NFR", type: "nfr", priority: 9 },
        { id: "R0", text: "Out of scope", type: "user-story", priority: 0 },
      ],
      confirm: true,
    });
    // Two assigned scorers.
    //   R1 (9): scorer1 1, scorer2 0 -> avg 0.5 -> Met -> 9
    //   R2 (3): scorer1 1 only       -> avg 1   -> Met -> 3   (partly scored)
    //   N1 (9): scorer1 1, scorer2 1 -> avg 1   -> Met -> 9
    //   R0 (0): out of scope         -> ignored
    // Scorers: requirements 12, NFR 9, combined 21. Vendor self: R1 = 1 -> 9.
    await t.run(async (ctx) => {
      await ctx.db.insert("projectMembers", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, userId: "beta-scorer-2",
        role: "company-scorer", displayName: "Beta Scorer 2", isActive: true, createdAt: 1,
      });
      const score = (requirementId: string, scorer: string, value: 0 | 1) => ctx.db.insert("scorerScores", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "northwind-vendor", vendorId,
        scorerScopeKey: `individual:${scorer}`, scorerScopeLabel: scorer, scorerScopeType: "individual",
        requirementId, score: value, enteredByUserId: scorer, enteredByDisplayName: scorer, enteredAt: 1, updatedAt: 1,
      });
      await score("R1", "beta-scorer", 1); await score("R1", "beta-scorer-2", 0);
      await score("R2", "beta-scorer", 1);
      await score("N1", "beta-scorer", 1); await score("N1", "beta-scorer-2", 1);
      await score("R0", "beta-scorer", 1);
      await ctx.db.insert("scores", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "northwind-vendor", vendorId,
        requirementId: "R1", score: 1, enteredBy: "northwind-vendor", enteredAt: 1,
      });
    });

    const dashboard = await admin.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId });
    expect(dashboard.assignedScorerCount).toBe(2);
    expect(dashboard.vendors).toHaveLength(1);
    const north = dashboard.vendors[0];
    expect(north.vendorName).toBe("Northwind Labs");
    expect(north.totals.scorers).toEqual({ requirements: 12, nfr: 9, combined: 21, must: 18, should: 3, could: 0 });
    expect(north.totals.vendorSelf.combined).toBe(9);
    expect(north.totals.coverage).toEqual({ scorableRequirements: 3, fullyScored: 2, partlyScored: 1, unscored: 0, vendorAnswered: 1 });

    // Scorer progress per vendor: scorer 1 scored R1, R2, N1 (R0 is out of scope); scorer 2 scored R1, N1.
    expect(north.scorerProgress.map((row) => [row.userId, row.answered, row.total, row.completed])).toEqual([
      ["beta-scorer", 3, 3, false],
      ["beta-scorer-2", 2, 3, false],
    ]);
    expect(north.scorerProgress[0]).toMatchObject({ name: "Beta Scorer", departmentName: "General" });
    expect(north.unscoredRequirements).toEqual([]);
    expect(north.submission).toMatchObject({ status: "in-progress", submittedAt: null, hasConflict: false });

    const comparison = await admin.query(api.scores.getProjectRequirementComparison, { projectId: seeded.projectBId });
    const compared = comparison.totalsByVendor.find((row) => row.vendorId === vendorId);
    expect(compared?.scorer.combined).toBe(north.totals.scorers.combined);
    expect(compared?.vendor.combined).toBe(north.totals.vendorSelf.combined);

    // Leader is provisional until every assigned scorer has completed every vendor.
    expect(dashboard.leader.scorers).toEqual({ vendorIds: [vendorId], isTie: false, isProvisional: true });
    await t.run(async (ctx) => {
      for (const scorer of ["beta-scorer", "beta-scorer-2"]) {
        await ctx.db.insert("scorerCompletions", {
          companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "northwind-vendor", vendorId,
          scorerScopeKey: `individual:${scorer}`, scorerScopeLabel: scorer, scorerScopeType: "individual",
          status: "completed", answeredCount: 3, totalRequirements: 3,
          updatedByUserId: scorer, updatedByDisplayName: scorer, updatedAt: 1, completedAt: 1,
        });
      }
    });
    const final = await admin.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId });
    expect(final.vendors[0].scorersCompleted).toBe(2);
    expect(final.leader.scorers.isProvisional).toBe(false);
  });

  test("only consultants and company admins of the workspace can open the dashboard", async () => {
    const { t, seeded } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("consultants", { userId: "platform-consultant", displayName: "Consultant", isActive: true, grantedAt: 1 });
    });
    await expect(t.withIdentity({ tokenIdentifier: "beta-admin" })
      .query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId })).resolves.toBeTruthy();
    await expect(t.withIdentity({ tokenIdentifier: "platform-consultant" })
      .query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId })).resolves.toBeTruthy();
    for (const outsider of ["beta-scorer", "northwind-vendor", "acme-admin", "unrelated-user"]) {
      await expect(t.withIdentity({ tokenIdentifier: outsider, name: "Beta Admin" })
        .query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId }))
        .rejects.toThrow("Only consultants and company admins");
    }
  });

  test("an organisation with several contacts is one row, and nothing is double-counted", async () => {
    const { t, seeded, vendorId } = await seed();
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId, rows: [{ id: "REQ", text: "Requirement", type: "user-story", priority: 9 }], confirm: true,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("companyMembers", {
        companyId: seeded.companyBId, vendorId, userId: "second-contact",
        displayName: "Second Contact", role: "vendor", isActive: true, createdAt: 1,
      });
      await ctx.db.insert("scores", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "northwind-vendor", vendorId,
        requirementId: "REQ", score: 1, enteredBy: "northwind-vendor", enteredAt: 1,
      });
    });
    const dashboard = await admin.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId });
    expect(dashboard.vendors).toHaveLength(1);
    expect(dashboard.vendors[0].totals.vendorSelf.combined).toBe(9);
  });

  test("conflicting answers for one organisation are excluded and block the leader", async () => {
    const { t, seeded, vendorId } = await seed();
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId, rows: [{ id: "REQ", text: "Requirement", type: "user-story", priority: 9 }], confirm: true,
    });
    await t.run(async (ctx) => {
      for (const [user, score] of [["northwind-vendor", 1], ["old-contact", 0]] as const) {
        await ctx.db.insert("scores", {
          companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: user, vendorId,
          requirementId: "REQ", score, enteredBy: user, enteredAt: 1,
        });
      }
    });
    const dashboard = await admin.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId });
    expect(dashboard.hasDataConflicts).toBe(true);
    expect(dashboard.vendors[0].totals.vendorSelf.combined).toBe(0);
    expect(dashboard.leader.vendorSelf.vendorIds).toEqual([]);
  });

  test("answers awaiting migration are not counted and block the leader", async () => {
    const { t, seeded } = await seed();
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId, rows: [{ id: "REQ", text: "Requirement", type: "user-story", priority: 9 }], confirm: true,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("scores", {
        companyId: seeded.companyBId, projectId: seeded.projectBId as Id<"projects">,
        vendorUserId: "old-contact", requirementId: "REQ", score: 1, enteredBy: "old-contact", enteredAt: 1,
      });
    });
    const dashboard = await admin.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId });
    expect(dashboard.migrationRequired).toBe(true);
    expect(dashboard.vendors[0].totals.vendorSelf.combined).toBe(0);
    expect(dashboard.leader.vendorSelf.vendorIds).toEqual([]);
  });

  test("lists requirements no scorer has scored, and shows when a vendor has submitted", async () => {
    const { t, seeded, vendorId } = await seed();
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [
        { id: "A", text: "Scored", type: "user-story", priority: 9 },
        { id: "B", text: "Not scored yet", type: "nfr", priority: 3 },
        { id: "C", text: "Out of scope", type: "user-story", priority: 0 },
      ],
      confirm: true,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("scorerScores", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "northwind-vendor", vendorId,
        scorerScopeKey: "individual:beta-scorer", scorerScopeLabel: "Beta Scorer", scorerScopeType: "individual",
        requirementId: "A", score: 1, enteredByUserId: "beta-scorer", enteredByDisplayName: "Beta Scorer", enteredAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("projectDeadlines", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, targetType: "vendor", targetUserId: "northwind-vendor",
        vendorId, dueAt: 2000, status: "submitted", submittedAt: 1500, createdAt: 1, updatedAt: 1,
      });
    });
    const dashboard = await admin.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId });
    const north = dashboard.vendors[0];
    expect(north.unscoredRequirements).toEqual([{ requirementId: "B", text: "Not scored yet", type: "nfr", priority: 3 }]);
    expect(north.submission).toEqual({ status: "submitted", submittedAt: 1500, deadlineAt: 2000, hasConflict: false });
  });
});
