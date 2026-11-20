import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { assertNoOtherActiveVendorContact, findVendorMembershipForIdentity, getProjectVendors, hasVendorMembershipForIdentity, resolveProjectVendorContact } from "./projectVendors";
import { getScorerDisplayNames, getWorkspacePersonName, resolveScorerDisplayName, updateMemberDisplayName } from "./scorerNames";

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
  const normalizedEmail = identity.email?.trim().toLowerCase();

  const identityMatches: Array<{ userId: string; role?: string; displayName?: string | null; email?: string | null }> = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(normalizedEmail ? [q.eq(q.field("email"), normalizedEmail)] : []),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();

  if (identityMatches.some((match) => match.role === "vendor")) {
    throw new Error("Only company admins or VS Consultants can manage this company");
  }

  const member = identityMatches.find((match) => match.role === companyAdminRole || match.role === consultantRole) ?? null;
  const consultantRow = await getActiveConsultantRow(ctx, userIds);
  const hasConsultantAccess = Boolean(consultantRow) || Boolean(identityMatches.some((match) => match.role === consultantRole));

  if (!member && !hasConsultantAccess) {
    throw new Error("Only company admins or VS Consultants can manage this company");
  }

  if (member && member.role !== companyAdminRole && member.role !== consultantRole) {
    throw new Error("Only company admins or VS Consultants can manage this company");
  }

  return identity;
}

function isLegacyGeneratedUserId(userId: string | null | undefined): boolean {
  const normalized = String(userId ?? "").trim();
  return normalized.length > 0 && /^(vendor-|scorer-)/i.test(normalized);
}

function roleRequiresDepartment(role: "company-admin" | "company-scorer" | "vendor") {
  return role === "company-admin" || role === "company-scorer";
}

async function getActiveDepartmentOrThrow(ctx: any, companyId: Id<"companies">, departmentId: Id<"workspaceDepartments">) {
  const department = await ctx.db.get(departmentId);
  if (!department || department.companyId !== companyId || department.isActive === false) {
    throw new Error("Department not found");
  }
  return department;
}

async function syncDepartmentMembership(
  ctx: any,
  args: {
    companyId: Id<"companies">;
    userId: string;
    email?: string;
    displayName: string;
    role: "company-admin" | "company-scorer";
    departmentId: Id<"workspaceDepartments">;
  },
) {
  const existingAssignments = await ctx.db
    .query("departmentMembers")
    .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
    .filter((q: any) => q.eq(q.field("userId"), args.userId))
    .collect();

  for (const assignment of existingAssignments) {
    const shouldBeActive = assignment.departmentId === args.departmentId;
    await ctx.db.patch(assignment._id, {
      email: args.email,
      displayName: args.displayName,
      role: args.role,
      isActive: shouldBeActive,
    });
  }

  const activeTarget = existingAssignments.find((row: any) => row.departmentId === args.departmentId);
  if (!activeTarget) {
    await ctx.db.insert("departmentMembers", {
      companyId: args.companyId,
      departmentId: args.departmentId,
      userId: args.userId,
      email: args.email,
      displayName: args.displayName,
      role: args.role,
      createdAt: Date.now(),
      isActive: true,
    });
  }
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
  const companyMatches: Array<{ userId: string }> = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();

  const candidateUserIds = new Set([...userIds, ...companyMatches.map((member: { userId: string }) => member.userId)]);
  const member = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), projectId))
    .filter((q: any) => q.or(
      ...Array.from(candidateUserIds).map((userId) => q.eq(q.field("userId"), userId)),
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
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", {
      name: workspaceName,
      slug: slugify(args.name),
      createdBy: canonicalUserId,
      createdAt: now,
      isActive: true,
      ssoProvider: args.ssoProvider,
      isTestData: false,
    });

    const defaultDepartmentId = await ctx.db.insert("workspaceDepartments", {
      companyId,
      name: "General",
      createdByUserId: canonicalUserId,
      createdAt: now,
      isActive: true,
      isTestData: false,
    });

    await ctx.db.insert("companyMembers", {
      companyId,
      userId: canonicalUserId,
      email: identity.email ?? undefined,
      displayName: identity.name ?? "Admin",
      role: companyAdminRole,
      departmentId: defaultDepartmentId,
      isActive: true,
      createdAt: now,
      isTestData: false,
    });

    await ctx.db.insert("departmentMembers", {
      companyId,
      departmentId: defaultDepartmentId,
      userId: canonicalUserId,
      email: identity.email ?? undefined,
      displayName: identity.name ?? "Admin",
      role: companyAdminRole,
      createdAt: now,
      isActive: true,
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
      if (await hasVendorMembershipForIdentity(ctx, identity)) {
        throw new Error("Only VS Consultants can manage workspaces");
      }
      await assertConsultantAccess(ctx);
    }

    const logs = args.companyId
      ? await ctx.db
          .query("activityLogs")
          .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
          .collect()
      : await ctx.db.query("activityLogs").collect();

    const sortedLogs = logs.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    const companyIds = Array.from(new Set(sortedLogs.map((log) => log.companyId).filter(Boolean)));
    const projectIds = Array.from(new Set(sortedLogs.map((log) => log.projectId).filter(Boolean)));

    const companyNameById = new Map<string, string>();
    for (const companyId of companyIds) {
      const company = await ctx.db.get(companyId as Id<"companies">);
      if (company?.name) {
        companyNameById.set(String(companyId), company.name);
      }
    }

    const projectNameById = new Map<string, string>();
    for (const projectId of projectIds) {
      const project = await ctx.db.get(projectId as Id<"projects">);
      if (project?.name) {
        projectNameById.set(String(projectId), project.name);
      }
    }

    const actorLabelByWorkspaceAndUser = new Map<string, string>();
    for (const log of sortedLogs) {
      const key = `${log.companyId ?? ""}:${log.actorUserId}`;
      if (!actorLabelByWorkspaceAndUser.has(key)) {
        actorLabelByWorkspaceAndUser.set(key, await getWorkspacePersonName(ctx, log.companyId, log.actorUserId));
      }
    }

    const extractChangedFields = (details: string) => {
      const labels = ["Name", "Description", "Vendor deadline", "Scorer deadline", "Scorer peer visibility"] as const;
      const changed: Array<{ label: string; before: string; after: string }> = [];

      for (const label of labels) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const labelPattern = `(?:${labels.map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`;
        const regex = new RegExp(`${escaped}:\\s*(.*?)\\s*->\\s*(.*?)(?=\\s+${labelPattern}:|$)`);
        const match = details.match(regex);
        if (!match) {
          continue;
        }

        const before = match[1].trim();
        const after = match[2].trim();
        if (before === after) {
          continue;
        }

        changed.push({ label, before, after });
      }

      return changed;
    };

    return sortedLogs.map((log) => {
      const firstPeriod = log.details.indexOf(".");
      const summary = firstPeriod >= 0 ? log.details.slice(0, firstPeriod + 1).trim() : log.details;
      const changedFields = extractChangedFields(log.details);
      const workspaceFromCompany = log.companyId ? companyNameById.get(String(log.companyId)) : undefined;
      const workspaceLabel = log.workspaceName && log.workspaceName !== "workspace"
        ? log.workspaceName
        : workspaceFromCompany ?? "Deleted workspace";

      const actorLabel = actorLabelByWorkspaceAndUser.get(`${log.companyId ?? ""}:${log.actorUserId}`)!;

      const detailLines = changedFields.length > 0
        ? changedFields.map((field) => `${field.label}: ${field.before} -> ${field.after}`)
        : [log.details];

      return {
        ...log,
        summary,
        detailLines,
        changedFields,
        workspaceLabel,
        actorLabel,
        projectName: log.projectId ? projectNameById.get(String(log.projectId)) ?? null : null,
      };
    });
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

    const members = ctx.db.query("companyMembers")
      .withIndex("by_company_user", (q) => q.eq("companyId", args.companyId));
    const matchingMembers = [];
    for await (const member of members) {
      if (member.email?.trim().toLowerCase() === normalizedEmail) {
        matchingMembers.push(member);
      }
    }

    const invites = ctx.db.query("workspaceInvites")
      .withIndex("by_company_status", (q) => q.eq("companyId", args.companyId));
    const matchingInvites = [];
    for await (const invite of invites) {
      if (invite.email.trim().toLowerCase() === normalizedEmail) matchingInvites.push(invite);
    }

    if (matchingMembers.length > 1 || matchingInvites.length > 1
      || matchingMembers.some((member) => member.role !== "vendor" || member.vendorId !== args.vendorId)
      || matchingInvites.some((invite) => invite.role !== "vendor" || invite.vendorId !== args.vendorId)) {
      throw new Error("This email is already linked or invited in this workspace. Ask an administrator to resolve the existing contact before inviting them.");
    }

    await assertNoOtherActiveVendorContact(ctx, args.companyId, args.vendorId, matchingMembers[0]?.userId);
    const existingMember = matchingMembers.find((member) => member.isActive);

    if (existingMember) {
      await ctx.db.patch(existingMember._id, {
        displayName,
      });
      return { vendorId: args.vendorId, email: normalizedEmail, displayName, status: "active" };
    }

    const existingInvite = matchingInvites[0];

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

    const memberRows = ctx.db
      .query("companyMembers")
      .withIndex("by_company_role", (q) => q.eq("companyId", args.companyId).eq("role", "vendor"));
    const activeContacts = [];
    for await (const member of memberRows) {
      if (member.vendorId !== args.vendorId) continue;
      activeContacts.push({
        id: member._id,
        userId: member.userId,
        name: member.displayName,
        email: member.email ?? "",
        role: member.role,
        status: member.isActive ? "active" : "deactivated",
        source: "member",
      });
    }

    const invites = ctx.db
      .query("workspaceInvites")
      .withIndex("by_company_status", (q) => q.eq("companyId", args.companyId));
    const inviteEntries = [];
    for await (const invite of invites) {
      if (invite.vendorId !== args.vendorId || invite.role !== "vendor" || invite.status === "active"
        || activeContacts.some((contact) => contact.email.trim().toLowerCase() === invite.email.trim().toLowerCase())) continue;
      inviteEntries.push({
        id: invite._id,
        userId: null,
        name: invite.displayName,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        source: "invite",
      });
    }

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

    await assertNoOtherActiveVendorContact(ctx, args.companyId, args.vendorId, member.userId);
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
    departmentId: v.optional(v.id("workspaceDepartments")),
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

    if (args.role === "vendor") {
      throw new Error("Invite vendor contacts from the vendor organisation's Manage contacts page.");
    }

    const vendorInvites = ctx.db.query("workspaceInvites")
      .withIndex("by_company_status", (q) => q.eq("companyId", args.companyId));
    const matchingInvites = [];
    for await (const invite of vendorInvites) {
      if (invite.email.trim().toLowerCase() !== normalizedEmail) continue;
      if (invite.role === "vendor") {
        throw new Error("This email is already linked or invited as a vendor contact in this workspace.");
      }
      matchingInvites.push(invite);
    }
    if (matchingInvites.length > 1) throw new Error("This email has multiple workspace invitations. Ask an administrator to resolve them.");

    if (roleRequiresDepartment(args.role) && !args.departmentId) {
      throw new Error("Select a department before inviting a company admin or scorer.");
    }

    const selectedDepartment = roleRequiresDepartment(args.role)
      ? await getActiveDepartmentOrThrow(ctx, args.companyId, args.departmentId as Id<"workspaceDepartments">)
      : null;

    const workspaceMembers = ctx.db.query("companyMembers")
      .withIndex("by_company_user", (q) => q.eq("companyId", args.companyId));
    const matchingMembers = [];
    for await (const member of workspaceMembers) {
      if (member.email?.trim().toLowerCase() !== normalizedEmail) continue;
      if (member.role === "vendor") {
        throw new Error("This email is already linked as a vendor contact in this workspace.");
      }
      if (member.isActive) matchingMembers.push(member);
    }
    if (matchingMembers.length > 1) {
      throw new Error("This email has multiple workspace memberships. Ask an administrator to resolve them.");
    }
    const existingMember = matchingMembers[0];

    if (existingMember) {
      await ctx.db.patch(existingMember._id, {
        displayName,
        role: args.role,
        departmentId: roleRequiresDepartment(args.role) ? args.departmentId : undefined,
        isActive: true,
      });

      if (roleRequiresDepartment(args.role)) {
        await syncDepartmentMembership(ctx, {
          companyId: args.companyId,
          userId: existingMember.userId,
          email: normalizedEmail,
          displayName,
          role: args.role,
          departmentId: args.departmentId as Id<"workspaceDepartments">,
        });
      } else {
        const departmentAssignments = await ctx.db
          .query("departmentMembers")
          .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
          .filter((q: any) => q.eq(q.field("userId"), existingMember.userId))
          .filter((q: any) => q.eq(q.field("isActive"), true))
          .collect();

        for (const assignment of departmentAssignments) {
          await ctx.db.patch(assignment._id, { isActive: false });
        }
      }

      await recordActivity(ctx, {
        actorUserId: canonicalUserId,
        actorEmail: identity.email ?? undefined,
        action: "update_workspace_person_role",
        details: roleRequiresDepartment(args.role)
          ? `Updated ${displayName} (${normalizedEmail}) to ${args.role} in this workspace and set department to ${selectedDepartment?.name}.`
          : `Updated ${displayName} (${normalizedEmail}) to ${args.role} in this workspace.`,
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

    const existingInvite = matchingInvites[0];

    const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
    let inviteId: any = existingInvite?._id;

    if (existingInvite) {
      await ctx.db.patch(existingInvite._id, {
        displayName,
        role: args.role,
        departmentId: roleRequiresDepartment(args.role) ? args.departmentId : undefined,
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
        departmentId: roleRequiresDepartment(args.role) ? args.departmentId : undefined,
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
      details: roleRequiresDepartment(args.role)
        ? `Invited ${displayName} (${normalizedEmail}) as ${args.role} to this workspace in department ${selectedDepartment?.name}.`
        : `Invited ${displayName} (${normalizedEmail}) as ${args.role} to this workspace.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      email: normalizedEmail,
      displayName,
      role: args.role,
      departmentId: roleRequiresDepartment(args.role) ? args.departmentId ?? null : null,
      status: "invited",
      inviteId,
    };
  },
});

export const updateWorkspacePersonName = mutation({
  args: {
    companyId: v.id("companies"),
    memberId: v.optional(v.id("companyMembers")),
    inviteId: v.optional(v.id("workspaceInvites")),
    displayName: v.string(),
  },
  returns: v.object({ displayName: v.string(), updated: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await assertCompanyAdmin(ctx, args.companyId);
    if (Boolean(args.memberId) === Boolean(args.inviteId)) throw new Error("Select one person or invitation.");
    const name = args.displayName.trim();
    if (!name || /\S+@\S+/.test(name)) throw new Error("Enter the person's name, not an email address.");
    const target = args.memberId ? await ctx.db.get(args.memberId) : args.inviteId ? await ctx.db.get(args.inviteId) : null;
    if (!target || target.companyId !== args.companyId) throw new Error("Person not found in this workspace.");
    if ("userId" in target && name === target.userId) throw new Error("Enter the person's name, not their user ID.");
    if (!("userId" in target) && (target.status !== "invited" || target.expiresAt <= Date.now())) {
      throw new Error("Only pending invitations can be updated.");
    }
    const previousName = target.displayName;
    if (previousName === name) return { displayName: name, updated: false };
    if ("userId" in target) await updateMemberDisplayName(ctx, target, name);
    else await ctx.db.patch(target._id, { displayName: name });
    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "update_workspace_person_name",
      details: `Updated a person's display name. Name: ${previousName} -> ${name}`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });
    return { displayName: name, updated: true };
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

    const departments = await ctx.db
      .query("workspaceDepartments")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .collect();
    const departmentNameById = new Map(departments.map((department) => [String(department._id), department.name]));

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
      departmentId: member.departmentId ?? null,
      departmentName: member.departmentId ? (departmentNameById.get(String(member.departmentId)) ?? "Unknown department") : null,
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
        departmentId: invite.departmentId ?? null,
        departmentName: invite.departmentId ? (departmentNameById.get(String(invite.departmentId)) ?? "Unknown department") : null,
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

    if (member.role === "vendor") {
      if (!member.vendorId) throw new Error("This contact has no vendor organisation. Ask a workspace admin to repair the contact link.");
      await assertNoOtherActiveVendorContact(ctx, args.companyId, member.vendorId, member.userId);
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

export const renameWorkspaceDepartment = mutation({
  args: {
    companyId: v.id("companies"),
    departmentId: v.id("workspaceDepartments"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const department = await getActiveDepartmentOrThrow(ctx, args.companyId, args.departmentId);
    const nextName = args.name.trim();
    if (!nextName) {
      throw new Error("Department name is required");
    }

    const duplicate = await ctx.db
      .query("workspaceDepartments")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("name"), nextName))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (duplicate && duplicate._id !== args.departmentId) {
      throw new Error("A department with that name already exists");
    }

    await ctx.db.patch(args.departmentId, { name: nextName });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "rename_workspace_department",
      details: `Renamed department ${department.name} to ${nextName}.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return { departmentId: args.departmentId, name: nextName };
  },
});

export const deactivateWorkspaceDepartment = mutation({
  args: {
    companyId: v.id("companies"),
    departmentId: v.id("workspaceDepartments"),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const department = await getActiveDepartmentOrThrow(ctx, args.companyId, args.departmentId);

    const linkedPeople = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("departmentId"), args.departmentId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .filter((q: any) => q.or(q.eq(q.field("role"), "company-admin"), q.eq(q.field("role"), "company-scorer")))
      .collect();

    if (linkedPeople.length > 0) {
      throw new Error("Move people to another department before deactivating this department.");
    }

    await ctx.db.patch(args.departmentId, { isActive: false });

    const activeDeptMemberships = await ctx.db
      .query("departmentMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("departmentId"), args.departmentId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();
    for (const row of activeDeptMemberships) {
      await ctx.db.patch(row._id, { isActive: false });
    }

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "deactivate_workspace_department",
      details: `Deactivated department ${department.name}.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return { departmentId: args.departmentId, isActive: false };
  },
});

export const updateWorkspacePersonDepartment = mutation({
  args: {
    companyId: v.id("companies"),
    userId: v.string(),
    departmentId: v.id("workspaceDepartments"),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const department = await getActiveDepartmentOrThrow(ctx, args.companyId, args.departmentId);

    const member = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("userId"), args.userId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (!member) {
      throw new Error("Workspace person not found");
    }
    if (member.role === "vendor") {
      throw new Error("Vendors do not belong to workspace departments.");
    }

    const beforeDepartmentId = member.departmentId;

    await ctx.db.patch(member._id, {
      departmentId: args.departmentId,
    });

    await syncDepartmentMembership(ctx, {
      companyId: args.companyId,
      userId: member.userId,
      email: member.email ?? undefined,
      displayName: member.displayName,
      role: member.role,
      departmentId: args.departmentId,
    });

    const beforeDepartment = beforeDepartmentId ? await ctx.db.get(beforeDepartmentId) : null;
    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "update_workspace_person_department",
      details: `Moved ${member.displayName} from ${beforeDepartment?.name ?? "none"} to ${department.name}.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      userId: member.userId,
      departmentId: args.departmentId,
      departmentName: department.name,
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

    const member = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("userId"), args.userId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (!member) {
      throw new Error("User is not a member of this workspace");
    }
    if (member.role === "vendor") {
      throw new Error("Vendors do not belong to workspace departments.");
    }

    await ctx.db.patch(member._id, { departmentId: args.departmentId });
    await syncDepartmentMembership(ctx, {
      companyId: args.companyId,
      userId: member.userId,
      email: member.email ?? undefined,
      displayName: member.displayName,
      role: member.role,
      departmentId: args.departmentId,
    });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "add_department_member",
      details: `Set ${member.displayName} (${member.email ?? args.userId}) to the ${department.name} department.`,
      workspaceName: "workspace",
      companyId: args.companyId,
    });

    return {
      companyId: args.companyId,
      departmentId: args.departmentId,
      userId: args.userId,
      displayName: member.displayName,
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

    throw new Error(`Cannot remove ${args.userId} from ${department.name} without assigning a new department. Use updateWorkspacePersonDepartment.`);
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
      .collect();

    const rows = await Promise.all(departments.map(async (department) => {
      const members = await ctx.db
        .query("companyMembers")
        .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
        .filter((q: any) => q.eq(q.field("departmentId"), department._id))
        .filter((q: any) => q.eq(q.field("isActive"), true))
        .filter((q: any) => q.or(q.eq(q.field("role"), "company-admin"), q.eq(q.field("role"), "company-scorer")))
        .collect();

      return {
        departmentId: department._id,
        name: department.name,
        isActive: department.isActive !== false,
        createdAt: department.createdAt,
        memberCount: members.length,
        members: members.map((member) => ({
          userId: member.userId,
          displayName: member.displayName,
          email: member.email ?? null,
          role: member.role,
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
    scorerCanSeePeerScores: v.optional(v.boolean()),
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

    if (
      typeof args.vendorDeadline === "number"
      && typeof args.scorerDeadline === "number"
      && args.scorerDeadline < args.vendorDeadline
    ) {
      throw new Error("Scorer deadline can't be before the vendor deadline");
    }

    const canonicalUserId = identity.subject ?? identity.tokenIdentifier ?? "system";
    const description = args.description?.trim() || undefined;
    const projectId = await ctx.db.insert("projects", {
      companyId: args.companyId,
      name: trimmedName,
      description,
      vendorDeadline: args.vendorDeadline ?? undefined,
      scorerDeadline: args.scorerDeadline ?? undefined,
      scorerCanSeePeerScores: args.scorerCanSeePeerScores ?? false,
      createdBy: canonicalUserId,
      createdAt: Date.now(),
      status: "active",
      isArchived: false,
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
      scorerCanSeePeerScores: args.scorerCanSeePeerScores ?? false,
    };
  },
});

export const updateProject = mutation({
  args: {
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    vendorDeadline: v.optional(v.union(v.number(), v.null())),
    scorerDeadline: v.optional(v.union(v.number(), v.null())),
    scorerCanSeePeerScores: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await assertCompanyAdmin(ctx, args.companyId);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.companyId !== args.companyId) {
      throw new Error("Project not found");
    }

    const nextName = args.name.trim();
    if (!nextName) {
      throw new Error("Project name is required");
    }

    const nextDescription = args.description?.trim() || undefined;
    const nextVendorDeadline = args.vendorDeadline ?? undefined;
    const nextScorerDeadline = args.scorerDeadline ?? undefined;
    const nextScorerCanSeePeerScores = args.scorerCanSeePeerScores ?? Boolean(project.scorerCanSeePeerScores);

    if (
      typeof nextVendorDeadline === "number"
      && typeof nextScorerDeadline === "number"
      && nextScorerDeadline < nextVendorDeadline
    ) {
      throw new Error("Scorer deadline can't be before the vendor deadline");
    }

    const beforeName = project.name;
    const beforeDescription = project.description ?? null;
    const beforeVendorDeadline = project.vendorDeadline ?? null;
    const beforeScorerDeadline = project.scorerDeadline ?? null;
    const beforeScorerCanSeePeerScores = Boolean(project.scorerCanSeePeerScores);

    await ctx.db.patch(args.projectId, {
      name: nextName,
      description: nextDescription,
      vendorDeadline: nextVendorDeadline,
      scorerDeadline: nextScorerDeadline,
      scorerCanSeePeerScores: nextScorerCanSeePeerScores,
    });

    if (typeof nextVendorDeadline === "number") {
      const vendorDeadlineRows = await ctx.db
        .query("projectDeadlines")
        .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
        .filter((q: any) => q.eq(q.field("targetType"), "vendor"))
        .collect();

      for (const row of vendorDeadlineRows) {
        await ctx.db.patch(row._id, {
          dueAt: nextVendorDeadline,
          updatedAt: Date.now(),
        });
      }
    }

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "update_project",
      details: [
        `Updated project ${beforeName}.`,
        `Name: ${beforeName} -> ${nextName}`,
        `Description: ${beforeDescription ?? "none"} -> ${nextDescription ?? "none"}`,
        `Vendor deadline: ${beforeVendorDeadline ?? "none"} -> ${nextVendorDeadline ?? "none"}`,
        `Scorer deadline: ${beforeScorerDeadline ?? "none"} -> ${nextScorerDeadline ?? "none"}`,
        `Scorer peer visibility: ${beforeScorerCanSeePeerScores ? "on" : "off"} -> ${nextScorerCanSeePeerScores ? "on" : "off"}`,
      ].join(" "),
      workspaceName: "workspace",
      companyId: args.companyId,
      projectId: args.projectId,
    });

    return {
      projectId: args.projectId,
      companyId: args.companyId,
      name: nextName,
      description: nextDescription ?? null,
      vendorDeadline: nextVendorDeadline ?? null,
      scorerDeadline: nextScorerDeadline ?? null,
      scorerCanSeePeerScores: nextScorerCanSeePeerScores,
    };
  },
});

export const archiveProject = mutation({
  args: {
    companyId: v.id("companies"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const identity = await assertCompanyAdmin(ctx, args.companyId);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.companyId !== args.companyId) {
      throw new Error("Project not found");
    }

    await ctx.db.patch(args.projectId, { isArchived: true });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "archive_project",
      details: `Archived project ${project.name}.`,
      workspaceName: "workspace",
      companyId: args.companyId,
      projectId: args.projectId,
    });

    return { projectId: args.projectId, companyId: args.companyId, isArchived: true };
  },
});

export const restoreProject = mutation({
  args: {
    companyId: v.id("companies"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const identity = await assertCompanyAdmin(ctx, args.companyId);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.companyId !== args.companyId) {
      throw new Error("Project not found");
    }

    await ctx.db.patch(args.projectId, { isArchived: false });

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "restore_project",
      details: `Restored project ${project.name}.`,
      workspaceName: "workspace",
      companyId: args.companyId,
      projectId: args.projectId,
    });

    return { projectId: args.projectId, companyId: args.companyId, isArchived: false };
  },
});

export const cleanupLegacyGeneratedProjectMembers = internalMutation({
  args: {
    secret: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    if (isProductionEnvironment()) {
      throw new Error("Legacy project-member cleanup is disabled in production");
    }

    const expectedSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET ?? process.env.DEV_CONSULTANT_GRANT_SECRET;
    if (!expectedSecret) {
      throw new Error("Set CONVEX_CONSULTANT_GRANT_SECRET before running the legacy project-member cleanup");
    }
    if (args.secret !== expectedSecret) {
      throw new Error("Invalid cleanup secret");
    }

    const rows = args.projectId
      ? await ctx.db
          .query("projectMembers")
          .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
          .collect()
      : await ctx.db.query("projectMembers").collect();

    const removed: Array<{ _id: string; projectId: string; userId: string; displayName: string; role: string }> = [];

    for (const row of rows) {
      if (isLegacyGeneratedUserId(row.userId)) {
        removed.push({
          _id: row._id,
          projectId: row.projectId,
          userId: row.userId,
          displayName: row.displayName,
          role: row.role,
        });
        await ctx.db.delete(row._id);
      }
    }

    return {
      projectId: args.projectId ?? null,
      removedCount: removed.length,
      removed,
    };
  },
});

export const migrateDepartmentModelStep1 = internalMutation({
  args: {
    secret: v.string(),
    companyId: v.optional(v.id("companies")),
    fallbackDepartmentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (isProductionEnvironment()) {
      throw new Error("Department model migration is disabled in production");
    }

    const expectedSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET ?? process.env.DEV_CONSULTANT_GRANT_SECRET;
    if (!expectedSecret) {
      throw new Error("Set CONVEX_CONSULTANT_GRANT_SECRET before running department model migration");
    }
    if (args.secret !== expectedSecret) {
      throw new Error("Invalid migration secret");
    }

    const fallbackDepartmentName = args.fallbackDepartmentName?.trim() || "Unassigned (migrated)";
    const companies = args.companyId
      ? [await ctx.db.get(args.companyId)].filter((company): company is NonNullable<typeof company> => Boolean(company))
      : await ctx.db.query("companies").collect();

    const summary = {
      companiesProcessed: 0,
      companyPeopleUpdated: 0,
      invitesUpdated: 0,
      legacyDepartmentProjectAssignmentsReplaced: 0,
      projectScorersAdded: 0,
      scorerScoreScopesConverted: 0,
      scorerCompletionScopesConverted: 0,
      scorerSnapshotsBackfilled: 0,
      testDataPeopleUpdated: 0,
    };

    for (const company of companies) {
      summary.companiesProcessed += 1;

      let fallbackDepartment = await ctx.db
        .query("workspaceDepartments")
        .filter((q: any) => q.eq(q.field("companyId"), company._id))
        .filter((q: any) => q.eq(q.field("name"), fallbackDepartmentName))
        .first();

      if (!fallbackDepartment) {
        const fallbackDepartmentId = await ctx.db.insert("workspaceDepartments", {
          companyId: company._id,
          name: fallbackDepartmentName,
          createdByUserId: "migration",
          createdAt: Date.now(),
          isActive: true,
          isTestData: company.isTestData ?? false,
        });
        fallbackDepartment = await ctx.db.get(fallbackDepartmentId);
      } else if (fallbackDepartment.isActive === false) {
        await ctx.db.patch(fallbackDepartment._id, { isActive: true });
      }

      const people = await ctx.db
        .query("companyMembers")
        .filter((q: any) => q.eq(q.field("companyId"), company._id))
        .filter((q: any) => q.eq(q.field("isActive"), true))
        .filter((q: any) => q.or(q.eq(q.field("role"), "company-admin"), q.eq(q.field("role"), "company-scorer")))
        .collect();

      for (const person of people) {
        let targetDepartmentId = person.departmentId as Id<"workspaceDepartments"> | undefined;
        if (targetDepartmentId) {
          const existingDepartment = await ctx.db.get(targetDepartmentId);
          if (!existingDepartment || existingDepartment.companyId !== company._id || existingDepartment.isActive === false) {
            targetDepartmentId = undefined;
          }
        }

        if (!targetDepartmentId) {
          targetDepartmentId = fallbackDepartment!._id;
          await ctx.db.patch(person._id, { departmentId: targetDepartmentId });
          summary.companyPeopleUpdated += 1;
          if (company.isTestData) {
            summary.testDataPeopleUpdated += 1;
          }
        }

        await syncDepartmentMembership(ctx, {
          companyId: company._id,
          userId: person.userId,
          email: person.email ?? undefined,
          displayName: person.displayName,
          role: person.role === "company-admin" ? "company-admin" : "company-scorer",
          departmentId: targetDepartmentId,
        });
      }

      const invites = await ctx.db
        .query("workspaceInvites")
        .filter((q: any) => q.eq(q.field("companyId"), company._id))
        .filter((q: any) => q.or(q.eq(q.field("role"), "company-admin"), q.eq(q.field("role"), "company-scorer")))
        .collect();

      for (const invite of invites) {
        let targetDepartmentId = invite.departmentId as Id<"workspaceDepartments"> | undefined;
        if (targetDepartmentId) {
          const existingDepartment = await ctx.db.get(targetDepartmentId);
          if (!existingDepartment || existingDepartment.companyId !== company._id || existingDepartment.isActive === false) {
            targetDepartmentId = undefined;
          }
        }
        if (!targetDepartmentId) {
          await ctx.db.patch(invite._id, { departmentId: fallbackDepartment!._id });
          summary.invitesUpdated += 1;
        }
      }

      const projects = await ctx.db
        .query("projects")
        .withIndex("by_company", (q) => q.eq("companyId", company._id))
        .collect();

      for (const project of projects) {
        const projectScorers = await ctx.db
          .query("projectMembers")
          .filter((q: any) => q.eq(q.field("companyId"), company._id))
          .filter((q: any) => q.eq(q.field("projectId"), project._id))
          .filter((q: any) => q.eq(q.field("role"), "company-scorer"))
          .filter((q: any) => q.eq(q.field("isActive"), true))
          .collect();

        const legacyDepartmentScorers = projectScorers.filter((row) => Boolean(row.departmentId || row.departmentName || row.userId.startsWith("department:")));
        for (const legacy of legacyDepartmentScorers) {
          const departmentId = legacy.departmentId
            ?? (legacy.userId.startsWith("department:") ? (legacy.userId.slice("department:".length) as Id<"workspaceDepartments">) : undefined);

          if (!departmentId) {
            await ctx.db.patch(legacy._id, { isActive: false });
            summary.legacyDepartmentProjectAssignmentsReplaced += 1;
            continue;
          }

          const deptPeople = await ctx.db
            .query("companyMembers")
            .filter((q: any) => q.eq(q.field("companyId"), company._id))
            .filter((q: any) => q.eq(q.field("departmentId"), departmentId as any))
            .filter((q: any) => q.eq(q.field("isActive"), true))
            .filter((q: any) => q.or(q.eq(q.field("role"), "company-admin"), q.eq(q.field("role"), "company-scorer")))
            .collect();

          let activeScorerCount = projectScorers.filter((row) => !Boolean(row.departmentId || row.departmentName || row.userId.startsWith("department:"))).length;
          for (const person of deptPeople) {
            const existingIndividual = await ctx.db
              .query("projectMembers")
              .filter((q: any) => q.eq(q.field("companyId"), company._id))
              .filter((q: any) => q.eq(q.field("projectId"), project._id))
              .filter((q: any) => q.eq(q.field("role"), "company-scorer"))
              .filter((q: any) => q.eq(q.field("userId"), person.userId))
              .filter((q: any) => q.eq(q.field("isActive"), true))
              .first();

            if (existingIndividual) {
              continue;
            }

            if (activeScorerCount >= 20) {
              break;
            }

            await ctx.db.insert("projectMembers", {
              companyId: company._id,
              projectId: project._id,
              userId: person.userId,
              role: "company-scorer",
              displayName: person.displayName,
              isActive: true,
              createdAt: Date.now(),
            });
            activeScorerCount += 1;
            summary.projectScorersAdded += 1;
          }

          await ctx.db.patch(legacy._id, {
            isActive: false,
          });
          summary.legacyDepartmentProjectAssignmentsReplaced += 1;
        }
      }

      const scorerRows = await ctx.db
        .query("scorerScores")
        .filter((q: any) => q.eq(q.field("companyId"), company._id))
        .collect();

      for (const row of scorerRows) {
        const wasDepartmentScope = row.scorerScopeType === "department";
        const nextScopeKey = wasDepartmentScope ? `individual:${row.enteredByUserId}` : row.scorerScopeKey;
        const nextScopeLabel = wasDepartmentScope ? row.enteredByDisplayName : row.scorerScopeLabel;

        const member = await ctx.db
          .query("companyMembers")
          .filter((q: any) => q.eq(q.field("companyId"), company._id))
          .filter((q: any) => q.eq(q.field("userId"), row.enteredByUserId))
          .first();

        const memberDepartment = member?.departmentId ? await ctx.db.get(member.departmentId) : null;
        const snapshotDepartmentId = row.scorerDepartmentId ?? member?.departmentId;
        const snapshotDepartmentName = row.scorerDepartmentName
          ?? (wasDepartmentScope ? row.scorerScopeLabel : (memberDepartment?.name ?? undefined));

        if (wasDepartmentScope) {
          summary.scorerScoreScopesConverted += 1;
        }
        if (!row.scorerDepartmentName || !row.scorerDepartmentId) {
          summary.scorerSnapshotsBackfilled += 1;
        }

        await ctx.db.patch(row._id, {
          scorerScopeKey: nextScopeKey,
          scorerScopeLabel: nextScopeLabel,
          scorerScopeType: "individual",
          scorerDepartmentId: snapshotDepartmentId,
          scorerDepartmentName: snapshotDepartmentName,
        });
      }

      const completionRows = await ctx.db
        .query("scorerCompletions")
        .filter((q: any) => q.eq(q.field("companyId"), company._id))
        .collect();

      for (const row of completionRows) {
        const wasDepartmentScope = row.scorerScopeType === "department";
        const nextScopeKey = wasDepartmentScope ? `individual:${row.updatedByUserId}` : row.scorerScopeKey;
        const nextScopeLabel = wasDepartmentScope ? row.updatedByDisplayName : row.scorerScopeLabel;

        const member = await ctx.db
          .query("companyMembers")
          .filter((q: any) => q.eq(q.field("companyId"), company._id))
          .filter((q: any) => q.eq(q.field("userId"), row.updatedByUserId))
          .first();
        const memberDepartment = member?.departmentId ? await ctx.db.get(member.departmentId) : null;

        if (wasDepartmentScope) {
          summary.scorerCompletionScopesConverted += 1;
        }

        await ctx.db.patch(row._id, {
          scorerScopeKey: nextScopeKey,
          scorerScopeLabel: nextScopeLabel,
          scorerScopeType: "individual",
          scorerDepartmentId: row.scorerDepartmentId ?? member?.departmentId,
          scorerDepartmentName: row.scorerDepartmentName ?? memberDepartment?.name,
        });
      }
    }

    return summary;
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

    if (await findVendorMembershipForIdentity(ctx, project.companyId, identity)) {
      const contact = await resolveProjectVendorContact(ctx, project, identity);
      if (!contact) throw new Error("Project access denied");
      return [{
        _id: contact.assignment._id,
        companyId: project.companyId,
        projectId: args.projectId,
        userId: contact.member.userId,
        role: "vendor" as const,
        displayName: contact.member.displayName,
        isActive: true,
        createdAt: contact.assignment.createdAt,
      }];
    }

    const userIds = getIdentityUserIds(identity);
    const companyMemberships = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
      .filter((q: any) => q.or(
        ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
        ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
      ))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    const hasCompanyAdminAccess = companyMemberships.some((member) => member.role === "company-admin");
    const consultantAccess = await getActiveConsultantRow(ctx, userIds);

    const projectMemberships = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .filter((q: any) => q.or(
        ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ))
      .collect();

    const hasProjectAccess = projectMemberships.some((member) => member.companyId === project.companyId && member.role !== "vendor");
    const projectVendors = await getProjectVendors(ctx, project);
    if (!hasCompanyAdminAccess && !hasProjectAccess && !consultantAccess) {
      throw new Error("Project access denied");
    }

    const members = await ctx.db
      .query("projectMembers")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .collect();

    const displayNameByUserId = await getScorerDisplayNames(ctx, project);
    const visibleMembers = members
      .filter((member) => member.role !== "vendor" && !isLegacyGeneratedUserId(member.userId))
      .map((member) => member.role === "company-scorer" ? {
        ...member,
        displayName: resolveScorerDisplayName({ enteredByUserId: member.userId, enteredByDisplayName: member.displayName, displayNameByUserId }),
      } : member);

    const vendorRows = projectVendors.map((vendor) => ({
      _id: vendor.assignmentId,
      projectId: args.projectId,
      userId: vendor.vendorId,
      role: "vendor" as const,
      displayName: vendor.vendorName,
      isActive: true,
      createdAt: vendor.assignedAt,
    }));

    return [...visibleMembers, ...vendorRows];
  },
});

export const addProjectVendor = mutation({
  args: {
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    vendorId: v.optional(v.id("vendorOrganizations")),
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCompanyAdmin(ctx, args.companyId);
    await assertProjectAccess(ctx, args.projectId, args.companyId);

    let vendorId = args.vendorId;
    let vendorName = args.displayName?.trim() ?? "";

    if (!vendorId) {
      if (!vendorName) {
        throw new Error("Select a vendor organization before assigning it to the project.");
      }

      const existingVendor = await ctx.db
        .query("vendorOrganizations")
        .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
        .filter((q: any) => q.eq(q.field("name"), vendorName))
        .first();

      if (!existingVendor) {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
          throw new Error("Not signed in");
        }

        vendorId = await ctx.db.insert("vendorOrganizations", {
          companyId: args.companyId,
          name: vendorName,
          contactEmail: args.email?.trim().toLowerCase() || undefined,
          status: "active",
          createdByUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isTestData: false,
        });
      } else {
        vendorId = existingVendor._id;
        vendorName = existingVendor.name;
      }
    }

    const vendor = await ctx.db.get(vendorId);
    if (!vendor || vendor.companyId !== args.companyId || vendor.status !== "active") {
      throw new Error("Vendor organization not found");
    }

    const projectVendorCount = await ctx.db
      .query("projectVendors")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .collect();

    if (projectVendorCount.length >= 10) {
      throw new Error("Project vendor limit reached");
    }

    const existingAssignment = await ctx.db
      .query("projectVendors")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("vendorId"), vendorId))
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .first();

    if (existingAssignment) {
      throw new Error(`${vendor.name} is already assigned to this project.`);
    }

    const projectVendorId = await ctx.db.insert("projectVendors", {
      companyId: args.companyId,
      projectId: args.projectId,
      vendorId,
      createdAt: Date.now(),
      isTestData: false,
    });

    return {
      _id: projectVendorId,
      companyId: args.companyId,
      projectId: args.projectId,
      vendorId,
      role: "vendor",
      displayName: vendor.name,
      email: vendor.contactEmail ?? null,
    };
  },
});

export const addProjectScorer = mutation({
  args: {
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    userId: v.optional(v.string()),
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
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

    let selectedUserId = args.userId?.trim() ?? "";
    let selectedDisplayName = args.displayName?.trim() ?? "";
    let selectedEmail = args.email?.trim().toLowerCase() ?? "";
    if (!selectedUserId) {
      if (!selectedDisplayName && !selectedEmail) {
        throw new Error("Select a workspace person before assigning them as a scorer.");
      }

      const member = await ctx.db
        .query("companyMembers")
        .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
        .filter((q: any) => q.or(
          ...(selectedEmail ? [q.eq(q.field("email"), selectedEmail)] : []),
          ...(selectedDisplayName ? [q.eq(q.field("displayName"), selectedDisplayName)] : []),
        ))
        .filter((q: any) => q.eq(q.field("isActive"), true))
        .first();

      if (!member) {
        throw new Error("Workspace person not found");
      }

      selectedUserId = member.userId;
      selectedDisplayName = member.displayName;
      selectedEmail = member.email ?? selectedEmail;
    }

    const member = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("userId"), selectedUserId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (!member) {
      throw new Error("Workspace person not found");
    }
    if (member.role !== "company-scorer" && member.role !== "company-admin") {
      throw new Error("Only active company admins or scorers can be assigned as project scorers.");
    }
    if (!member.departmentId) {
      throw new Error("Assign this person to a department before adding them to a project scorer list.");
    }

    if (await isLegacyGeneratedUserId(selectedUserId)) {
      throw new Error("Scorer assignments must use a real workspace person userId.");
    }

    selectedDisplayName = member.displayName;
    selectedEmail = member.email ?? selectedEmail;

    const duplicate = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("companyId"), args.companyId))
      .filter((q: any) => q.eq(q.field("role"), "company-scorer"))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .filter((q: any) => q.eq(q.field("userId"), selectedUserId))
      .first();

    if (duplicate) {
      throw new Error(`${selectedDisplayName} is already assigned to this project.`);
    }

    const memberId = await ctx.db.insert("projectMembers", {
      companyId: args.companyId,
      projectId: args.projectId,
      userId: selectedUserId,
      role: "company-scorer",
      displayName: selectedDisplayName,
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
      userId: selectedUserId,
      role: "company-scorer",
      displayName: selectedDisplayName,
      email: selectedEmail,
      scorerRole: "individual",
      departmentName: null,
    };
  },
});
