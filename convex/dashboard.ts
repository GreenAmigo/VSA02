import { query } from "./_generated/server";
import { v } from "convex/values";
import { findVendorMembershipForIdentity, getProjectVendors } from "./projectVendors";
import { getProjectVendorAnswerState, getUnconflictedVendorAnswers } from "./vendorAnswers";

function getIdentityUserIds(identity: { subject?: string; tokenIdentifier?: string }) {
  return Array.from(new Set([identity.subject, identity.tokenIdentifier].filter((value): value is string => Boolean(value))));
}

async function assertProjectDashboardAccess(ctx: any, projectId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const project = await ctx.db.get(projectId as any);
  if (!project) {
    throw new Error("Project not found");
  }
  if (await findVendorMembershipForIdentity(ctx, project.companyId, identity)) {
    throw new Error("Project access denied");
  }

  const userIds = getIdentityUserIds(identity);
  const normalizedEmail = identity.email?.trim().toLowerCase();

  const member = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), projectId))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
    ))
    .first();

  if (member && member.companyId === project.companyId && (member.role === "company-admin" || member.role === "company-scorer")) {
    return { project, identity, member };
  }

  const companyAdminMembership = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
    .filter((q: any) => q.eq(q.field("role"), "company-admin"))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(normalizedEmail ? [q.eq(q.field("email"), normalizedEmail)] : []),
    ))
    .first();

  if (companyAdminMembership) {
    return {
      project,
      identity,
      member: {
        companyId: project.companyId,
        projectId,
        userId: companyAdminMembership.userId,
        role: "company-admin",
      },
    };
  }

  if (!member || member.companyId !== project.companyId) {
    throw new Error("Project access denied");
  }

  throw new Error("Project access denied");
}

export const getProjectDashboard = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project, member } = await assertProjectDashboardAccess(ctx, args.projectId);
    const requirements = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .collect();

    const answerState = await getProjectVendorAnswerState(ctx, project);
    const vendors = await getProjectVendors(ctx, project);

    const rows = vendors.map((vendor) => {
      const vendorUserId = vendor.primaryContact?.userId ?? null;
      const vendorScores = [...getUnconflictedVendorAnswers(answerState, vendor.vendorId).values()];
      const userStoryTotal = vendorScores
        .filter((entry) => {
          const requirement = requirements.find((item) => item.requirementId === entry.requirementId);
          return requirement && requirement.type === "user-story" && requirement.status !== "withdrawn" && requirement.priority !== 0;
        })
        .reduce((sum, entry) => {
          const requirement = requirements.find((item) => item.requirementId === entry.requirementId)!;
          const weighted = requirement.priority * entry.score;
          return sum + weighted;
        }, 0);

      const nfrTotal = vendorScores
        .filter((entry) => {
          const requirement = requirements.find((item) => item.requirementId === entry.requirementId);
          return requirement && requirement.type === "nfr" && requirement.status !== "withdrawn" && requirement.priority !== 0;
        })
        .reduce((sum, entry) => {
          const requirement = requirements.find((item) => item.requirementId === entry.requirementId)!;
          const weighted = requirement.priority * entry.score;
          return sum + weighted;
        }, 0);

      const unmetCount = vendorScores.filter((entry) => entry.score === 0).length;
      const missingCount = requirements.filter((requirement) => {
        if (requirement.status === "withdrawn" || requirement.priority === 0) return false;
        return !vendorScores.some((entry) => entry.requirementId === requirement.requirementId);
      }).length;

      const scoredCount = vendorScores.length;
      const total = userStoryTotal + nfrTotal - unmetCount;

      return {
        vendorId: vendor.vendorId,
        vendorUserId,
        vendorName: vendor.vendorName,
        hasConflicts: [...(answerState.grouped.get(vendor.vendorId)?.values() ?? [])].some((answers) => answers.length > 1),
        userStoryTotal,
        nfrTotal,
        total,
        unmetCount,
        missingCount,
        scoredCount,
      };
    });

    const leadingVendor = rows.reduce<{ vendorUserId: string | null; total: number } | null>((best, row) => {
      if (!best || row.total > best.total) {
        return { vendorUserId: row.vendorUserId, total: row.total };
      }
      return best;
    }, null);

    return {
      projectId: args.projectId,
      companyId: project.companyId,
      migrationRequired: answerState.migrationRequired,
      canViewScorerDetails: member.role === "company-admin" || member.role === "company-scorer",
      leadingVendorUserId: leadingVendor?.vendorUserId ?? null,
      rows,
    };
  },
});
