import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const seedScenario = mutation({
  args: {
    companyAName: v.string(),
    companyBName: v.string(),
    companyCName: v.optional(v.string()),
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

    const companyCName = args.companyCName ?? "Maxwell Knight Ltd";
    const companyCId = await ctx.db.insert("companies", {
      name: companyCName,
      slug: "maxwell-knight-ltd",
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
      email: "acme-admin@acme.example",
      displayName: "ACME Admin",
      role: "company-admin",
      isActive: true,
      createdAt: Date.now(),
    });

    await ctx.db.insert("projectMembers", {
      companyId: companyAId,
      projectId: projectAId,
      userId: "acme-admin",
      role: "company-admin",
      displayName: "ACME Admin",
      isActive: true,
      createdAt: Date.now(),
    });

    await ctx.db.insert("companyMembers", {
      companyId: companyBId,
      userId: "beta-scorer",
      email: "scorer@beta.example",
      displayName: "Beta Scorer",
      role: "company-scorer",
      isActive: true,
      createdAt: Date.now(),
    });

    await ctx.db.insert("projectMembers", {
      companyId: companyBId,
      projectId: projectBId,
      userId: "beta-scorer",
      role: "company-scorer",
      displayName: "Beta Scorer",
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

    await ctx.db.insert("companyMembers", {
      companyId: companyCId,
      userId: "frazer-knight-admin",
      email: "frazerknight@hotmail.com",
      displayName: "Frazer Knight",
      role: "company-admin",
      isActive: true,
      createdAt: Date.now(),
    });

    return { companyAId, companyBId, companyCId, projectAId, projectBId };
  },
});

export const getCurrentUserAccess = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        email: null,
        displayName: null,
        role: null,
        isConsultant: false,
        companyIds: [] as string[],
      };
    }

    const memberships = await ctx.db
      .query("companyMembers")
      .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
      .filter((q) => q.eq(q.field("isActive"), true))
      .take(200);

    const isConsultant = memberships.some((member) => member.role === "vs-consultant");
    const role = isConsultant ? "vs-consultant" : memberships[0]?.role ?? null;

    return {
      email: identity.email ?? memberships[0]?.email ?? null,
      displayName: identity.name ?? memberships[0]?.displayName ?? null,
      role,
      isConsultant,
      companyIds: memberships.map((member) => member.companyId),
    };
  },
});

export const listAccessibleCompanies = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [] as const;
    }

    const memberships = await ctx.db
      .query("companyMembers")
      .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
      .filter((q) => q.eq(q.field("isActive"), true))
      .take(200);

    const companyIds = memberships.map((item) => item.companyId);
    if (companyIds.length === 0) {
      return [] as const;
    }

    const consultantMemberships = memberships.filter((member) => member.role === "vs-consultant");
    const visibleCompanyIds = consultantMemberships.length > 0
      ? (await ctx.db.query("companies").collect()).map((company) => company._id)
      : companyIds;

    const companies = await Promise.all(
      visibleCompanyIds.map((id) => ctx.db.get(id)),
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
      const consultantMembership = await ctx.db
        .query("companyMembers")
        .filter((q) => q.eq(q.field("companyId"), args.companyId))
        .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
        .filter((q) => q.eq(q.field("role"), "vs-consultant"))
        .filter((q) => q.eq(q.field("isActive"), true))
        .first();

      if (!consultantMembership) {
        throw new Error("Company access denied");
      }
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

    const projectMembership = await ctx.db
      .query("projectMembers")
      .filter((q) => q.eq(q.field("projectId"), args.projectId))
      .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (projectMembership) {
      if (projectMembership.companyId !== project.companyId) {
        throw new Error("Project access denied");
      }
      return project;
    }

    const consultantMembership = await ctx.db
      .query("companyMembers")
      .filter((q) => q.eq(q.field("companyId"), project.companyId))
      .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
      .filter((q) => q.eq(q.field("role"), "vs-consultant"))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!consultantMembership) {
      throw new Error("Project access denied");
    }

    return project;
  },
});

export const listProjectsForCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [] as const;
    }

    const membership = await ctx.db
      .query("companyMembers")
      .filter((q) => q.eq(q.field("companyId"), args.companyId))
      .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    const isConsultant = await ctx.db
      .query("companyMembers")
      .filter((q) => q.eq(q.field("companyId"), args.companyId))
      .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
      .filter((q) => q.eq(q.field("role"), "vs-consultant"))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!membership && !isConsultant) {
      throw new Error("Company access denied");
    }

    return await ctx.db
      .query("projects")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const listProjectRequirements = query({
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

    const membership = await ctx.db
      .query("projectMembers")
      .filter((q) => q.eq(q.field("projectId"), args.projectId))
      .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!membership || membership.companyId !== project.companyId) {
      throw new Error("Project access denied");
    }

    return await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .collect();
  },
});
