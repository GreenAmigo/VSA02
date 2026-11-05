import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const companyAdminRole = "company-admin" as const;

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
}

async function assertCompanyAdmin(ctx: any, companyId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const member = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.eq(q.field("userId"), identity.tokenIdentifier))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();

  if (!member || member.role !== companyAdminRole) {
    throw new Error("Only company admins can manage this company");
  }

  return identity;
}

async function assertProjectAccess(ctx: any, projectId: string, companyId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const project = await ctx.db.get(projectId as any);
  if (!project) {
    throw new Error("Project not found");
  }

  if (project.companyId !== companyId) {
    throw new Error("Project does not belong to this company");
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

  return project;
}

export const createCompany = mutation({
  args: {
    name: v.string(),
    ssoProvider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const companyId = await ctx.db.insert("companies", {
      name: args.name.trim(),
      slug: slugify(args.name),
      createdBy: identity.tokenIdentifier,
      createdAt: Date.now(),
      isActive: true,
      ssoProvider: args.ssoProvider,
    });

    await ctx.db.insert("companyMembers", {
      companyId,
      userId: identity.tokenIdentifier,
      email: identity.email ?? undefined,
      displayName: identity.name ?? "Admin",
      role: companyAdminRole,
      isActive: true,
      createdAt: Date.now(),
    });

    return {
      companyId,
      name: args.name.trim(),
      ssoProvider: args.ssoProvider ?? null,
    };
  },
});

export const ensurePreviewAdminMembership = mutation({
  args: {
    companySlug: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
      throw new Error("Preview admin sync is disabled in production");
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const company = args.companyId
      ? await ctx.db.get(args.companyId)
      : await ctx.db
          .query("companies")
          .filter((q: any) => q.eq(q.field("slug"), args.companySlug ?? "maxwell-knight-ltd"))
          .first();

    if (!company) {
      throw new Error("Company not found");
    }

    const email = String(args.email ?? identity.email ?? "").trim().toLowerCase();
    const displayName = args.displayName ?? identity.name ?? "Frazer Knight";

    const byUser = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), company._id))
      .filter((q: any) => q.eq(q.field("userId"), identity.tokenIdentifier))
      .first();

    if (byUser) {
      await ctx.db.patch(byUser._id, {
        email: email || byUser.email,
        displayName,
        isActive: true,
      });
      return byUser._id;
    }

    const byEmail = email
      ? await ctx.db
          .query("companyMembers")
          .filter((q: any) => q.eq(q.field("companyId"), company._id))
          .filter((q: any) => q.eq(q.field("email"), email))
          .first()
      : null;

    if (byEmail) {
      await ctx.db.patch(byEmail._id, {
        userId: identity.tokenIdentifier,
        email,
        displayName,
        isActive: true,
      });
      return byEmail._id;
    }

    return await ctx.db.insert("companyMembers", {
      companyId: company._id,
      userId: identity.tokenIdentifier,
      email: email || undefined,
      displayName,
      role: "company-admin",
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const listCompanyMembers = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [] as const;
    }

    await assertCompanyAdmin(ctx, args.companyId);

    const members = await ctx.db
      .query("companyMembers")
      .withIndex("by_company_role", (q) => q.eq("companyId", args.companyId))
      .collect();

    return members.filter((member) => member.isActive);
  },
});

export const createProject = mutation({
  args: {
    companyId: v.id("companies"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const projectId = await ctx.db.insert("projects", {
      companyId: args.companyId,
      name: args.name.trim(),
      createdBy: (await ctx.auth.getUserIdentity())?.tokenIdentifier ?? "system",
      createdAt: Date.now(),
      status: "active",
    });

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    await ctx.db.insert("projectMembers", {
      companyId: args.companyId,
      projectId,
      userId: identity.tokenIdentifier,
      role: companyAdminRole,
      displayName: identity.name ?? "Admin",
      isActive: true,
      createdAt: Date.now(),
    });

    return {
      projectId,
      companyId: args.companyId,
      name: args.name.trim(),
    };
  },
});

export const listProjectMembers = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [] as const;
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    await assertCompanyAdmin(ctx, project.companyId);

    return await ctx.db
      .query("projectMembers")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .collect();
  },
});

export const addProjectVendor = mutation({
  args: {
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    displayName: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);
    await assertProjectAccess(ctx, args.projectId, args.companyId);

    const userId = `vendor-${slugify(args.displayName)}-${Date.now()}`;
    const memberId = await ctx.db.insert("projectMembers", {
      companyId: args.companyId,
      projectId: args.projectId,
      userId,
      role: "vendor",
      displayName: args.displayName.trim(),
      isActive: true,
      createdAt: Date.now(),
    });

    const projectMember = await ctx.db.get(memberId);
    if (!projectMember) {
      throw new Error("Project member could not be created");
    }

    return {
      _id: memberId,
      companyId: args.companyId,
      projectId: args.projectId,
      userId,
      role: "vendor",
      displayName: args.displayName.trim(),
      email: args.email.trim(),
    };
  },
});

export const addProjectScorer = mutation({
  args: {
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    displayName: v.string(),
    email: v.string(),
    role: v.union(v.literal("individual"), v.literal("department")),
    departmentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);
    await assertProjectAccess(ctx, args.projectId, args.companyId);

    const userId = `scorer-${slugify(args.displayName)}-${Date.now()}`;

    const memberId = await ctx.db.insert("projectMembers", {
      companyId: args.companyId,
      projectId: args.projectId,
      userId,
      role: "company-scorer",
      displayName: args.displayName.trim(),
      isActive: true,
      createdAt: Date.now(),
    });

    const projectMember = await ctx.db.get(memberId);
    if (!projectMember) {
      throw new Error("Project member could not be created");
    }

    return {
      _id: memberId,
      companyId: args.companyId,
      projectId: args.projectId,
      userId,
      role: "company-scorer",
      displayName: args.displayName.trim(),
      email: args.email.trim(),
      scorerRole: args.role,
      departmentName: args.departmentName?.trim() ?? null,
    };
  },
});
