import { query } from "./_generated/server";
import { v } from "convex/values";
import { getProjectVendors } from "./projectVendors";
import { getProjectVendorAnswerState, getUnconflictedVendorAnswers } from "./vendorAnswers";
import { getVendorScorerCompletion, getVendorScorerHistory, scorerHistoryNeedsMigration } from "./scorerHistory";
import { assertVendorReviewAccess } from "./scores";
import { getVendorDeadline } from "./vendorDeadlines";
import { computeVendorTotals, isScorable, pickLeaders, type TotalsRequirement } from "./scoreTotals";

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

    // Scorer names and CURRENT departments (per-score department snapshots are used for score reporting).
    const scorers = await Promise.all(assignedScorerUserIds.map(async (userId) => {
      const membership = await ctx.db.query("companyMembers")
        .withIndex("by_company_user", (q) => q.eq("companyId", project.companyId).eq("userId", userId))
        .first();
      const assignment = scorerAssignments.find((row) => row.userId === userId);
      const department = membership?.departmentId ? await ctx.db.get(membership.departmentId) : null;
      const name = membership?.displayName && !membership.displayName.includes("@")
        ? membership.displayName
        : assignment?.displayName ?? membership?.email ?? "Unnamed scorer";
      return { userId, name, departmentName: department?.name ?? null };
    }));
    const scorableRequirementDocs = requirementDocs
      .filter((row) => isScorable(row))
      .sort((a, b) => a.requirementId.localeCompare(b.requirementId));

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

      const scorableIds = new Set(scorableRequirementDocs.map((row) => row.requirementId));
      const scorerProgress = await Promise.all(scorers.map(async (scorer) => {
        const scopeKey = `individual:${scorer.userId}`;
        const { completion } = await getVendorScorerCompletion(ctx, args.projectId, vendor.vendorId, scopeKey);
        const answered = new Set(scorerHistory.scores
          .filter((row) => row.scorerScopeKey === scopeKey && scorableIds.has(row.requirementId))
          .map((row) => row.requirementId)).size;
        return {
          userId: scorer.userId,
          name: scorer.name,
          departmentName: scorer.departmentName,
          answered,
          total: scorableIds.size,
          completed: completion?.status === "completed",
          completedAt: completion?.status === "completed" ? completion.completedAt ?? null : null,
        };
      }));
      const scorersCompleted = scorerProgress.filter((row) => row.completed).length;

      const scoredIds = new Set(scorerHistory.scores.map((row) => row.requirementId));
      const unscoredRequirements = scorableRequirementDocs
        .filter((row) => !scoredIds.has(row.requirementId))
        .map((row) => ({ requirementId: row.requirementId, text: row.text, type: row.type, priority: row.priority }));

      // Vendor submission status. The page compares deadlineAt with the current time to show CLOSED.
      const deadlineState = await getVendorDeadline(ctx, args.projectId, vendor.vendorId);
      const deadline = deadlineState.deadline;
      const deadlineAt = typeof deadline?.dueAt === "number"
        ? deadline.dueAt
        : typeof project.vendorDeadline === "number" ? project.vendorDeadline as number : null;
      const submissionStatus: "not-started" | "in-progress" | "submitted" = deadline?.status === "submitted"
        ? "submitted"
        : totals.coverage.vendorAnswered > 0 ? "in-progress" : "not-started";

      const hasAnswerConflicts = [...(answerState.grouped.get(vendor.vendorId)?.values() ?? [])]
        .some((answers) => answers.length > 1);

      return {
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        totals,
        scorersCompleted,
        scorerProgress,
        unscoredRequirements,
        submission: {
          status: submissionStatus,
          submittedAt: deadline?.submittedAt ?? null,
          deadlineAt,
          hasConflict: deadlineState.hasConflict,
        },
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
      scorerDeadlineAt: typeof project.scorerDeadline === "number" ? project.scorerDeadline as number : null,
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
