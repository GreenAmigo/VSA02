import { query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { assertVendorReviewAccess } from "./scores";
import { buildProjectDashboard } from "./dashboard";
import { getProjectVendors } from "./projectVendors";
import { getProjectVendorAnswerState, getUnconflictedVendorAnswers } from "./vendorAnswers";
import { getVendorScorerHistory } from "./scorerHistory";
import { averageScorerScore, isScorable, scorerOutcome } from "./scoreTotals";

function isEmailLike(value: string | null | undefined) {
  return Boolean(value && value.includes("@"));
}

/** A person's display name in this workspace; never an ID, and an email only as a last resort. */
async function personName(ctx: QueryCtx, companyId: Id<"companies">, userId: string, recorded?: string | null) {
  const member = await ctx.db.query("companyMembers")
    .withIndex("by_company_user", (q) => q.eq("companyId", companyId).eq("userId", userId))
    .first();
  for (const candidate of [member?.displayName, recorded]) {
    if (candidate && !isEmailLike(candidate) && !candidate.startsWith("user_") && !candidate.startsWith("https://")) return candidate;
  }
  return member?.email ?? recorded ?? "Unknown person";
}

/**
 * Sign-off report for one project (consultants and company admins only).
 * Summary figures come from the same calculation as the dashboard.
 */
export const getProjectReport = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project } = await assertVendorReviewAccess(ctx, args.projectId);
    const company = await ctx.db.get(project.companyId as Id<"companies">);
    const summary = await buildProjectDashboard(ctx, project, args.projectId);

    const requirementDocs = (await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .take(2000))
      .sort((a, b) => a.requirementId.localeCompare(b.requirementId));

    const vendors = await getProjectVendors(ctx, project);
    const answerState = await getProjectVendorAnswerState(ctx, project);
    const names = new Map<string, string>();
    const nameOf = async (userId: string, recorded?: string | null) => {
      if (!names.has(userId)) names.set(userId, await personName(ctx, project.companyId, userId, recorded));
      return names.get(userId)!;
    };

    const scorerScores: Array<{
      requirementId: string; vendorName: string; scorerName: string; departmentName: string;
      score: 0 | 1; comment: string; enteredAt: number;
    }> = [];
    const views: Array<{ vendorName: string; scorerName: string; departmentName: string; viewText: string; updatedAt: number }> = [];
    const amendments: Array<{
      requirementId: string; vendorName: string; originalScore: 0 | 1; newScore: 0 | 1;
      originalComment: string; newComment: string; amendedBy: string; reason: string; amendedAt: number;
    }> = [];
    const perVendor = new Map<string, {
      scorer: Map<string, Array<{ requirementId: string; scorerKey: string; score: 0 | 1 }>>;
      answers: Map<string, { score: 0 | 1; comment: string; amended: boolean }>;
    }>();

    for (const vendor of vendors) {
      const history = await getVendorScorerHistory(ctx, args.projectId, vendor.vendorId);
      const scorerByRequirement = new Map<string, Array<{ requirementId: string; scorerKey: string; score: 0 | 1 }>>();
      for (const row of history.scores) {
        const list = scorerByRequirement.get(row.requirementId) ?? [];
        list.push({ requirementId: row.requirementId, scorerKey: row.scorerScopeKey, score: row.score });
        scorerByRequirement.set(row.requirementId, list);
        scorerScores.push({
          requirementId: row.requirementId,
          vendorName: vendor.vendorName,
          scorerName: await nameOf(row.enteredByUserId, row.enteredByDisplayName),
          departmentName: row.scorerDepartmentName ?? "",
          score: row.score,
          comment: row.comment ?? "",
          enteredAt: row.enteredAt,
        });
      }
      const answers = new Map<string, { score: 0 | 1; comment: string; amended: boolean }>();
      for (const [requirementId, answer] of getUnconflictedVendorAnswers(answerState, vendor.vendorId)) {
        answers.set(requirementId, { score: answer.score, comment: answer.comment ?? "", amended: Boolean(answer.amendedAt) });
      }
      perVendor.set(vendor.vendorId, { scorer: scorerByRequirement, answers });

      const viewRows = await ctx.db.query("projectViews")
        .withIndex("by_project_vendor_id", (q) => q.eq("projectId", args.projectId).eq("vendorId", vendor.vendorId))
        .take(500);
      for (const row of viewRows) {
        if (!row.viewText.trim()) continue;
        views.push({
          vendorName: vendor.vendorName,
          scorerName: await nameOf(row.scorerUserId),
          departmentName: row.scorerDepartmentName ?? "",
          viewText: row.viewText,
          updatedAt: row.updatedAt ?? row.createdAt,
        });
      }

      const amendmentRows = await ctx.db.query("scoreAmendments")
        .withIndex("by_project_vendor_id_requirement", (q) => q.eq("projectId", args.projectId).eq("vendorId", vendor.vendorId))
        .take(2000);
      for (const row of amendmentRows) {
        amendments.push({
          requirementId: row.requirementId,
          vendorName: vendor.vendorName,
          originalScore: row.originalScore,
          newScore: row.newScore,
          originalComment: row.originalComment ?? "",
          newComment: row.newComment ?? "",
          amendedBy: await nameOf(row.amendedByUserId, row.amendedByDisplayName),
          reason: row.reason,
          amendedAt: row.amendedAt,
        });
      }
    }

    const comparison = requirementDocs.map((requirement) => ({
      requirementId: requirement.requirementId,
      text: requirement.text,
      type: requirement.type,
      priority: requirement.priority,
      status: requirement.status,
      counted: isScorable(requirement),
      cells: vendors.map((vendor) => {
        const data = perVendor.get(vendor.vendorId);
        const { average, count } = averageScorerScore(data?.scorer.get(requirement.requirementId) ?? []);
        const answer = data?.answers.get(requirement.requirementId) ?? null;
        return {
          vendorId: vendor.vendorId,
          scorerVerdict: average === null ? null : scorerOutcome(average),
          scorersScored: count,
          vendorScore: answer?.score ?? null,
          vendorComment: answer?.comment ?? "",
          vendorAmended: answer?.amended ?? false,
        };
      }),
    }));

    const sortRows = <T extends { vendorName: string }>(rows: T[], key: (row: T) => string) =>
      rows.sort((a, b) => a.vendorName.localeCompare(b.vendorName) || key(a).localeCompare(key(b)));

    return {
      companyName: company?.name ?? "",
      projectName: project.name as string,
      projectDescription: (project.description as string | undefined) ?? "",
      vendorDeadlineAt: typeof project.vendorDeadline === "number" ? project.vendorDeadline as number : null,
      scorerDeadlineAt: typeof project.scorerDeadline === "number" ? project.scorerDeadline as number : null,
      summary,
      vendorNames: vendors.map((vendor) => ({ vendorId: vendor.vendorId, vendorName: vendor.vendorName })),
      comparison,
      scorerScores: sortRows(scorerScores, (row) => `${row.requirementId} ${row.scorerName}`),
      views: sortRows(views, (row) => row.scorerName),
      amendments: sortRows(amendments, (row) => `${row.requirementId} ${row.amendedAt}`),
    };
  },
});
