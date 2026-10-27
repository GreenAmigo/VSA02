import { query } from "./_generated/server";
import { v } from "convex/values";

async function assertProjectDashboardAccess(ctx: any, projectId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const project = await ctx.db.get(projectId as any);
  if (!project) {
    throw new Error("Project not found");
  }

  const member = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), projectId))
    .filter((q: any) => q.eq(q.field("userId"), identity.tokenIdentifier))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();

  if (!member || member.companyId !== project.companyId) {
    throw new Error("Project access denied");
  }

  if (member.role !== "company-admin" && member.role !== "company-scorer") {
    throw new Error("Project access denied");
  }

  return { project, identity, member };
}

export const getProjectDashboard = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project, member } = await assertProjectDashboardAccess(ctx, args.projectId);
    const requirements = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .collect();

    const scores = await ctx.db
      .query("scores")
      .withIndex("by_project_requirement", (q) => q.eq("projectId", args.projectId))
      .collect();

    const vendors = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_user", (q) => q.eq("projectId", args.projectId))
      .filter((q: any) => q.eq(q.field("role"), "vendor"))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    const rows = vendors.map((vendor) => {
      const vendorScores = scores.filter((entry) => entry.vendorUserId === vendor.userId);
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
        vendorUserId: vendor.userId,
        vendorName: vendor.displayName,
        userStoryTotal,
        nfrTotal,
        total,
        unmetCount,
        missingCount,
        scoredCount,
      };
    });

    const leadingVendor = rows.reduce<{ vendorUserId: string; total: number } | null>((best, row) => {
      if (!best || row.total > best.total) {
        return { vendorUserId: row.vendorUserId, total: row.total };
      }
      return best;
    }, null);

    return {
      projectId: args.projectId,
      companyId: project.companyId,
      canViewScorerDetails: member.role === "company-admin" || member.role === "company-scorer",
      leadingVendorUserId: leadingVendor?.vendorUserId ?? null,
      rows,
    };
  },
});
