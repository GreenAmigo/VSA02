import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const projectViewValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.string(),
  viewText: v.string(),
});

async function assertProjectViewAccess(ctx: any, projectId: string) {
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

  if (!member) {
    throw new Error("Project access denied");
  }

  if (member.companyId !== project.companyId) {
    throw new Error("Project access denied");
  }

  return { project, identity, member };
}

export const listProjectViews = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { identity, member } = await assertProjectViewAccess(ctx, args.projectId);

    const rows = await ctx.db
      .query("projectViews")
      .withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId))
      .take(200);

    if (member.role === "vendor") {
      return rows
        .filter((row) => row.vendorUserId === identity.tokenIdentifier)
        .map((row) => ({
          _id: row._id,
          projectId: row.projectId,
          scorerUserId: row.scorerUserId,
          vendorUserId: row.vendorUserId,
          viewText: row.viewText,
          createdAt: row.createdAt,
        }));
    }

    return rows.map((row) => ({
      _id: row._id,
      projectId: row.projectId,
      scorerUserId: row.scorerUserId,
      vendorUserId: row.vendorUserId,
      viewText: row.viewText,
      createdAt: row.createdAt,
    }));
  },
});

export const saveProjectView = mutation({
  args: projectViewValidator,
  handler: async (ctx, args) => {
    const { identity, member, project } = await assertProjectViewAccess(ctx, args.projectId);

    if (member.role !== "company-admin" && member.role !== "company-scorer") {
      throw new Error("Project access denied");
    }

    const vendorMembership = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("userId"), args.vendorUserId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (!vendorMembership) {
      throw new Error("Vendor not found on this project");
    }

    const existing = await ctx.db
      .query("projectViews")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("scorerUserId"), identity.tokenIdentifier))
      .filter((q: any) => q.eq(q.field("vendorUserId"), args.vendorUserId))
      .first();

    const row = {
      companyId: project.companyId,
      projectId: args.projectId,
      scorerUserId: identity.tokenIdentifier,
      vendorUserId: args.vendorUserId,
      viewText: args.viewText,
      createdAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, row);
      return { ...row, updated: true };
    }

    await ctx.db.insert("projectViews", row);
    return { ...row, updated: false };
  },
});
