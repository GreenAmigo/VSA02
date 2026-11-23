/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

async function seedWithScores() {
  const t = convexTest({ schema, modules });
  const seeded = await t.mutation(internal.access.seedScenario, {
    companyAName: "Acme Health", companyBName: "Beta Logistics", projectAName: "HR Platform", projectBName: "Supply Chain",
  });
  const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
  await admin.mutation(api.requirements.applyRequirementImport, {
    projectId: seeded.projectBId,
    rows: [
      { id: "R1", text: "Must user story", type: "user-story", priority: 9 },
      { id: "N1", text: "Should NFR", type: "nfr", priority: 3 },
      { id: "R0", text: "Out of scope", type: "user-story", priority: 0 },
    ],
    confirm: true,
  });
  const vendorId = await t.run(async (ctx) => {
    const member = await ctx.db.query("companyMembers")
      .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "northwind-vendor")).unique();
    if (!member?.vendorId) throw new Error("Missing test organisation");
    const vendorId = member.vendorId;
    const score = (requirementId: string, value: 0 | 1, comment: string) => ctx.db.insert("scorerScores", {
      companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "northwind-vendor", vendorId,
      scorerScopeKey: "individual:beta-scorer", scorerScopeLabel: "Beta Scorer", scorerScopeType: "individual",
      requirementId, score: value, comment, enteredByUserId: "beta-scorer", enteredByDisplayName: "beta-scorer",
      scorerDepartmentName: "General", enteredAt: 10, updatedAt: 10,
    });
    await score("R1", 1, "Fully met");
    await score("N1", 0, "Not yet");
    await ctx.db.insert("scores", {
      companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "northwind-vendor", vendorId,
      requirementId: "R1", score: 1, comment: "We do this", enteredBy: "northwind-vendor", enteredAt: 5, amendedAt: 20,
    });
    await ctx.db.insert("projectViews", {
      companyId: seeded.companyBId, projectId: seeded.projectBId, scorerUserId: "beta-scorer", vendorUserId: "northwind-vendor",
      vendorId, viewText: "Strong on delivery", scorerDepartmentName: "General", createdAt: 30,
    });
    await ctx.db.insert("scoreAmendments", {
      companyId: seeded.companyBId, projectId: seeded.projectBId, vendorUserId: "northwind-vendor", vendorId,
      requirementId: "R1", originalScore: 0, newScore: 1, amendedByUserId: "beta-admin", amendedByDisplayName: "beta-admin",
      reason: "Evidence supplied", amendedAt: 20,
    });
    return vendorId;
  });
  return { t, seeded, admin, vendorId };
}

describe("Project sign-off report", () => {
  test("summary matches the dashboard and every part of the report is filled in, with names not IDs", async () => {
    const { seeded, admin, vendorId } = await seedWithScores();
    const report = await admin.query(api.report.getProjectReport, { projectId: seeded.projectBId });
    const dashboard = await admin.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId });

    expect(report.projectName).toBe("Supply Chain");
    expect(report.companyName).toBe("Beta Logistics");
    expect(report.summary).toEqual(dashboard);
    expect(report.summary.vendors[0].totals.scorers.combined).toBe(9); // R1 Met (9) + N1 Not met (0)

    const r1 = report.comparison.find((row) => row.requirementId === "R1");
    expect(r1?.counted).toBe(true);
    expect(r1?.cells[0]).toEqual({
      vendorId, scorerVerdict: 1, scorersScored: 1, vendorScore: 1, vendorComment: "We do this", vendorAmended: true,
    });
    expect(report.comparison.find((row) => row.requirementId === "R0")?.counted).toBe(false);

    expect(report.scorerScores.map((row) => [row.requirementId, row.scorerName, row.departmentName, row.score, row.comment])).toEqual([
      ["N1", "Beta Scorer", "General", 0, "Not yet"],
      ["R1", "Beta Scorer", "General", 1, "Fully met"],
    ]);
    expect(report.views).toEqual([
      { vendorName: "Northwind Labs", scorerName: "Beta Scorer", departmentName: "General", viewText: "Strong on delivery", updatedAt: 30 },
    ]);
    expect(report.amendments[0]).toMatchObject({ requirementId: "R1", amendedBy: "Beta Admin", reason: "Evidence supplied", originalScore: 0, newScore: 1 });
  });

  test("only consultants and company admins of the workspace can get the report", async () => {
    const { t, seeded } = await seedWithScores();
    await t.run((ctx) => ctx.db.insert("consultants", { userId: "platform-consultant", displayName: "Consultant", isActive: true, grantedAt: 1 }));
    await expect(t.withIdentity({ tokenIdentifier: "platform-consultant" })
      .query(api.report.getProjectReport, { projectId: seeded.projectBId })).resolves.toBeTruthy();
    for (const outsider of ["beta-scorer", "northwind-vendor", "acme-admin", "unrelated-user"]) {
      await expect(t.withIdentity({ tokenIdentifier: outsider })
        .query(api.report.getProjectReport, { projectId: seeded.projectBId }))
        .rejects.toThrow("Only consultants and company admins");
    }
  });
});
