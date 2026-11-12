import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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
    workspaceName?: string;
    companyId?: string;
    projectId?: string;
  },
) {
  await ctx.db.insert("activityLogs", {
    actorUserId: payload.actorUserId,
    actorEmail: payload.actorEmail,
    action: payload.action,
    details: payload.details,
    workspaceName: payload.workspaceName,
    companyId: payload.companyId,
    projectId: payload.projectId,
    createdAt: Date.now(),
  });
}

function getIdentityUserIds(identity: { subject?: string; tokenIdentifier?: string }) {
  return Array.from(new Set([identity.subject, identity.tokenIdentifier].filter((value): value is string => Boolean(value))));
}

async function getActiveConsultantRow(ctx: any, userIds: string | string[]) {
  const candidateIds = Array.isArray(userIds) ? userIds : [userIds];

  for (const userId of candidateIds) {
    const row = await ctx.db
      .query("consultants")
      .filter((q: any) => q.eq(q.field("userId"), userId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (row) {
      return row;
    }
  }

  for (const userId of candidateIds) {
    const legacyConsultantRows = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("userId"), userId))
      .filter((q: any) => q.eq(q.field("role"), consultantRole))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    if (legacyConsultantRows.length > 0) {
      const [legacyRow] = legacyConsultantRows;
      const existingConsultant = await ctx.db
        .query("consultants")
        .filter((q: any) => q.eq(q.field("userId"), userId))
        .filter((q: any) => q.eq(q.field("isActive"), true))
        .first();

      if (!existingConsultant) {
        const rowId = await ctx.db.insert("consultants", {
          userId,
          email: legacyRow.email,
          displayName: legacyRow.displayName,
          isActive: true,
          grantedAt: Date.now(),
          grantedBy: "legacy-migration",
          isTestData: legacyRow.isTestData ?? false,
        });

        const migratedRow = await ctx.db.get(rowId);
        if (migratedRow) {
          return migratedRow;
        }
      }

      for (const row of legacyConsultantRows) {
        await ctx.db.delete(row._id);
      }

      return await ctx.db
        .query("consultants")
        .filter((q: any) => q.eq(q.field("userId"), userId))
        .filter((q: any) => q.eq(q.field("isActive"), true))
        .first();
    }
  }

  return null;
}

async function assertConsultantAccess(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const userIds = getIdentityUserIds(identity);
  if (userIds.length === 0) {
    throw new Error("Only VS Consultants can manage workspaces");
  }

  const consultantRecord = await getActiveConsultantRow(ctx, userIds);
  if (consultantRecord) {
    return identity;
  }

  const legacyConsultantMembership = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.or(...userIds.map((userId) => q.eq(q.field("userId"), userId))))
    .filter((q: any) => q.eq(q.field("role"), consultantRole))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();

  if (legacyConsultantMembership) {
    await getActiveConsultantRow(ctx, userIds);
    return identity;
  }

  throw new Error("Only VS Consultants can manage workspaces");
}

async function assertCompanyAdmin(ctx: any, companyId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const userIds = getIdentityUserIds(identity);
  const member = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.or(...userIds.map((userId) => q.eq(q.field("userId"), userId))))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();

  const consultantRow = await getActiveConsultantRow(ctx, userIds);
  const hasConsultantAccess = Boolean(consultantRow) || (member && member.role === consultantRole);

  if (!member && !hasConsultantAccess) {
    throw new Error("Only company admins or VS Consultants can manage this company");
  }

  if (member && member.role !== companyAdminRole && member.role !== consultantRole) {
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

  const userIds = getIdentityUserIds(identity);
  const companyMatches: Array<{ userId: string; displayName?: string | null }> = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
      ...(identity.name?.trim() ? [q.eq(q.field("displayName"), identity.name.trim())] : []),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();

  const candidateUserIds = new Set([...userIds, ...companyMatches.map((member: { userId: string }) => member.userId)]);
  const candidateNames = new Set([
    ...(identity.name?.trim() ? [identity.name.trim()] : []),
    ...companyMatches
      .map((member: { displayName?: string | null }) => member.displayName?.trim())
      .filter((displayName): displayName is string => Boolean(displayName)),
  ]);

  const member = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), projectId))
    .filter((q: any) => q.or(
      ...Array.from(candidateUserIds).map((userId) => q.eq(q.field("userId"), userId)),
      ...Array.from(candidateNames).map((displayName) => q.eq(q.field("displayName"), displayName)),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();

  if (!member) {
    const consultantRow = await getActiveConsultantRow(ctx, userIds);
    if (!consultantRow) {
      throw new Error("Project access denied");
    }
  }

  return project;
}

export const createCompany = mutation({
  args: {
    name: v.string(),
    ssoProvider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await assertConsultantAccess(ctx);

    const canonicalUserId = identity.subject ?? identity.tokenIdentifier ?? "system";
    const workspaceName = args.name.trim();
    const companyId = await ctx.db.insert("companies", {
      name: workspaceName,
      slug: slugify(args.name),
      createdBy: canonicalUserId,
      createdAt: Date.now(),
      isActive: true,
      ssoProvider: args.ssoProvider,
      isTestData: false,
    });

    await ctx.db.insert("companyMembers", {
      companyId,
      userId: canonicalUserId,
      email: identity.email ?? undefined,
      displayName: identity.name ?? "Admin",
      role: companyAdminRole,
      isActive: true,
      createdAt: Date.now(),
      isTestData: false,
    });

    await recordActivity(ctx, {
      actorUserId: canonicalUserId,
      actorEmail: identity.email ?? undefined,
      action: "create_workspace",
      details: `Created workspace ${workspaceName}.`,
      workspaceName,
      companyId,
    });

    return {
      companyId,
      name: workspaceName,
      ssoProvider: args.ssoProvider ?? null,
    };
  },
});

export const archiveCompany = mutation({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const identity = await assertConsultantAccess(ctx);

    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    const canonicalUserId = identity.subject ?? identity.tokenIdentifier ?? "system";
    await ctx.db.patch(args.companyId, {
      isActive: false,
    });

    await recordActivity(ctx, {
      actorUserId: canonicalUserId,
      actorEmail: identity.email ?? undefined,
      action: "archive_workspace",
      details: `Archived workspace ${company.name}.`,
      workspaceName: company.name,
      companyId: args.companyId,
    });

    return {
      companyId: args.companyId,
      name: company.name,
      isActive: false,
    };
  },
});

export const restoreCompany = mutation({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const identity = await assertConsultantAccess(ctx);

    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    const canonicalUserId = identity.subject ?? identity.tokenIdentifier ?? "system";
    await ctx.db.patch(args.companyId, {
      isActive: true,
    });

    await recordActivity(ctx, {
      actorUserId: canonicalUserId,
      actorEmail: identity.email ?? undefined,
      action: "restore_workspace",
      details: `Restored workspace ${company.name}.`,
      workspaceName: company.name,
      companyId: args.companyId,
    });

    return {
      companyId: args.companyId,
      name: company.name,
      isActive: true,
    };
  },
});

export const deleteCompany = mutation({
  args: {
    companyId: v.id("companies"),
    confirmationName: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await assertConsultantAccess(ctx);

    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    if (company.isActive !== false) {
      throw new Error("archive this workspace first");
    }

    if (args.confirmationName.trim() !== company.name.trim()) {
      throw new Error("Enter the workspace name to match the workspace name and confirm deletion");
    }

    const canonicalUserId = identity.subject ?? identity.tokenIdentifier ?? "system";

    const companyMembers = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .collect();

    for (const member of companyMembers) {
      await ctx.db.delete(member._id);
    }

    const projectMembers = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .collect();

    for (const member of projectMembers) {
      await ctx.db.delete(member._id);
    }

    const projects = await ctx.db
      .query("projects")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .collect();

    for (const project of projects) {
      const requirements = await ctx.db
        .query("requirements")
        .filter((q: any) => q.eq(q.field("projectId"), project._id))
        .collect();

      for (const requirement of requirements) {
        await ctx.db.delete(requirement._id);
      }

      const scores = await ctx.db
        .query("scores")
        .filter((q: any) => q.eq(q.field("projectId"), project._id))
        .collect();

      for (const score of scores) {
        await ctx.db.delete(score._id);
      }

      await ctx.db.delete(project._id);
    }

    const requirements = await ctx.db
      .query("requirements")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .collect();

    for (const requirement of requirements) {
      await ctx.db.delete(requirement._id);
    }

    const scores = await ctx.db
      .query("scores")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .collect();

    for (const score of scores) {
      await ctx.db.delete(score._id);
    }

    await ctx.db.delete(args.companyId);

    await recordActivity(ctx, {
      actorUserId: canonicalUserId,
      actorEmail: identity.email ?? undefined,
      action: "delete_workspace",
      details: `Permanently deleted workspace ${company.name}.`,
      workspaceName: company.name,
      companyId: args.companyId,
    });

    return {
      companyId: args.companyId,
      name: company.name,
      deletedProjects: projects.length,
      deletedMembers: companyMembers.length,
      deletedRequirements: requirements.length,
      deletedScores: scores.length,
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

    const existingConsultant = await getActiveConsultantRow(ctx, targetUserId);
    if (existingConsultant) {
      await ctx.db.patch(existingConsultant._id, {
        email: targetEmail ?? existingConsultant.email,
        displayName: targetDisplayName,
        isActive: true,
        grantedAt: Date.now(),
        grantedBy: "system",
        isTestData: false,
      });
    } else {
      await ctx.db.insert("consultants", {
        userId: targetUserId,
        email: targetEmail,
        displayName: targetDisplayName,
        isActive: true,
        grantedAt: Date.now(),
        grantedBy: "system",
        isTestData: false,
      });
    }

    const legacyConsultantRows = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("userId"), targetUserId))
      .filter((q: any) => q.eq(q.field("role"), consultantRole))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    for (const legacyRow of legacyConsultantRows) {
      await ctx.db.delete(legacyRow._id);
    }

    await recordActivity(ctx, {
      actorUserId: "system",
      actorEmail: targetEmail,
      action: "grant_vs_consultant_role",
      details: `Granted the platform-level VS Consultant role to ${targetDisplayName} (${targetUserId}).`,
      companyId: args.companyId,
    });

    return {
      role: consultantRole,
      userId: targetUserId,
      email: targetEmail ?? null,
      displayName: targetDisplayName,
      grantedCount: 1,
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
      await ctx.db.delete(stale._id);
    }

    const consultantRecord = await getActiveConsultantRow(ctx, args.workosUserId);
    if (consultantRecord) {
      await ctx.db.patch(consultantRecord._id, {
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

    const consultants = await ctx.db
      .query("consultants")
      .filter((q: any) => q.eq(q.field("isTestData"), true))
      .collect();

    for (const consultant of consultants) {
      await ctx.db.delete(consultant._id);
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
    } else {
      await assertConsultantAccess(ctx);
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

export const listWorkspacesForConsultant = query({
  args: {},
  handler: async (ctx) => {
    await assertConsultantAccess(ctx);

    const companies = await ctx.db.query("companies").collect();
    return companies.sort((a, b) => a.name.localeCompare(b.name));
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

export const listWorkspaceVendors = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [] as const;
    }

    await assertCompanyAdmin(ctx, args.companyId);

    const vendors = await ctx.db
      .query("vendorOrganizations")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .collect();

    return vendors
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((vendor) => ({
        vendorId: vendor._id,
        name: vendor.name,
        contactEmail: vendor.contactEmail ?? null,
        status: vendor.status,
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
        contactCount: 0,
      }));
  },
});

export const addWorkspaceVendor = mutation({
  args: {
    companyId: v.id("companies"),
    name: v.string(),
    contactEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const normalizedName = args.name.trim();
    const normalizedContactEmail = args.contactEmail?.trim().toLowerCase() || undefined;

    if (!normalizedName) {
      throw new Error("Vendor name is required");
    }

    const existingVendor = await ctx.db
      .query("vendorOrganizations")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("name"), normalizedName))
      .first();

    if (existingVendor) {
      if (existingVendor.status === "deactivated") {
        await ctx.db.patch(existingVendor._id, {
          contactEmail: normalizedContactEmail ?? existingVendor.contactEmail,
          status: "active",
          updatedAt: Date.now(),
        });
      }

      await recordActivity(ctx, {
        actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
        actorEmail: identity.email ?? undefined,
        action: "activate_workspace_vendor",
        details: `Activated vendor organization ${normalizedName} in this workspace.`,
        workspaceName: "workspace",
        companyId: args.companyId,
      });

      return {
        vendorId: existingVendor._id,
        name: normalizedName,
        contactEmail: normalizedContactEmail ?? existingVendor.contactEmail ?? null,
        status: "active",
      };
    }

    const vendorId = await ctx.db.insert("vendorOrganizations", {
      companyId: args.companyId,
      name: normalizedName,
      contactEmail: normalizedContactEmail,
      status: "active",
      createdByUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isTestData: false,
    });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "create_workspace_vendor",
      details: `Created vendor organization ${normalizedName} for this workspace.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      vendorId: vendorId,
      name: normalizedName,
      contactEmail: normalizedContactEmail ?? null,
      status: "active",
    };
  },
});

export const updateWorkspaceVendor = mutation({
  args: {
    companyId: v.id("companies"),
    vendorId: v.id("vendorOrganizations"),
    name: v.string(),
    contactEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor || vendor.companyId !== args.companyId) {
      throw new Error("Vendor organization not found");
    }

    const normalizedName = args.name.trim();
    const normalizedContactEmail = args.contactEmail?.trim().toLowerCase() || undefined;

    await ctx.db.patch(args.vendorId, {
      name: normalizedName,
      contactEmail: normalizedContactEmail,
      updatedAt: Date.now(),
    });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "update_workspace_vendor",
      details: `Updated vendor organization ${normalizedName}.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      vendorId: args.vendorId,
      name: normalizedName,
      contactEmail: normalizedContactEmail ?? vendor.contactEmail ?? null,
      status: vendor.status,
    };
  },
});

export const deactivateWorkspaceVendor = mutation({
  args: {
    companyId: v.id("companies"),
    vendorId: v.id("vendorOrganizations"),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor || vendor.companyId !== args.companyId) {
      throw new Error("Vendor organization not found");
    }

    await ctx.db.patch(args.vendorId, {
      status: "deactivated",
      updatedAt: Date.now(),
    });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "deactivate_workspace_vendor",
      details: `Deactivated vendor organization ${vendor.name}.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return { vendorId: args.vendorId, status: "deactivated" };
  },
});

export const reactivateWorkspaceVendor = mutation({
  args: {
    companyId: v.id("companies"),
    vendorId: v.id("vendorOrganizations"),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor || vendor.companyId !== args.companyId) {
      throw new Error("Vendor organization not found");
    }

    await ctx.db.patch(args.vendorId, {
      status: "active",
      updatedAt: Date.now(),
    });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "reactivate_workspace_vendor",
      details: `Reactivated vendor organization ${vendor.name}.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return { vendorId: args.vendorId, status: "active" };
  },
});

export const inviteVendorContact = mutation({
  args: {
    companyId: v.id("companies"),
    vendorId: v.id("vendorOrganizations"),
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor || vendor.companyId !== args.companyId) {
      throw new Error("Vendor organization not found");
    }

    if (vendor.status === "deactivated") {
      throw new Error("Vendor organization is deactivated");
    }

    const normalizedEmail = args.email.trim().toLowerCase();
    const displayName = args.name.trim() || normalizedEmail;

    const existingMember = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("email"), normalizedEmail))
      .filter((q: any) => q.eq(q.field("role"), "vendor"))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (existingMember) {
      await ctx.db.patch(existingMember._id, {
        displayName,
        role: "vendor",
        vendorId: args.vendorId,
        isActive: true,
      });
      return { vendorId: args.vendorId, email: normalizedEmail, displayName, status: "active" };
    }

    const existingInvite = await ctx.db
      .query("workspaceInvites")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("email"), normalizedEmail))
      .filter((q: any) => q.eq(q.field("vendorId"), args.vendorId))
      .first();

    const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
    if (existingInvite) {
      await ctx.db.patch(existingInvite._id, {
        displayName,
        role: "vendor",
        vendorId: args.vendorId,
        status: "invited",
        invitedByUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
        invitedAt: Date.now(),
        expiresAt,
        acceptedAt: undefined,
        cancelledAt: undefined,
        deactivatedAt: undefined,
        expiredAt: undefined,
      });

      await recordActivity(ctx, {
        actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
        actorEmail: identity.email ?? undefined,
        action: "invite_vendor_contact",
        details: `Invited ${displayName} (${normalizedEmail}) to vendor organization ${vendor.name}.`,
        workspaceName: "workspace",
        companyId: args.companyId,
      });

      return { vendorId: args.vendorId, email: normalizedEmail, displayName, status: "invited" };
    }

    await ctx.db.insert("workspaceInvites", {
      companyId: args.companyId,
      email: normalizedEmail,
      displayName,
      role: "vendor",
      vendorId: args.vendorId,
      status: "invited",
      invitedByUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      invitedAt: Date.now(),
      expiresAt,
      isTestData: false,
    });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "invite_vendor_contact",
      details: `Invited ${displayName} (${normalizedEmail}) to vendor organization ${vendor.name}.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return { vendorId: args.vendorId, email: normalizedEmail, displayName, status: "invited" };
  },
});

export const listVendorContacts = query({
  args: { companyId: v.id("companies"), vendorId: v.id("vendorOrganizations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [] as const;
    }

    await assertCompanyAdmin(ctx, args.companyId);

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor || vendor.companyId !== args.companyId) {
      return [] as const;
    }

    const memberRows = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("vendorId"), args.vendorId))
      .collect();

    const activeContacts = memberRows.map((member) => ({
      id: member._id,
      userId: member.userId,
      name: member.displayName,
      email: member.email ?? "",
      role: member.role,
      status: member.isActive ? "active" : "deactivated",
      source: "member",
    }));

    const invites = await ctx.db
      .query("workspaceInvites")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("vendorId"), args.vendorId))
      .collect();

    const inviteEntries = invites
      .filter((invite) => invite.status !== "active")
      .filter((invite) => !activeContacts.some((contact) => contact.email.trim().toLowerCase() === invite.email.trim().toLowerCase()))
      .map((invite) => ({
        id: invite._id,
        userId: null,
        name: invite.displayName,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        source: "invite",
      }));

    return [...activeContacts, ...inviteEntries].sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const cancelVendorContactInvite = mutation({
  args: {
    companyId: v.id("companies"),
    vendorId: v.id("vendorOrganizations"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const normalizedEmail = args.email.trim().toLowerCase();
    const invite = await ctx.db
      .query("workspaceInvites")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("vendorId"), args.vendorId))
      .filter((q: any) => q.eq(q.field("email"), normalizedEmail))
      .first();

    if (!invite) {
      throw new Error("Vendor contact invite not found");
    }

    await ctx.db.patch(invite._id, {
      status: "cancelled",
      cancelledAt: Date.now(),
      acceptedAt: undefined,
      expiredAt: undefined,
    });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "cancel_vendor_contact_invite",
      details: `Cancelled the contact invite for ${invite.displayName} (${normalizedEmail}) on this vendor organization.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return { vendorId: args.vendorId, email: normalizedEmail, status: "cancelled" };
  },
});

export const deactivateVendorContact = mutation({
  args: {
    companyId: v.id("companies"),
    vendorId: v.id("vendorOrganizations"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const member = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("userId"), args.userId))
      .filter((q: any) => q.eq(q.field("vendorId"), args.vendorId))
      .first();

    if (!member) {
      throw new Error("Vendor contact not found");
    }

    await ctx.db.patch(member._id, { isActive: false });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "deactivate_vendor_contact",
      details: `Deactivated ${member.displayName} from this vendor organization.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return { vendorId: args.vendorId, userId: args.userId, status: "deactivated" };
  },
});

export const reactivateVendorContact = mutation({
  args: {
    companyId: v.id("companies"),
    vendorId: v.id("vendorOrganizations"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const member = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("userId"), args.userId))
      .filter((q: any) => q.eq(q.field("vendorId"), args.vendorId))
      .first();

    if (!member) {
      throw new Error("Vendor contact not found");
    }

    await ctx.db.patch(member._id, { isActive: true });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "reactivate_vendor_contact",
      details: `Reactivated ${member.displayName} for this vendor organization.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return { vendorId: args.vendorId, userId: args.userId, status: "active" };
  },
});

export const inviteWorkspacePerson = mutation({
  args: {
    companyId: v.id("companies"),
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("company-admin"), v.literal("company-scorer"), v.literal("vendor")),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const canonicalUserId = identity.subject ?? identity.tokenIdentifier ?? "system";
    const normalizedEmail = args.email.trim().toLowerCase();
    const displayName = args.name.trim() || normalizedEmail;

    const existingMember = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("email"), normalizedEmail))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (existingMember) {
      await ctx.db.patch(existingMember._id, {
        displayName,
        role: args.role,
        isActive: true,
      });

      await recordActivity(ctx, {
        actorUserId: canonicalUserId,
        actorEmail: identity.email ?? undefined,
        action: "update_workspace_person_role",
        details: `Updated ${displayName} (${normalizedEmail}) to ${args.role} in this workspace.`,
        workspaceName: "workspace",
        companyId: args.companyId,
      });

      return {
        email: normalizedEmail,
        displayName,
        role: args.role,
        status: "active",
      };
    }

    const existingInvite = await ctx.db
      .query("workspaceInvites")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("email"), normalizedEmail))
      .first();

    const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
    let inviteId: any = existingInvite?._id;

    if (existingInvite) {
      await ctx.db.patch(existingInvite._id, {
        displayName,
        role: args.role,
        status: "invited",
        invitedByUserId: canonicalUserId,
        invitedAt: Date.now(),
        expiresAt,
        acceptedAt: undefined,
        deactivatedAt: undefined,
        cancelledAt: undefined,
        expiredAt: undefined,
      });
    } else {
      inviteId = await ctx.db.insert("workspaceInvites", {
        companyId: args.companyId,
        email: normalizedEmail,
        displayName,
        role: args.role,
        status: "invited",
        invitedByUserId: canonicalUserId,
        invitedAt: Date.now(),
        expiresAt,
        isTestData: false,
      });
    }

    await recordActivity(ctx, {
      actorUserId: canonicalUserId,
      actorEmail: identity.email ?? undefined,
      action: "invite_workspace_person",
      details: `Invited ${displayName} (${normalizedEmail}) as ${args.role} to this workspace.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      email: normalizedEmail,
      displayName,
      role: args.role,
      status: "invited",
      inviteId,
    };
  },
});

export const listWorkspacePeople = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [] as const;
    }

    await assertCompanyAdmin(ctx, args.companyId);

    const members = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .collect();

    const canonicalMembers = new Map<string, any>();
    for (const member of members) {
      const key = `${member.userId}::${member.email ?? ""}`.toLowerCase();
      const current = canonicalMembers.get(key);
      if (!current || Number(current.isActive) < Number(member.isActive) || (current.isActive === member.isActive && current.createdAt > member.createdAt)) {
        canonicalMembers.set(key, member);
      }
    }

    const memberEntries = Array.from(canonicalMembers.values()).map((member) => ({
      id: member._id,
      userId: member.userId,
      name: member.displayName,
      email: member.email ?? "",
      role: member.role,
      status: member.isActive ? ("active" as const) : ("deactivated" as const),
      source: "member" as const,
    }));

    const invites = await ctx.db
      .query("workspaceInvites")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .collect();

    const memberEmails = new Set(memberEntries.map((member) => member.email.trim().toLowerCase()).filter(Boolean));
    const inviteEntries = invites
      .filter((invite) => invite.status !== "active")
      .filter((invite) => !memberEmails.has(invite.email.trim().toLowerCase()))
      .map((invite) => ({
        id: invite._id,
        userId: null,
        name: invite.displayName,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        source: "invite" as const,
      }));

    return [...memberEntries, ...inviteEntries].sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const cleanupDuplicateWorkspaceMembers = mutation({
  args: {
    companyId: v.id("companies"),
    userId: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const normalizedEmail = args.email?.trim().toLowerCase();
    const memberships = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => (args.userId ? q.eq(q.field("userId"), args.userId) : q.eq(q.field("email"), normalizedEmail ?? "")))
      .collect();

    if (memberships.length <= 1) {
      return { removed: 0, keptUserId: memberships[0]?.userId ?? null };
    }

    const canonical = [...memberships].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.createdAt - b.createdAt)[0];
    let removed = 0;

    for (const membership of memberships) {
      if (membership._id !== canonical._id) {
        await ctx.db.delete(membership._id);
        removed += 1;
      }
    }

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "cleanup_duplicate_workspace_members",
      details: `Removed ${removed} duplicate membership rows and kept the canonical workspace membership for ${canonical.displayName}.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      removed,
      keptUserId: canonical.userId,
      keptEmail: canonical.email ?? normalizedEmail ?? null,
    };
  },
});

export const reactivateWorkspacePerson = mutation({
  args: {
    companyId: v.id("companies"),
    userId: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const normalizedEmail = args.email?.trim().toLowerCase();
    const member = normalizedEmail
      ? await ctx.db
          .query("companyMembers")
          .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
          .filter((q: any) => q.eq(q.field("email"), normalizedEmail))
          .first()
      : await ctx.db
          .query("companyMembers")
          .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
          .filter((q: any) => q.eq(q.field("userId"), args.userId ?? ""))
          .first();

    if (!member) {
      throw new Error("Workspace person not found");
    }

    if (member.isActive) {
      throw new Error("Workspace person is already active");
    }

    await ctx.db.patch(member._id, {
      isActive: true,
    });

    const invite = await ctx.db
      .query("workspaceInvites")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("email"), (member.email ?? normalizedEmail ?? "").toLowerCase()))
      .first();

    if (invite) {
      await ctx.db.patch(invite._id, {
        status: "active",
        acceptedAt: Date.now(),
        cancelledAt: undefined,
        deactivatedAt: undefined,
        expiredAt: undefined,
      });
    }

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "reactivate_workspace_person",
      details: `Reactivated ${member.displayName} (${member.email ?? normalizedEmail ?? "unknown email"}) in this workspace.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      userId: member.userId,
      email: member.email ?? normalizedEmail ?? null,
      status: "active",
    };
  },
});

export const createWorkspaceDepartment = mutation({
  args: {
    companyId: v.id("companies"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const normalizedName = args.name.trim();
    if (!normalizedName) {
      throw new Error("Department name is required");
    }

    const existingDepartment = await ctx.db
      .query("workspaceDepartments")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("name"), normalizedName))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (existingDepartment) {
      throw new Error("A department with that name already exists");
    }

    const departmentId = await ctx.db.insert("workspaceDepartments", {
      companyId: args.companyId,
      name: normalizedName,
      createdByUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      createdAt: Date.now(),
      isActive: true,
      isTestData: false,
    });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "create_workspace_department",
      details: `Created the ${normalizedName} department for this workspace.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      companyId: args.companyId,
      departmentId,
      name: normalizedName,
      members: [],
    };
  },
});

export const addWorkspaceDepartmentMember = mutation({
  args: {
    companyId: v.id("companies"),
    departmentId: v.id("workspaceDepartments"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const department = await ctx.db.get(args.departmentId);
    if (!department || department.companyId !== args.companyId || !department.isActive) {
      throw new Error("Department not found");
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const identityUserIds = new Set(getIdentityUserIds(identity));
    const member = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("userId"), args.userId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (!member && !identityUserIds.has(args.userId)) {
      const consultantRecord = await getActiveConsultantRow(ctx, args.userId);
      if (!consultantRecord) {
        throw new Error("User is not a member of this workspace");
      }
    }

    const resolvedMember = member ?? {
      _id: "system" as any,
      userId: args.userId,
      email: identity.email ?? undefined,
      displayName: identity.name ?? args.userId,
      role: "company-admin" as const,
    };

    const existingAssignment = await ctx.db
      .query("departmentMembers")
      .filter((q: any) => q.eq(q.field("departmentId"), args.departmentId))
      .filter((q: any) => q.eq(q.field("userId"), args.userId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (existingAssignment) {
      await ctx.db.patch(existingAssignment._id, {
        email: resolvedMember.email,
        displayName: resolvedMember.displayName,
        role: resolvedMember.role,
      });

      return {
        companyId: args.companyId,
        departmentId: args.departmentId,
        userId: args.userId,
        displayName: resolvedMember.displayName,
      };
    }

    await ctx.db.insert("departmentMembers", {
      companyId: args.companyId,
      departmentId: args.departmentId,
      userId: args.userId,
      email: resolvedMember.email,
      displayName: resolvedMember.displayName,
      role: resolvedMember.role,
      createdAt: Date.now(),
      isActive: true,
    });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "add_department_member",
      details: `Added ${resolvedMember.displayName} (${resolvedMember.email ?? args.userId}) to the ${department.name} department.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      companyId: args.companyId,
      departmentId: args.departmentId,
      userId: args.userId,
      displayName: resolvedMember.displayName,
    };
  },
});

export const removeWorkspaceDepartmentMember = mutation({
  args: {
    companyId: v.id("companies"),
    departmentId: v.id("workspaceDepartments"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const department = await ctx.db.get(args.departmentId);
    if (!department || department.companyId !== args.companyId || !department.isActive) {
      throw new Error("Department not found");
    }

    const assignment = await ctx.db
      .query("departmentMembers")
      .filter((q: any) => q.eq(q.field("departmentId"), args.departmentId))
      .filter((q: any) => q.eq(q.field("userId"), args.userId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (!assignment) {
      return {
        companyId: args.companyId,
        departmentId: args.departmentId,
        userId: args.userId,
        removed: false,
      };
    }

    await ctx.db.patch(assignment._id, {
      isActive: false,
    });

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "remove_department_member",
      details: `Removed ${assignment.displayName} from the ${department.name} department.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      companyId: args.companyId,
      departmentId: args.departmentId,
      userId: args.userId,
      removed: true,
    };
  },
});

export const listWorkspaceDepartments = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [] as const;
    }

    await assertCompanyAdmin(ctx, args.companyId);

    const departments = await ctx.db
      .query("workspaceDepartments")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    const rows = await Promise.all(departments.map(async (department) => {
      const members = await ctx.db
        .query("departmentMembers")
        .filter((q: any) => q.eq(q.field("departmentId"), department._id))
        .filter((q: any) => q.eq(q.field("isActive"), true))
        .collect();

      return {
        departmentId: department._id,
        name: department.name,
        createdAt: department.createdAt,
        members: members.map((member) => ({
          userId: member.userId,
          displayName: member.displayName,
          email: member.email ?? null,
          role: member.role ?? "company-scorer",
        })),
      };
    }));

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const cancelWorkspaceInvite = mutation({
  args: {
    companyId: v.id("companies"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const normalizedEmail = args.email.trim().toLowerCase();
    const invite = await ctx.db
      .query("workspaceInvites")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("email"), normalizedEmail))
      .first();

    if (!invite) {
      throw new Error("Workspace invite not found");
    }

    await ctx.db.patch(invite._id, {
      status: "cancelled",
      cancelledAt: Date.now(),
      acceptedAt: undefined,
      expiredAt: undefined,
    });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "cancel_workspace_invite",
      details: `Cancelled invite for ${invite.displayName} (${normalizedEmail}) in this workspace.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      companyId: args.companyId,
      email: normalizedEmail,
      status: "cancelled",
    };
  },
});

export const expireWorkspaceInvite = mutation({
  args: {
    companyId: v.id("companies"),
    inviteId: v.id("workspaceInvites"),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.companyId !== args.companyId) {
      throw new Error("Workspace invite not found");
    }

    await ctx.db.patch(invite._id, {
      status: "expired",
      expiredAt: Date.now(),
      acceptedAt: undefined,
      cancelledAt: undefined,
    });

    return {
      companyId: args.companyId,
      email: invite.email,
      status: "expired",
    };
  },
});

export const deactivateWorkspacePerson = mutation({
  args: {
    companyId: v.id("companies"),
    userId: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const normalizedEmail = args.email?.trim().toLowerCase();
    const member = normalizedEmail
      ? await ctx.db
          .query("companyMembers")
          .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
          .filter((q: any) => q.eq(q.field("email"), normalizedEmail))
          .filter((q: any) => q.eq(q.field("isActive"), true))
          .first()
      : await ctx.db
          .query("companyMembers")
          .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
          .filter((q: any) => q.eq(q.field("userId"), args.userId ?? ""))
          .filter((q: any) => q.eq(q.field("isActive"), true))
          .first();

    if (!member) {
      throw new Error("Workspace person not found");
    }

    await ctx.db.patch(member._id, {
      isActive: false,
    });

    const invite = await ctx.db
      .query("workspaceInvites")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("email"), (member.email ?? normalizedEmail ?? "").toLowerCase()))
      .first();

    if (invite) {
      await ctx.db.patch(invite._id, {
        status: "deactivated",
        deactivatedAt: Date.now(),
        cancelledAt: undefined,
        expiredAt: undefined,
      });
    }

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "deactivate_workspace_person",
      details: `Deactivated ${member.displayName} (${member.email ?? normalizedEmail ?? "unknown email"}) in this workspace.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      userId: member.userId,
      email: member.email ?? normalizedEmail ?? null,
      status: "deactivated",
    };
  },
});

export const createProject = mutation({
  args: {
    companyId: v.id("companies"),
    name: v.string(),
    description: v.optional(v.string()),
    vendorDeadline: v.optional(v.number()),
    scorerDeadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new Error("Project name is required");
    }

    const canonicalUserId = identity.subject ?? identity.tokenIdentifier ?? "system";
    const description = args.description?.trim() || undefined;
    const projectId = await ctx.db.insert("projects", {
      companyId: args.companyId,
      name: trimmedName,
      description,
      vendorDeadline: args.vendorDeadline ?? undefined,
      scorerDeadline: args.scorerDeadline ?? undefined,
      createdBy: canonicalUserId,
      createdAt: Date.now(),
      status: "active",
      isTestData: false,
    });

    await ctx.db.insert("projectMembers", {
      companyId: args.companyId,
      projectId,
      userId: canonicalUserId,
      role: companyAdminRole,
      displayName: identity.name ?? "Admin",
      isActive: true,
      createdAt: Date.now(),
      isTestData: false,
    });

    return {
      projectId,
      companyId: args.companyId,
      name: trimmedName,
      description,
      vendorDeadline: args.vendorDeadline ?? null,
      scorerDeadline: args.scorerDeadline ?? null,
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

    const userIds = getIdentityUserIds(identity);
    const hasCompanyAdminAccess = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
      .filter((q: any) => q.or(
        ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
        ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
        ...(identity.name?.trim() ? [q.eq(q.field("displayName"), identity.name.trim())] : []),
      ))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .filter((q: any) => q.eq(q.field("role"), "company-admin"))
      .first();

    const hasProjectAccess = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .filter((q: any) => q.or(
        ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
        ...(identity.name?.trim() ? [q.eq(q.field("displayName"), identity.name.trim())] : []),
      ))
      .first();

    const consultantAccess = await getActiveConsultantRow(ctx, userIds);
    if (!hasCompanyAdminAccess && !hasProjectAccess && !consultantAccess) {
      throw new Error("Project access denied");
    }

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

    const existingVendors = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("role"), "vendor"))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    if (existingVendors.length >= 10) {
      throw new Error("Project vendor limit reached");
    }

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

    const existingScorers = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("role"), "company-scorer"))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    if (existingScorers.length >= 20) {
      throw new Error("Project scorer limit reached");
    }

    const normalizedName = args.displayName.trim();
    const normalizedDepartmentName = args.role === "department" ? (args.departmentName ?? "").trim() : "";
    let departmentId: Id<"workspaceDepartments"> | undefined;
    if (args.role === "department") {
      if (!normalizedDepartmentName) {
        throw new Error("Department name is required for department scorers");
      }

      const department = await ctx.db
        .query("workspaceDepartments")
        .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
        .filter((q: any) => q.eq(q.field("name"), normalizedDepartmentName))
        .filter((q: any) => q.eq(q.field("isActive"), true))
        .first();

      if (!department) {
        throw new Error("Department not found");
      }

      departmentId = department._id;
    }

    const userId = `scorer-${slugify(args.displayName)}-${Date.now()}`;

    const memberId = await ctx.db.insert("projectMembers", {
      companyId: args.companyId,
      projectId: args.projectId,
      userId,
      role: "company-scorer",
      displayName: normalizedName,
      departmentId,
      departmentName: normalizedDepartmentName || undefined,
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
