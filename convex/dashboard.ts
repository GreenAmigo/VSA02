import { query } from "./_generated/server";
import { v } from "convex/values";
import { getProjectVendors } from "./projectVendors";
import { getProjectVendorAnswerState, getUnconflictedVendorAnswers } from "./vendorAnswers";
import { getVendorScorerCompletion, getVendorScorerHistory, scorerHistoryNeedsMigration } from "./scorerHistory";
import { assertVendorReviewAccess } from "./scores";
import { computeVendorTotals, pickLeaders, type TotalsRequirement } from "./scoreTotals";

/**
 * Project dashboard (Phase 6b). Consultants and company admins only.
 * Official totals use the company scorers' scores (priority x average score);
 * vendor self-score totals are returned alongside for comparison.
 * One answer per vendor organisation per requirement; nothing is subtracted.
 */
export const getProjectDashboard = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project } = await assertVendorReviewAccess(ctx, args.projectId);

    const requirementDocs = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .take(2000);
    const requirements: TotalsRequirement[] = requirementDocs.map((row) => ({
      requirementId: row.requirementId,
      type: row.type,
      priority: row.priority,
      status: row.status,
    }));

    const scorerAssignments = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_user", (q) => q.eq("projectId", args.projectId))
      .take(500);
    const assignedScorerUserIds = [...new Set(scorerAssignments
      .filter((row) => row.isActive && row.role === "company-scorer")
      .map((row) => row.userId))];

    const answerState = await getProjectVendorAnswerState(ctx, project);
    const scorerHistoryMigrationRequired = await scorerHistoryNeedsMigration(ctx, args.projectId);
    const vendors = await getProjectVendors(ctx, project);

    const vendorRows = await Promise.all(vendors.map(async (vendor) => {
      const scorerHistory = await getVendorScorerHistory(ctx, args.projectId, vendor.vendorId);
      const vendorAnswers = [...getUnconflictedVendorAnswers(answerState, vendor.vendorId).values()];
      const totals = computeVendorTotals({
        requirements,
        assignedScorerCount: assignedScorerUserIds.length,
        scorerScores: scorerHistory.scores.map((row) => ({
          requirementId: row.requirementId,
          scorerKey: row.scorerScopeKey,
          score: row.score,
        })),
        vendorAnswers: vendorAnswers.map((row) => ({ requirementId: row.requirementId, score: row.score })),
      });

      let scorersCompleted = 0;
      for (const userId of assignedScorerUserIds) {
        const { completion } = await getVendorScorerCompletion(ctx, args.projectId, vendor.vendorId, `individual:${userId}`);
        if (completion?.status === "completed") scorersCompleted += 1;
      }

      const hasAnswerConflicts = [...(answerState.grouped.get(vendor.vendorId)?.values() ?? [])]
        .some((answers) => answers.length > 1);

      return {
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        totals,
        scorersCompleted,
        hasScorerConflicts: scorerHistory.hasConflicts,
        hasAnswerConflicts,
      };
    }));

    const blockedByData = answerState.migrationRequired || scorerHistoryMigrationRequired
      || vendorRows.some((row) => row.hasScorerConflicts || row.hasAnswerConflicts);

    const scorerLeader = blockedByData ? { vendorIds: [], isTie: false } : pickLeaders(vendorRows.map((row) => ({
      vendorId: row.vendorId,
      combined: row.totals.scorers.combined,
      hasAnyScore: row.totals.coverage.fullyScored + row.totals.coverage.partlyScored > 0,
    })));
    const vendorSelfLeader = blockedByData ? { vendorIds: [], isTie: false } : pickLeaders(vendorRows.map((row) => ({
      vendorId: row.vendorId,
      combined: row.totals.vendorSelf.combined,
      hasAnyScore: row.totals.coverage.vendorAnswered > 0,
    })));

    const allScoringComplete = assignedScorerUserIds.length > 0 && vendorRows.length > 0
      && vendorRows.every((row) => row.scorersCompleted === assignedScorerUserIds.length);

    return {
      projectId: args.projectId,
      projectName: project.name as string,
      assignedScorerCount: assignedScorerUserIds.length,
      migrationRequired: answerState.migrationRequired,
      scorerHistoryMigrationRequired,
      hasDataConflicts: vendorRows.some((row) => row.hasScorerConflicts || row.hasAnswerConflicts),
      vendors: vendorRows,
      leader: {
        scorers: { ...scorerLeader, isProvisional: !allScoringComplete },
        vendorSelf: { ...vendorSelfLeader, isProvisional: !allScoringComplete },
      },
    };
  },
});
