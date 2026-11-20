/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { v } from "convex/values";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

const seedRequirementComparisonFixture = mutation({
  args: {
    companyId: v.id("companies"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const departments = await ctx.db
      .query("workspaceDepartments")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .collect();
    const defaultDepartment = departments[0] ?? null;

    const northwindMembership = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("role"), "vendor"))
      .filter((q: any) => q.eq(q.field("userId"), "northwind-vendor"))
      .first();

    if (!northwindMembership?.vendorId) {
      throw new Error("Northwind vendor membership is required for this fixture");
    }

    const existingProjectVendors = await ctx.db
      .query("projectVendors")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .collect();

    if (!existingProjectVendors.some((row: any) => row.vendorId === northwindMembership.vendorId)) {
      await ctx.db.insert("projectVendors", {
        companyId: args.companyId,
        projectId: args.projectId,
        vendorId: northwindMembership.vendorId,
        createdAt: now,
      });
    }

    const southwindVendorId = await ctx.db.insert("vendorOrganizations", {
      companyId: args.companyId,
      name: "Southwind Systems",
      contactEmail: "contact@southwind.example",
      status: "active",
      createdAt: now,
      updatedAt: now,
      createdByUserId: "beta-admin",
    });

    await ctx.db.insert("companyMembers", {
      companyId: args.companyId,
      userId: "southwind-vendor",
      email: "vendor@southwind.example",
      displayName: "Southwind Contact",
      role: "vendor",
      isActive: true,
      createdAt: now,
      vendorId: southwindVendorId,
    });

    await ctx.db.insert("projectVendors", {
      companyId: args.companyId,
      projectId: args.projectId,
      vendorId: southwindVendorId,
      createdAt: now,
    });

    const scorerTwoMembership = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("userId"), "beta-scorer-2"))
      .first();

    if (!scorerTwoMembership) {
      await ctx.db.insert("companyMembers", {
        companyId: args.companyId,
        userId: "beta-scorer-2",
        email: "scorer2@beta.example",
        displayName: "Green Test2",
        role: "company-scorer",
        isActive: true,
        createdAt: now,
        departmentId: defaultDepartment?._id,
      });
    }

    const scorerOneProjectMembership = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("userId"), "beta-scorer"))
      .first();
    if (!scorerOneProjectMembership) {
      await ctx.db.insert("projectMembers", {
        companyId: args.companyId,
        projectId: args.projectId,
        userId: "beta-scorer",
        role: "company-scorer",
        displayName: "Green Test1",
        isActive: true,
        createdAt: now,
        departmentId: defaultDepartment?._id,
        departmentName: defaultDepartment?.name,
      });
    }

    await ctx.db.insert("projectMembers", {
      companyId: args.companyId,
      projectId: args.projectId,
      userId: "beta-scorer-2",
      role: "company-scorer",
      displayName: "Green Test2",
      isActive: true,
      createdAt: now,
      departmentId: defaultDepartment?._id,
      departmentName: defaultDepartment?.name,
    });

    await ctx.db.insert("requirements", {
      companyId: args.companyId,
      projectId: args.projectId,
      requirementId: "CMP-REQ-001",
      text: "Core requirement",
      type: "user-story",
      priority: 9,
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("requirements", {
      companyId: args.companyId,
      projectId: args.projectId,
      requirementId: "CMP-NFR-001",
      text: "Latency nfr",
      type: "nfr",
      priority: 3,
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("requirements", {
      companyId: args.companyId,
      projectId: args.projectId,
      requirementId: "CMP-REQ-000",
      text: "Out of scope item",
      type: "user-story",
      priority: 0,
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("requirements", {
      companyId: args.companyId,
      projectId: args.projectId,
      requirementId: "CMP-NFR-999",
      text: "Withdrawn nfr",
      type: "nfr",
      priority: 9,
      status: "withdrawn",
      createdAt: now,
    });

    const insertVendorScore = async (payload: {
      vendorUserId: string;
      requirementId: string;
      score: 0 | 1;
      comment: string;
      amended?: boolean;
    }) => {
      await ctx.db.insert("scores", {
        companyId: args.companyId,
        projectId: args.projectId,
        vendorUserId: payload.vendorUserId,
        requirementId: payload.requirementId,
        score: payload.score,
        comment: payload.comment,
        enteredBy: payload.vendorUserId,
        enteredAt: now,
        amendedByUserId: payload.amended ? "beta-admin" : undefined,
        amendedByDisplayName: payload.amended ? "Beta Admin" : undefined,
        amendedAt: payload.amended ? now : undefined,
        amendmentReason: payload.amended ? "Manual correction" : undefined,
      });
    };

    await insertVendorScore({ vendorUserId: "northwind-vendor", requirementId: "CMP-REQ-001", score: 1, comment: "Northwind req" });
    await insertVendorScore({ vendorUserId: "northwind-vendor", requirementId: "CMP-NFR-001", score: 1, comment: "Northwind nfr", amended: true });
    await insertVendorScore({ vendorUserId: "northwind-vendor", requirementId: "CMP-REQ-000", score: 1, comment: "Northwind oos" });
    await insertVendorScore({ vendorUserId: "northwind-vendor", requirementId: "CMP-NFR-999", score: 1, comment: "Northwind withdrawn" });

    await insertVendorScore({ vendorUserId: "southwind-vendor", requirementId: "CMP-REQ-001", score: 0, comment: "Southwind req" });
    await insertVendorScore({ vendorUserId: "southwind-vendor", requirementId: "CMP-NFR-001", score: 1, comment: "Southwind nfr" });
    await insertVendorScore({ vendorUserId: "southwind-vendor", requirementId: "CMP-REQ-000", score: 1, comment: "Southwind oos" });
    await insertVendorScore({ vendorUserId: "southwind-vendor", requirementId: "CMP-NFR-999", score: 1, comment: "Southwind withdrawn" });

    await ctx.db.insert("scoreAmendments", {
      companyId: args.companyId,
      projectId: args.projectId,
      vendorUserId: "northwind-vendor",
      requirementId: "CMP-NFR-001",
      originalScore: 0,
      newScore: 1,
      originalComment: "Initial",
      newComment: "Corrected",
      amendedByUserId: "beta-admin",
      amendedByDisplayName: "Beta Admin",
      reason: "Manual correction",
      amendedAt: now,
    });

    const insertScorerScore = async (payload: {
      vendorUserId: string;
      requirementId: string;
      scorerUserId: string;
      scorerName: string;
      score: 0 | 1;
      comment: string;
    }) => {
      await ctx.db.insert("scorerScores", {
        companyId: args.companyId,
        projectId: args.projectId,
        vendorUserId: payload.vendorUserId,
        scorerScopeKey: `individual:${payload.scorerUserId}`,
        scorerScopeLabel: payload.scorerName,
        scorerScopeType: "individual",
        requirementId: payload.requirementId,
        score: payload.score,
        comment: payload.comment,
        enteredByUserId: payload.scorerUserId,
        enteredByDisplayName: payload.scorerName,
        scorerDepartmentId: defaultDepartment?._id,
        scorerDepartmentName: defaultDepartment?.name ?? "Operations",
        enteredAt: now,
        updatedAt: now,
      });
    };

    await insertScorerScore({ vendorUserId: "northwind-vendor", requirementId: "CMP-REQ-001", scorerUserId: "beta-scorer", scorerName: "workos_user_fake_1", score: 1, comment: "Met" });
    await insertScorerScore({ vendorUserId: "northwind-vendor", requirementId: "CMP-REQ-001", scorerUserId: "beta-scorer-2", scorerName: "Green Test2", score: 0, comment: "Partly" });
    await insertScorerScore({ vendorUserId: "northwind-vendor", requirementId: "CMP-NFR-001", scorerUserId: "beta-scorer", scorerName: "Green Test1", score: 1, comment: "Good" });
    await insertScorerScore({ vendorUserId: "northwind-vendor", requirementId: "CMP-REQ-000", scorerUserId: "beta-scorer", scorerName: "Green Test1", score: 1, comment: "Ignored" });
    await insertScorerScore({ vendorUserId: "northwind-vendor", requirementId: "CMP-NFR-999", scorerUserId: "beta-scorer", scorerName: "Green Test1", score: 1, comment: "Withdrawn" });

    await insertScorerScore({ vendorUserId: "southwind-vendor", requirementId: "CMP-REQ-001", scorerUserId: "beta-scorer", scorerName: "Green Test1", score: 0, comment: "Not met" });
    await insertScorerScore({ vendorUserId: "southwind-vendor", requirementId: "CMP-REQ-001", scorerUserId: "beta-scorer-2", scorerName: "Green Test2", score: 0, comment: "Still not met" });
    await insertScorerScore({ vendorUserId: "southwind-vendor", requirementId: "CMP-REQ-000", scorerUserId: "beta-scorer", scorerName: "Green Test1", score: 1, comment: "Ignored" });
    await insertScorerScore({ vendorUserId: "southwind-vendor", requirementId: "CMP-NFR-999", scorerUserId: "beta-scorer", scorerName: "Green Test1", score: 1, comment: "Withdrawn" });
  },
});

describe("Phase 5 score audit trail", () => {
  test("vendor answers follow contact links rather than organisation or invitation order", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const first = await admin.mutation(api.admin.addWorkspaceVendor, { companyId: seeded.companyBId, name: "First organisation" });
    const second = await admin.mutation(api.admin.addWorkspaceVendor, { companyId: seeded.companyBId, name: "Second organisation" });
    for (const vendorId of [first.vendorId, second.vendorId]) {
      await admin.mutation(api.admin.addProjectVendor, { companyId: seeded.companyBId, projectId: seeded.projectBId, vendorId });
    }
    for (const [userId, email, vendorId] of [
      ["second-contact", "second@example.com", second.vendorId],
      ["first-contact", "first@example.com", first.vendorId],
    ] as const) {
      await admin.mutation(api.admin.inviteVendorContact, { companyId: seeded.companyBId, vendorId, name: userId, email });
      await t.mutation(internal.access.acceptPendingInvitesForUser, { userId, email });
    }
    await t.run((ctx) => ctx.db.patch(seeded.projectBId, { vendorDeadline: Date.now() + 100000 }));
    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-LINK", text: "Linked vendor answer", type: "user-story", priority: 9 }],
      confirm: true,
    });
    const firstUser = t.withIdentity({ subject: "first-contact", tokenIdentifier: "first-contact", email: "first@example.com" });
    const secondUser = t.withIdentity({ subject: "second-contact", tokenIdentifier: "second-contact", email: "second@example.com" });
    await firstUser.mutation(api.scores.saveVendorAnswer, { projectId: seeded.projectBId, requirementId: "REQ-LINK", score: 1, comment: "first answer" });
    await secondUser.mutation(api.scores.saveVendorAnswer, { projectId: seeded.projectBId, requirementId: "REQ-LINK", score: 0, comment: "second answer" });
    const firstAnswers = await firstUser.query(api.scores.listVendorAnswerRequirements, { projectId: seeded.projectBId });
    const secondAnswers = await secondUser.query(api.scores.listVendorAnswerRequirements, { projectId: seeded.projectBId });
    expect(firstAnswers.vendorOrganizationName).toBe("First organisation");
    expect(secondAnswers.vendorOrganizationName).toBe("Second organisation");
    expect(firstAnswers.rows.find((row) => row.requirementId === "REQ-LINK")?.comment).toBe("first answer");
    expect(secondAnswers.rows.find((row) => row.requirementId === "REQ-LINK")?.comment).toBe("second answer");
    await expect(firstUser.query(api.scores.getVendorScoringStatus, {
      projectId: seeded.projectBId, vendorUserId: "second-contact",
    })).rejects.toThrow("own scoring status");
    await expect(firstUser.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId, vendorUserId: "second-contact", requirementId: "REQ-LINK", score: 1,
    })).rejects.toThrow("own submission");
  });

  test("matching a scorer or admin name alone does not grant scoring access", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const fakeScorer = t.withIdentity({ tokenIdentifier: "unrelated-user", email: "unrelated@example.com", name: "Beta Scorer" });
    await expect(fakeScorer.query(api.scores.getScorerVendorGrid, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor",
    })).rejects.toThrow("Only assigned scorers");
    const fakeAdmin = t.withIdentity({ tokenIdentifier: "unrelated-user", email: "unrelated@example.com", name: "Beta Admin" });
    await expect(fakeAdmin.query(api.scores.getVendorResponseReview, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor",
    })).rejects.toThrow("Only consultants and company admins");
  });

  test("scoring screens prefer workspace scorer names over stale assignment and score labels", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    await t.run(async (ctx) => {
      const assignment = await ctx.db.query("projectMembers")
        .withIndex("by_project_user", (q) => q.eq("projectId", seeded.projectBId).eq("userId", "beta-scorer")).unique();
      if (!assignment) throw new Error("Missing test assignment");
      await ctx.db.patch(assignment._id, { displayName: "scorer@beta.example" });
      await ctx.db.insert("companyMembers", {
        companyId: seeded.companyAId, userId: "beta-scorer", displayName: "Other Company Scorer",
        role: "company-scorer", isActive: true, createdAt: Date.now(),
      });
    });
    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-NAME", text: "Scorer name", type: "user-story", priority: 9 }],
      confirm: true,
    });
    await scorer.mutation(api.scores.saveScorerScore, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor", requirementId: "REQ-NAME", score: 1,
    });
    await t.run(async (ctx) => {
      const score = await ctx.db.query("scorerScores")
        .withIndex("by_project_vendor", (q) => q.eq("projectId", seeded.projectBId).eq("vendorUserId", "northwind-vendor")).first();
      if (!score) throw new Error("Missing test score");
      await ctx.db.patch(score._id, { scorerScopeLabel: "user_stale", enteredByDisplayName: "user_stale" });
    });

    const grid = await scorer.query(api.scores.getScorerVendorGrid, { projectId: seeded.projectBId, vendorUserId: "northwind-vendor" });
    expect(grid.scorerScope.label).toBe("Beta Scorer");
    expect(grid.rows[0].ownEnteredByDisplayName).toBe("Beta Scorer");
    const workboard = await scorer.query(api.scores.getScorerWorkboard, { projectId: seeded.projectBId });
    expect(workboard.scorerScopes[0].label).toBe("Beta Scorer");
    const review = await admin.query(api.scores.getVendorResponseReview, { projectId: seeded.projectBId, vendorUserId: "northwind-vendor" });
    expect(review.rows[0].scorerScores[0]).toMatchObject({ scopeLabel: "Beta Scorer", enteredByDisplayName: "Beta Scorer", scorerDepartmentName: "General" });
    const progress = await admin.query(api.scores.getProjectScoringProgress, { projectId: seeded.projectBId });
    expect(progress.groups[0].scorers[0].displayName).toBe("Beta Scorer");
    const comparison = await admin.query(api.scores.getProjectRequirementComparison, { projectId: seeded.projectBId });
    expect(comparison.rows[0].cells[0].scorerDetails[0].scorerName).toBe("Beta Scorer");

    const person = (await admin.query(api.admin.listWorkspacePeople, { companyId: seeded.companyBId }))
      .find((entry) => entry.userId === "beta-scorer");
    if (!person) throw new Error("Missing test person");
    await admin.mutation(api.admin.updateWorkspacePersonName, {
      companyId: seeded.companyBId, memberId: person.id as Id<"companyMembers">, displayName: "Mary-Jane Smith",
    });
    const renamedGrid = await scorer.query(api.scores.getScorerVendorGrid, { projectId: seeded.projectBId, vendorUserId: "northwind-vendor" });
    expect(renamedGrid.scorerScope.label).toBe("Mary-Jane Smith");
    expect(renamedGrid.rows[0].ownEnteredByDisplayName).toBe("Mary-Jane Smith");
    const renamedReview = await admin.query(api.scores.getVendorResponseReview, { projectId: seeded.projectBId, vendorUserId: "northwind-vendor" });
    expect(renamedReview.rows[0].scorerScores[0].enteredByDisplayName).toBe("Mary-Jane Smith");
    const renamedProgress = await admin.query(api.scores.getProjectScoringProgress, { projectId: seeded.projectBId });
    expect(renamedProgress.groups[0].scorers[0].displayName).toBe("Mary-Jane Smith");
    const renamedComparison = await admin.query(api.scores.getProjectRequirementComparison, { projectId: seeded.projectBId });
    expect(renamedComparison.rows[0].cells[0].scorerDetails[0].scorerName).toBe("Mary-Jane Smith");

    await t.run(async (ctx) => {
      const member = await ctx.db.query("companyMembers")
        .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "beta-scorer")).unique();
      if (!member) throw new Error("Missing test member");
      await ctx.db.patch(member._id, { displayName: "beta-scorer" });
      const assignment = await ctx.db.query("projectMembers")
        .withIndex("by_project_user", (q) => q.eq("projectId", seeded.projectBId).eq("userId", "beta-scorer")).unique();
      if (!assignment) throw new Error("Missing test assignment");
      await ctx.db.patch(assignment._id, { displayName: "scorer@beta.example" });
    });
    const fallbackGrid = await scorer.query(api.scores.getScorerVendorGrid, { projectId: seeded.projectBId, vendorUserId: "northwind-vendor" });
    expect(fallbackGrid.scorerScope.label).toBe("Name not set — ask an admin to update it");
    expect(fallbackGrid.rows[0].ownEnteredByDisplayName).toBe("Name not set — ask an admin to update it");
  });

  test("vendor scoring access follows organisation assignment rather than legacy project membership", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    await expect(vendor.query(api.scores.listVendorAnswerRequirements, { projectId: seeded.projectBId }))
      .resolves.toMatchObject({ vendorUserId: "northwind-vendor" });

    await t.run(async (ctx) => {
      const assignment = await ctx.db.query("projectVendors")
        .withIndex("by_company_project", (q) => q.eq("companyId", seeded.companyBId).eq("projectId", seeded.projectBId))
        .first();
      if (!assignment) throw new Error("Missing test assignment");
      await ctx.db.delete(assignment._id);
    });
    await expect(vendor.query(api.scores.listVendorAnswerRequirements, { projectId: seeded.projectBId }))
      .rejects.toThrow("Project access denied");
  });

  test("requirement comparison rejects scorers and vendors at the server", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    await expect(
      scorer.query((api as any).scores.getProjectRequirementComparison, { projectId: seeded.projectBId }),
    ).rejects.toThrow("Only consultants and company admins can review vendor responses");

    await expect(
      vendor.query((api as any).scores.getProjectRequirementComparison, { projectId: seeded.projectBId }),
    ).rejects.toThrow("Only consultants and company admins can review vendor responses");
  });

  test("requirement comparison returns correct averages, weighted totals, exclusions, and mode-specific values", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    await t.mutation(seedRequirementComparisonFixture as any, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const comparison = await admin.query((api as any).scores.getProjectRequirementComparison, {
      projectId: seeded.projectBId,
    });

    const northwind = comparison.vendors.find((vendor: any) => vendor.vendorUserId === "northwind-vendor");
    const southwind = comparison.vendors.find((vendor: any) => vendor.vendorUserId === "southwind-vendor");
    expect(northwind).toBeTruthy();
    expect(southwind).toBeTruthy();

    const reqRow = comparison.rows.find((row: any) => row.requirementId === "CMP-REQ-001");
    const nfrRow = comparison.rows.find((row: any) => row.requirementId === "CMP-NFR-001");
    expect(reqRow).toBeTruthy();
    expect(nfrRow).toBeTruthy();

    const northwindReqCell = reqRow.cells.find((cell: any) => cell.vendorUserId === "northwind-vendor");
    expect(northwindReqCell.scorerAverage).toBe(0.5);
    expect(northwindReqCell.scorerScoredCount).toBe(2);
    expect(northwindReqCell.totalScorers).toBe(2);
    expect(northwindReqCell.vendorScore).toBe(1);

    const northwindNfrCell = nfrRow.cells.find((cell: any) => cell.vendorUserId === "northwind-vendor");
    expect(northwindNfrCell.vendorScore).toBe(1);
    expect(northwindNfrCell.vendorIsAmended).toBe(true);

    const northwindTotals = comparison.totalsByVendor.find((row: any) => row.vendorUserId === "northwind-vendor");
    const southwindTotals = comparison.totalsByVendor.find((row: any) => row.vendorUserId === "southwind-vendor");

    // Hand-checked scorer totals: (REQ p9 * 0.5) + (NFR p3 * 1) = 7.5
    expect(northwindTotals.scorer.requirements).toBe(4.5);
    expect(northwindTotals.scorer.nfr).toBe(3);
    expect(northwindTotals.scorer.combined).toBe(7.5);

    // Hand-checked vendor totals: (REQ p9 * 1) + (NFR p3 * 1) = 12
    expect(northwindTotals.vendor.requirements).toBe(9);
    expect(northwindTotals.vendor.nfr).toBe(3);
    expect(northwindTotals.vendor.combined).toBe(12);

    // Out-of-scope (priority 0) and withdrawn rows are present but excluded from totals
    expect(southwindTotals.scorer.combined).toBe(0);
    expect(southwindTotals.vendor.combined).toBe(3);

    // Mode switch changes values (scorer average vs vendor self-score)
    expect(northwindTotals.scorer.combined).not.toBe(northwindTotals.vendor.combined);
    expect(comparison.scorerBestVendorUserIds).toContain("northwind-vendor");
    expect(comparison.vendorBestVendorUserIds).toContain("northwind-vendor");

    // Display names are resolved from membership records, not ID-like scorer labels
    expect(northwindReqCell.scorerDetails.some((entry: any) => entry.scorerName === "Beta Scorer")).toBe(true);
    expect(northwindReqCell.scorerDetails.some((entry: any) => entry.scorerName === "workos_user_fake_1")).toBe(false);
  });

  test("a scorer can submit a score and the audit trail records who entered it and when", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectAId,
      rows: [
        {
          id: "REQ-101",
          text: "Support role-based access",
          type: "user-story",
          priority: 9,
        },
      ],
      confirm: true,
    });

    const submitted = await admin.mutation(api.scores.submitScore, {
      projectId: seeded.projectAId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-101",
      score: 1,
      comment: "Matches the requirement",
    });

    expect(submitted.enteredBy).toBe("acme-admin");
    expect(submitted.enteredAt).toBeTypeOf("number");

    const history = await admin.query(api.scores.listScoreHistory, {
      projectId: seeded.projectAId,
    });

    expect(history).toHaveLength(1);
    expect(history[0].vendorUserId).toBe("northwind-vendor");
    expect(history[0].enteredBy).toBe("acme-admin");
    expect(history[0].enteredAt).toBe(submitted.enteredAt);
  });

  test("vendors can only score their own project row and cannot reach another vendor's submission", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const betaAdmin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });

    await betaAdmin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [
        {
          id: "REQ-201",
          text: "Deliver on-time shipping",
          type: "nfr",
          priority: 3,
        },
      ],
      confirm: true,
    });

    await vendor.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-201",
      score: 0,
      comment: "We are still behind on this item",
    });

    const history = await vendor.query(api.scores.listScoreHistory, {
      projectId: seeded.projectBId,
    });

    expect(history).toHaveLength(1);
    expect(history[0].vendorUserId).toBe("northwind-vendor");
    expect(history[0].enteredBy).toBe("northwind-vendor");

    await expect(
      vendor.mutation(api.scores.submitScore, {
        projectId: seeded.projectBId,
        vendorUserId: "other-vendor",
        requirementId: "REQ-201",
        score: 1,
      }),
    ).rejects.toThrow("Vendor can only score their own submission");

    await expect(
      vendor.query(api.scores.listScoreHistory, { projectId: seeded.projectAId }),
    ).rejects.toThrow("Project access denied");
  });

  test("vendors can keep editing after submit until due date, then lock after due date while admins can amend with a stored reason", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-301", text: "Vendor portal uptime", type: "nfr", priority: 9 }],
      confirm: true,
    });

    await admin.mutation(api.deadlines.upsertProjectDeadline, {
      projectId: seeded.projectBId,
      targetType: "vendor",
      targetUserId: "northwind-vendor",
      dueAt: Date.now() + 60 * 60 * 1000,
    });

    await vendor.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-301",
      score: 1,
      comment: "Ready for review",
    });

    const progressBefore = await vendor.query(api.scores.getVendorScoringStatus, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    expect(progressBefore.status).toBe("in-progress");
    expect(progressBefore.answeredCount).toBe(1);

    await admin.mutation(api.deadlines.markDeadlineSubmitted, {
      projectId: seeded.projectBId,
      targetType: "vendor",
      targetUserId: "northwind-vendor",
    });

    await vendor.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-301",
      score: 0,
      comment: "Changed before due date",
    });

    await admin.mutation(api.deadlines.upsertProjectDeadline, {
      projectId: seeded.projectBId,
      targetType: "vendor",
      targetUserId: "northwind-vendor",
      dueAt: Date.now() - 60 * 1000,
    });

    await expect(
      vendor.mutation(api.scores.submitScore, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        requirementId: "REQ-301",
        score: 1,
        comment: "Changed after due date",
      }),
    ).rejects.toThrow("Vendor scoring is locked after the deadline");

    const amended = await admin.mutation(api.scores.amendVendorScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-301",
      score: 1,
      reason: "Updated after final review",
    });

    expect(amended.originalScore).toBe(0);
    expect(amended.newScore).toBe(1);
    expect(amended.amendedByDisplayName).toBe("Beta Admin");

    const history = await admin.query(api.scores.listScoreAmendments, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });

    expect(history).toHaveLength(1);
    expect(history[0].reason).toBe("Updated after final review");
    expect(history[0].originalScore).toBe(0);
    expect(history[0].newScore).toBe(1);
  });

  test("vendor answer page APIs only expose active answerable requirements and keep edits open until due date", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor", name: "Northwind Labs" });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [
        { id: "REQ-401", text: "Must support SSO", type: "user-story", priority: 9, status: "active" },
        { id: "REQ-402", text: "Legacy withdrawn", type: "nfr", priority: 9, status: "withdrawn" },
        { id: "REQ-403", text: "Out of scope", type: "nfr", priority: 0, status: "active" },
        { id: "REQ-404", text: "Audit logs", type: "user-story", priority: 1, status: "active" },
      ],
      confirm: true,
    });

    await admin.mutation(api.deadlines.upsertProjectDeadline, {
      projectId: seeded.projectBId,
      targetType: "vendor",
      targetUserId: "northwind-vendor",
      dueAt: Date.now() + 60 * 60 * 1000,
    });

    const initialPanel = await vendor.query((api as any).scores.listVendorAnswerRequirements, {
      projectId: seeded.projectBId,
    });

    expect(initialPanel.totalRequirements).toBe(2);
    expect(initialPanel.rows.map((row: { requirementId: string }) => row.requirementId)).toEqual(["REQ-401", "REQ-404"]);
    expect(initialPanel.status).toBe("not-started");

    await vendor.mutation((api as any).scores.saveVendorAnswer, {
      projectId: seeded.projectBId,
      requirementId: "REQ-401",
      score: 1,
      comment: "Supported",
    });

    const afterFirstSave = await vendor.query((api as any).scores.listVendorAnswerRequirements, {
      projectId: seeded.projectBId,
    });
    expect(afterFirstSave.answeredCount).toBe(1);
    expect(afterFirstSave.status).toBe("in-progress");

    await vendor.mutation((api as any).scores.submitVendorAnswers, {
      projectId: seeded.projectBId,
      confirm: true,
    });

    const submittedPanel = await vendor.query((api as any).scores.listVendorAnswerRequirements, {
      projectId: seeded.projectBId,
    });
    expect(submittedPanel.status).toBe("submitted");

    await vendor.mutation((api as any).scores.saveVendorAnswer, {
      projectId: seeded.projectBId,
      requirementId: "REQ-401",
      score: 0,
      comment: "Changed before due date",
    });

    const editedAfterSubmit = await vendor.query((api as any).scores.listVendorAnswerRequirements, {
      projectId: seeded.projectBId,
    });
    const editedRow = editedAfterSubmit.rows.find((row: { requirementId: string }) => row.requirementId === "REQ-401");
    expect(editedRow?.score).toBe(0);
    expect(editedAfterSubmit.status).toBe("submitted");

    const companyLogs = await admin.query(api.admin.listActivityLogs, { companyId: seeded.companyBId });
    expect(companyLogs.some((entry: { action: string }) => entry.action === "vendor_score_edit")).toBe(true);
    expect(companyLogs.some((entry: { action: string }) => entry.action === "vendor_score_submit")).toBe(true);

    await admin.mutation(api.deadlines.upsertProjectDeadline, {
      projectId: seeded.projectBId,
      targetType: "vendor",
      targetUserId: "northwind-vendor",
      dueAt: Date.now() - 60 * 1000,
    });

    await expect(
      vendor.mutation((api as any).scores.saveVendorAnswer, {
        projectId: seeded.projectBId,
        requirementId: "REQ-404",
        score: 1,
      }),
    ).rejects.toThrow("Vendor scoring is locked after the deadline");

    await admin.mutation(api.scores.amendVendorScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-401",
      score: 1,
      reason: "Final admin correction",
    });

    const readOnlyPanel = await vendor.query((api as any).scores.listVendorAnswerRequirements, {
      projectId: seeded.projectBId,
    });
    const amendedRow = readOnlyPanel.rows.find((row: { requirementId: string }) => row.requirementId === "REQ-401");
    expect(readOnlyPanel.deadlineLocked).toBe(true);
    expect(amendedRow?.amendedByDisplayName).toBe("Beta Admin");
    const adminPerson = (await admin.query(api.admin.listWorkspacePeople, { companyId: seeded.companyBId }))
      .find((person) => person.userId === "beta-admin");
    if (!adminPerson) throw new Error("Missing admin");
    await admin.mutation(api.admin.updateWorkspacePersonName, {
      companyId: seeded.companyBId, memberId: adminPerson.id as Id<"companyMembers">, displayName: "Renamed Admin",
    });
    const renamedPanel = await vendor.query(api.scores.listVendorAnswerRequirements, { projectId: seeded.projectBId });
    expect(renamedPanel.rows.find((row) => row.requirementId === "REQ-401")?.amendedByDisplayName).toBe("Renamed Admin");
    const review = await admin.query(api.scores.getVendorResponseReview, { projectId: seeded.projectBId, vendorUserId: "northwind-vendor" });
    expect(review.rows.find((row) => row.requirementId === "REQ-401")?.history[0].amendedByDisplayName).toBe("Renamed Admin");
    const comparison = await admin.query(api.scores.getProjectRequirementComparison, { projectId: seeded.projectBId });
    expect(comparison.rows.find((row) => row.requirementId === "REQ-401")?.cells[0].vendorAmendedByDisplayName).toBe("Renamed Admin");
  });

  test("vendor answer page APIs enforce project scope and active requirement rules", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [
        { id: "REQ-501", text: "Active row", type: "user-story", priority: 9, status: "active" },
        { id: "REQ-502", text: "Withdrawn row", type: "nfr", priority: 9, status: "withdrawn" },
      ],
      confirm: true,
    });

    await expect(
      vendor.query((api as any).scores.listVendorAnswerRequirements, { projectId: seeded.projectAId }),
    ).rejects.toThrow("Project access denied");

    await expect(
      vendor.mutation((api as any).scores.saveVendorAnswer, {
        projectId: seeded.projectBId,
        requirementId: "REQ-502",
        score: 1,
      }),
    ).rejects.toThrow("This requirement is not active for scoring");
  });

  test("editing project vendor deadline immediately locks and unlocks vendor answers", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor", name: "Northwind Labs" });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-601", text: "Lock test", type: "user-story", priority: 9, status: "active" }],
      confirm: true,
    });

    await admin.mutation((api as any).admin.updateProject, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      name: "Supply Chain",
      vendorDeadline: Date.now() + 1000 * 60 * 30,
    });

    await vendor.mutation((api as any).scores.saveVendorAnswer, {
      projectId: seeded.projectBId,
      requirementId: "REQ-601",
      score: 1,
      comment: "Editable before lock",
    });

    await admin.mutation((api as any).admin.updateProject, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      name: "Supply Chain",
      vendorDeadline: Date.now() - 1000,
    });

    await expect(
      vendor.mutation((api as any).scores.saveVendorAnswer, {
        projectId: seeded.projectBId,
        requirementId: "REQ-601",
        score: 0,
      }),
    ).rejects.toThrow("Vendor scoring is locked after the deadline");

    await admin.mutation((api as any).admin.updateProject, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      name: "Supply Chain",
      vendorDeadline: Date.now() + 1000 * 60 * 60,
    });

    await vendor.mutation((api as any).scores.saveVendorAnswer, {
      projectId: seeded.projectBId,
      requirementId: "REQ-601",
      score: 0,
      comment: "Editable again after extension",
    });
  });

  test("consultants and company admins can review vendor responses, amend after lock with a reason, and reopen a vendor window", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin", email: "beta-admin@example.com" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor", name: "Northwind Labs", email: "vendor@northwind.example" });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [
        { id: "REQ-701", text: "Vendor evidence", type: "user-story", priority: 9, status: "active" },
        { id: "REQ-702", text: "Availability", type: "nfr", priority: 3, status: "active" },
      ],
      confirm: true,
    });

    await admin.mutation((api as any).admin.updateProject, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      name: "Supply Chain",
      vendorDeadline: Date.now() + 1000 * 60 * 60,
    });

    await vendor.mutation((api as any).scores.saveVendorAnswer, {
      projectId: seeded.projectBId,
      requirementId: "REQ-701",
      score: 0,
      comment: "Initial vendor answer",
    });

    const responseRows = await admin.query((api as any).scores.listProjectVendorResponses, {
      projectId: seeded.projectBId,
    });
    const northwindRow = responseRows.find((row: { vendorName: string }) => row.vendorName === "Northwind Labs");
    expect(northwindRow?.answeredCount).toBe(1);
    expect(northwindRow?.status).toBe("in-progress");
    expect(northwindRow?.vendorUserId).toBe("northwind-vendor");

    await expect(
      admin.mutation((api as any).scores.amendVendorScore, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        requirementId: "REQ-701",
        score: 1,
        reason: "Too early",
      }),
    ).rejects.toThrow("Vendor score amendments are only allowed after the deadline");

    await admin.mutation((api as any).admin.updateProject, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      name: "Supply Chain",
      vendorDeadline: Date.now() - 1000,
    });

    await expect(
      admin.mutation((api as any).scores.amendVendorScore, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        requirementId: "REQ-701",
        score: 1,
        reason: "   ",
      }),
    ).rejects.toThrow("A reason is required to amend a vendor score");

    await admin.mutation((api as any).scores.amendVendorScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-701",
      score: 1,
      comment: "Admin corrected answer",
      reason: "Evidence reviewed with vendor",
    });

    const review = await admin.query((api as any).scores.getVendorResponseReview, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });

    expect(review.deadlineLocked).toBe(true);
    const amendedRow = review.rows.find((row: { requirementId: string }) => row.requirementId === "REQ-701");
    expect(amendedRow?.score).toBe(1);
    expect(amendedRow?.comment).toBe("Admin corrected answer");
    expect(amendedRow?.history.length).toBe(1);
    expect(amendedRow?.history[0].originalScore).toBe(0);
    expect(amendedRow?.history[0].newScore).toBe(1);
    expect(amendedRow?.history[0].originalComment).toBe("Initial vendor answer");
    expect(amendedRow?.history[0].newComment).toBe("Admin corrected answer");
    expect(amendedRow?.history[0].reason).toBe("Evidence reviewed with vendor");

    await expect(
      vendor.mutation((api as any).scores.saveVendorAnswer, {
        projectId: seeded.projectBId,
        requirementId: "REQ-701",
        score: 0,
      }),
    ).rejects.toThrow("Vendor scoring is locked after the deadline");

    await admin.mutation((api as any).scores.reopenVendorAnswers, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      dueAt: Date.now() + 1000 * 60 * 60,
    });

    await vendor.mutation((api as any).scores.saveVendorAnswer, {
      projectId: seeded.projectBId,
      requirementId: "REQ-701",
      score: 0,
      comment: "Vendor reopened answer",
    });

    const activity = await admin.query(api.admin.listActivityLogs, { companyId: seeded.companyBId });
    expect(activity.some((entry: { action: string }) => entry.action === "vendor_score_amend_admin")).toBe(true);
    expect(activity.some((entry: { action: string }) => entry.action === "vendor_answers_reopened")).toBe(true);
  });

  test("assigned scorers can autosave 0/1 scoring and only see vendor self-answers after completion", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer", name: "Beta Scorer" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor", name: "Northwind Labs" });

    await admin.mutation((api as any).admin.updateWorkspacePersonDepartment, {
      companyId: seeded.companyBId,
      userId: "beta-scorer",
      departmentId: (await admin.query((api as any).admin.listWorkspaceDepartments, { companyId: seeded.companyBId }))[0].departmentId,
    });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [
        { id: "REQ-S1", text: "Core capability", type: "user-story", priority: 9, status: "active" },
        { id: "REQ-S2", text: "Withdrawn row", type: "nfr", priority: 3, status: "withdrawn" },
        { id: "REQ-S3", text: "Out of scope row", type: "nfr", priority: 0, status: "active" },
      ],
      confirm: true,
    });

    await vendor.mutation((api as any).scores.saveVendorAnswer, {
      projectId: seeded.projectBId,
      requirementId: "REQ-S1",
      score: 1,
      comment: "Vendor self score",
    });

    const beforeComplete = await scorer.query((api as any).scores.getScorerVendorGrid, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    expect(beforeComplete.rows).toHaveLength(1);
    expect(beforeComplete.rows[0].requirementId).toBe("REQ-S1");
    expect(beforeComplete.rows[0].vendorScore).toBe(null);
    expect(beforeComplete.rows[0].vendorComment).toBe(null);

    await scorer.mutation((api as any).scores.saveScorerScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-S1",
      score: 0,
      comment: "Scorer notes",
    });

    await expect(
      scorer.mutation((api as any).scores.saveScorerScore, {
        projectId: seeded.projectBId,
        vendorUserId: "other-vendor",
        requirementId: "REQ-S1",
        score: 1,
      }),
    ).rejects.toThrow("Vendor is not assigned to this project");

    await expect(
      scorer.mutation((api as any).scores.saveScorerScore, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        requirementId: "REQ-S2",
        score: 1,
      }),
    ).rejects.toThrow("This requirement is not active for scoring");

    await expect(
      scorer.mutation((api as any).scores.saveScorerScore, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        requirementId: "REQ-S3",
        score: 1,
      }),
    ).rejects.toThrow("This requirement is not active for scoring");

    await scorer.mutation((api as any).scores.completeScorerVendor, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });

    const afterComplete = await scorer.query((api as any).scores.getScorerVendorGrid, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    expect(afterComplete.isCompleted).toBe(true);
    expect(afterComplete.rows[0].vendorScore).toBe(1);
    expect(afterComplete.rows[0].vendorComment).toBe("Vendor self score");

    const workboard = await scorer.query((api as any).scores.getScorerWorkboard, {
      projectId: seeded.projectBId,
    });
    const northwindRow = workboard.vendors.find((row: { vendorUserId: string }) => row.vendorUserId === "northwind-vendor");
    expect(northwindRow?.status).toBe("completed");

    const logs = await admin.query(api.admin.listActivityLogs, { companyId: seeded.companyBId });
    expect(logs.some((entry: { action: string }) => entry.action === "scorer_score_edit")).toBe(true);
    expect(logs.some((entry: { action: string }) => entry.action === "scorer_vendor_complete")).toBe(true);
  });

  test("server rejects scorer attempts to save scores as another scorer", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer", name: "Beta Scorer" });
    const departments = await admin.query((api as any).admin.listWorkspaceDepartments, { companyId: seeded.companyBId });

    await admin.mutation((api as any).admin.updateWorkspacePersonDepartment, {
      companyId: seeded.companyBId,
      userId: "beta-scorer",
      departmentId: departments[0].departmentId,
    });

    await admin.mutation(api.admin.inviteWorkspacePerson, {
      companyId: seeded.companyBId,
      name: "Peer Scorer",
      email: "peer.scorer@beta.example",
      role: "company-scorer",
      departmentId: departments[0].departmentId,
    });

    await t.mutation(internal.access.acceptPendingInvitesForUser, {
      userId: "peer-scorer",
      email: "peer.scorer@beta.example",
      displayName: "Peer Scorer",
    });

    await admin.mutation(api.admin.addProjectScorer, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      userId: "peer-scorer",
      displayName: "Peer Scorer",
      email: "peer.scorer@beta.example",
    });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-OWNERSHIP", text: "Scope ownership", type: "user-story", priority: 9, status: "active" }],
      confirm: true,
    });

    await expect(
      scorer.mutation((api as any).scores.saveScorerScore, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        requirementId: "REQ-OWNERSHIP",
        score: 1,
        comment: "Should be blocked",
        scopeKey: "individual:peer-scorer",
      }),
    ).rejects.toThrow("You can only score as yourself.");
  });

  test("scorer scores keep the scorer department snapshot", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin" });
    const department = await admin.mutation(api.admin.createWorkspaceDepartment, {
      companyId: seeded.companyBId,
      name: "Operations",
    });

    await admin.mutation(api.admin.inviteWorkspacePerson, {
      companyId: seeded.companyBId,
      name: "Ops Member",
      email: "ops.member@beta.example",
      role: "company-scorer",
      departmentId: department.departmentId,
    });

    await t.mutation(internal.access.acceptPendingInvitesForUser, {
      userId: "ops-member",
      email: "ops.member@beta.example",
      displayName: "Ops Member",
    });

    const deptMember = t.withIdentity({ tokenIdentifier: "ops-member", name: "Ops Member", email: "ops.member@beta.example" });

    await admin.mutation(api.admin.addProjectScorer, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      userId: "ops-member",
      displayName: "Ops Member",
      email: "ops.member@beta.example",
    });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-D1", text: "Department scoring row", type: "user-story", priority: 9, status: "active" }],
      confirm: true,
    });

    await deptMember.mutation((api as any).scores.saveScorerScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-D1",
      score: 1,
      comment: "Department assessment",
    });

    const grid = await deptMember.query((api as any).scores.getScorerVendorGrid, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    expect(grid.rows[0].ownScore).toBe(1);
    expect(grid.rows[0].ownComment).toBe("Department assessment");
    expect(grid.rows[0].ownEnteredByDisplayName).toBe("Ops Member");
    expect(grid.rows[0].ownScorerDepartmentName).toBe("Operations");

    const engineering = await admin.mutation(api.admin.createWorkspaceDepartment, {
      companyId: seeded.companyBId,
      name: "Engineering",
    });
    await admin.mutation((api as any).admin.updateWorkspacePersonDepartment, {
      companyId: seeded.companyBId,
      userId: "ops-member",
      departmentId: engineering.departmentId,
    });

    const gridAfterMove = await deptMember.query((api as any).scores.getScorerVendorGrid, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    expect(gridAfterMove.rows[0].ownScorerDepartmentName).toBe("Operations");

    const adminReview = await admin.query((api as any).scores.getVendorResponseReview, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    const scoredRow = adminReview.rows.find((item: { requirementId: string }) => item.requirementId === "REQ-D1");
    expect(scoredRow?.scorerScores[0].scorerDepartmentName).toBe("Operations");
  });

  test("vendor response review shows scorer department snapshots on each scorer score", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin", email: "admin@beta.example" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer", name: "Beta Scorer", email: "scorer@beta.example" });

    await admin.mutation((api as any).admin.updateWorkspacePersonDepartment, {
      companyId: seeded.companyBId,
      userId: "beta-scorer",
      departmentId: (await admin.query((api as any).admin.listWorkspaceDepartments, { companyId: seeded.companyBId }))[0].departmentId,
    });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-SNAPSHOT", text: "Snapshot visibility", type: "user-story", priority: 9, status: "active" }],
      confirm: true,
    });

    await scorer.mutation((api as any).scores.saveScorerScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-SNAPSHOT",
      score: 1,
      comment: "Snapshot check",
    });

    const review = await admin.query((api as any).scores.getVendorResponseReview, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });

    const row = review.rows.find((item: { requirementId: string }) => item.requirementId === "REQ-SNAPSHOT");
    expect(row?.scorerScores.length).toBe(1);
    expect(row?.scorerScores[0].scopeLabel).toBe("Beta Scorer");
    expect(row?.scorerScores[0].scorerDepartmentName).toBe("General");
  });

  test("scoring progress flags scorers with historical snapshot departments", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin", email: "admin@beta.example" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer", name: "Beta Scorer", email: "scorer@beta.example" });

    const finance = await admin.mutation(api.admin.createWorkspaceDepartment, {
      companyId: seeded.companyBId,
      name: "Finance",
    });
    await admin.mutation((api as any).admin.updateWorkspacePersonDepartment, {
      companyId: seeded.companyBId,
      userId: "beta-scorer",
      departmentId: finance.departmentId,
    });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [
        { id: "REQ-HIST-1", text: "History 1", type: "user-story", priority: 9, status: "active" },
        { id: "REQ-HIST-2", text: "History 2", type: "user-story", priority: 9, status: "active" },
      ],
      confirm: true,
    });

    await scorer.mutation((api as any).scores.saveScorerScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-HIST-1",
      score: 1,
      comment: "Finance score",
    });

    const generalDepartmentId = (await admin.query((api as any).admin.listWorkspaceDepartments, { companyId: seeded.companyBId }))
      .find((row: { name: string }) => row.name === "General")?.departmentId;
    expect(generalDepartmentId).toBeTruthy();

    await admin.mutation((api as any).admin.updateWorkspacePersonDepartment, {
      companyId: seeded.companyBId,
      userId: "beta-scorer",
      departmentId: generalDepartmentId,
    });

    await scorer.mutation((api as any).scores.saveScorerScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-HIST-2",
      score: 1,
      comment: "General score",
    });

    const progress = await admin.query((api as any).scores.getProjectScoringProgress, {
      projectId: seeded.projectBId,
    });

    const generalGroup = progress.groups.find((group: { departmentName: string }) => group.departmentName === "General");
    const scorerRow = generalGroup?.scorers.find((row: { displayName: string }) => row.displayName === "Beta Scorer");
    expect(scorerRow?.historicalDepartmentNames).toContain("Finance");
  });

  test("department filter splits current and historical scorer groups based on score snapshots", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin", email: "admin@beta.example" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer", name: "Beta Scorer", email: "scorer@beta.example" });

    const itDepartment = await admin.mutation(api.admin.createWorkspaceDepartment, {
      companyId: seeded.companyBId,
      name: "IT Test Dept",
    });
    const digitalDepartment = await admin.mutation(api.admin.createWorkspaceDepartment, {
      companyId: seeded.companyBId,
      name: "Digital",
    });

    await admin.mutation((api as any).admin.updateWorkspacePersonDepartment, {
      companyId: seeded.companyBId,
      userId: "beta-scorer",
      departmentId: itDepartment.departmentId,
    });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-IT-1", text: "IT snapshot", type: "user-story", priority: 9, status: "active" }],
      confirm: true,
    });

    await scorer.mutation((api as any).scores.saveScorerScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-IT-1",
      score: 1,
      comment: "Entered in IT",
    });

    await admin.mutation((api as any).admin.updateWorkspacePersonDepartment, {
      companyId: seeded.companyBId,
      userId: "beta-scorer",
      departmentId: digitalDepartment.departmentId,
    });

    const filtered = await admin.query((api as any).scores.getProjectScoringProgress, {
      projectId: seeded.projectBId,
      departmentId: itDepartment.departmentId,
    });

    const currentGroup = filtered.groups.find((group: { groupType: string }) => group.groupType === "current");
    const historicalGroup = filtered.groups.find((group: { groupType: string }) => group.groupType === "historical");

    expect(currentGroup?.departmentName).toBe("Currently in IT Test Dept");
    expect(currentGroup?.scorers).toHaveLength(0);
    expect(historicalGroup?.departmentName).toBe("Also scored while in IT Test Dept");

    const historicalScorer = historicalGroup?.scorers.find((row: { displayName: string }) => row.displayName === "Beta Scorer");
    expect(historicalScorer?.departmentName).toBe("Digital");
    expect(historicalScorer?.selectedDepartmentScoreCount).toBeGreaterThanOrEqual(1);
  });

  test("scorer peer visibility is controlled by the per-project admin setting", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer", name: "Beta Scorer" });

    await admin.mutation((api as any).admin.updateWorkspacePersonDepartment, {
      companyId: seeded.companyBId,
      userId: "beta-scorer",
      departmentId: (await admin.query((api as any).admin.listWorkspaceDepartments, { companyId: seeded.companyBId }))[0].departmentId,
    });

    await admin.mutation(api.admin.inviteWorkspacePerson, {
      companyId: seeded.companyBId,
      name: "Peer Scorer",
      email: "peer.scorer@beta.example",
      role: "company-scorer",
      departmentId: (await admin.query((api as any).admin.listWorkspaceDepartments, { companyId: seeded.companyBId }))[0].departmentId,
    });

    await t.mutation(internal.access.acceptPendingInvitesForUser, {
      userId: "peer-scorer",
      email: "peer.scorer@beta.example",
      displayName: "Peer Scorer",
    });

    await admin.mutation(api.admin.addProjectScorer, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      userId: "peer-scorer",
      displayName: "Peer Scorer",
      email: "peer.scorer@beta.example",
    });

    const peerScorer = t.withIdentity({ tokenIdentifier: "peer-scorer", name: "Peer Scorer", email: "peer.scorer@beta.example" });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-P1", text: "Peer visibility row", type: "user-story", priority: 9, status: "active" }],
      confirm: true,
    });

    await peerScorer.mutation((api as any).scores.saveScorerScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-P1",
      score: 1,
      comment: "Peer scorer value",
      scopeKey: "individual:peer-scorer",
    });

    await t.run(async (ctx) => {
      const assignment = await ctx.db.query("projectMembers")
        .withIndex("by_project_user", (q) => q.eq("projectId", seeded.projectBId).eq("userId", "peer-scorer")).unique();
      const scores = await ctx.db.query("scorerScores")
        .withIndex("by_project_vendor", (q) => q.eq("projectId", seeded.projectBId).eq("vendorUserId", "northwind-vendor")).collect();
      const score = scores.find((row) => row.enteredByUserId === "peer-scorer");
      if (!assignment || !score) throw new Error("Missing peer test data");
      await ctx.db.patch(assignment._id, { displayName: "peer.scorer@beta.example" });
      await ctx.db.patch(score._id, { scorerScopeLabel: "user_peer", enteredByDisplayName: "user_peer" });
    });

    const hiddenPeer = await scorer.query((api as any).scores.getScorerVendorGrid, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    expect(hiddenPeer.canSeePeerScores).toBe(false);
    expect(hiddenPeer.rows[0].peerScores).toHaveLength(0);

    await admin.mutation((api as any).admin.updateProject, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      name: "Supply Chain",
      scorerCanSeePeerScores: true,
    });

    const visiblePeerBeforeCompletion = await scorer.query((api as any).scores.getScorerVendorGrid, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    expect(visiblePeerBeforeCompletion.canSeePeerScores).toBe(false);
    expect(visiblePeerBeforeCompletion.rows[0].peerScores).toHaveLength(0);

    await scorer.mutation((api as any).scores.completeScorerVendor, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });

    const visiblePeerAfterCompletion = await scorer.query((api as any).scores.getScorerVendorGrid, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    expect(visiblePeerAfterCompletion.canSeePeerScores).toBe(true);
    expect(visiblePeerAfterCompletion.rows[0].peerScores.length).toBeGreaterThan(0);
    expect(visiblePeerAfterCompletion.rows[0].peerScores[0]).toMatchObject({
      scopeLabel: "Peer Scorer",
      enteredByDisplayName: "Peer Scorer",
    });
  });

  test("preview/dev scorer reset clears scorer-only project data and leaves vendor answers", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const previousAppEnvironment = process.env.APP_ENVIRONMENT;
    process.env.APP_ENVIRONMENT = "development";

    try {
      const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin", email: "admin@beta.example" });
      const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer", name: "Beta Scorer", email: "scorer@beta.example" });
      const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor", name: "Northwind Labs", email: "vendor@northwind.example" });

      await admin.mutation((api as any).admin.updateWorkspacePersonDepartment, {
        companyId: seeded.companyBId,
        userId: "beta-scorer",
        departmentId: (await admin.query((api as any).admin.listWorkspaceDepartments, { companyId: seeded.companyBId }))[0].departmentId,
      });

      await admin.mutation(api.requirements.applyRequirementImport, {
        projectId: seeded.projectBId,
        rows: [{ id: "REQ-R1", text: "Reset row", type: "user-story", priority: 9, status: "active" }],
        confirm: true,
      });

      await vendor.mutation((api as any).scores.saveVendorAnswer, {
        projectId: seeded.projectBId,
        requirementId: "REQ-R1",
        score: 1,
        comment: "Vendor stays",
      });

      await scorer.mutation((api as any).scores.saveScorerScore, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        requirementId: "REQ-R1",
        score: 1,
        comment: "Scorer removed",
      });

      await scorer.mutation((api as any).scores.completeScorerVendor, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
      });

      await scorer.mutation((api as any).projectViews.saveProjectView, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        viewText: "Scorer view removed",
      });

      const resetResult = await t.mutation((internal as any).scores.clearProjectScorerData, {
        projectId: seeded.projectBId,
      });

      expect(resetResult.scorerScoresRemoved).toBeGreaterThanOrEqual(1);
      expect(resetResult.scorerCompletionsRemoved).toBeGreaterThanOrEqual(1);
      expect(resetResult.scorerViewsRemoved).toBeGreaterThanOrEqual(1);

      const scorerGrid = await scorer.query((api as any).scores.getScorerVendorGrid, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
      });
      expect(scorerGrid.rows[0].ownScore).toBe(null);

      const vendorRows = await vendor.query((api as any).scores.listVendorAnswerRequirements, {
        projectId: seeded.projectBId,
      });
      expect(vendorRows.rows.find((row: { requirementId: string }) => row.requirementId === "REQ-R1")?.score).toBe(1);

      const logs = await admin.query(api.admin.listActivityLogs, { companyId: seeded.companyBId });
      expect(logs.some((entry: { action: string }) => entry.action === "clear_project_scorer_data")).toBe(true);
    } finally {
      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });

  test("project scorer reset is blocked in production", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const previousAppEnvironment = process.env.APP_ENVIRONMENT;
    process.env.APP_ENVIRONMENT = "production";

    try {
      await expect(t.mutation((internal as any).scores.clearProjectScorerData, {
        projectId: seeded.projectBId,
      })).rejects.toThrow("Project scorer data reset is disabled in production");
    } finally {
      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });
});

