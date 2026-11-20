import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { findProjectVendorByUserId, getProjectVendors } from "./projectVendors";
import { getScorerDisplayNames, resolveScorerDisplayName } from "./scorerNames";

const projectViewValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.string(),
  viewText: v.string(),
});

const listProjectViewsValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.optional(v.string()),
});

function getIdentityUserIds(identity: { subject?: string; tokenIdentifier?: string }) {
  return Array.from(new Set([identity.subject, identity.tokenIdentifier].filter((value): value is string => Boolean(value))));
}

async function resolveScorerDepartmentSnapshot(ctx: any, companyId: Id<"companies">, scorerUserId: string) {
  const companyMember = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.eq(q.field("userId"), scorerUserId))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();

  if (!companyMember?.departmentId) {
    throw new Error("Assign this scorer to a department before they save scorer views.");
  }

  const department = await ctx.db.get(companyMember.departmentId);
  if (!department || department.companyId !== companyId || department.isActive === false) {
    throw new Error("This scorer's department is not active. Reassign their department before saving scorer views.");
  }

  return {
    scorerDepartmentId: companyMember.departmentId,
    scorerDepartmentName: department.name,
  };
}

async function assertProjectViewAccess(ctx: any, projectId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const project = await ctx.db.get(projectId as any);
  if (!project) {
    throw new Error("Project not found");
  }

  const userIds = getIdentityUserIds(identity);
  const normalizedEmail = identity.email?.trim().toLowerCase();

  const vendorMemberships = ctx.db.query("companyMembers")
    .withIndex("by_company_role", (q: any) => q.eq("companyId", project.companyId).eq("role", "vendor"));
  let hasVendorMembership = false;
  for await (const candidate of vendorMemberships) {
    if (candidate.isActive && (userIds.includes(candidate.userId)
      || (normalizedEmail && candidate.email?.trim().toLowerCase() === normalizedEmail))) {
      hasVendorMembership = true;
      break;
    }
  }
  if (hasVendorMembership) {
    const vendors = await getProjectVendors(ctx, project);
    const contact = vendors.flatMap((vendor) => vendor.contacts).find((candidate) => userIds.includes(candidate.userId));
    if (contact) {
      return { project, identity, member: { ...contact, role: "vendor" as const }, consultant: null, actorUserId: contact.userId };
    }
    throw new Error("Project access denied");
  }

  const member = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), projectId))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
    ))
    .first();

  const consultant = await ctx.db
    .query("consultants")
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(normalizedEmail ? [q.eq(q.field("email"), normalizedEmail)] : []),
    ))
    .first();

  if ((!member || member.role === "vendor") && !consultant) {
    const vendors = await getProjectVendors(ctx, project);
    const contact = vendors.flatMap((vendor) => vendor.contacts).find((candidate) => userIds.includes(candidate.userId));
    if (contact) {
      return { project, identity, member: { ...contact, role: "vendor" as const }, consultant, actorUserId: contact.userId };
    }
    throw new Error("Project access denied");
  }

  if (member && member.companyId !== project.companyId) {
    throw new Error("Project access denied");
  }

  const actorUserId = identity.subject ?? identity.tokenIdentifier ?? member?.userId ?? consultant?.userId ?? "system";

  return { project, identity, member, consultant, actorUserId };
}

export const listProjectViews = query({
  args: listProjectViewsValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        projectId: args.projectId,
        vendorUserId: args.vendorUserId ?? null,
        canViewAll: false,
        peerVisibilityEnabled: false,
        peerViewsUnlocked: false,
        rows: [] as const,
      };
    }

    const { member, project } = await assertProjectViewAccess(ctx, args.projectId);

    if (member?.role === "vendor") {
      return {
        projectId: args.projectId,
        vendorUserId: args.vendorUserId ?? null,
        canViewAll: false,
        peerVisibilityEnabled: false,
        peerViewsUnlocked: false,
        rows: [] as const,
      };
    }

    const rows = args.vendorUserId
      ? await ctx.db
          .query("projectViews")
          .withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", args.vendorUserId as string))
          .take(200)
      : await ctx.db
          .query("projectViews")
          .withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId))
          .take(500);

    const scorerNameByUserId = await getScorerDisplayNames(ctx, project, rows.map((row) => row.scorerUserId));

    const requesterUserId = member?.userId ?? identity.tokenIdentifier ?? identity.subject ?? "";
    let peerViewsUnlocked = false;
    if (member?.role === "company-scorer" && requesterUserId && args.vendorUserId) {
      const completion = await ctx.db
        .query("scorerCompletions")
        .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", args.vendorUserId as string).eq("scorerScopeKey", `individual:${requesterUserId}`))
        .first();
      peerViewsUnlocked = completion?.status === "completed";
    }

    const canViewAll = Boolean(member?.role === "company-admin" || !member);
    const peerVisibilityEnabled = Boolean(project.scorerCanSeePeerScores);

    const visibleRows = member?.role === "company-scorer"
      ? rows.filter((row) => row.scorerUserId === requesterUserId || (peerVisibilityEnabled && peerViewsUnlocked))
      : rows;

    const orderedRows = visibleRows
      .slice()
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));

    return {
      projectId: args.projectId,
      vendorUserId: args.vendorUserId ?? null,
      canViewAll,
      peerVisibilityEnabled,
      peerViewsUnlocked,
      rows: orderedRows.map((row) => ({
        _id: row._id,
        projectId: row.projectId,
        scorerUserId: row.scorerUserId,
        scorerDisplayName: resolveScorerDisplayName({ enteredByUserId: row.scorerUserId, displayNameByUserId: scorerNameByUserId }),
        isOwnView: row.scorerUserId === requesterUserId,
        vendorUserId: row.vendorUserId,
        viewText: row.viewText,
        scorerDepartmentId: row.scorerDepartmentId ?? null,
        scorerDepartmentName: row.scorerDepartmentName ?? "No department recorded",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt ?? row.createdAt,
      })),
    };
  },
});

export const saveProjectView = mutation({
  args: projectViewValidator,
  handler: async (ctx, args) => {
    const { identity, member, project, actorUserId } = await assertProjectViewAccess(ctx, args.projectId);

    if (!member || member.role !== "company-scorer") {
      throw new Error("Only assigned scorers can save scorer views.");
    }

    const now = Date.now();
    if (typeof project.scorerDeadline === "number" && project.scorerDeadline <= now) {
      throw new Error("Scorer deadline has passed. Reopen the deadline before editing scorer views.");
    }

    const vendors = await getProjectVendors(ctx, project);
    const vendor = findProjectVendorByUserId(vendors, args.vendorUserId);
    if (!vendor) {
      throw new Error("Vendor not found on this project");
    }
    const vendorContact = vendor.contacts.find((contact) => contact.userId === args.vendorUserId)!;

    const scorerDepartmentSnapshot = await resolveScorerDepartmentSnapshot(ctx, project.companyId, member.userId);
    const normalizedViewText = args.viewText.trim();

    const existing = await ctx.db
      .query("projectViews")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("scorerUserId"), member.userId))
      .filter((q: any) => q.eq(q.field("vendorUserId"), args.vendorUserId))
      .first();

    const row = {
      companyId: project.companyId,
      projectId: args.projectId,
      scorerUserId: member.userId,
      vendorUserId: args.vendorUserId,
      viewText: normalizedViewText,
      scorerDepartmentId: scorerDepartmentSnapshot.scorerDepartmentId,
      scorerDepartmentName: scorerDepartmentSnapshot.scorerDepartmentName,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, row);
      await ctx.db.insert("activityLogs", {
        actorUserId,
        actorEmail: identity.email,
        action: "save_scorer_view",
        details: `${member.displayName} updated scorer views for ${vendorContact.displayName}.`,
        workspaceName: "workspace",
        companyId: project.companyId,
        projectId: args.projectId,
        createdAt: now,
      });
      return { ...row, updated: true };
    }

    await ctx.db.insert("projectViews", row);
    await ctx.db.insert("activityLogs", {
      actorUserId,
      actorEmail: identity.email,
      action: "save_scorer_view",
      details: `${member.displayName} added scorer views for ${vendorContact.displayName}.`,
      workspaceName: "workspace",
      companyId: project.companyId,
      projectId: args.projectId,
      createdAt: now,
    });
    return { ...row, updated: false };
  },
});
