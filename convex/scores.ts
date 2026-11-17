import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const scoreRowValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.string(),
  requirementId: v.string(),
  score: v.union(v.literal(0), v.literal(1)),
  comment: v.optional(v.string()),
});

const scoreAmendmentValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.string(),
  requirementId: v.string(),
  score: v.union(v.literal(0), v.literal(1)),
  reason: v.string(),
});

async function getProjectDeadlineForVendor(ctx: any, projectId: string, vendorUserId: string) {
  return await ctx.db
    .query("projectDeadlines")
    .filter((q: any) => q.eq(q.field("projectId"), projectId))
    .filter((q: any) => q.eq(q.field("targetType"), "vendor"))
    .filter((q: any) => q.eq(q.field("targetUserId"), vendorUserId))
    .first();
}

function isDeadlineLocked(deadline: { status?: string; dueAt?: number } | null, now = Date.now()) {
  if (!deadline) {
    return false;
  }

  return deadline.status === "submitted" || (typeof deadline.dueAt === "number" && deadline.dueAt <= now);
}

function isAllowedAdminOrConsultant(ctx: any, identity: any, companyId: string) {
  const userIds = [identity.subject, identity.tokenIdentifier].filter(Boolean) as string[];
  const normalizedEmail = identity.email?.trim().toLowerCase();
  const normalizedName = identity.name?.trim();

  return ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(normalizedEmail ? [q.eq(q.field("email"), normalizedEmail)] : []),
      ...(normalizedName ? [q.eq(q.field("displayName"), normalizedName)] : []),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.eq(q.field("role"), "company-admin"))
    .first()
    .then((member: any) => Boolean(member));
}

async function assertScoringAccess(ctx: any, projectId: string): Promise<{ project: any; identity: any; member: any }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const project: any = await ctx.db.get(projectId as any);
  if (!project) {
    throw new Error("Project not found");
  }

  const member = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), projectId))
    .filter((q: any) => q.eq(q.field("userId"), identity.tokenIdentifier))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();

  if (!member || (member.role !== "company-admin" && member.role !== "company-scorer" && member.role !== "vendor")) {
    throw new Error("Project access denied");
  }

  if (member.companyId !== project.companyId) {
    throw new Error("Project access denied");
  }

  return { project, identity, member };
}

export const listScoreHistory = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [] as const;
    }

    await assertScoringAccess(ctx, args.projectId);

    const rows = await ctx.db
      .query("scores")
      .withIndex("by_project_requirement", (q) => q.eq("projectId", args.projectId))
      .take(200);

    return rows.map((row) => ({
      _id: row._id,
      projectId: row.projectId,
      vendorUserId: row.vendorUserId,
      requirementId: row.requirementId,
      score: row.score,
      comment: row.comment,
      enteredBy: row.enteredBy,
      enteredAt: row.enteredAt,
      amendedByUserId: row.amendedByUserId,
      amendedByDisplayName: row.amendedByDisplayName,
      amendedAt: row.amendedAt,
      amendmentReason: row.amendmentReason,
    }));
  },
});

export const getVendorScoringStatus = query({
  args: {
    projectId: v.id("projects"),
    vendorUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const { member, project }: { member: any; project: any } = await assertScoringAccess(ctx, args.projectId);
    if (member.role === "vendor" && member.userId !== args.vendorUserId) {
      throw new Error("Vendor can only view their own scoring status");
    }

    const activeRequirements = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .collect();

    const eligibleRequirements = activeRequirements.filter((row) => row.status === "active" && row.priority !== 0);
    const answeredRows = await ctx.db
      .query("scores")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("vendorUserId"), args.vendorUserId))
      .collect();

    const answeredIds = new Set(answeredRows.map((row) => row.requirementId));
    const answeredCount = eligibleRequirements.filter((row) => answeredIds.has(row.requirementId)).length;
    const deadline = await getProjectDeadlineForVendor(ctx, args.projectId, args.vendorUserId);
    const hasSubmitted = deadline?.status === "submitted";

    let status: "not-started" | "in-progress" | "submitted" = "not-started";
    if (hasSubmitted) {
      status = "submitted";
    } else if (answeredCount > 0) {
      status = "in-progress";
    }

    return {
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      status,
      answeredCount,
      totalRequirements: eligibleRequirements.length,
      submittedAt: deadline?.submittedAt ?? null,
      deadlineAt: deadline?.dueAt ?? null,
    };
  },
});

export const submitScore = mutation({
  args: scoreRowValidator,
  handler: async (ctx, args) => {
    const { project, identity, member }: { project: any; identity: any; member: any } = await assertScoringAccess(ctx, args.projectId);

    if (member.role === "vendor") {
      if (member.userId !== args.vendorUserId) {
        throw new Error("Vendor can only score their own submission");
      }

      const deadline = await getProjectDeadlineForVendor(ctx, args.projectId, args.vendorUserId);
      if (isDeadlineLocked(deadline)) {
        throw new Error("Vendor scoring is locked after the deadline");
      }
    }

    const requirement = await ctx.db
      .query("requirements")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("requirementId"), args.requirementId))
      .first();

    if (!requirement) {
      throw new Error("Requirement not found in project");
    }

    if (requirement.status === "withdrawn" || requirement.priority === 0) {
      throw new Error("This requirement is not active for scoring");
    }

    const existing = await ctx.db
      .query("scores")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("vendorUserId"), args.vendorUserId))
      .filter((q: any) => q.eq(q.field("requirementId"), args.requirementId))
      .first();

    const now = Date.now();
    const scoreRecord = {
      companyId: project.companyId,
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      requirementId: args.requirementId,
      score: args.score,
      comment: args.comment,
      enteredBy: identity.tokenIdentifier,
      enteredAt: now,
      amendedByUserId: existing?.amendedByUserId,
      amendedByDisplayName: existing?.amendedByDisplayName,
      amendedAt: existing?.amendedAt,
      amendmentReason: existing?.amendmentReason,
    };

    if (existing) {
      await ctx.db.patch(existing._id, scoreRecord);
      return { ...scoreRecord, updated: true };
    }

    await ctx.db.insert("scores", scoreRecord);
    return { ...scoreRecord, updated: false };
  },
});

export const listScoreAmendments = query({
  args: {
    projectId: v.id("projects"),
    vendorUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [] as const;
    }

    const { member, project }: { member: any; project: any } = await assertScoringAccess(ctx, args.projectId);
    const isAdmin = member.role === "company-admin" || member.role === "company-scorer" || Boolean(await ctx.db
      .query("consultants")
      .filter((q: any) => q.eq(q.field("userId"), member.userId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first());

    if (!isAdmin && member.role === "vendor" && member.userId !== args.vendorUserId) {
      throw new Error("Project access denied");
    }

    const rows = await ctx.db
      .query("scoreAmendments")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("vendorUserId"), args.vendorUserId))
      .collect();

    return rows
      .filter((row) => row.companyId === project.companyId)
      .map((row) => ({
        _id: row._id,
        projectId: row.projectId,
        vendorUserId: row.vendorUserId,
        requirementId: row.requirementId,
        originalScore: row.originalScore,
        newScore: row.newScore,
        amendedByUserId: row.amendedByUserId,
        amendedByDisplayName: row.amendedByDisplayName,
        reason: row.reason,
        amendedAt: row.amendedAt,
      }));
  },
});

export const amendVendorScore = mutation({
  args: scoreAmendmentValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const project: any = await ctx.db.get(args.projectId as any);
    if (!project) {
      throw new Error("Project not found");
    }

    const userIds = [identity.subject, identity.tokenIdentifier].filter(Boolean) as string[];
    const projectMember = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.or(
        ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
        ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
      ))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    const companyMember = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
      .filter((q: any) => q.or(
        ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
        ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
      ))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    const consultant = await ctx.db
      .query("consultants")
      .filter((q: any) => q.or(
        ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
        ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
      ))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    const isAdmin = Boolean(
      consultant ||
      (projectMember && projectMember.role === "company-admin") ||
      (companyMember && companyMember.role === "company-admin"),
    );

    if (!isAdmin) {
      throw new Error("Only consultants and company admins can amend vendor scores");
    }

    const deadline = await getProjectDeadlineForVendor(ctx, args.projectId, args.vendorUserId);
    if (!isDeadlineLocked(deadline)) {
      throw new Error("Vendor score amendments are only allowed after the deadline");
    }

    const requirement = await ctx.db
      .query("requirements")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("requirementId"), args.requirementId))
      .first();

    if (!requirement) {
      throw new Error("Requirement not found in project");
    }

    const existing = await ctx.db
      .query("scores")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("vendorUserId"), args.vendorUserId))
      .filter((q: any) => q.eq(q.field("requirementId"), args.requirementId))
      .first();

    if (!existing) {
      throw new Error("No vendor score found for this requirement");
    }

    const reason = args.reason.trim();
    if (!reason) {
      throw new Error("A reason is required to amend a vendor score");
    }

    const amendedByDisplayName = identity.name?.trim() || companyMember?.displayName || projectMember?.displayName || "Admin";
    const amendmentRecord = {
      companyId: project.companyId,
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      requirementId: args.requirementId,
      originalScore: existing.score,
      newScore: args.score,
      amendedByUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      amendedByDisplayName,
      reason,
      amendedAt: Date.now(),
    };

    await ctx.db.insert("scoreAmendments", amendmentRecord);
    await ctx.db.patch(existing._id, {
      score: args.score,
      amendedByUserId: amendmentRecord.amendedByUserId,
      amendedByDisplayName: amendmentRecord.amendedByDisplayName,
      amendedAt: amendmentRecord.amendedAt,
      amendmentReason: amendmentRecord.reason,
    });

    return {
      _id: existing._id,
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      requirementId: args.requirementId,
      originalScore: existing.score,
      newScore: args.score,
      amendedByDisplayName,
      amendedAt: amendmentRecord.amendedAt,
      reason,
    };
  },
});
