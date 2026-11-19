import { query, mutation, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getProjectVendors } from "./projectVendors";

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

    const ensureVendorOrganization = async (companyId: any, name: string, contactEmail?: string) => {
      const existing = await ctx.db
        .query("vendorOrganizations")
        .filter((q) => q.eq(q.field("companyId"), companyId))
        .filter((q) => q.eq(q.field("name"), name))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          contactEmail: contactEmail ?? existing.contactEmail,
          status: "active",
          updatedAt: Date.now(),
          isTestData: true,
        });
        return existing._id;
      }

      const vendorId = await ctx.db.insert("vendorOrganizations", {
        companyId,
        name,
        contactEmail,
        status: "active",
        createdByUserId: "seed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isTestData: true,
      });
      return vendorId;
    };

    const ensureDepartment = async (companyId: any, name: string) => {
      const existing = await ctx.db
        .query("workspaceDepartments")
        .filter((q) => q.eq(q.field("companyId"), companyId))
        .filter((q) => q.eq(q.field("name"), name))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { isActive: true, isTestData: true });
        return existing._id;
      }

      return await ctx.db.insert("workspaceDepartments", {
        companyId,
        name,
        createdByUserId: "seed",
        createdAt: Date.now(),
        isActive: true,
        isTestData: true,
      });
    };

    const ensureCompanyMember = async (companyId: any, userId: string, email: string, displayName: string, role: "company-admin" | "company-scorer" | "vendor", vendorId?: any, departmentId?: any) => {
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
          departmentId: departmentId ?? existing.departmentId,
          vendorId: vendorId ?? existing.vendorId,
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
        departmentId,
        vendorId,
        isActive: true,
        createdAt: Date.now(),
        isTestData: true,
      });
      return memberId;
    };

    const ensureDepartmentMember = async (companyId: any, departmentId: any, userId: string, email: string, displayName: string, role: "company-admin" | "company-scorer") => {
      const existing = await ctx.db
        .query("departmentMembers")
        .filter((q) => q.eq(q.field("companyId"), companyId))
        .filter((q) => q.eq(q.field("userId"), userId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          departmentId,
          email,
          displayName,
          role,
          isActive: true,
        });
        return;
      }

      await ctx.db.insert("departmentMembers", {
        companyId,
        departmentId,
        userId,
        email,
        displayName,
        role,
        createdAt: Date.now(),
        isActive: true,
      });
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

    const companyAGeneralDepartmentId = await ensureDepartment(companyA._id, "General");
    const companyBGeneralDepartmentId = await ensureDepartment(companyB._id, "General");
    const companyCGeneralDepartmentId = await ensureDepartment(companyC._id, "General");

    await ensureCompanyMember(companyA._id, "acme-admin", "acme-admin@acme.example", "ACME Admin", "company-admin", undefined, companyAGeneralDepartmentId);
    await ensureDepartmentMember(companyA._id, companyAGeneralDepartmentId, "acme-admin", "acme-admin@acme.example", "ACME Admin", "company-admin");
    await ensureProjectMember(companyA._id, companyAProjectId, "acme-admin", "company-admin", "ACME Admin");

    await ensureCompanyMember(companyB._id, "beta-admin", "admin@beta.example", "Beta Admin", "company-admin", undefined, companyBGeneralDepartmentId);
    await ensureDepartmentMember(companyB._id, companyBGeneralDepartmentId, "beta-admin", "admin@beta.example", "Beta Admin", "company-admin");
    await ensureProjectMember(companyB._id, companyBProjectId, "beta-admin", "company-admin", "Beta Admin");

    await ensureCompanyMember(companyB._id, "beta-scorer", "scorer@beta.example", "Beta Scorer", "company-scorer", undefined, companyBGeneralDepartmentId);
    await ensureDepartmentMember(companyB._id, companyBGeneralDepartmentId, "beta-scorer", "scorer@beta.example", "Beta Scorer", "company-scorer");
    await ensureProjectMember(companyB._id, companyBProjectId, "beta-scorer", "company-scorer", "Beta Scorer");

    const northwindVendorId = await ensureVendorOrganization(companyB._id, "Northwind Labs", "vendor@northwind.example");
    await ensureCompanyMember(companyB._id, "northwind-vendor", "vendor@northwind.example", "Northwind Labs", "vendor", northwindVendorId);
    await ensureProjectMember(companyB._id, companyBProjectId, "northwind-vendor", "vendor", "Northwind Labs");
    await ctx.db.insert("projectVendors", {
      companyId: companyB._id,
      projectId: companyBProjectId,
      vendorId: northwindVendorId,
      createdAt: Date.now(),
      isTestData: true,
    });

    await ensureCompanyMember(companyC._id, "frazer-knight-admin", "frazerknight@hotmail.com", "Frazer Knight", "company-admin", undefined, companyCGeneralDepartmentId);
    await ensureDepartmentMember(companyC._id, companyCGeneralDepartmentId, "frazer-knight-admin", "frazerknight@hotmail.com", "Frazer Knight", "company-admin");

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
      const inviteNeedsDepartment = invite.role === "company-admin" || invite.role === "company-scorer";
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

      if (inviteNeedsDepartment && !invite.departmentId) {
        throw new Error("This invite is missing a department. Ask a workspace admin to re-send the invite with a department.");
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
      const hasMatchingDepartment = inviteNeedsDepartment
        ? existingMemberships.some((membership) => membership.departmentId === invite.departmentId)
        : true;

      if (canonicalMembership && canonicalMembership.isActive && hasMatchingVendorMembership && hasMatchingDepartment) {
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
          departmentId: inviteNeedsDepartment ? invite.departmentId : undefined,
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
          departmentId: inviteNeedsDepartment ? invite.departmentId : undefined,
          vendorId: invite.vendorId,
          isActive: true,
          createdAt: Date.now(),
          isTestData: invite.isTestData ?? false,
        });
      }

      if (inviteNeedsDepartment && invite.departmentId) {
        const activeAssignments = await ctx.db
          .query("departmentMembers")
          .filter((q: any) => q.eq(q.field("companyId"), invite.companyId))
          .filter((q: any) => q.eq(q.field("userId"), args.userId))
          .collect();

        for (const assignment of activeAssignments) {
          await ctx.db.patch(assignment._id, {
            isActive: assignment.departmentId === invite.departmentId,
            email: targetEmail,
            displayName: args.displayName ?? invite.displayName,
            role: invite.role,
          });
        }

        const hasTargetAssignment = activeAssignments.some((assignment) => assignment.departmentId === invite.departmentId);
        if (!hasTargetAssignment) {
          await ctx.db.insert("departmentMembers", {
            companyId: invite.companyId,
            departmentId: invite.departmentId,
            userId: args.userId,
            email: targetEmail,
            displayName: args.displayName ?? invite.displayName,
            role: invite.role,
            createdAt: Date.now(),
            isActive: true,
          });
        }
      } else {
        const activeAssignments = await ctx.db
          .query("departmentMembers")
          .filter((q: any) => q.eq(q.field("companyId"), invite.companyId))
          .filter((q: any) => q.eq(q.field("userId"), args.userId))
          .filter((q: any) => q.eq(q.field("isActive"), true))
          .collect();
        for (const assignment of activeAssignments) {
          await ctx.db.patch(assignment._id, { isActive: false });
        }
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

  const vendorMemberships = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.or(
      ...Array.from(candidateUserIds).map((userId) => q.eq(q.field("userId"), userId)),
      ...(identity?.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
      ...(identity?.name?.trim() ? [q.eq(q.field("displayName"), identity.name.trim())] : []),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.eq(q.field("role"), "vendor"))
    .collect();

  for (const vendorMembership of vendorMemberships) {
    if (!vendorMembership.vendorId) {
      continue;
    }

    const vendorAssignments = await ctx.db
      .query("projectVendors")
      .filter((q: any) => q.eq(q.field("companyId"), companyId))
      .filter((q: any) => q.eq(q.field("vendorId"), vendorMembership.vendorId))
      .collect();

    for (const assignment of vendorAssignments) {
      allowedProjectIds.add(assignment.projectId);
    }
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

export const listWorkspaceRequirementsSummary = query({
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

    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const allowedProjectIds = consultantMembership || memberships.some((member: { role: string }) => member.role === "company-admin")
      ? null
      : await getAccessibleProjectIdsForUser(ctx, args.companyId, userIds, identity);

    const scopedProjects = allowedProjectIds
      ? allProjects.filter((project) => allowedProjectIds.has(project._id))
      : allProjects;

    const rows = await Promise.all(scopedProjects.map(async (project) => {
      const requirements = await ctx.db
        .query("requirements")
        .withIndex("by_company_project", (q) => q.eq("companyId", args.companyId).eq("projectId", project._id))
        .collect();

      const activeCount = requirements.filter((row) => row.status === "active" && row.priority !== 0).length;
      const withdrawnCount = requirements.filter((row) => row.status === "withdrawn").length;
      const outOfScopeCount = requirements.filter((row) => row.status === "active" && row.priority === 0).length;

      return {
        projectId: project._id,
        projectName: project.name,
        activeCount,
        withdrawnCount,
        outOfScopeCount,
      };
    }));

    return rows.sort((a, b) => a.projectName.localeCompare(b.projectName));
  },
});

export const listWorkspaceScoringSummary = query({
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

    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const allowedProjectIds = consultantMembership || memberships.some((member: { role: string }) => member.role === "company-admin")
      ? null
      : await getAccessibleProjectIdsForUser(ctx, args.companyId, userIds, identity);

    const scopedProjects = allowedProjectIds
      ? allProjects.filter((project) => allowedProjectIds.has(project._id))
      : allProjects;

    const rows = await Promise.all(scopedProjects.map(async (project) => {
      const projectVendors = await getProjectVendors(ctx, project);
      const vendors = await Promise.all(projectVendors.map(async (vendor) => {
        const selectedContact = vendor.primaryContact;
        if (!selectedContact) {
          return null;
        }

        const deadline = await ctx.db
          .query("projectDeadlines")
          .withIndex("by_project_target", (q) => q.eq("projectId", project._id).eq("targetType", "vendor").eq("targetUserId", selectedContact.userId))
          .first();

        return {
          vendorUserId: selectedContact.userId,
          submitted: deadline?.status === "submitted",
        };
      }));

      const vendorRows = vendors.filter((row): row is { vendorUserId: string; submitted: boolean } => row !== null);
      const submittedVendors = vendorRows.filter((row) => row.submitted).length;

      const scopeKeys = new Set<string>();
      const scorerAssignments = await ctx.db
        .query("projectMembers")
        .filter((q: any) => q.eq(q.field("projectId"), project._id))
        .filter((q: any) => q.eq(q.field("role"), "company-scorer"))
        .filter((q: any) => q.eq(q.field("isActive"), true))
        .collect();

      for (const assignment of scorerAssignments) {
        if (assignment.departmentId || assignment.departmentName) {
          scopeKeys.add(`department:${assignment.departmentId ?? assignment.departmentName}`);
        } else {
          scopeKeys.add(`individual:${assignment.userId}`);
        }
      }

      const completionRows = await ctx.db
        .query("scorerCompletions")
        .filter((q: any) => q.eq(q.field("projectId"), project._id))
        .filter((q: any) => q.eq(q.field("status"), "completed"))
        .collect();
      const completedScorerVendorPairs = new Set(completionRows.map((row) => `${row.vendorUserId}::${row.scorerScopeKey}`));
      const totalScorerVendorPairs = scopeKeys.size * vendorRows.length;

      return {
        projectId: project._id,
        projectName: project.name,
        submittedVendors,
        totalVendors: vendorRows.length,
        completedScorerVendorPairs: completedScorerVendorPairs.size,
        totalScorerVendorPairs,
      };
    }));

    return rows.sort((a, b) => a.projectName.localeCompare(b.projectName));
  },
});

export const listDashboardProjects = query({
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

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    if (consultantMembership || memberships.some((member: { role: string }) => member.role === "company-admin")) {
      return projects;
    }

    const allowedProjectIds = await getAccessibleProjectIdsForUser(ctx, args.companyId, userIds, identity);
    return projects.filter((project) => allowedProjectIds.has(project._id));
  },
});

export async function canViewRequirements(
  ctx: any,
  projectId: Id<"projects">,
  identity: { subject?: string; tokenIdentifier?: string; email?: string; name?: string | null },
) {
  const project = await ctx.db.get(projectId);
  if (!project) {
    return { allowed: false, visibility: null as "full" | "scorer" | "vendor" | null };
  }

  const userIds = getIdentityUserIds(identity);
  const projectMembership = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), projectId))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("displayName"), identity.name?.trim() ?? identity.email.trim().toLowerCase())] : []),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();

  const companyMembership = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
      ...(identity.name?.trim() ? [q.eq(q.field("displayName"), identity.name.trim())] : []),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();

  const consultantMembership = await getActiveConsultantRecord(ctx, identity);

  if (consultantMembership) {
    return { allowed: true, visibility: "full" as const };
  }

  if (companyMembership && companyMembership.role === "company-admin") {
    return { allowed: true, visibility: "full" as const };
  }

  if (projectMembership && projectMembership.role === "company-admin") {
    return { allowed: true, visibility: "full" as const };
  }

  if (projectMembership && projectMembership.role === "company-scorer") {
    return { allowed: true, visibility: "scorer" as const };
  }

  if (projectMembership && projectMembership.role === "vendor") {
    return { allowed: true, visibility: "vendor" as const };
  }

  const vendorCompanyMembership = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
      ...(identity.name?.trim() ? [q.eq(q.field("displayName"), identity.name.trim())] : []),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.eq(q.field("role"), "vendor"))
    .first();

  if (vendorCompanyMembership && vendorCompanyMembership.vendorId) {
    const vendorAssignment = await ctx.db
      .query("projectVendors")
      .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
      .filter((q: any) => q.eq(q.field("projectId"), projectId))
      .filter((q: any) => q.eq(q.field("vendorId"), vendorCompanyMembership.vendorId))
      .first();

    if (vendorAssignment) {
      return { allowed: true, visibility: "vendor" as const };
    }
  }

  return { allowed: false, visibility: null };
}

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

    const permission = await canViewRequirements(ctx, args.projectId, identity);
    if (!permission.allowed || !permission.visibility) {
      throw new Error("Project access denied");
    }

    const rows = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .collect();

    return rows.map((row) => {
      if (permission.visibility === "full") {
        return {
          ...row,
          requirementId: row.requirementId,
          text: row.text,
          type: row.type,
          priority: row.priority,
          status: row.status,
        };
      }

      if (permission.visibility === "scorer") {
        return {
          ...row,
          requirementId: row.requirementId,
          text: row.text,
          type: row.type,
          status: row.status,
          priority: undefined,
        };
      }

      return {
        ...row,
        requirementId: row.requirementId,
        text: row.text,
        status: row.status,
        type: undefined,
        priority: undefined,
      };
    });
  },
});

