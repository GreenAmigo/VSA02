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
});

