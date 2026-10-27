import { mutation } from "./_generated/server";
import { v } from "convex/values";

const MAGIC_LINK_TTL_MS = 1000 * 60 * 30;

function createMagicToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const requestVendorMagicLink = mutation({
  args: {
    projectId: v.id("projects"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const member = await ctx.db
      .query("companyMembers")
      .filter((q) => q.eq(q.field("companyId"), project.companyId))
      .filter((q) => q.eq(q.field("email"), args.email))
      .filter((q) => q.eq(q.field("role"), "vendor"))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!member) {
      throw new Error("Vendor not assigned to this project");
    }

    const projectMember = await ctx.db
      .query("projectMembers")
      .filter((q) => q.eq(q.field("projectId"), args.projectId))
      .filter((q) => q.eq(q.field("userId"), member.userId))
      .filter((q) => q.eq(q.field("role"), "vendor"))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!projectMember) {
      throw new Error("Vendor not assigned to this project");
    }

    const token = createMagicToken();
    const now = Date.now();

    await ctx.db.insert("vendorLoginTokens", {
      companyId: project.companyId,
      projectId: args.projectId,
      userId: member.userId,
      email: args.email,
      token,
      createdAt: now,
      expiresAt: now + MAGIC_LINK_TTL_MS,
    });

    return {
      sent: true,
      projectId: args.projectId,
      companyId: project.companyId,
      userId: member.userId,
      email: args.email,
      token,
      expiresAt: now + MAGIC_LINK_TTL_MS,
    };
  },
});

export const completeVendorMagicLink = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("vendorLoginTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!record) {
      throw new Error("Magic link is invalid or expired");
    }

    if (record.usedAt) {
      throw new Error("Magic link has already been used");
    }

    if (Date.now() > record.expiresAt) {
      throw new Error("Magic link has expired");
    }

    const projectMember = await ctx.db
      .query("projectMembers")
      .filter((q) => q.eq(q.field("projectId"), record.projectId))
      .filter((q) => q.eq(q.field("userId"), record.userId))
      .filter((q) => q.eq(q.field("role"), "vendor"))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!projectMember) {
      throw new Error("Vendor access denied for this project");
    }

    await ctx.db.patch(record._id, { usedAt: Date.now() });

    return {
      companyId: record.companyId,
      projectId: record.projectId,
      userId: record.userId,
      email: record.email,
      displayName: projectMember.displayName,
      role: "vendor" as const,
    };
  },
});
