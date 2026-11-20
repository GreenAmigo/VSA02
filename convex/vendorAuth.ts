import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getProjectVendors } from "./projectVendors";

const MAGIC_LINK_TTL_MS = 1000 * 60 * 30;

function createMagicToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const requestVendorMagicLink = mutation({
  args: {
    projectId: v.id("projects"),
    email: v.string(),
  },
  returns: v.object({
    sent: v.boolean(),
    projectId: v.id("projects"),
    companyId: v.id("companies"),
    userId: v.string(),
    email: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const members = ctx.db
      .query("companyMembers")
      .withIndex("by_company_role", (q) => q.eq("companyId", project.companyId).eq("role", "vendor"));
    let member = null;
    for await (const candidate of members) {
      if (candidate.email === args.email && candidate.isActive) {
        member = candidate;
        break;
      }
    }

    if (!member || !member.vendorId) {
      throw new Error("Vendor not assigned to this project");
    }

    const projectVendor = (await getProjectVendors(ctx, project))
      .find((vendor) => vendor.vendorId === member.vendorId && vendor.contacts.some((contact) => contact._id === member._id));
    if (!projectVendor) {
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
  returns: v.object({
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    userId: v.string(),
    email: v.string(),
    displayName: v.string(),
    role: v.literal("vendor"),
  }),
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

    const members = ctx.db
      .query("companyMembers")
      .withIndex("by_company_user", (q) => q.eq("companyId", record.companyId).eq("userId", record.userId));
    let companyMember = null;
    for await (const candidate of members) {
      if (candidate.role === "vendor" && candidate.isActive) {
        companyMember = candidate;
        break;
      }
    }

    if (!companyMember || !companyMember.vendorId) {
      throw new Error("Vendor access denied for this project");
    }

    const project = await ctx.db.get(record.projectId);
    if (!project || project.companyId !== record.companyId) {
      throw new Error("Vendor access denied for this project");
    }
    const projectVendor = (await getProjectVendors(ctx, project))
      .find((vendor) => vendor.vendorId === companyMember.vendorId && vendor.contacts.some((contact) => contact._id === companyMember._id));
    if (!projectVendor) {
      throw new Error("Vendor access denied for this project");
    }

    await ctx.db.patch(record._id, { usedAt: Date.now() });

    return {
      companyId: record.companyId,
      projectId: record.projectId,
      userId: record.userId,
      email: record.email,
      displayName: companyMember.displayName,
      role: "vendor" as const,
    };
  },
});
