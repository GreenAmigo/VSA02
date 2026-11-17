/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 5 score audit trail", () => {
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

  test("department scorer columns can be scored by any department member and record who entered each score", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin", name: "Beta Admin" });
    const deptMember = t.withIdentity({ tokenIdentifier: "ops-member", name: "Ops Member", email: "ops.member@beta.example" });

    const department = await admin.mutation(api.admin.createWorkspaceDepartment, {
      companyId: seeded.companyBId,
      name: "Operations",
    });

    await admin.mutation(api.admin.inviteWorkspacePerson, {
      companyId: seeded.companyBId,
      name: "Ops Member",
      email: "ops.member@beta.example",
      role: "company-scorer",
    });

    await t.mutation(internal.access.acceptPendingInvitesForUser, {
      userId: "ops-member",
      email: "ops.member@beta.example",
      displayName: "Ops Member",
    });

    await admin.mutation(api.admin.addWorkspaceDepartmentMember, {
      companyId: seeded.companyBId,
      departmentId: department.departmentId,
      userId: "ops-member",
    });

    await admin.mutation(api.admin.addProjectScorer, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      role: "department",
      departmentId: department.departmentId,
      departmentName: "Operations",
    });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-D1", text: "Department scoring row", type: "user-story", priority: 9, status: "active" }],
      confirm: true,
    });

    const workboard = await deptMember.query((api as any).scores.getScorerWorkboard, { projectId: seeded.projectBId });
    const departmentScope = workboard.scorerScopes.find((scope: { scopeType: string; label: string }) => scope.scopeType === "department" && scope.label === "Operations");
    expect(departmentScope).toBeTruthy();

    await deptMember.mutation((api as any).scores.saveScorerScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-D1",
      score: 1,
      comment: "Department assessment",
      scopeKey: departmentScope.scopeKey,
    });

    const grid = await deptMember.query((api as any).scores.getScorerVendorGrid, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      scopeKey: departmentScope.scopeKey,
    });
    expect(grid.rows[0].ownScore).toBe(1);
    expect(grid.rows[0].ownComment).toBe("Department assessment");
    expect(grid.rows[0].ownEnteredByDisplayName).toBe("Ops Member");
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

    await admin.mutation(api.admin.inviteWorkspacePerson, {
      companyId: seeded.companyBId,
      name: "Peer Scorer",
      email: "peer.scorer@beta.example",
      role: "company-scorer",
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
      role: "individual",
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

    const visiblePeer = await scorer.query((api as any).scores.getScorerVendorGrid, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
    });
    expect(visiblePeer.canSeePeerScores).toBe(true);
    expect(visiblePeer.rows[0].peerScores.length).toBeGreaterThan(0);
  });
});

