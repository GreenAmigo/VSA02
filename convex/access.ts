import { query, mutation, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

function getIdentityUserIds(identity: { subject?: string; tokenIdentifier?: string }) {
  return Array.from(new Set([identity.subject, identity.tokenIdentifier].filter((value): value is string => Boolean(value))));
}

async function migrateLegacyConsultantMemberships(ctx: any, userIds?: string[]) {
  const targetUserIds = userIds && userIds.length > 0 ? userIds : undefined;
  const legacyMemberships = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("role"), "vs-consultant"))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();

  for (const membership of legacyMemberships) {
    if (targetUserIds && !targetUserIds.includes(membership.userId)) {
      continue;
    }

    const existingConsultant = await ctx.db
      .query("consultants")
      .filter((q: any) => q.eq(q.field("userId"), membership.userId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (!existingConsultant) {
      await ctx.db.insert("consultants", {
        userId: membership.userId,
        email: membership.email,
        displayName: membership.displayName,
        isActive: true,
        grantedAt: Date.now(),
        grantedBy: "legacy-migration",
        isTestData: membership.isTestData ?? false,
      });
    }

    await ctx.db.delete(membership._id);
  }
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
  }

  await migrateLegacyConsultantMemberships(ctx, userIds);

  for (const userId of userIds) {
    const migratedConsultant = await ctx.db
      .query("consultants")
      .filter((q: any) => q.eq(q.field("userId"), userId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (migratedConsultant) {
      return migratedConsultant;
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

async function resolveWorkOSUserEmail(identity: { subject?: string; tokenIdentifier?: string; email?: string; emailVerified?: boolean; name?: string }) {
  const workosUserId = identity.subject ?? identity.tokenIdentifier;
  if (!workosUserId) {
    return {
      email: identity.email?.trim().toLowerCase() || null,
      emailVerified: identity.email ? true : false,
      displayName: identity.name ?? null,
      source: "identity" as const,
    };
  }

  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    return {
      email: identity.email?.trim().toLowerCase() || null,
      emailVerified: identity.emailVerified === true,
      displayName: identity.name ?? null,
      source: "identity" as const,
    };
  }

  try {
    const response = await fetch(`https://api.workos.com/user_management/users/${encodeURIComponent(workosUserId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        email: identity.email?.trim().toLowerCase() || null,
        emailVerified: identity.emailVerified === true,
        displayName: identity.name ?? null,
        source: "identity" as const,
      };
    }

    const data = (await response.json()) as {
      email?: string | null;
      email_address?: string | null;
      emailAddress?: string | null;
      email_verified?: boolean | null;
      emailVerified?: boolean | null;
      name?: string | null;
      full_name?: string | null;
    };

    const resolvedEmail = (data.email ?? data.email_address ?? data.emailAddress ?? identity.email ?? null)?.trim().toLowerCase() || null;
    const emailVerified = typeof data.email_verified === "boolean"
      ? data.email_verified
      : typeof data.emailVerified === "boolean"
        ? data.emailVerified
        : identity.emailVerified === true;

    return {
      email: resolvedEmail,
      emailVerified,
      displayName: data.name ?? data.full_name ?? identity.name ?? resolvedEmail,
      source: "workos" as const,
    };
  } catch {
    return {
      email: identity.email?.trim().toLowerCase() || null,
      emailVerified: identity.emailVerified === true,
      displayName: identity.name ?? null,
      source: "identity" as const,
    };
  }
}

export const acceptPendingInvitesForUser = internalMutation({
  args: {
    userId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const targetEmail = args.email.trim().toLowerCase();
    const pendingInvites = await ctx.db
      .query("workspaceInvites")
      .filter((q: any) => q.eq(q.field("email"), targetEmail))
      .filter((q: any) => q.or(q.eq(q.field("status"), "invited"), q.eq(q.field("status"), "active")))
      .collect();

    let accepted = 0;
    for (const invite of pendingInvites) {
      const isExpired = invite.expiresAt !== undefined && Date.now() > invite.expiresAt;
      if (invite.cancelledAt || invite.deactivatedAt || isExpired) {
        await ctx.db.patch(invite._id, {
          status: isExpired ? "expired" : invite.cancelledAt ? "cancelled" : "deactivated",
          expiredAt: isExpired ? Date.now() : invite.expiredAt,
          cancelledAt: invite.cancelledAt ?? undefined,
          deactivatedAt: invite.deactivatedAt ?? undefined,
        });
        continue;
      }

      const existingMemberships = await ctx.db
        .query("companyMembers")
        .filter((q: any) => q.eq(q.field("companyId"), invite.companyId))
        .filter((q: any) => q.eq(q.field("userId"), args.userId))
        .collect();

      const canonicalMembership = (existingMemberships.length > 0
        ? [...existingMemberships].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.createdAt - b.createdAt)[0]
        : null) as any;
      const hasMatchingVendorMembership = invite.vendorId
        ? existingMemberships.some((membership) => membership.vendorId === invite.vendorId)
        : true;

      if (canonicalMembership && canonicalMembership.isActive && hasMatchingVendorMembership) {
        for (const duplicate of existingMemberships) {
          if (duplicate._id !== canonicalMembership._id) {
            await ctx.db.delete(duplicate._id);
          }
        }

        await ctx.db.patch(invite._id, {
          status: "active",
          acceptedAt: invite.acceptedAt ?? Date.now(),
          cancelledAt: undefined,
          deactivatedAt: undefined,
          expiredAt: undefined,
        });
        continue;
      }

      if (canonicalMembership) {
        await ctx.db.patch(canonicalMembership._id, {
          email: targetEmail,
          displayName: args.displayName ?? invite.displayName,
          role: invite.role,
          vendorId: invite.vendorId ?? canonicalMembership.vendorId,
          isActive: true,
        });
      } else {
        await ctx.db.insert("companyMembers", {
          companyId: invite.companyId,
          userId: args.userId,
          email: targetEmail,
          displayName: args.displayName ?? invite.displayName,
          role: invite.role,
          vendorId: invite.vendorId,
          isActive: true,
          createdAt: Date.now(),
          isTestData: invite.isTestData ?? false,
        });
      }

      for (const duplicate of existingMemberships) {
        if (duplicate._id !== canonicalMembership?._id) {
          await ctx.db.delete(duplicate._id);
        }
      }

      if (canonicalMembership && !canonicalMembership.isActive) {
        accepted += 1;
      } else if (!canonicalMembership) {
        accepted += 1;
      }

      await ctx.db.patch(invite._id, {
        status: "active",
        acceptedAt: Date.now(),
        cancelledAt: undefined,
        deactivatedAt: undefined,
        expiredAt: undefined,
      });

      await ctx.db.insert("activityLogs", {
        actorUserId: args.userId,
        actorEmail: targetEmail,
        action: "accept_workspace_invite",
        details: `Accepted invite to ${invite.displayName} for ${invite.role} access in this workspace.`,
        workspaceName: "workspace",
        companyId: invite.companyId,
        createdAt: Date.now(),
      });
    }

    return { accepted, email: targetEmail, verified: true };
  },
});

export const acceptPendingInvites = action({
  args: {},
  handler: async (ctx): Promise<{ accepted: number; email: string | null; verified: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const workosUserId = identity.subject ?? identity.tokenIdentifier;
    if (!workosUserId) {
      return { accepted: 0, email: null, verified: false };
    }

    const workosUser = await resolveWorkOSUserEmail(identity);
    const targetEmail = workosUser.email?.trim().toLowerCase() || null;
    const verified = Boolean(workosUser.emailVerified === true && targetEmail);

    if (!targetEmail || !verified) {
      return { accepted: 0, email: targetEmail, verified: false };
    }

    const userId = workosUserId;
    return await ctx.runMutation(internal.access.acceptPendingInvitesForUser, {
      userId,
      email: targetEmail,
      displayName: workosUser.displayName ?? identity.name ?? targetEmail,
    });
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
      .filter((q) => q.or(
        ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
        ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
        ...(identity.name?.trim() ? [q.eq(q.field("displayName"), identity.name.trim())] : []),
      ))
      .filter((q) => q.eq(q.field("isActive"), true))
      .take(200);

    const consultantRecord = await getActiveConsultantRecord(ctx, identity);
    const isConsultant = Boolean(consultantRecord);
    const primaryMembership = memberships[0] ?? null;
    const vendorMembership = memberships.find((member) => member.role === "vendor") ?? null;
    const role = isConsultant ? "vs-consultant" : primaryMembership?.role ?? null;

    const visibleCompanyIds = new Set<Id<"companies">>();
    for (const member of memberships) {
      const company = (await ctx.db.get(member.companyId)) as { _id: Id<"companies">; isActive?: boolean } | null;
      if (company && company.isActive !== false) {
        visibleCompanyIds.add(member.companyId);
      }
    }

    let companyIds: Id<"companies">[] = Array.from(visibleCompanyIds);
    if (isConsultant) {
      const allCompanies = await ctx.db.query("companies").collect();
      companyIds = allCompanies.filter((company) => company.isActive !== false).map((company) => company._id);
    }

    return {
      email: identity.email ?? memberships[0]?.email ?? consultantRecord?.email ?? null,
      displayName: identity.name ?? memberships[0]?.displayName ?? consultantRecord?.displayName ?? null,
      tokenIdentifier: identity.tokenIdentifier,
      subject: identity.subject,
      role,
      isConsultant,
      isVendor: Boolean(vendorMembership),
      vendorId: vendorMembership?.vendorId ?? null,
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
      .filter((q) => q.or(
        ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
        ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
        ...(identity.name?.trim() ? [q.eq(q.field("displayName"), identity.name.trim())] : []),
      ))
      .filter((q) => q.eq(q.field("isActive"), true))
      .take(200);

    const consultantRecord = await getActiveConsultantRecord(ctx, identity);
    if (consultantRecord) {
      const companies = await ctx.db.query("companies").collect();
      return companies.filter((company) => company.isActive !== false);
    }

    const dedupedCompanyIds = new Set(memberships.map((item) => item.companyId));
    if (dedupedCompanyIds.size === 0) {
      return [] as const;
    }

    const companies = await Promise.all(
      Array.from(dedupedCompanyIds).map((id) => ctx.db.get(id) as Promise<{ _id: Id<"companies">; name: string; isActive?: boolean } | null>),
    );

    return companies.filter((company): company is { _id: Id<"companies">; name: string; isActive?: boolean } => company !== null && company.isActive !== false);
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
    const membership = await findActiveCompanyMembershipsForIdentity(ctx, args.companyId, identity).then((members) => members[0] ?? null);

    if (membership) {
      return company;
    }

    const consultantMembership = await getActiveConsultantRecord(ctx, identity);
    const hasLegacyConsultantMembership = consultantMembership && "companyId" in consultantMembership
      ? consultantMembership.companyId === args.companyId
      : false;

    if (!consultantMembership && !hasLegacyConsultantMembership) {
      throw new Error("Company access denied");
    }

    return company;
  },
});

async function findActiveCompanyMembershipsForIdentity(
  ctx: any,
  companyId: Id<"companies">,
  identity: { subject?: string; tokenIdentifier?: string; email?: string; name?: string | null },
) {
  const userIds = getIdentityUserIds(identity);
  const normalizedEmail = identity.email?.trim().toLowerCase();
  const normalizedDisplayName = identity.name?.trim();

  return await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(normalizedEmail ? [q.eq(q.field("email"), normalizedEmail)] : []),
      ...(normalizedDisplayName ? [q.eq(q.field("displayName"), normalizedDisplayName)] : []),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();
}

async function getAccessibleProjectIdsForUser(
  ctx: any,
  companyId: Id<"companies">,
  userIds: string[],
  identity?: { subject?: string; tokenIdentifier?: string; email?: string; name?: string | null },
) {
  const allowedProjectIds = new Set<Id<"projects">>();
  const identityMatches = identity ? await findActiveCompanyMembershipsForIdentity(ctx, companyId, identity) : [];
  const candidateUserIds = new Set<string>([...userIds, ...identityMatches.map((member: { userId: string }) => member.userId)]);
  const candidateDisplayNames = new Set<string>([
    ...identityMatches.map((member: { displayName: string }) => member.displayName.trim()).filter(Boolean),
    ...(identity?.name?.trim() ? [identity.name.trim()] : []),
  ]);

  const directMemberships = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.or(
      ...Array.from(candidateUserIds).map((userId) => q.eq(q.field("userId"), userId)),
      ...Array.from(candidateDisplayNames).map((displayName) => q.eq(q.field("displayName"), displayName)),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();

  for (const membership of directMemberships) {
    allowedProjectIds.add(membership.projectId);
  }

  const departmentMemberships = await ctx.db
    .query("departmentMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.or(
      ...Array.from(candidateUserIds).map((userId) => q.eq(q.field("userId"), userId)),
      ...(identity?.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
      ...(identity?.name?.trim() ? [q.eq(q.field("displayName"), identity.name.trim())] : []),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();

  if (departmentMemberships.length > 0) {
    const departmentIds = departmentMemberships.map((member: { departmentId: Id<"workspaceDepartments"> }) => member.departmentId);
    const departmentProjectMemberships = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("companyId"), companyId))
      .filter((q: any) => q.or(...departmentIds.map((departmentId: Id<"workspaceDepartments">) => q.eq(q.field("departmentId"), departmentId))))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    for (const membership of departmentProjectMemberships) {
      allowedProjectIds.add(membership.projectId);
    }

    if (departmentProjectMemberships.length === 0) {
      const departmentNames = new Set<string>();
      for (const departmentId of departmentIds) {
        const department = await ctx.db.get(departmentId);
        if (department && department.isActive !== false) {
          departmentNames.add(department.name);
        }
      }

      const fallbackAssignments = await ctx.db
        .query("projectMembers")
        .filter((q: any) => q.eq(q.field("companyId"), companyId))
        .filter((q: any) => q.eq(q.field("role"), "company-scorer"))
        .filter((q: any) => q.eq(q.field("isActive"), true))
        .collect();

      for (const membership of fallbackAssignments) {
        if (membership.departmentName && departmentNames.has(membership.departmentName)) {
          allowedProjectIds.add(membership.projectId);
        }
      }
    }
  }

  return allowedProjectIds;
}

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
    const allowedProjectIds = await getAccessibleProjectIdsForUser(ctx, project.companyId, userIds, identity);
    if (allowedProjectIds.has(args.projectId)) {
      return project;
    }

    const companyMembership = await findActiveCompanyMembershipsForIdentity(ctx, project.companyId, identity).then((members) => members[0] ?? null);

    if (companyMembership && companyMembership.role === "company-admin") {
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
    const memberships = await findActiveCompanyMembershipsForIdentity(ctx, args.companyId, identity);

    const consultantMembership = await getActiveConsultantRecord(ctx, identity);

    if (memberships.length === 0 && !consultantMembership) {
      throw new Error("Company access denied");
    }

    if (consultantMembership || memberships.some((member: { role: string }) => member.role === "company-admin")) {
      return await ctx.db
        .query("projects")
        .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
        .collect();
    }

    const allowedProjectIds = await getAccessibleProjectIdsForUser(ctx, args.companyId, userIds, identity);
    const companyProjects = await ctx.db
      .query("projects")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    return companyProjects.filter((project) => allowedProjectIds.has(project._id));
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

