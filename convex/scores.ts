import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const scoreRowValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.string(),
  requirementId: v.string(),
  score: v.union(v.literal(0), v.literal(1)),
  comment: v.optional(v.string()),
});

async function assertScoringAccess(ctx: any, projectId: string) {
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

  if (!member || (member.role !== "company-admin" && member.role !== "company-scorer" && member.role !== "vendor")) {
    throw new Error("Project access denied");
  }

  if (member.companyId !== project.companyId) {
    throw new Error("Project access denied");
  }

  return { project, identity, member };
}

export const listScoreHistory = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await assertScoringAccess(ctx, args.projectId);

    const rows = await ctx.db
      .query("scores")
      .withIndex("by_project_requirement", (q) => q.eq("projectId", args.projectId))
      .take(200);

    return rows.map((row) => ({
      _id: row._id,
      projectId: row.projectId,
      vendorUserId: row.vendorUserId,
      requirementId: row.requirementId,
      score: row.score,
      comment: row.comment,
      enteredBy: row.enteredBy,
      enteredAt: row.enteredAt,
    }));
  },
});

export const submitScore = mutation({
  args: scoreRowValidator,
  handler: async (ctx, args) => {
    const { project, identity, member } = await assertScoringAccess(ctx, args.projectId);

    if (member.role === "vendor") {
      if (member.userId !== args.vendorUserId) {
        throw new Error("Vendor can only score their own submission");
      }
    }

    const requirement = await ctx.db
      .query("requirements")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("requirementId"), args.requirementId))
      .first();

    if (!requirement) {
      throw new Error("Requirement not found in project");
    }

    const existing = await ctx.db
      .query("scores")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("vendorUserId"), args.vendorUserId))
      .filter((q: any) => q.eq(q.field("requirementId"), args.requirementId))
      .first();

    const now = Date.now();
    const scoreRecord = {
      companyId: project.companyId,
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      requirementId: args.requirementId,
      score: args.score,
      comment: args.comment,
      enteredBy: identity.tokenIdentifier,
      enteredAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, scoreRecord);
      return { ...scoreRecord, updated: true };
    }

    await ctx.db.insert("scores", scoreRecord);
    return { ...scoreRecord, updated: false };
  },
});
