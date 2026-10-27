import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const seedScenario = mutation({
  args: {
    companyAName: v.string(),
    companyBName: v.string(),
    projectAName: v.string(),
    projectBName: v.string(),
  },
  handler: async (ctx, args) => {
    const companyAId = await ctx.db.insert("companies", {
      name: args.companyAName,
      slug: "acme-health",
      createdBy: "seed",
      createdAt: Date.now(),
      isActive: true,
      ssoProvider: "temporary-login",
    });

    const companyBId = await ctx.db.insert("companies", {
      name: args.companyBName,
      slug: "beta-logistics",
      createdBy: "seed",
      createdAt: Date.now(),
      isActive: true,
      ssoProvider: "temporary-login",
    });

    const projectAId = await ctx.db.insert("projects", {
      companyId: companyAId,
      name: args.projectAName,
      createdBy: "seed",
      createdAt: Date.now(),
      status: "active",
    });

    const projectBId = await ctx.db.insert("projects", {
      companyId: companyBId,
      name: args.projectBName,
      createdBy: "seed",
      createdAt: Date.now(),
      status: "active",
    });

    await ctx.db.insert("companyMembers", {
      companyId: companyAId,
      userId: "acme-admin",
      email: "admin@acme.example",
      displayName: "Acme Admin",
      role: "company-admin",
      isActive: true,
      createdAt: Date.now(),
    });

    await ctx.db.insert("projectMembers", {
      companyId: companyAId,
      projectId: projectAId,
      userId: "acme-admin",
      role: "company-admin",
      displayName: "Acme Admin",
      isActive: true,
      createdAt: Date.now(),
    });

    await ctx.db.insert("companyMembers", {
      companyId: companyBId,
      userId: "northwind-vendor",
      email: "vendor@northwind.example",
      displayName: "Northwind Labs",
      role: "vendor",
      isActive: true,
      createdAt: Date.now(),
    });

    await ctx.db.insert("projectMembers", {
      companyId: companyBId,
      projectId: projectBId,
      userId: "northwind-vendor",
      role: "vendor",
      displayName: "Northwind Labs",
      isActive: true,
      createdAt: Date.now(),
    });

    return { companyAId, companyBId, projectAId, projectBId };
  },
});

export const listAccessibleCompanies = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const memberships = await ctx.db
      .query("companyMembers")
      .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
      .filter((q) => q.eq(q.field("isActive"), true))
      .take(50);

    const companyIds = memberships.map((item) => item.companyId);
    if (companyIds.length === 0) {
      return [] as const;
    }

    const companies = await Promise.all(
      companyIds.map((id) => ctx.db.get(id)),
    );

    return companies.filter((company): company is NonNullable<typeof company> => company !== null);
  },
});

export const getCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    const membership = await ctx.db
      .query("companyMembers")
      .filter((q) => q.eq(q.field("companyId"), args.companyId))
      .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!membership) {
      throw new Error("Company access denied");
    }

    return company;
  },
});

export const getProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const membership = await ctx.db
      .query("projectMembers")
      .filter((q) => q.eq(q.field("projectId"), args.projectId))
      .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!membership) {
      throw new Error("Project access denied");
    }

    if (membership.companyId !== project.companyId) {
      throw new Error("Project access denied");
    }

    return project;
  },
});
