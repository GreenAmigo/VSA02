import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const companyAdminRole = "company-admin" as const;
const consultantRole = "vs-consultant" as const;

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
}

const protectedTestDataUserEmails = new Set(["frazer@maxwellknight.co.uk"]);

async function upsertTestCompanyBySlug(ctx: any, companyName: string, companySlug: string) {
  const matches = await ctx.db
    .query("companies")
    .filter((q: any) => q.eq(q.field("slug"), companySlug))
    .filter((q: any) => q.eq(q.field("isTestData"), true))
    .collect();

  const existing = matches[0];

  if (existing) {
    await ctx.db.patch(existing._id, {
      name: companyName,
      slug: companySlug,
      isActive: true,
      isTestData: true,
    });
    return existing;
  }

  const companyId = await ctx.db.insert("companies", {
    name: companyName,
    slug: companySlug,
    createdBy: "system-seed",
    createdAt: Date.now(),
    isActive: true,
    ssoProvider: "preview-test-data",
    isTestData: true,
  });

  return await ctx.db.get(companyId);
}

function isProductionEnvironment(): boolean {
  const environment = (process.env.APP_ENVIRONMENT ?? "production").trim().toLowerCase();
  return environment !== "development" && environment !== "preview";
}

async function recordActivity(
  ctx: any,
  payload: {
    actorUserId: string;
    actorEmail?: string;
    action: string;
    details: string;
    companyId?: string;
    projectId?: string;
  },
) {
  await ctx.db.insert("activityLogs", {
    actorUserId: payload.actorUserId,
    actorEmail: payload.actorEmail,
    action: payload.action,
    details: payload.details,
    companyId: payload.companyId,
    projectId: payload.projectId,
    createdAt: Date.now(),
  });
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

  if (!member || (member.role !== companyAdminRole && member.role !== consultantRole)) {
    throw new Error("Only company admins or VS Consultants can manage this company");
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
      isTestData: false,
    });

    await ctx.db.insert("companyMembers", {
      companyId,
      userId: identity.tokenIdentifier,
      email: identity.email ?? undefined,
      displayName: identity.name ?? "Admin",
      role: companyAdminRole,
      isActive: true,
      createdAt: Date.now(),
      isTestData: false,
    });

    const consultantMembers = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("role"), consultantRole))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .take(200);

    for (const consultant of consultantMembers) {
      const existingMembership = await ctx.db
        .query("companyMembers")
        .filter((q: any) => q.eq(q.field("companyId"), companyId))
        .filter((q: any) => q.eq(q.field("userId"), consultant.userId))
        .first();

      if (!existingMembership) {
        await ctx.db.insert("companyMembers", {
          companyId,
          userId: consultant.userId,
          email: consultant.email,
          displayName: consultant.displayName,
          role: consultantRole,
          isActive: true,
          createdAt: Date.now(),
          isTestData: false,
        });
      }
    }

    return {
      companyId,
      name: args.name.trim(),
      ssoProvider: args.ssoProvider ?? null,
    };
  },
});

export const grantConsultantRole = internalMutation({
  args: {
    secret: v.string(),
    userId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    if (isProductionEnvironment()) {
      throw new Error("Consultant role grants are disabled in production");
    }

    const expectedSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET ?? process.env.DEV_CONSULTANT_GRANT_SECRET;
    if (!expectedSecret) {
      throw new Error("Set CONVEX_CONSULTANT_GRANT_SECRET before running the developer-only Consultant grant command");
    }
    if (args.secret !== expectedSecret) {
      throw new Error("Invalid Consultant grant secret");
    }

    const targetUserId = args.userId.trim();
    const targetEmail = (args.email ?? "").trim().toLowerCase() || undefined;
    const targetDisplayName = args.displayName?.trim() || targetEmail || "VS Consultant";
    const companies = args.companyId
      ? [await ctx.db.get(args.companyId)]
      : await ctx.db.query("companies").collect();

    const validCompanies = companies.filter((company): company is NonNullable<typeof company> => company !== null);
    if (validCompanies.length === 0) {
      throw new Error("No companies available to grant Consultant access to");
    }

    let grantedCount = 0;

    for (const company of validCompanies) {
      const existing = await ctx.db
        .query("companyMembers")
        .filter((q: any) => q.eq(q.field("companyId"), company._id))
        .filter((q: any) => q.eq(q.field("userId"), targetUserId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          email: targetEmail ?? existing.email,
          displayName: targetDisplayName,
          role: consultantRole,
          isActive: true,
          isTestData: false,
        });
      } else {
        await ctx.db.insert("companyMembers", {
          companyId: company._id,
          userId: targetUserId,
          email: targetEmail,
          displayName: targetDisplayName,
          role: consultantRole,
          isActive: true,
          createdAt: Date.now(),
          isTestData: false,
        });
      }

      grantedCount += 1;
    }

    await recordActivity(ctx, {
      actorUserId: "system",
      actorEmail: targetEmail,
      action: "grant_vs_consultant_role",
      details: `Granted the VS Consultant role to ${targetDisplayName} (${targetUserId}) across ${grantedCount} workspaces.`,
      companyId: validCompanies[0]._id,
    });

    return {
      role: consultantRole,
      userId: targetUserId,
      email: targetEmail ?? null,
      displayName: targetDisplayName,
      grantedCount,
    };
  },
});

export const linkWorkOSUserToCompanyAdmin = internalMutation({
  args: {
    secret: v.string(),
    companyId: v.id("companies"),
    seededUserId: v.string(),
    workosUserId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (isProductionEnvironment()) {
      throw new Error("Preview/dev user rebinding is disabled in production");
    }

    const expectedSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET ?? process.env.DEV_CONSULTANT_GRANT_SECRET;
    if (!expectedSecret) {
      throw new Error("Set CONVEX_CONSULTANT_GRANT_SECRET before running the developer-only WorkOS rebinding command");
    }
    if (args.secret !== expectedSecret) {
      throw new Error("Invalid Consultant grant secret");
    }

    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    const staleConsultantMemberships = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("userId"), args.workosUserId))
      .filter((q: any) => q.eq(q.field("role"), consultantRole))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    for (const stale of staleConsultantMemberships) {
      await ctx.db.patch(stale._id, {
        isActive: false,
        isTestData: false,
      });
    }

    const seededMembership = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("userId"), args.seededUserId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (!seededMembership) {
      throw new Error("Seeded company admin not found for this company");
    }

    const targetEmail = (args.email ?? seededMembership.email ?? "").trim().toLowerCase() || undefined;
    const targetDisplayName = args.displayName?.trim() || seededMembership.displayName || "Company Admin";

    await ctx.db.patch(seededMembership._id, {
      userId: args.workosUserId,
      email: targetEmail,
      displayName: targetDisplayName,
      role: companyAdminRole,
      isActive: true,
      isTestData: false,
    });

    const projectMemberships = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("userId"), args.seededUserId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    for (const membership of projectMemberships) {
      await ctx.db.patch(membership._id, {
        userId: args.workosUserId,
        displayName: targetDisplayName,
        isActive: true,
        isTestData: false,
      });
    }

    await recordActivity(ctx, {
      actorUserId: "system",
      actorEmail: targetEmail,
      action: "link_workos_company_admin",
      details: `Rebound seeded admin ${args.seededUserId} to WorkOS user ${args.workosUserId} for ${company.name}.`,
      companyId: args.companyId,
    });

    return {
      companyId: args.companyId,
      seededUserId: args.seededUserId,
      workosUserId: args.workosUserId,
      email: targetEmail ?? null,
      displayName: targetDisplayName,
    };
  },
});

export const seedPreviewWorkspaceData = internalMutation({
  args: {
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    if (isProductionEnvironment()) {
      throw new Error("Preview/dev seed data is disabled in production");
    }

    const expectedSecret = process.env.CONVEX_PREVIEW_SEED_SECRET ?? process.env.DEV_CONSULTANT_SEED_SECRET;
    if (!expectedSecret) {
      throw new Error("Set CONVEX_PREVIEW_SEED_SECRET before running the preview-only data seeder");
    }
    if (args.secret !== expectedSecret) {
      throw new Error("Invalid preview seed secret");
    }

    const testCompanies = [
      { name: "Northway Health Test", slug: "northway-health-test" },
      { name: "Harbor Logistics Test", slug: "harbor-logistics-test" },
      { name: "Crescent Energy Test", slug: "crescent-energy-test" },
    ];

    const createdCompanies: Array<{ _id: any; name: string }> = [];

    for (const company of testCompanies) {
      const companyRecord = await upsertTestCompanyBySlug(ctx, company.name, company.slug);
      if (!companyRecord) {
        continue;
      }

      createdCompanies.push({ _id: companyRecord._id, name: companyRecord.name });

      const adminUserId = `test-admin-${company.slug}`;
      const existingAdminMember = await ctx.db
        .query("companyMembers")
        .filter((q: any) => q.eq(q.field("companyId"), companyRecord._id))
        .filter((q: any) => q.eq(q.field("userId"), adminUserId))
        .first();

      if (!existingAdminMember) {
        await ctx.db.insert("companyMembers", {
          companyId: companyRecord._id,
          userId: adminUserId,
          email: `${company.slug}@preview.test`,
          displayName: `${company.name} Admin`,
          role: "company-admin",
          isActive: true,
          createdAt: Date.now(),
          isTestData: true,
        });
      }

      const projectNames = [`${company.name} Core Review`, `${company.name} Renewal Review`];

      for (const projectName of projectNames) {
        const projectMatch = await ctx.db
          .query("projects")
          .filter((q: any) => q.eq(q.field("companyId"), companyRecord._id))
          .filter((q: any) => q.eq(q.field("name"), projectName))
          .first();

        if (!projectMatch) {
          await ctx.db.insert("projects", {
            companyId: companyRecord._id,
            name: projectName,
            createdBy: "system-seed",
            createdAt: Date.now(),
            status: projectName.endsWith("Renewal Review") ? "draft" : "active",
            isTestData: true,
          });
        }
      }

      const projectOne = await ctx.db
        .query("projects")
        .filter((q: any) => q.eq(q.field("companyId"), companyRecord._id))
        .filter((q: any) => q.eq(q.field("name"), `${company.name} Core Review`))
        .first();

      const projectTwo = await ctx.db
        .query("projects")
        .filter((q: any) => q.eq(q.field("companyId"), companyRecord._id))
        .filter((q: any) => q.eq(q.field("name"), `${company.name} Renewal Review`))
        .first();

      const scorerUserId = `test-scorer-${company.slug}`;
      const vendorUserId = `test-vendor-${company.slug}`;

      const companyMemberRows = await ctx.db
        .query("companyMembers")
        .filter((q: any) => q.eq(q.field("companyId"), companyRecord._id))
        .collect();

      const ensureCompanyMember = async (userId: string, email: string, displayName: string, role: "company-scorer" | "vendor") => {
        const existing = companyMemberRows.find((member) => member.userId === userId && member.companyId === companyRecord._id);
        if (existing) {
          await ctx.db.patch(existing._id, {
            email,
            displayName,
            role,
            isActive: true,
            isTestData: true,
          });
          return;
        }

        await ctx.db.insert("companyMembers", {
          companyId: companyRecord._id,
          userId,
          email,
          displayName,
          role,
          isActive: true,
          createdAt: Date.now(),
          isTestData: true,
        });
      };

      await ensureCompanyMember(scorerUserId, `${company.slug}-scorer@preview.test`, `${company.name} Scorer`, "company-scorer");
      await ensureCompanyMember(vendorUserId, `${company.slug}-vendor@preview.test`, `${company.name} Vendor`, "vendor");

      if (projectOne) {
        const existingProjectMembers = await ctx.db
          .query("projectMembers")
          .filter((q: any) => q.eq(q.field("projectId"), projectOne._id))
          .collect();

        const ensureProjectMember = async (userId: string, role: "company-admin" | "company-scorer" | "vendor", displayName: string) => {
          const matches = existingProjectMembers.filter((member) => member.userId === userId && member.projectId === projectOne._id);
          if (matches[0]) {
            await ctx.db.patch(matches[0]._id, {
              displayName,
              role,
              isActive: true,
              isTestData: true,
            });
            return;
          }

          await ctx.db.insert("projectMembers", {
            companyId: companyRecord._id,
            projectId: projectOne._id,
            userId,
            role,
            displayName,
            isActive: true,
            createdAt: Date.now(),
            isTestData: true,
          });
        };

        await ensureProjectMember(adminUserId, "company-admin", `${company.name} Admin`);
        await ensureProjectMember(scorerUserId, "company-scorer", `${company.name} Scorer`);
        await ensureProjectMember(vendorUserId, "vendor", `${company.name} Vendor`);
      }

      if (projectTwo) {
        const existingProjectMembers = await ctx.db
          .query("projectMembers")
          .filter((q: any) => q.eq(q.field("projectId"), projectTwo._id))
          .collect();

        const adminMember = existingProjectMembers.find((member) => member.userId === adminUserId && member.projectId === projectTwo._id);
        if (!adminMember) {
          await ctx.db.insert("projectMembers", {
            companyId: companyRecord._id,
            projectId: projectTwo._id,
            userId: adminUserId,
            role: "company-admin",
            displayName: `${company.name} Admin`,
            isActive: true,
            createdAt: Date.now(),
            isTestData: true,
          });
        }
      }

      await recordActivity(ctx, {
        actorUserId: "system-seed",
        action: "seed_preview_test_workspaces",
        details: `Created preview-only test workspace data for ${company.name}.`,
        companyId: companyRecord._id,
      });
    }

    return {
      createdCompanies: createdCompanies.length,
      label: "test-data",
    };
  },
});

export const deleteAllTestData = internalMutation({
  args: {
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    if (isProductionEnvironment()) {
      throw new Error("Test-data cleanup is disabled in production");
    }

    const expectedSecret = process.env.CONVEX_PREVIEW_SEED_SECRET ?? process.env.DEV_CONSULTANT_SEED_SECRET ?? process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    if (!expectedSecret) {
      throw new Error("Set a preview/dev secret before running test-data cleanup");
    }
    if (args.secret !== expectedSecret) {
      throw new Error("Invalid preview seed secret");
    }

    const testCompanies = await ctx.db
      .query("companies")
      .filter((q: any) => q.eq(q.field("isTestData"), true))
      .collect();

    const testCompanyIds = new Set(testCompanies.map((company) => company._id));
    const protectedUserIds = new Set(["frazer@maxwellknight.co.uk"]);

    const companyMembers = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("isTestData"), true))
      .collect();

    for (const member of companyMembers) {
      if (protectedUserIds.has((member.email ?? member.userId).toLowerCase())) {
        continue;
      }
      await ctx.db.delete(member._id);
    }

    const projectMembers = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("isTestData"), true))
      .collect();

    for (const member of projectMembers) {
      const memberEmail = await ctx.db.get(member.companyId).then((company) => company?.name ?? "");
      if (memberEmail && memberEmail.toLowerCase().includes("maxwell")) {
        continue;
      }
      await ctx.db.delete(member._id);
    }

    const testProjects = await ctx.db
      .query("projects")
      .filter((q: any) => q.eq(q.field("isTestData"), true))
      .collect();

    for (const project of testProjects) {
      await ctx.db.delete(project._id);
    }

    const requirements = await ctx.db.query("requirements").collect();
    for (const requirement of requirements) {
      if (testCompanyIds.has(requirement.companyId) || testProjects.some((project) => project._id === requirement.projectId)) {
        await ctx.db.delete(requirement._id);
      }
    }

    const scores = await ctx.db.query("scores").collect();
    for (const score of scores) {
      if (testCompanyIds.has(score.companyId) || testProjects.some((project) => project._id === score.projectId)) {
        await ctx.db.delete(score._id);
      }
    }

    const activityLogs = await ctx.db.query("activityLogs").collect();
    for (const log of activityLogs) {
      if (log.actorUserId === "system-seed" || (log.companyId && testCompanyIds.has(log.companyId))) {
        await ctx.db.delete(log._id);
      }
    }

    for (const company of testCompanies) {
      await ctx.db.delete(company._id);
    }

    return {
      deletedCompanies: testCompanies.length,
      deletedCompanyMembers: companyMembers.filter((member) => !protectedUserIds.has((member.email ?? member.userId).toLowerCase())).length,
      deletedProjects: testProjects.length,
      deletedRequirements: requirements.filter((requirement) => testCompanyIds.has(requirement.companyId) || testProjects.some((project) => project._id === requirement.projectId)).length,
      deletedScores: scores.filter((score) => testCompanyIds.has(score.companyId) || testProjects.some((project) => project._id === score.projectId)).length,
    };
  },
});

export const listActivityLogs = query({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [] as const;
    }

    if (args.companyId) {
      await assertCompanyAdmin(ctx, args.companyId);
    }

    const logs = args.companyId
      ? await ctx.db
          .query("activityLogs")
          .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
          .collect()
      : await ctx.db.query("activityLogs").collect();

    return logs.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
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
      isTestData: false,
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
      isTestData: false,
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
