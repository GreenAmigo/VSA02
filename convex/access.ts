import { query, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

function getIdentityUserIds(identity: { subject?: string; tokenIdentifier?: string }) {
  return Array.from(new Set([identity.subject, identity.tokenIdentifier].filter((value): value is string => Boolean(value))));
}

async function getActiveConsultantRecord(ctx: any, identity: { subject?: string; tokenIdentifier?: string }) {
  const userIds = getIdentityUserIds(identity);

  for (const userId of userIds) {
    const activeConsultant = await ctx.db
      .query("consultants")
      .filter((q: any) => q.eq(q.field("userId"), userId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (activeConsultant) {
      return activeConsultant;
    }

    const legacyConsultantMembership = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("userId"), userId))
      .filter((q: any) => q.eq(q.field("role"), "vs-consultant"))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (legacyConsultantMembership) {
      return legacyConsultantMembership;
    }
  }

  return null;
}

export const seedScenario = internalMutation({
  args: {
    companyAName: v.string(),
    companyBName: v.string(),
    companyCName: v.optional(v.string()),
    projectAName: v.string(),
    projectBName: v.string(),
  },
  handler: async (ctx, args) => {
    const matchByCompanySlug = async (name: string, slug: string) => {
      const existing = await ctx.db
        .query("companies")
        .filter((q) => q.eq(q.field("slug"), slug))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name,
          slug,
          isActive: true,
          isTestData: true,
        });
        return existing;
      }

      const companyId = await ctx.db.insert("companies", {
        name,
        slug,
        createdBy: "seed",
        createdAt: Date.now(),
        isActive: true,
        ssoProvider: "temporary-login",
        isTestData: true,
      });

      return await ctx.db.get(companyId);
    };

    const companyA = await matchByCompanySlug(args.companyAName, "acme-health");
    const companyB = await matchByCompanySlug(args.companyBName, "beta-logistics");
    const companyCName = args.companyCName ?? "Maxwell Knight Ltd";
    const companyC = await matchByCompanySlug(companyCName, "maxwell-knight-ltd");

    if (!companyA || !companyB || !companyC) {
      throw new Error("Failed to create or update the seeded company records");
    }

    const projectA = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("companyId"), companyA._id))
      .filter((q) => q.eq(q.field("name"), args.projectAName))
      .first();

    const projectB = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("companyId"), companyB._id))
      .filter((q) => q.eq(q.field("name"), args.projectBName))
      .first();

    const companyAProjectId = projectA?._id ?? await ctx.db.insert("projects", {
      companyId: companyA._id,
      name: args.projectAName,
      createdBy: "seed",
      createdAt: Date.now(),
      status: "active",
      isTestData: true,
    });

    const companyBProjectId = projectB?._id ?? await ctx.db.insert("projects", {
      companyId: companyB._id,
      name: args.projectBName,
      createdBy: "seed",
      createdAt: Date.now(),
      status: "active",
      isTestData: true,
    });

    const ensureCompanyMember = async (companyId: any, userId: string, email: string, displayName: string, role: "company-admin" | "company-scorer" | "vendor") => {
      const existing = await ctx.db
        .query("companyMembers")
        .filter((q) => q.eq(q.field("companyId"), companyId))
        .filter((q) => q.eq(q.field("userId"), userId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          email,
          displayName,
          role,
          isActive: true,
          isTestData: true,
        });
        return existing._id;
      }

      const memberId = await ctx.db.insert("companyMembers", {
        companyId,
        userId,
        email,
        displayName,
        role,
        isActive: true,
        createdAt: Date.now(),
        isTestData: true,
      });
      return memberId;
    };

    const ensureProjectMember = async (companyId: any, projectId: any, userId: string, role: "company-admin" | "company-scorer" | "vendor", displayName: string) => {
      const existing = await ctx.db
        .query("projectMembers")
        .filter((q) => q.eq(q.field("companyId"), companyId))
        .filter((q) => q.eq(q.field("projectId"), projectId))
        .filter((q) => q.eq(q.field("userId"), userId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          role,
          displayName,
          isActive: true,
          isTestData: true,
        });
        return existing._id;
      }

      const memberId = await ctx.db.insert("projectMembers", {
        companyId,
        projectId,
        userId,
        role,
        displayName,
        isActive: true,
        createdAt: Date.now(),
        isTestData: true,
      });
      return memberId;
    };

    await ensureCompanyMember(companyA._id, "acme-admin", "acme-admin@acme.example", "ACME Admin", "company-admin");
    await ensureProjectMember(companyA._id, companyAProjectId, "acme-admin", "company-admin", "ACME Admin");

    await ensureCompanyMember(companyB._id, "beta-scorer", "scorer@beta.example", "Beta Scorer", "company-scorer");
    await ensureProjectMember(companyB._id, companyBProjectId, "beta-scorer", "company-scorer", "Beta Scorer");

    await ensureCompanyMember(companyB._id, "northwind-vendor", "vendor@northwind.example", "Northwind Labs", "vendor");
    await ensureProjectMember(companyB._id, companyBProjectId, "northwind-vendor", "vendor", "Northwind Labs");

    await ensureCompanyMember(companyC._id, "frazer-knight-admin", "frazerknight@hotmail.com", "Frazer Knight", "company-admin");

    return { companyAId: companyA._id, companyBId: companyB._id, companyCId: companyC._id, projectAId: companyAProjectId, projectBId: companyBProjectId };
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
        tokenIdentifier: null,
        subject: null,
        role: null,
        isConsultant: false,
        companyIds: [] as string[],
      };
    }

    const userIds = getIdentityUserIds(identity);
    const memberships = await ctx.db
      .query("companyMembers")
      .filter((q) => q.or(...userIds.map((userId) => q.eq(q.field("userId"), userId))))
      .filter((q) => q.eq(q.field("isActive"), true))
      .take(200);

    const consultantRecord = await getActiveConsultantRecord(ctx, identity);
    const isConsultant = Boolean(consultantRecord);
    const role = isConsultant ? "vs-consultant" : memberships[0]?.role ?? null;

    let companyIds: Id<"companies">[] = memberships.map((member) => member.companyId);
    if (isConsultant) {
      const allCompanies = await ctx.db.query("companies").collect();
      companyIds = allCompanies.filter((company) => company.isActive !== false).map((company) => company._id);
    } else {
      const visibleCompanyIds = new Set<Id<"companies">>();
      for (const companyId of companyIds) {
        const company = await ctx.db.get(companyId);
        if (company && company.isActive !== false) {
          visibleCompanyIds.add(companyId);
        }
      }
      companyIds = Array.from(visibleCompanyIds);
    }

    return {
      email: identity.email ?? memberships[0]?.email ?? consultantRecord?.email ?? null,
      displayName: identity.name ?? memberships[0]?.displayName ?? consultantRecord?.displayName ?? null,
      tokenIdentifier: identity.tokenIdentifier,
      subject: identity.subject,
      role,
      isConsultant,
      companyIds,
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

    const userIds = getIdentityUserIds(identity);
    const memberships = await ctx.db
      .query("companyMembers")
      .filter((q) => q.or(...userIds.map((userId) => q.eq(q.field("userId"), userId))))
      .filter((q) => q.eq(q.field("isActive"), true))
      .take(200);

    const consultantRecord = await getActiveConsultantRecord(ctx, identity);
    const companyIds = memberships.map((item) => item.companyId);
    if (consultantRecord) {
      const companies = await ctx.db.query("companies").collect();
      return companies.filter((company) => company.isActive !== false);
    }

    if (companyIds.length === 0) {
      return [] as const;
    }

    const companies = await Promise.all(
      companyIds.map((id) => ctx.db.get(id)),
    );

    return companies.filter((company): company is NonNullable<typeof company> => company !== null && company.isActive !== false);
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
    if (company.isActive === false) {
      throw new Error("Company access denied");
    }

    const userIds = getIdentityUserIds(identity);
    const membership = await ctx.db
      .query("companyMembers")
      .filter((q) => q.eq(q.field("companyId"), args.companyId))
      .filter((q) => q.or(...userIds.map((userId) => q.eq(q.field("userId"), userId))))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!membership) {
      const consultantMembership = await getActiveConsultantRecord(ctx, identity);
      const hasLegacyConsultantMembership = consultantMembership && "companyId" in consultantMembership
        ? consultantMembership.companyId === args.companyId
        : false;

      if (!consultantMembership && !hasLegacyConsultantMembership) {
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

    const userIds = getIdentityUserIds(identity);
    const projectMembership = await ctx.db
      .query("projectMembers")
      .filter((q) => q.eq(q.field("projectId"), args.projectId))
      .filter((q) => q.or(...userIds.map((userId) => q.eq(q.field("userId"), userId))))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (projectMembership) {
      if (projectMembership.companyId !== project.companyId) {
        throw new Error("Project access denied");
      }
      return project;
    }

    const consultantMembership = await getActiveConsultantRecord(ctx, identity);
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

    const userIds = getIdentityUserIds(identity);
    const membership = await ctx.db
      .query("companyMembers")
      .filter((q) => q.eq(q.field("companyId"), args.companyId))
      .filter((q) => q.or(...userIds.map((userId) => q.eq(q.field("userId"), userId))))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    const consultantMembership = await getActiveConsultantRecord(ctx, identity);

    if (!membership && !consultantMembership) {
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

    const userIds = getIdentityUserIds(identity);
    const membership = await ctx.db
      .query("projectMembers")
      .filter((q) => q.eq(q.field("projectId"), args.projectId))
      .filter((q) => q.or(...userIds.map((userId) => q.eq(q.field("userId"), userId))))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!membership || membership.companyId !== project.companyId) {
      const consultantMembership = await getActiveConsultantRecord(ctx, identity);
      if (!consultantMembership) {
        throw new Error("Project access denied");
      }
    }

    return await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .collect();
  },
});

