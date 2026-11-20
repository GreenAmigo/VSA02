/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 6 project view isolation", () => {
  test("scorer views stay with the organisation after a contact is replaced", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "A", companyBName: "B", projectAName: "A project", projectBName: "B project",
    });
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    await scorer.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor", viewText: "Original view",
    });
    const vendorId = await t.run(async (ctx) => {
      const member = await ctx.db.query("companyMembers")
        .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "northwind-vendor")).unique();
      if (!member?.vendorId) throw new Error("Missing test organisation");
      return member.vendorId;
    });
    await admin.mutation(api.admin.deactivateVendorContact, { companyId: seeded.companyBId, vendorId, userId: "northwind-vendor" });
    await admin.mutation(api.admin.inviteVendorContact, {
      companyId: seeded.companyBId, vendorId, name: "Replacement", email: "replacement@example.com",
    });
    await t.mutation(internal.access.acceptPendingInvitesForUser, { userId: "replacement", email: "replacement@example.com" });
    const before = await scorer.query(api.projectViews.listProjectViews, { projectId: seeded.projectBId, vendorUserId: "replacement" });
    expect(before.rows[0].viewText).toBe("Original view");
    const saved = await scorer.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId, vendorUserId: "replacement", viewText: "Updated view",
    });
    expect(saved.updated).toBe(true);
    const after = await admin.query(api.projectViews.listProjectViews, { projectId: seeded.projectBId, vendorUserId: "replacement" });
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].viewText).toBe("Updated view");
  });

  test("a matching scorer name does not authorize project views", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const outsider = t.withIdentity({ tokenIdentifier: "unrelated-user", email: "unrelated@example.com", name: "Beta Scorer" });
    await expect(outsider.query(api.projectViews.listProjectViews, { projectId: seeded.projectBId }))
      .rejects.toThrow("Project access denied");
    await expect(outsider.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor", viewText: "Blocked",
    })).rejects.toThrow("Project access denied");
  });

  test("scorer views show workspace names and a safe fallback for missing names", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    await scorer.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor", viewText: "A view",
    });
    await t.run(async (ctx) => {
      const assignment = await ctx.db.query("projectMembers")
        .withIndex("by_project_user", (q) => q.eq("projectId", seeded.projectBId).eq("userId", "beta-scorer")).unique();
      if (!assignment) throw new Error("Missing test assignment");
      await ctx.db.patch(assignment._id, { displayName: "scorer@beta.example" });
    });
    const views = await admin.query(api.projectViews.listProjectViews, { projectId: seeded.projectBId });
    expect(views.rows[0].scorerDisplayName).toBe("Beta Scorer");
    await t.run(async (ctx) => {
      const assignment = await ctx.db.query("projectMembers")
        .withIndex("by_project_user", (q) => q.eq("projectId", seeded.projectBId).eq("userId", "beta-scorer")).unique();
      if (!assignment) throw new Error("Missing test assignment");
      await ctx.db.delete(assignment._id);
      const member = await ctx.db.query("companyMembers")
        .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "beta-scorer")).unique();
      if (!member) throw new Error("Missing test member");
      await ctx.db.patch(member._id, { isActive: false });
    });
    const historical = await admin.query(api.projectViews.listProjectViews, { projectId: seeded.projectBId });
    expect(historical.rows[0].scorerDisplayName).toBe("Beta Scorer");
    await t.run(async (ctx) => {
      const member = await ctx.db.query("companyMembers")
        .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "beta-scorer")).unique();
      if (!member) throw new Error("Missing test member");
      await ctx.db.patch(member._id, { displayName: "beta-scorer" });
    });
    const fallback = await admin.query(api.projectViews.listProjectViews, { projectId: seeded.projectBId });
    expect(fallback.rows[0].scorerDisplayName).toBe("Name not set — ask an admin to update it");
  });

  test("scorer views require an active contact of an assigned vendor organisation, not a legacy project member", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    const assignmentId = await t.run(async (ctx) => {
      const membership = await ctx.db.query("projectMembers")
        .withIndex("by_project_user", (q) => q.eq("projectId", seeded.projectBId).eq("userId", "northwind-vendor"))
        .unique();
      const assignment = await ctx.db.query("projectVendors")
        .withIndex("by_company_project", (q) => q.eq("companyId", seeded.companyBId).eq("projectId", seeded.projectBId))
        .first();
      if (!membership || !assignment) throw new Error("Missing test setup");
      await ctx.db.delete(membership._id);
      return assignment._id;
    });
    const args = { projectId: seeded.projectBId, vendorUserId: "northwind-vendor", viewText: "A view" };
    await expect(scorer.mutation(api.projectViews.saveProjectView, args)).resolves.toMatchObject({ updated: false });

    await t.run(async (ctx) => {
      const contact = await ctx.db.query("companyMembers")
        .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "northwind-vendor"))
        .unique();
      if (!contact) throw new Error("Missing test contact");
      await ctx.db.patch(contact._id, { isActive: false });
    });
    await expect(scorer.mutation(api.projectViews.saveProjectView, args)).rejects.toThrow("Vendor not found on this project");

    await t.run(async (ctx) => {
      const contact = await ctx.db.query("companyMembers")
        .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "northwind-vendor"))
        .unique();
      if (!contact) throw new Error("Missing test contact");
      await ctx.db.patch(contact._id, { isActive: true });
      await ctx.db.delete(assignmentId);
    });
    await expect(scorer.mutation(api.projectViews.saveProjectView, args)).rejects.toThrow("Vendor not found on this project");
  });

  test("vendor view access follows the organisation assignment and never exposes scorer views", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    await scorer.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor", viewText: "Private scorer view",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.projectBId, { scorerCanSeePeerScores: true });
    });
    await t.run(async (ctx) => {
      const membership = await ctx.db.query("projectMembers")
        .withIndex("by_project_user", (q) => q.eq("projectId", seeded.projectBId).eq("userId", "northwind-vendor")).unique();
      if (!membership) throw new Error("Missing test membership");
      await ctx.db.delete(membership._id);
    });
    const views = await vendor.query(api.projectViews.listProjectViews, { projectId: seeded.projectBId });
    expect(views.rows).toHaveLength(0);
    const filteredViews = await vendor.query(api.projectViews.listProjectViews, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor",
    });
    expect(filteredViews).toMatchObject({ rows: [], canViewAll: false, peerViewsUnlocked: false });
    await expect(vendor.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor", viewText: "Not allowed",
    })).rejects.toThrow("Only assigned scorers");
    await t.run(async (ctx) => {
      await ctx.db.insert("projectMembers", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, userId: "northwind-vendor",
        role: "vendor", displayName: "Northwind Labs", isActive: true, createdAt: Date.now(),
      });
      const assignment = await ctx.db.query("projectVendors")
        .withIndex("by_company_project", (q) => q.eq("companyId", seeded.companyBId).eq("projectId", seeded.projectBId)).first();
      if (!assignment) throw new Error("Missing test assignment");
      await ctx.db.delete(assignment._id);
    });
    const historicalViews = await admin.query(api.projectViews.listProjectViews, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor",
    });
    expect(historicalViews.rows.map((row) => row.viewText)).toEqual(["Private scorer view"]);
    await expect(vendor.query(api.projectViews.listProjectViews, { projectId: seeded.projectBId })).rejects.toThrow("Project access denied");
  });

  test("a vendor with a stale scorer assignment cannot read scorer views", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    await scorer.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor", viewText: "Private scorer view",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.projectBId, { scorerCanSeePeerScores: true });
      const membership = await ctx.db.query("projectMembers")
        .withIndex("by_project_user", (q) => q.eq("projectId", seeded.projectBId).eq("userId", "northwind-vendor")).unique();
      if (!membership) throw new Error("Missing legacy membership");
      await ctx.db.patch(membership._id, { role: "company-scorer" });
      await ctx.db.insert("companyMembers", {
        companyId: seeded.companyBId, userId: "northwind-vendor", role: "company-scorer",
        displayName: "Northwind Scorer", isActive: true, createdAt: Date.now(),
      });
      await ctx.db.insert("consultants", {
        userId: "northwind-vendor", displayName: "Northwind Consultant", isActive: true, grantedAt: Date.now(),
      });
      await ctx.db.insert("scorerCompletions", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "northwind-vendor",
        scorerScopeKey: "individual:northwind-vendor", scorerScopeLabel: "Northwind", scorerScopeType: "individual",
        status: "completed", answeredCount: 1, totalRequirements: 1, updatedByUserId: "northwind-vendor",
        updatedByDisplayName: "Northwind", updatedAt: Date.now(),
      });
    });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    const views = await vendor.query(api.projectViews.listProjectViews, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor",
    });
    expect(views).toMatchObject({ rows: [], canViewAll: false, peerViewsUnlocked: false });
    await expect(vendor.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId, vendorUserId: "northwind-vendor", viewText: "Blocked",
    })).rejects.toThrow("Only assigned scorers");
  });

  test("scorers can autosave views until scorer deadline and each change is activity logged", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin", email: "admin@beta.example" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });

    const firstSave = await scorer.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      viewText: "Strong vendor with good delivery track record.",
    });

    const secondSave = await scorer.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      viewText: "Updated overall view after review.",
    });

    expect(firstSave.scorerUserId).toBe("beta-scorer");
    expect(firstSave.vendorUserId).toBe("northwind-vendor");
    expect(secondSave.updated).toBe(true);
    expect(secondSave.updatedAt).toBeGreaterThanOrEqual(firstSave.updatedAt);

    const adminViews = await admin.query(api.projectViews.listProjectViews, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });

    expect(adminViews.rows).toHaveLength(1);
    expect(adminViews.rows[0].scorerDisplayName).toBe("Beta Scorer");
    expect(adminViews.rows[0].scorerDepartmentName).toBe("General");
    expect(adminViews.rows[0].viewText).toBe("Updated overall view after review.");
    expect(adminViews.rows[0].updatedAt).toBeTypeOf("number");

    const activityLogs = await admin.query(api.admin.listActivityLogs, { companyId: seeded.companyBId });
    const scorerViewLogs = activityLogs.filter((row: { action: string }) => row.action === "save_scorer_view");
    expect(scorerViewLogs.length).toBeGreaterThanOrEqual(2);

    await admin.mutation(api.admin.updateProject, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      name: "Supply Chain",
      description: "Scoring deadline lock",
      vendorDeadline: Date.now() - 2000,
      scorerDeadline: Date.now() - 1000,
      scorerCanSeePeerScores: false,
    });

    await expect(
      scorer.mutation(api.projectViews.saveProjectView, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        viewText: "Should fail after deadline",
      }),
    ).rejects.toThrow("Scorer deadline has passed");
  });

  test("scorers only see peer views after project setting is on and their own vendor scoring is complete", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin", email: "admin@beta.example" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer", name: "Beta Scorer", email: "scorer@beta.example" });

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

    await scorer.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      viewText: "My view",
    });

    await peerScorer.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      viewText: "Peer view",
    });

    const viewsBeforeSetting = await scorer.query(api.projectViews.listProjectViews, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    expect(viewsBeforeSetting.rows).toHaveLength(1);
    expect(viewsBeforeSetting.peerVisibilityEnabled).toBe(false);

    await admin.mutation(api.admin.updateProject, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      name: "Supply Chain",
      description: "Peer view toggle",
      vendorDeadline: Date.now() + 1000 * 60 * 60,
      scorerDeadline: Date.now() + 1000 * 60 * 60,
      scorerCanSeePeerScores: true,
    });

    const viewsBeforeCompletion = await scorer.query(api.projectViews.listProjectViews, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    expect(viewsBeforeCompletion.peerVisibilityEnabled).toBe(true);
    expect(viewsBeforeCompletion.peerViewsUnlocked).toBe(false);
    expect(viewsBeforeCompletion.rows).toHaveLength(1);

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-PV-1", text: "Peer view unlock", type: "user-story", priority: 9, status: "active" }],
      confirm: true,
    });

    await scorer.mutation((api as any).scores.saveScorerScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-PV-1",
      score: 1,
      comment: "complete own scoring",
    });

    await scorer.mutation((api as any).scores.completeScorerVendor, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });

    const viewsAfterCompletion = await scorer.query(api.projectViews.listProjectViews, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    expect(viewsAfterCompletion.peerViewsUnlocked).toBe(true);
    expect(viewsAfterCompletion.rows.length).toBeGreaterThanOrEqual(2);
    expect(viewsAfterCompletion.rows.some((row: { scorerDisplayName: string }) => row.scorerDisplayName === "Peer Scorer")).toBe(true);
  });

  test("vendors never see scorer views and consultants can review all scorer views", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const previousSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousEnvironment = process.env.APP_ENVIRONMENT;
    process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
    process.env.APP_ENVIRONMENT = "preview";

    try {
      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "vs-consultant-user",
        email: "consultant@example.com",
        displayName: "VS Consultant",
      });

      const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer", name: "Beta Scorer", email: "scorer@beta.example" });
      const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor", name: "Northwind Labs", email: "vendor@northwind.example" });
      const consultant = t.withIdentity({ tokenIdentifier: "vs-consultant-user", name: "VS Consultant", email: "consultant@example.com" });

      await scorer.mutation(api.projectViews.saveProjectView, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        viewText: "Consultant should be able to review this",
      });

      const vendorViews = await vendor.query(api.projectViews.listProjectViews, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
      });
      expect(vendorViews.rows).toHaveLength(0);

      await expect(
        vendor.mutation(api.projectViews.saveProjectView, {
          projectId: seeded.projectBId,
          vendorUserId: "northwind-vendor",
          viewText: "Not allowed",
        }),
      ).rejects.toThrow("Only assigned scorers can save scorer views.");

      const consultantViews = await consultant.query(api.projectViews.listProjectViews, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
      });

      expect(consultantViews.canViewAll).toBe(true);
      expect(consultantViews.rows.length).toBeGreaterThanOrEqual(1);
      expect(consultantViews.rows[0].scorerDisplayName).toBe("Beta Scorer");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousSecret;
      }

      if (previousEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousEnvironment;
      }
    }
  });
});

