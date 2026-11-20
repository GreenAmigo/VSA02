import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { findProjectVendorByUserId, findVendorMembershipForIdentity, getProjectVendors, resolveProjectVendorContact } from "./projectVendors";
import { getScorerDisplayNames, getWorkspacePersonName, personDisplayName, recordedPersonName, resolveScorerDisplayName } from "./scorerNames";

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
  comment: v.optional(v.string()),
  reason: v.string(),
});

const vendorResponseReviewValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.string(),
});

const requirementComparisonValidator = v.object({
  projectId: v.id("projects"),
});

const reopenVendorAnswersValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.string(),
  dueAt: v.number(),
});

const vendorAnswerValidator = v.object({
  projectId: v.id("projects"),
  requirementId: v.string(),
  score: v.union(v.literal(0), v.literal(1)),
  comment: v.optional(v.string()),
});

const vendorSubmitValidator = v.object({
  projectId: v.id("projects"),
  confirm: v.boolean(),
});

const scorerWorkboardValidator = v.object({
  projectId: v.id("projects"),
  scopeKey: v.optional(v.string()),
});

const scorerVendorGridValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.string(),
  scopeKey: v.optional(v.string()),
});

const scorerScoreValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.string(),
  requirementId: v.string(),
  score: v.union(v.literal(0), v.literal(1)),
  comment: v.optional(v.string()),
  scopeKey: v.optional(v.string()),
});

const completeScorerVendorValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.string(),
  scopeKey: v.optional(v.string()),
});

const reopenScorerVendorValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.string(),
  scopeKey: v.optional(v.string()),
});

const backfillScorerSnapshotsValidator = v.object({
  projectId: v.optional(v.id("projects")),
});

const clearProjectScorerDataValidator = v.object({
  projectId: v.id("projects"),
});

function getIdentityUserIds(identity: { subject?: string; tokenIdentifier?: string }) {
  return Array.from(new Set([identity.subject, identity.tokenIdentifier].filter((value): value is string => Boolean(value))));
}

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

  return typeof deadline.dueAt === "number" && deadline.dueAt <= now;
}

function getEffectiveVendorDueAt(project: { vendorDeadline?: number | null }, deadline: { dueAt?: number } | null) {
  if (typeof deadline?.dueAt === "number") {
    return deadline.dueAt;
  }

  return typeof project.vendorDeadline === "number" ? project.vendorDeadline : null;
}

async function recordActivity(
  ctx: any,
  payload: {
    actorUserId: string;
    actorEmail?: string;
    action: string;
    details: string;
    companyId: string;
    projectId: string;
  },
) {
  await ctx.db.insert("activityLogs", {
    actorUserId: payload.actorUserId,
    actorEmail: payload.actorEmail,
    action: payload.action,
    details: payload.details,
    workspaceName: "workspace",
    companyId: payload.companyId,
    projectId: payload.projectId,
    createdAt: Date.now(),
  });
}

function isAllowedAdminOrConsultant(ctx: any, identity: any, companyId: string) {
  const userIds = [identity.subject, identity.tokenIdentifier].filter(Boolean) as string[];
  const normalizedEmail = identity.email?.trim().toLowerCase();

  return ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(normalizedEmail ? [q.eq(q.field("email"), normalizedEmail)] : []),
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

  const userIds = getIdentityUserIds(identity);
  const normalizedEmail = identity.email?.trim().toLowerCase();

  if (await findVendorMembershipForIdentity(ctx, project.companyId, identity)) {
    const contact = await resolveProjectVendorContact(ctx, project, identity);
    if (!contact) throw new Error("Project access denied");
    return {
      project, identity,
      member: { companyId: project.companyId, projectId, userId: contact.member.userId, role: "vendor", vendorId: contact.organization._id },
    };
  }

  const member = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), projectId))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
    ))
    .first();

  if (member && member.companyId === project.companyId && (member.role === "company-admin" || member.role === "company-scorer")) {
    return { project, identity, member };
  }

  const companyMemberships = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(normalizedEmail ? [q.eq(q.field("email"), normalizedEmail)] : []),
    ))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();

  const companyAdminMembership = companyMemberships.find((row: any) => row.role === "company-admin") ?? null;
  if (companyAdminMembership) {
    return {
      project,
      identity,
      member: {
        companyId: project.companyId,
        projectId,
        userId: companyAdminMembership.userId,
        role: "company-admin",
      },
    };
  }

  const consultant = await ctx.db
    .query("consultants")
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(normalizedEmail ? [q.eq(q.field("email"), normalizedEmail)] : []),
    ))
    .first();

  if (consultant) {
    return {
      project,
      identity,
      member: {
        companyId: project.companyId,
        projectId,
        userId: consultant.userId,
        role: "company-admin",
      },
    };
  }

  if (member && member.companyId !== project.companyId) {
    throw new Error("Project access denied");
  }

  throw new Error("Project access denied");
}

async function assertVendorReviewAccess(ctx: any, projectId: string): Promise<{ project: any; identity: any; actorUserId: string; actorDisplayName: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const project: any = await ctx.db.get(projectId as any);
  if (!project) {
    throw new Error("Project not found");
  }

  const userIds = getIdentityUserIds(identity);
  if (userIds.length === 0) {
    throw new Error("Only consultants and company admins can review vendor responses");
  }
  if (await findVendorMembershipForIdentity(ctx, project.companyId, identity)) {
    throw new Error("Only consultants and company admins can review vendor responses");
  }

  const companyAdmin = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
    .filter((q: any) => q.eq(q.field("role"), "company-admin"))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
    ))
    .first();

  const consultant = await ctx.db
    .query("consultants")
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
    ))
    .first();

  if (!companyAdmin && !consultant) {
    throw new Error("Only consultants and company admins can review vendor responses");
  }

  const actorUserId = companyAdmin?.userId ?? consultant?.userId ?? identity.subject ?? identity.tokenIdentifier ?? "system";
  const actorDisplayName = await getWorkspacePersonName(ctx, project.companyId, actorUserId, identity.name);

  return { project, identity, actorUserId, actorDisplayName };
}

async function resolveVendorReviewContext(ctx: any, project: any, vendorUserId: string) {
  const trimmedVendorUserId = vendorUserId.trim();
  if (!trimmedVendorUserId) {
    throw new Error("Select a vendor before opening vendor responses");
  }

  const vendor = findProjectVendorByUserId(await getProjectVendors(ctx, project), trimmedVendorUserId);
  if (!vendor) {
    throw new Error("Vendor not assigned to this project");
  }

  const contact = vendor.contacts.find((row) => row.userId === trimmedVendorUserId)!;
  return {
    vendorUserId: trimmedVendorUserId,
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    vendorDisplayName: personDisplayName(contact.displayName, contact.userId),
  };
}

async function assertScorerAccess(ctx: any, projectId: string): Promise<{ project: any; identity: any; userIds: string[] }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const project: any = await ctx.db.get(projectId as any);
  if (!project) {
    throw new Error("Project not found");
  }

  const userIds = getIdentityUserIds(identity);
  if (await findVendorMembershipForIdentity(ctx, project.companyId, identity)) {
    throw new Error("Only assigned scorers can score this project");
  }
  return { project, identity, userIds };
}

async function resolveScorerScopes(ctx: any, project: any, userIds: string[]) {
  const scopeMap = new Map<string, { scopeKey: string; scopeType: "individual" | "department"; label: string }>();

  const projectScorerMemberships = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), project._id))
    .filter((q: any) => q.eq(q.field("role"), "company-scorer"))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();

  const individualAssignments = projectScorerMemberships.filter((row: any) => userIds.includes(row.userId));

  const displayNameByUserId = await getScorerDisplayNames(ctx, project);
  for (const assignment of individualAssignments) {
    scopeMap.set(`individual:${assignment.userId}`, {
      scopeKey: `individual:${assignment.userId}`,
      scopeType: "individual",
      label: resolveScorerDisplayName({ enteredByUserId: assignment.userId, enteredByDisplayName: assignment.displayName, displayNameByUserId }),
    });
  }

  const scopes = Array.from(scopeMap.values());
  if (scopes.length === 0) {
    throw new Error("Only assigned scorers can score this project");
  }

  return scopes;
}

async function getScorerDepartmentSnapshot(ctx: any, companyId: Id<"companies">, scorerUserId: string) {
  const member = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.eq(q.field("userId"), scorerUserId))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();

  if (!member || !member.departmentId) {
    throw new Error("Assign this scorer to a department before they enter scores.");
  }

  const department = await ctx.db.get(member.departmentId);
  if (!department || department.companyId !== companyId || department.isActive === false) {
    throw new Error("This scorer's department is not active. Reassign their department before scoring.");
  }

  return {
    scorerDepartmentId: member.departmentId,
    scorerDepartmentName: department.name,
  };
}

function resolveActiveScope(scopes: Array<{ scopeKey: string; scopeType: "individual" | "department"; label: string }>, requestedScopeKey?: string) {
  if (requestedScopeKey) {
    const exact = scopes.find((scope) => scope.scopeKey === requestedScopeKey);
    if (exact) {
      return exact;
    }

    throw new Error("You can only score as yourself.");
  }

  return scopes[0];
}

function resolveScorerUserId(
  activeScope: { scopeKey: string; scopeType: "individual" | "department" },
  identity: { subject?: string; tokenIdentifier?: string },
) {
  if (activeScope.scopeType === "individual" && activeScope.scopeKey.startsWith("individual:")) {
    return activeScope.scopeKey.slice("individual:".length);
  }

  return identity.subject ?? identity.tokenIdentifier ?? "system";
}

function isProductionEnvironment(): boolean {
  const environment = (process.env.APP_ENVIRONMENT ?? "production").trim().toLowerCase();
  return environment !== "development" && environment !== "preview";
}

async function resolveMemberDepartmentSnapshot(ctx: any, companyId: Id<"companies">, scorerUserId: string) {
  const member = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), companyId))
    .filter((q: any) => q.eq(q.field("userId"), scorerUserId))
    .first();
  if (!member?.departmentId) {
    return { scorerDepartmentId: undefined, scorerDepartmentName: undefined };
  }

  const department = await ctx.db.get(member.departmentId);
  if (!department || department.companyId !== companyId) {
    return { scorerDepartmentId: undefined, scorerDepartmentName: undefined };
  }

  return {
    scorerDepartmentId: member.departmentId,
    scorerDepartmentName: department.name,
  };
}

async function listScoringRequirements(ctx: any, project: any) {
  const requirements = await ctx.db
    .query("requirements")
    .withIndex("by_company_project", (q: any) => q.eq("companyId", project.companyId).eq("projectId", project._id))
    .collect();

  return requirements
    .filter((row: any) => row.status === "active" && row.priority !== 0)
    .sort((a: any, b: any) => a.requirementId.localeCompare(b.requirementId));
}

async function listAssignedVendorUsers(ctx: any, project: any) {
  const vendors = await getProjectVendors(ctx, project);
  return vendors.flatMap((vendor) => vendor.primaryContact ? [{
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    vendorUserId: vendor.primaryContact.userId,
    vendorContactName: personDisplayName(vendor.primaryContact.displayName, vendor.primaryContact.userId),
  }] : []);
}

export const listScoreHistory = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [] as const;
    }

    const { member } = await assertScoringAccess(ctx, args.projectId);

    const rows = await ctx.db
      .query("scores")
      .withIndex("by_project_requirement", (q) => q.eq("projectId", args.projectId))
      .take(200);

    const visibleRows = member.role === "vendor"
      ? rows.filter((row) => row.vendorUserId === member.userId)
      : rows;

    return visibleRows.map((row) => ({
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

export const listVendorAnswerRequirements = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project, member } = await assertScoringAccess(ctx, args.projectId);
    if (member.role !== "vendor") {
      throw new Error("Project access denied");
    }

    const company = await ctx.db.get(project.companyId) as { name?: string } | null;
    const vendorOrganization = await ctx.db.get(member.vendorId) as { name: string } | null;
    if (!vendorOrganization) throw new Error("Vendor organisation not found in this workspace.");

    const allRequirements = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .collect();

    const visibleRequirements = allRequirements
      .filter((row) => row.status === "active" && row.priority !== 0)
      .sort((a, b) => a.requirementId.localeCompare(b.requirementId));

    const vendorScores = await ctx.db
      .query("scores")
      .withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", member.userId))
      .collect();

    const scoreByRequirementId = new Map(vendorScores.map((row) => [row.requirementId, row]));
    const amendmentNames = new Map(await Promise.all(
      [...new Set(vendorScores.map((row) => row.amendedByUserId).filter((id): id is string => Boolean(id)))]
        .map(async (id) => [id, await getWorkspacePersonName(ctx, project.companyId, id)] as const),
    ));
    const answeredCount = visibleRequirements.filter((row) => scoreByRequirementId.has(row.requirementId)).length;
    const deadline = await getProjectDeadlineForVendor(ctx, args.projectId, member.userId);
    const deadlineAt = getEffectiveVendorDueAt(project, deadline);
    const deadlineLocked = isDeadlineLocked(deadlineAt ? { dueAt: deadlineAt } : null);

    let status: "not-started" | "in-progress" | "submitted" = "not-started";
    if (deadline?.status === "submitted") {
      status = "submitted";
    } else if (answeredCount > 0) {
      status = "in-progress";
    }

    return {
      projectId: args.projectId,
      companyId: project.companyId,
      companyName: company?.name ?? "Workspace",
      projectName: project.name,
      projectDescription: project.description ?? null,
      vendorOrganizationName: vendorOrganization.name,
      vendorUserId: member.userId,
      deadlineAt,
      deadlineLocked,
      submittedAt: deadline?.submittedAt ?? null,
      status,
      answeredCount,
      totalRequirements: visibleRequirements.length,
      rows: visibleRequirements.map((requirement) => {
        const answer = scoreByRequirementId.get(requirement.requirementId);
        return {
          requirementId: requirement.requirementId,
          text: requirement.text,
          score: answer?.score ?? null,
          comment: answer?.comment ?? "",
          enteredAt: answer?.enteredAt ?? null,
          amendedByDisplayName: answer?.amendedByUserId
            ? recordedPersonName(amendmentNames.get(answer.amendedByUserId), answer.amendedByDisplayName, answer.amendedByUserId)
            : answer?.amendedByDisplayName ? personDisplayName(answer.amendedByDisplayName) : null,
          amendedAt: answer?.amendedAt ?? null,
        };
      }),
    };
  },
});

export const saveVendorAnswer = mutation({
  args: vendorAnswerValidator,
  handler: async (ctx, args) => {
    const { project, identity, member } = await assertScoringAccess(ctx, args.projectId);
    if (member.role !== "vendor") {
      throw new Error("Project access denied");
    }

    const deadline = await getProjectDeadlineForVendor(ctx, args.projectId, member.userId);
    const effectiveDueAt = getEffectiveVendorDueAt(project, deadline);
    if (isDeadlineLocked(effectiveDueAt ? { dueAt: effectiveDueAt } : null)) {
      throw new Error("Vendor scoring is locked after the deadline");
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
      .filter((q: any) => q.eq(q.field("vendorUserId"), member.userId))
      .filter((q: any) => q.eq(q.field("requirementId"), args.requirementId))
      .first();

    const now = Date.now();
    const scoreRecord = {
      companyId: project.companyId,
      projectId: args.projectId,
      vendorUserId: member.userId,
      requirementId: args.requirementId,
      score: args.score,
      comment: args.comment?.trim() || undefined,
      enteredBy: identity.tokenIdentifier,
      enteredAt: now,
      amendedByUserId: existing?.amendedByUserId,
      amendedByDisplayName: existing?.amendedByDisplayName,
      amendedAt: existing?.amendedAt,
      amendmentReason: existing?.amendmentReason,
    };

    if (existing) {
      await ctx.db.patch(existing._id, scoreRecord);
    } else {
      await ctx.db.insert("scores", scoreRecord);
    }

    if (deadline) {
      if (deadline.status !== "submitted") {
        await ctx.db.patch(deadline._id, {
          status: "in-progress",
          updatedAt: now,
        });
      }
    } else {
      await ctx.db.insert("projectDeadlines", {
        companyId: project.companyId,
        projectId: args.projectId,
        targetType: "vendor",
        targetUserId: member.userId,
        dueAt: project.vendorDeadline ?? now,
        status: "in-progress",
        createdAt: now,
        updatedAt: now,
      });
    }

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? member.userId,
      actorEmail: identity.email ?? undefined,
      action: "vendor_score_edit",
      details: `Saved vendor score for ${args.requirementId} as ${args.score}.`,
      companyId: project.companyId,
      projectId: args.projectId,
    });

    return {
      projectId: args.projectId,
      vendorUserId: member.userId,
      requirementId: args.requirementId,
      score: args.score,
      comment: scoreRecord.comment ?? "",
      savedAt: now,
      updated: Boolean(existing),
    };
  },
});

export const submitVendorAnswers = mutation({
  args: vendorSubmitValidator,
  handler: async (ctx, args) => {
    if (!args.confirm) {
      throw new Error("Please confirm before submitting your answers");
    }

    const { project, identity, member } = await assertScoringAccess(ctx, args.projectId);
    if (member.role !== "vendor") {
      throw new Error("Project access denied");
    }

    const deadline = await getProjectDeadlineForVendor(ctx, args.projectId, member.userId);
    const effectiveDueAt = getEffectiveVendorDueAt(project, deadline);
    if (isDeadlineLocked(effectiveDueAt ? { dueAt: effectiveDueAt } : null)) {
      throw new Error("Vendor scoring is locked after the deadline");
    }

    const now = Date.now();
    if (deadline) {
      await ctx.db.patch(deadline._id, {
        status: "submitted",
        submittedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("projectDeadlines", {
        companyId: project.companyId,
        projectId: args.projectId,
        targetType: "vendor",
        targetUserId: member.userId,
        dueAt: project.vendorDeadline ?? now,
        status: "submitted",
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? member.userId,
      actorEmail: identity.email ?? undefined,
      action: "vendor_score_submit",
      details: "Submitted vendor requirement answers.",
      companyId: project.companyId,
      projectId: args.projectId,
    });

    return {
      projectId: args.projectId,
      vendorUserId: member.userId,
      submittedAt: now,
      status: "submitted" as const,
    };
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
    const deadlineAt = getEffectiveVendorDueAt(project, deadline);
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
      deadlineAt,
    };
  },
});

export const listProjectVendorResponses = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project } = await assertVendorReviewAccess(ctx, args.projectId);

    const allRequirements = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .collect();
    const totalRequirements = allRequirements.filter((row) => row.status === "active" && row.priority !== 0).length;

    const vendors = await getProjectVendors(ctx, project);
    const rows = await Promise.all(vendors.map(async (vendor) => {
      const selectedContact = vendor.primaryContact;
      const vendorUserIds = vendor.contacts.map((contact) => contact.userId);
      const scoresByVendor = await Promise.all(vendorUserIds.map((vendorUserId) =>
        ctx.db
          .query("scores")
          .withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", vendorUserId))
          .collect(),
      ));
      const answeredRequirementIds = new Set(scoresByVendor.flat().map((scoreRow) => scoreRow.requirementId));

      const deadlines = await Promise.all(vendorUserIds.map((vendorUserId) =>
        ctx.db
          .query("projectDeadlines")
          .withIndex("by_project_target", (q) => q.eq("projectId", args.projectId).eq("targetType", "vendor").eq("targetUserId", vendorUserId))
          .first(),
      ));
      const submittedRows = deadlines.filter((deadline) => deadline?.status === "submitted" && typeof deadline.submittedAt === "number");
      const submittedAt = submittedRows.length > 0 ? Math.max(...submittedRows.map((deadline) => deadline!.submittedAt as number)) : null;
      const latestDueAt = deadlines
        .map((deadline) => deadline?.dueAt)
        .filter((value): value is number => typeof value === "number")
        .sort((a, b) => b - a)[0];
      const deadlineAt = typeof latestDueAt === "number" ? latestDueAt : (project.vendorDeadline ?? null);
      const answeredCount = answeredRequirementIds.size;
      const status = submittedAt
        ? "submitted"
        : answeredCount > 0
          ? "in-progress"
          : "not-started";

      return {
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        vendorUserId: selectedContact?.userId ?? null,
        vendorContactName: selectedContact ? personDisplayName(selectedContact.displayName, selectedContact.userId) : null,
        answeredCount,
        totalRequirements,
        status,
        submittedAt,
        deadlineAt,
      };
    }));

    return rows.sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  },
});

export const getProjectScoringProgress = query({
  args: {
    projectId: v.id("projects"),
    departmentId: v.optional(v.id("workspaceDepartments")),
  },
  handler: async (ctx, args) => {
    const { project } = await assertVendorReviewAccess(ctx, args.projectId);
    const selectedDepartment = args.departmentId ? await ctx.db.get(args.departmentId) : null;
    if (args.departmentId && (!selectedDepartment || selectedDepartment.companyId !== project.companyId || selectedDepartment.isActive === false)) {
      throw new Error("Department not found");
    }

    const vendors = await listAssignedVendorUsers(ctx, project);
    const vendorRows = vendors.map((vendor) => ({
      vendorUserId: vendor.vendorUserId as string,
      vendorName: vendor.vendorName,
      vendorContactName: vendor.vendorContactName,
    }));

    const scorerAssignments = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("role"), "company-scorer"))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    const displayNameByUserId = await getScorerDisplayNames(ctx, project);
    const scorerRows: Array<{
      userId: string;
      displayName: string;
      departmentId: Id<"workspaceDepartments"> | null;
      departmentName: string;
      historicalDepartmentNames: string[];
      selectedDepartmentScoreCount: number;
      scopeKey: string;
      completedPairs: number;
      totalPairs: number;
      vendors: Array<{ vendorUserId: string; status: "not-started" | "in-progress" | "completed"; answeredCount: number; totalRequirements: number; completedAt: number | null }>;
    }> = [];

    for (const assignment of scorerAssignments) {
      if (assignment.userId.startsWith("department:")) {
        continue;
      }

      const member = await ctx.db
        .query("companyMembers")
        .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
        .filter((q: any) => q.eq(q.field("userId"), assignment.userId))
        .filter((q: any) => q.eq(q.field("isActive"), true))
        .first();

      const memberDepartment = member?.departmentId ? await ctx.db.get(member.departmentId) : null;
      const departmentId = member?.departmentId ?? null;
      const departmentName = memberDepartment?.name ?? "No department";

      const scopeKey = `individual:${assignment.userId}`;
      const snapshotDepartments = new Set<string>();
      let selectedDepartmentScoreCount = 0;
      const scorerVendorRows: Array<{ vendorUserId: string; status: "not-started" | "in-progress" | "completed"; answeredCount: number; totalRequirements: number; completedAt: number | null }> = [];

      for (const vendor of vendorRows) {
        const completion = await ctx.db
          .query("scorerCompletions")
          .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", vendor.vendorUserId).eq("scorerScopeKey", scopeKey))
          .first();

        const scorerScoreRows = await ctx.db
          .query("scorerScores")
          .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", vendor.vendorUserId).eq("scorerScopeKey", scopeKey))
          .collect();
        for (const scorerScoreRow of scorerScoreRows) {
          if (scorerScoreRow.scorerDepartmentName) {
            snapshotDepartments.add(scorerScoreRow.scorerDepartmentName);
          }
          if (
            args.departmentId
            && (
              (scorerScoreRow.scorerDepartmentId && String(scorerScoreRow.scorerDepartmentId) === String(args.departmentId))
              || (!scorerScoreRow.scorerDepartmentId && scorerScoreRow.scorerDepartmentName === selectedDepartment?.name)
            )
          ) {
            selectedDepartmentScoreCount += 1;
          }
        }

        scorerVendorRows.push({
          vendorUserId: vendor.vendorUserId,
          status: completion?.status ?? "not-started",
          answeredCount: completion?.answeredCount ?? 0,
          totalRequirements: completion?.totalRequirements ?? 0,
          completedAt: completion?.completedAt ?? null,
        });
      }

      const completedPairs = scorerVendorRows.filter((row) => row.status === "completed").length;
      const historicalDepartmentNames = Array.from(snapshotDepartments)
        .filter((name) => name !== departmentName)
        .sort((a, b) => a.localeCompare(b));

      if (args.departmentId && departmentId !== args.departmentId && selectedDepartmentScoreCount === 0) {
        continue;
      }

      scorerRows.push({
        userId: assignment.userId,
        displayName: resolveScorerDisplayName({ enteredByUserId: assignment.userId, enteredByDisplayName: assignment.displayName, displayNameByUserId }),
        departmentId,
        departmentName,
        historicalDepartmentNames,
        selectedDepartmentScoreCount,
        scopeKey,
        completedPairs,
        totalPairs: vendorRows.length,
        vendors: scorerVendorRows,
      });
    }

    if (args.departmentId && selectedDepartment) {
      const selectedDepartmentName = selectedDepartment.name;
      const currentlyIn = scorerRows
        .filter((scorer) => scorer.departmentId === args.departmentId)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      const alsoScoredWhileIn = scorerRows
        .filter((scorer) => scorer.departmentId !== args.departmentId && scorer.selectedDepartmentScoreCount > 0)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      const currentlyCompletedPairs = currentlyIn.reduce((sum, scorer) => sum + scorer.completedPairs, 0);
      const currentlyTotalPairs = currentlyIn.reduce((sum, scorer) => sum + scorer.totalPairs, 0);
      const historicalCompletedPairs = alsoScoredWhileIn.reduce((sum, scorer) => sum + scorer.completedPairs, 0);
      const historicalTotalPairs = alsoScoredWhileIn.reduce((sum, scorer) => sum + scorer.totalPairs, 0);

      return {
        projectId: args.projectId,
        vendors: vendorRows,
        groups: [
          {
            departmentId: args.departmentId,
            departmentName: `Currently in ${selectedDepartmentName}`,
            groupType: "current" as const,
            completedPairs: currentlyCompletedPairs,
            totalPairs: currentlyTotalPairs,
            scorers: currentlyIn,
          },
          {
            departmentId: args.departmentId,
            departmentName: `Also scored while in ${selectedDepartmentName}`,
            groupType: "historical" as const,
            completedPairs: historicalCompletedPairs,
            totalPairs: historicalTotalPairs,
            scorers: alsoScoredWhileIn,
          },
        ],
      };
    }

    const grouped = new Map<string, { departmentId: string | null; departmentName: string; scorers: typeof scorerRows; completedPairs: number; totalPairs: number }>();
    for (const scorer of scorerRows) {
      const key = scorer.departmentId ?? "none";
      const current = grouped.get(key) ?? {
        departmentId: scorer.departmentId,
        departmentName: scorer.departmentName,
        scorers: [],
        completedPairs: 0,
        totalPairs: 0,
      };
      current.scorers.push(scorer);
      current.completedPairs += scorer.completedPairs;
      current.totalPairs += scorer.totalPairs;
      grouped.set(key, current);
    }

    return {
      projectId: args.projectId,
      vendors: vendorRows,
      groups: Array.from(grouped.values())
        .map((group) => ({
          ...group,
          groupType: "default" as const,
          scorers: group.scorers.sort((a, b) => a.displayName.localeCompare(b.displayName)),
        }))
        .sort((a, b) => a.departmentName.localeCompare(b.departmentName)),
    };
  },
});

export const getVendorResponseReview = query({
  args: vendorResponseReviewValidator,
  handler: async (ctx, args) => {
    const { project } = await assertVendorReviewAccess(ctx, args.projectId);
    const vendorContext = await resolveVendorReviewContext(ctx, project, args.vendorUserId);
    const requirements = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .collect();
    const requirementRows = requirements
      .filter((row) => row.status === "active" && row.priority !== 0)
      .sort((a, b) => a.requirementId.localeCompare(b.requirementId));

    const scoreRows = await ctx.db
      .query("scores")
      .withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", vendorContext.vendorUserId))
      .collect();
    const scoreByRequirementId = new Map(scoreRows.map((row) => [row.requirementId, row]));

    const scorerRows = await ctx.db
      .query("scorerScores")
      .withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", vendorContext.vendorUserId))
      .collect();
    const scorerDisplayNamesByUserId = await getScorerDisplayNames(ctx, project, scorerRows.map((row) => row.enteredByUserId));
    const scorerRowsByRequirementId = new Map<string, Array<{
      scopeKey: string;
      scopeLabel: string;
      score: 0 | 1;
      comment: string;
      enteredByDisplayName: string;
      scorerDepartmentName: string;
      enteredAt: number;
    }>>();
    for (const scorerRow of scorerRows) {
      const current = scorerRowsByRequirementId.get(scorerRow.requirementId) ?? [];
      current.push({
        scopeKey: scorerRow.scorerScopeKey,
        scopeLabel: scorerRow.scorerScopeType === "individual" ? resolveScorerDisplayName({
          enteredByUserId: scorerRow.enteredByUserId,
          enteredByDisplayName: scorerRow.scorerScopeLabel,
          displayNameByUserId: scorerDisplayNamesByUserId,
        }) : scorerRow.scorerScopeLabel,
        score: scorerRow.score,
        comment: scorerRow.comment ?? "",
        enteredByDisplayName: resolveScorerDisplayName({
          enteredByUserId: scorerRow.enteredByUserId,
          enteredByDisplayName: scorerRow.enteredByDisplayName,
          displayNameByUserId: scorerDisplayNamesByUserId,
        }),
        scorerDepartmentName: scorerRow.scorerDepartmentName ?? "No department snapshot",
        enteredAt: scorerRow.enteredAt,
      });
      scorerRowsByRequirementId.set(scorerRow.requirementId, current);
    }

    const amendments = await ctx.db
      .query("scoreAmendments")
      .withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", vendorContext.vendorUserId))
      .collect();

    const amendmentUserIds = new Set([
      ...amendments.map((entry) => entry.amendedByUserId),
      ...scoreRows.map((entry) => entry.amendedByUserId).filter((id): id is string => Boolean(id)),
    ]);
    const amendmentNames = new Map(await Promise.all(
      [...amendmentUserIds].map(async (id) => [id, await getWorkspacePersonName(ctx, project.companyId, id)] as const),
    ));
    const amendmentsByRequirementId = new Map<string, Array<any>>();
    for (const amendment of amendments) {
      const current = amendmentsByRequirementId.get(amendment.requirementId) ?? [];
      current.push(amendment);
      amendmentsByRequirementId.set(amendment.requirementId, current);
    }

    const deadline = await getProjectDeadlineForVendor(ctx, args.projectId, vendorContext.vendorUserId);
    const deadlineAt = getEffectiveVendorDueAt(project, deadline);
    const deadlineLocked = isDeadlineLocked(deadlineAt ? { dueAt: deadlineAt } : null);

    const rows = requirementRows.map((requirement) => {
      const score = scoreByRequirementId.get(requirement.requirementId);
      const history = (amendmentsByRequirementId.get(requirement.requirementId) ?? [])
        .sort((a, b) => b.amendedAt - a.amendedAt)
        .map((entry) => ({
          originalScore: entry.originalScore,
          newScore: entry.newScore,
          originalComment: entry.originalComment ?? "",
          newComment: entry.newComment ?? "",
          amendedByDisplayName: recordedPersonName(amendmentNames.get(entry.amendedByUserId), entry.amendedByDisplayName, entry.amendedByUserId),
          amendedAt: entry.amendedAt,
          reason: entry.reason,
        }));

      return {
        requirementId: requirement.requirementId,
        text: requirement.text,
        type: requirement.type,
        priority: requirement.priority,
        score: score?.score ?? null,
        comment: score?.comment ?? "",
        amendedByDisplayName: score?.amendedByUserId
          ? recordedPersonName(amendmentNames.get(score.amendedByUserId), score.amendedByDisplayName, score.amendedByUserId)
          : score?.amendedByDisplayName ? personDisplayName(score.amendedByDisplayName) : null,
        amendedAt: score?.amendedAt ?? null,
        scorerScores: (scorerRowsByRequirementId.get(requirement.requirementId) ?? [])
          .sort((a, b) => a.scopeLabel.localeCompare(b.scopeLabel) || b.enteredAt - a.enteredAt),
        history,
      };
    });

    return {
      projectId: args.projectId,
      vendorUserId: vendorContext.vendorUserId,
      vendorName: vendorContext.vendorName,
      vendorContactName: vendorContext.vendorDisplayName,
      deadlineAt,
      deadlineLocked,
      rows,
    };
  },
});

export const getProjectRequirementComparison = query({
  args: requirementComparisonValidator,
  handler: async (ctx, args) => {
    const { project } = await assertVendorReviewAccess(ctx, args.projectId);
    const requirements = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q: any) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .collect();
    const requirementRows = requirements.sort((a, b) => a.requirementId.localeCompare(b.requirementId));

    const vendors = await listAssignedVendorUsers(ctx, project);
    const scorerAssignments = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("role"), "company-scorer"))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();
    const totalScorers = new Set(scorerAssignments.map((row: any) => row.userId)).size;

    const vendorComparison = await Promise.all(vendors.map(async (vendor) => {
      const scorerRows = await ctx.db
        .query("scorerScores")
        .withIndex("by_project_vendor", (q: any) => q.eq("projectId", args.projectId).eq("vendorUserId", vendor.vendorUserId as string))
        .collect();
      const scorerDisplayNamesByUserId = await getScorerDisplayNames(ctx, project, scorerRows.map((row) => row.enteredByUserId));
      const vendorRows = await ctx.db
        .query("scores")
        .withIndex("by_project_vendor", (q: any) => q.eq("projectId", args.projectId).eq("vendorUserId", vendor.vendorUserId as string))
        .collect();
      const amendmentRows = await ctx.db
        .query("scoreAmendments")
        .withIndex("by_project_vendor", (q: any) => q.eq("projectId", args.projectId).eq("vendorUserId", vendor.vendorUserId as string))
        .collect();

      const amendmentUserIds = new Set([
        ...amendmentRows.map((entry) => entry.amendedByUserId),
        ...vendorRows.map((entry) => entry.amendedByUserId).filter((id): id is string => Boolean(id)),
      ]);
      const amendmentNames = new Map(await Promise.all(
        [...amendmentUserIds].map(async (id) => [id, await getWorkspacePersonName(ctx, project.companyId, id)] as const),
      ));
      const scorerByRequirementId = new Map<string, Array<{
        scorerName: string;
        scorerDepartmentName: string;
        score: 0 | 1;
        comment: string;
        enteredAt: number;
      }>>();
      for (const row of scorerRows) {
        const current = scorerByRequirementId.get(row.requirementId) ?? [];
        current.push({
          scorerName: resolveScorerDisplayName({
            enteredByUserId: row.enteredByUserId,
            enteredByDisplayName: row.enteredByDisplayName,
            displayNameByUserId: scorerDisplayNamesByUserId,
          }),
          scorerDepartmentName: row.scorerDepartmentName ?? "No department snapshot",
          score: row.score,
          comment: row.comment ?? "",
          enteredAt: row.enteredAt,
        });
        scorerByRequirementId.set(row.requirementId, current);
      }

      const vendorByRequirementId = new Map(vendorRows.map((row) => [row.requirementId, row]));
      const amendmentsByRequirementId = new Map<string, Array<{
        originalScore: 0 | 1;
        newScore: 0 | 1;
        originalComment: string;
        newComment: string;
        amendedByDisplayName: string;
        amendedAt: number;
        reason: string;
      }>>();
      for (const row of amendmentRows) {
        const current = amendmentsByRequirementId.get(row.requirementId) ?? [];
        current.push({
          originalScore: row.originalScore,
          newScore: row.newScore,
          originalComment: row.originalComment ?? "",
          newComment: row.newComment ?? "",
          amendedByDisplayName: recordedPersonName(amendmentNames.get(row.amendedByUserId), row.amendedByDisplayName, row.amendedByUserId),
          amendedAt: row.amendedAt,
          reason: row.reason,
        });
        amendmentsByRequirementId.set(row.requirementId, current);
      }

      return {
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        vendorUserId: vendor.vendorUserId as string,
        vendorContactName: vendor.vendorContactName,
        scorerByRequirementId,
        vendorByRequirementId,
        amendmentsByRequirementId,
        amendmentNames,
      };
    }));

    const rows = requirementRows.map((requirement) => {
      const cells = vendorComparison.map((vendor) => {
        const scorerDetails = (vendor.scorerByRequirementId.get(requirement.requirementId) ?? [])
          .sort((a, b) => a.scorerName.localeCompare(b.scorerName) || a.enteredAt - b.enteredAt);
        const scorerScoredCount = scorerDetails.length;
        const scorerAverage = scorerScoredCount > 0
          ? scorerDetails.reduce((sum, item) => sum + item.score, 0) / scorerScoredCount
          : null;

        const vendorAnswer = vendor.vendorByRequirementId.get(requirement.requirementId);
        const amendmentHistory = (vendor.amendmentsByRequirementId.get(requirement.requirementId) ?? [])
          .sort((a, b) => b.amendedAt - a.amendedAt);

        return {
          vendorUserId: vendor.vendorUserId,
          scorerAverage,
          scorerScoredCount,
          totalScorers,
          scorerDetails,
          vendorScore: vendorAnswer?.score ?? null,
          vendorComment: vendorAnswer?.comment ?? "",
          vendorEnteredAt: vendorAnswer?.enteredAt ?? null,
          vendorIsAmended: Boolean(vendorAnswer?.amendedAt || vendorAnswer?.amendedByDisplayName || vendorAnswer?.amendmentReason),
          vendorAmendedByDisplayName: vendorAnswer?.amendedByUserId
            ? recordedPersonName(vendor.amendmentNames.get(vendorAnswer.amendedByUserId), vendorAnswer.amendedByDisplayName, vendorAnswer.amendedByUserId)
            : vendorAnswer?.amendedByDisplayName ? personDisplayName(vendorAnswer.amendedByDisplayName) : null,
          vendorAmendedAt: vendorAnswer?.amendedAt ?? null,
          vendorAmendmentReason: vendorAnswer?.amendmentReason ?? null,
          amendmentHistory,
        };
      });

      return {
        requirementId: requirement.requirementId,
        text: requirement.text,
        type: requirement.type,
        priority: requirement.priority,
        status: requirement.status,
        cells,
      };
    });

    const totalsByVendor = vendorComparison.map((vendor) => {
      let scorerRequirementsTotal = 0;
      let scorerNfrTotal = 0;
      let vendorRequirementsTotal = 0;
      let vendorNfrTotal = 0;

      for (const requirement of rows) {
        if (requirement.status === "withdrawn" || requirement.priority === 0) {
          continue;
        }

        const cell = requirement.cells.find((item) => item.vendorUserId === vendor.vendorUserId);
        if (!cell) {
          continue;
        }

        if (typeof cell.scorerAverage === "number") {
          const weighted = requirement.priority * cell.scorerAverage;
          if (requirement.type === "nfr") {
            scorerNfrTotal += weighted;
          } else {
            scorerRequirementsTotal += weighted;
          }
        }

        if (typeof cell.vendorScore === "number") {
          const weighted = requirement.priority * cell.vendorScore;
          if (requirement.type === "nfr") {
            vendorNfrTotal += weighted;
          } else {
            vendorRequirementsTotal += weighted;
          }
        }
      }

      return {
        vendorUserId: vendor.vendorUserId,
        scorer: {
          requirements: scorerRequirementsTotal,
          nfr: scorerNfrTotal,
          combined: scorerRequirementsTotal + scorerNfrTotal,
        },
        vendor: {
          requirements: vendorRequirementsTotal,
          nfr: vendorNfrTotal,
          combined: vendorRequirementsTotal + vendorNfrTotal,
        },
      };
    });

    const scorerBestCombined = totalsByVendor.reduce((max, row) => Math.max(max, row.scorer.combined), Number.NEGATIVE_INFINITY);
    const vendorBestCombined = totalsByVendor.reduce((max, row) => Math.max(max, row.vendor.combined), Number.NEGATIVE_INFINITY);

    return {
      projectId: args.projectId,
      vendors: vendorComparison.map((vendor) => ({
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        vendorUserId: vendor.vendorUserId,
        vendorContactName: vendor.vendorContactName,
      })),
      rows,
      totalsByVendor,
      scorerBestVendorUserIds: totalsByVendor.filter((row) => row.scorer.combined === scorerBestCombined).map((row) => row.vendorUserId),
      vendorBestVendorUserIds: totalsByVendor.filter((row) => row.vendor.combined === vendorBestCombined).map((row) => row.vendorUserId),
    };
  },
});

export const getScorerWorkboard = query({
  args: scorerWorkboardValidator,
  handler: async (ctx, args) => {
    const { project, identity, userIds } = await assertScorerAccess(ctx, args.projectId);
    const scopes = await resolveScorerScopes(ctx, project, userIds);
    const activeScope = resolveActiveScope(scopes, args.scopeKey);
    const requirements = await listScoringRequirements(ctx, project);
    const vendorRows = await listAssignedVendorUsers(ctx, project);

    const rows = await Promise.all(vendorRows.map(async (vendor) => {
      const scorerScores = await ctx.db
        .query("scorerScores")
        .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", vendor.vendorUserId as string).eq("scorerScopeKey", activeScope.scopeKey))
        .collect();
      const answeredCount = new Set(scorerScores.map((row) => row.requirementId)).size;

      const completion = await ctx.db
        .query("scorerCompletions")
        .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", vendor.vendorUserId as string).eq("scorerScopeKey", activeScope.scopeKey))
        .first();

      const status = completion?.status === "completed"
        ? "completed"
        : answeredCount > 0
          ? "in-progress"
          : "not-started";

      return {
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        vendorUserId: vendor.vendorUserId as string,
        vendorContactName: vendor.vendorContactName,
        answeredCount,
        totalRequirements: requirements.length,
        status,
        completedAt: completion?.completedAt ?? null,
        lastScoredAt: completion?.lastScoredAt ?? null,
      };
    }));

    return {
      projectId: args.projectId,
      scorerCanSeePeerScores: Boolean(project.scorerCanSeePeerScores),
      scorerScopes: scopes.map((scope) => ({ scopeKey: scope.scopeKey, scopeType: scope.scopeType, label: scope.label })),
      activeScopeKey: activeScope.scopeKey,
      vendors: rows.sort((a, b) => a.vendorName.localeCompare(b.vendorName)),
    };
  },
});

export const getScorerVendorGrid = query({
  args: scorerVendorGridValidator,
  handler: async (ctx, args) => {
    const { project, identity, userIds } = await assertScorerAccess(ctx, args.projectId);
    const scopes = await resolveScorerScopes(ctx, project, userIds);
    const activeScope = resolveActiveScope(scopes, args.scopeKey);
    let scorerDisplayNamesByUserId = await getScorerDisplayNames(ctx, project);
    const vendorRows = await listAssignedVendorUsers(ctx, project);
    const selectedVendor = vendorRows.find((row) => row.vendorUserId === args.vendorUserId);

    if (!selectedVendor) {
      throw new Error("Vendor is not assigned to this project");
    }

    const requirements = await listScoringRequirements(ctx, project);
    const ownScores = await ctx.db
      .query("scorerScores")
      .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", args.vendorUserId).eq("scorerScopeKey", activeScope.scopeKey))
      .collect();
    const ownScoreByRequirementId = new Map(ownScores.map((row) => [row.requirementId, row]));

    const completion = await ctx.db
      .query("scorerCompletions")
      .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", args.vendorUserId).eq("scorerScopeKey", activeScope.scopeKey))
      .first();
    const isCompleted = completion?.status === "completed";

    const vendorSelfScores = isCompleted
      ? await ctx.db
          .query("scores")
          .withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", args.vendorUserId))
          .collect()
      : [];
    const vendorSelfByRequirementId = new Map(vendorSelfScores.map((row) => [row.requirementId, row]));

    const peerScoresByRequirementId = new Map<string, Array<{
      scopeKey: string;
      scopeLabel: string;
      score: 0 | 1;
      comment: string;
      enteredByDisplayName: string;
      enteredAt: number;
    }>>();

    if (project.scorerCanSeePeerScores && isCompleted) {
      const allScorerScores = await ctx.db
        .query("scorerScores")
        .withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", args.vendorUserId))
        .collect();
      scorerDisplayNamesByUserId = await getScorerDisplayNames(ctx, project, allScorerScores.map((row) => row.enteredByUserId));

      for (const row of allScorerScores) {
        if (row.scorerScopeKey === activeScope.scopeKey) {
          continue;
        }

        const current = peerScoresByRequirementId.get(row.requirementId) ?? [];
        current.push({
          scopeKey: row.scorerScopeKey,
          scopeLabel: row.scorerScopeType === "individual" ? resolveScorerDisplayName({
            enteredByUserId: row.enteredByUserId,
            enteredByDisplayName: row.scorerScopeLabel,
            displayNameByUserId: scorerDisplayNamesByUserId,
          }) : row.scorerScopeLabel,
          score: row.score,
          comment: row.comment ?? "",
          enteredByDisplayName: resolveScorerDisplayName({
            enteredByUserId: row.enteredByUserId,
            enteredByDisplayName: row.enteredByDisplayName,
            displayNameByUserId: scorerDisplayNamesByUserId,
          }),
          enteredAt: row.enteredAt,
        });
        peerScoresByRequirementId.set(row.requirementId, current);
      }
    }

    const rows = requirements.map((requirement: any) => {
      const own = ownScoreByRequirementId.get(requirement.requirementId);
      const vendorSelf = vendorSelfByRequirementId.get(requirement.requirementId);

      return {
        requirementId: requirement.requirementId,
        text: requirement.text,
        type: requirement.type,
        priority: requirement.priority,
        ownScore: own?.score ?? null,
        ownComment: own?.comment ?? "",
        ownEnteredByDisplayName: own ? resolveScorerDisplayName({
          enteredByUserId: own.enteredByUserId,
          enteredByDisplayName: own.enteredByDisplayName,
          displayNameByUserId: scorerDisplayNamesByUserId,
        }) : null,
        ownScorerDepartmentName: own?.scorerDepartmentName ?? null,
        ownEnteredAt: own?.enteredAt ?? null,
        vendorScore: isCompleted ? (vendorSelf?.score ?? null) : null,
        vendorComment: isCompleted ? (vendorSelf?.comment ?? "") : null,
        peerScores: project.scorerCanSeePeerScores && isCompleted ? (peerScoresByRequirementId.get(requirement.requirementId) ?? []) : [],
      };
    });

    return {
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      vendorName: selectedVendor.vendorName,
      vendorContactName: selectedVendor.vendorContactName,
      scorerScope: {
        scopeKey: activeScope.scopeKey,
        scopeType: activeScope.scopeType,
        label: activeScope.label,
      },
      canSeePeerScores: Boolean(project.scorerCanSeePeerScores && isCompleted),
      isCompleted,
      completedAt: completion?.completedAt ?? null,
      rows,
    };
  },
});

export const saveScorerScore = mutation({
  args: scorerScoreValidator,
  handler: async (ctx, args) => {
    const { project, identity, userIds } = await assertScorerAccess(ctx, args.projectId);
    const scopes = await resolveScorerScopes(ctx, project, userIds);
    const activeScope = resolveActiveScope(scopes, args.scopeKey);

    const vendorRows = await listAssignedVendorUsers(ctx, project);
    if (!vendorRows.some((row) => row.vendorUserId === args.vendorUserId)) {
      throw new Error("Vendor is not assigned to this project");
    }

    const requirement = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", args.projectId))
      .filter((q: any) => q.eq(q.field("requirementId"), args.requirementId))
      .first();

    if (!requirement) {
      throw new Error("Requirement not found in project");
    }

    if (requirement.status === "withdrawn" || requirement.priority === 0) {
      throw new Error("This requirement is not active for scoring");
    }

    const now = Date.now();
    const scorerUserId = resolveScorerUserId(activeScope, identity);
    const departmentSnapshot = await getScorerDepartmentSnapshot(ctx, project.companyId, scorerUserId);
    const existing = await ctx.db
      .query("scorerScores")
      .withIndex("by_project_vendor_scope_requirement", (q) =>
        q.eq("projectId", args.projectId)
          .eq("vendorUserId", args.vendorUserId)
          .eq("scorerScopeKey", activeScope.scopeKey)
          .eq("requirementId", args.requirementId),
      )
      .first();

    const payload = {
      companyId: project.companyId,
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      scorerScopeKey: activeScope.scopeKey,
      scorerScopeLabel: activeScope.label,
      scorerScopeType: activeScope.scopeType,
      requirementId: args.requirementId,
      score: args.score,
      comment: args.comment?.trim() || undefined,
      enteredByUserId: existing?.enteredByUserId ?? scorerUserId,
      enteredByDisplayName: existing?.enteredByDisplayName ?? activeScope.label,
      scorerDepartmentId: existing?.scorerDepartmentId ?? departmentSnapshot.scorerDepartmentId,
      scorerDepartmentName: existing?.scorerDepartmentName ?? departmentSnapshot.scorerDepartmentName,
      enteredAt: existing?.enteredAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("scorerScores", payload);
    }

    const requirements = await listScoringRequirements(ctx, project);
    const allScopeScores = await ctx.db
      .query("scorerScores")
      .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", args.vendorUserId).eq("scorerScopeKey", activeScope.scopeKey))
      .collect();
    const answeredCount = new Set(allScopeScores.map((row) => row.requirementId)).size;

    const completion = await ctx.db
      .query("scorerCompletions")
      .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", args.vendorUserId).eq("scorerScopeKey", activeScope.scopeKey))
      .first();

    const completionPayload = {
      companyId: project.companyId,
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      scorerScopeKey: activeScope.scopeKey,
      scorerScopeLabel: activeScope.label,
      scorerScopeType: activeScope.scopeType,
      status: completion?.status === "completed" ? "completed" : "in-progress",
      answeredCount,
      totalRequirements: requirements.length,
      lastScoredAt: now,
      completedAt: completion?.completedAt,
      updatedByUserId: payload.enteredByUserId,
      updatedByDisplayName: payload.enteredByDisplayName,
      scorerDepartmentId: departmentSnapshot.scorerDepartmentId,
      scorerDepartmentName: departmentSnapshot.scorerDepartmentName,
      updatedAt: now,
    } as const;

    if (completion) {
      await ctx.db.patch(completion._id, completionPayload);
    } else {
      await ctx.db.insert("scorerCompletions", completionPayload);
    }

    await recordActivity(ctx, {
      actorUserId: payload.enteredByUserId,
      actorEmail: identity.email ?? undefined,
      action: "scorer_score_edit",
      details: `Saved scorer score for ${args.requirementId} (${activeScope.label}) as ${args.score}.`,
      companyId: project.companyId,
      projectId: args.projectId,
    });

    return {
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      requirementId: args.requirementId,
      scopeKey: activeScope.scopeKey,
      score: args.score,
      comment: payload.comment ?? "",
      answeredCount,
      totalRequirements: requirements.length,
      updated: Boolean(existing),
      savedAt: now,
    };
  },
});

export const completeScorerVendor = mutation({
  args: completeScorerVendorValidator,
  handler: async (ctx, args) => {
    const { project, identity, userIds } = await assertScorerAccess(ctx, args.projectId);
    const scopes = await resolveScorerScopes(ctx, project, userIds);
    const activeScope = resolveActiveScope(scopes, args.scopeKey);

    const vendorRows = await listAssignedVendorUsers(ctx, project);
    const selectedVendor = vendorRows.find((row) => row.vendorUserId === args.vendorUserId);
    if (!selectedVendor) {
      throw new Error("Vendor is not assigned to this project");
    }

    const requirements = await listScoringRequirements(ctx, project);
    const scopeScores = await ctx.db
      .query("scorerScores")
      .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", args.vendorUserId).eq("scorerScopeKey", activeScope.scopeKey))
      .collect();
    const answeredCount = new Set(scopeScores.map((row) => row.requirementId)).size;

    const now = Date.now();
    const scorerUserId = resolveScorerUserId(activeScope, identity);
    const departmentSnapshot = await getScorerDepartmentSnapshot(ctx, project.companyId, scorerUserId);
    const completion = await ctx.db
      .query("scorerCompletions")
      .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", args.vendorUserId).eq("scorerScopeKey", activeScope.scopeKey))
      .first();

    const completionPayload = {
      companyId: project.companyId,
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      scorerScopeKey: activeScope.scopeKey,
      scorerScopeLabel: activeScope.label,
      scorerScopeType: activeScope.scopeType,
      status: "completed" as const,
      answeredCount,
      totalRequirements: requirements.length,
      lastScoredAt: completion?.lastScoredAt ?? now,
      completedAt: now,
      updatedByUserId: scorerUserId,
      updatedByDisplayName: activeScope.label,
      scorerDepartmentId: departmentSnapshot.scorerDepartmentId,
      scorerDepartmentName: departmentSnapshot.scorerDepartmentName,
      updatedAt: now,
    };

    if (completion) {
      await ctx.db.patch(completion._id, completionPayload);
    } else {
      await ctx.db.insert("scorerCompletions", completionPayload);
    }

    await recordActivity(ctx, {
      actorUserId: completionPayload.updatedByUserId,
      actorEmail: identity.email ?? undefined,
      action: "scorer_vendor_complete",
      details: `Marked scorer scoring complete for ${selectedVendor.vendorName} (${activeScope.label}).`,
      companyId: project.companyId,
      projectId: args.projectId,
    });

    return {
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      scopeKey: activeScope.scopeKey,
      status: "completed" as const,
      answeredCount,
      totalRequirements: requirements.length,
      completedAt: now,
    };
  },
});

export const reopenScorerVendor = mutation({
  args: reopenScorerVendorValidator,
  handler: async (ctx, args) => {
    const { project, identity, userIds } = await assertScorerAccess(ctx, args.projectId);
    const scopes = await resolveScorerScopes(ctx, project, userIds);
    const activeScope = resolveActiveScope(scopes, args.scopeKey);

    if (isDeadlineLocked(project.scorerDeadline ? { dueAt: project.scorerDeadline } : null)) {
      throw new Error("Scorer completion can only be reopened before the scorer deadline.");
    }

    const vendorRows = await listAssignedVendorUsers(ctx, project);
    const selectedVendor = vendorRows.find((row) => row.vendorUserId === args.vendorUserId);
    if (!selectedVendor) {
      throw new Error("Vendor is not assigned to this project");
    }

    const completion = await ctx.db
      .query("scorerCompletions")
      .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", args.vendorUserId).eq("scorerScopeKey", activeScope.scopeKey))
      .first();

    if (!completion || completion.status !== "completed") {
      throw new Error("This scorer vendor row is not completed.");
    }

    const now = Date.now();
    const scorerUserId = resolveScorerUserId(activeScope, identity);
    await ctx.db.patch(completion._id, {
      status: "in-progress",
      completedAt: undefined,
      updatedByUserId: scorerUserId,
      updatedByDisplayName: activeScope.label,
      updatedAt: now,
    });

    await recordActivity(ctx, {
      actorUserId: scorerUserId,
      actorEmail: identity.email ?? undefined,
      action: "scorer_vendor_reopen",
      details: `Reopened scorer completion for ${selectedVendor.vendorName} (${activeScope.label}).`,
      companyId: project.companyId,
      projectId: args.projectId,
    });

    return {
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      scopeKey: activeScope.scopeKey,
      status: "in-progress" as const,
      completedAt: null,
      updatedAt: now,
    };
  },
});

export const backfillMissingScorerDepartmentSnapshots = internalMutation({
  args: backfillScorerSnapshotsValidator,
  handler: async (ctx, args) => {
    const scorerScores = args.projectId
      ? await ctx.db
          .query("scorerScores")
          .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
          .collect()
      : await ctx.db.query("scorerScores").collect();

    let scorerScoresUpdated = 0;
    for (const row of scorerScores) {
      if (row.scorerDepartmentId && row.scorerDepartmentName) {
        continue;
      }

      const completion = await ctx.db
        .query("scorerCompletions")
        .withIndex("by_project_vendor_scope", (q) => q
          .eq("projectId", row.projectId)
          .eq("vendorUserId", row.vendorUserId)
          .eq("scorerScopeKey", row.scorerScopeKey))
        .first();

      const fallback = await resolveMemberDepartmentSnapshot(ctx, row.companyId, row.enteredByUserId);
      const scorerDepartmentId = row.scorerDepartmentId ?? completion?.scorerDepartmentId ?? fallback.scorerDepartmentId;
      const scorerDepartmentName = row.scorerDepartmentName ?? completion?.scorerDepartmentName ?? fallback.scorerDepartmentName;

      await ctx.db.patch(row._id, {
        scorerDepartmentId,
        scorerDepartmentName,
      });
      scorerScoresUpdated += 1;
    }

    const scorerCompletions = args.projectId
      ? await ctx.db
          .query("scorerCompletions")
          .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
          .collect()
      : await ctx.db.query("scorerCompletions").collect();

    let scorerCompletionsUpdated = 0;
    for (const row of scorerCompletions) {
      if (row.scorerDepartmentId && row.scorerDepartmentName) {
        continue;
      }

      const fallback = await resolveMemberDepartmentSnapshot(ctx, row.companyId, row.updatedByUserId);
      await ctx.db.patch(row._id, {
        scorerDepartmentId: row.scorerDepartmentId ?? fallback.scorerDepartmentId,
        scorerDepartmentName: row.scorerDepartmentName ?? fallback.scorerDepartmentName,
      });
      scorerCompletionsUpdated += 1;
    }

    return {
      scorerScoresUpdated,
      scorerCompletionsUpdated,
    };
  },
});

export const clearProjectScorerData = internalMutation({
  args: clearProjectScorerDataValidator,
  handler: async (ctx, args) => {
    if (isProductionEnvironment()) {
      throw new Error("Project scorer data reset is disabled in production");
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const identity = await ctx.auth.getUserIdentity();
    const actorUserId = identity?.subject ?? identity?.tokenIdentifier ?? "system";

    const scorerScores = await ctx.db
      .query("scorerScores")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .collect();

    const scorerCompletions = await ctx.db
      .query("scorerCompletions")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .collect();

    const scorerViews = await ctx.db
      .query("projectViews")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .collect();

    for (const row of scorerScores) {
      await ctx.db.delete(row._id);
    }
    for (const row of scorerCompletions) {
      await ctx.db.delete(row._id);
    }
    for (const row of scorerViews) {
      await ctx.db.delete(row._id);
    }

    await recordActivity(ctx, {
      actorUserId,
      actorEmail: identity?.email ?? undefined,
      action: "clear_project_scorer_data",
      details: `Cleared scorer data for project ${args.projectId}: ${scorerScores.length} scorer scores, ${scorerCompletions.length} scorer completions, ${scorerViews.length} scorer views removed.`,
      companyId: project.companyId,
      projectId: args.projectId,
    });

    return {
      projectId: args.projectId,
      scorerScoresRemoved: scorerScores.length,
      scorerCompletionsRemoved: scorerCompletions.length,
      scorerViewsRemoved: scorerViews.length,
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
      const deadlineAt = getEffectiveVendorDueAt(project, deadline);
      if (isDeadlineLocked(deadlineAt ? { dueAt: deadlineAt } : null)) {
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
    if (member.role === "vendor" && member.userId !== args.vendorUserId) {
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
    const { project, identity, actorUserId, actorDisplayName } = await assertVendorReviewAccess(ctx, args.projectId);
    await resolveVendorReviewContext(ctx, project, args.vendorUserId);

    const deadline = await getProjectDeadlineForVendor(ctx, args.projectId, args.vendorUserId);
    const deadlineAt = getEffectiveVendorDueAt(project, deadline);
    if (!isDeadlineLocked(deadlineAt ? { dueAt: deadlineAt } : null)) {
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

    const updatedComment = args.comment?.trim() ?? "";
    const amendmentRecord = {
      companyId: project.companyId,
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      requirementId: args.requirementId,
      originalScore: existing.score,
      newScore: args.score,
      originalComment: existing.comment ?? "",
      newComment: updatedComment,
      amendedByUserId: actorUserId,
      amendedByDisplayName: actorDisplayName,
      reason,
      amendedAt: Date.now(),
    };

    await ctx.db.insert("scoreAmendments", amendmentRecord);
    await ctx.db.patch(existing._id, {
      score: args.score,
      comment: updatedComment || undefined,
      amendedByUserId: amendmentRecord.amendedByUserId,
      amendedByDisplayName: amendmentRecord.amendedByDisplayName,
      amendedAt: amendmentRecord.amendedAt,
      amendmentReason: amendmentRecord.reason,
    });

    await recordActivity(ctx, {
      actorUserId,
      actorEmail: identity.email ?? undefined,
      action: "vendor_score_amend_admin",
      details: `Amended ${args.requirementId} for vendor ${args.vendorUserId}: ${existing.score} -> ${args.score}. Reason: ${reason}`,
      companyId: project.companyId,
      projectId: args.projectId,
    });

    return {
      _id: existing._id,
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      requirementId: args.requirementId,
      originalScore: existing.score,
      newScore: args.score,
      originalComment: existing.comment ?? "",
      newComment: updatedComment,
      amendedByDisplayName: actorDisplayName,
      amendedAt: amendmentRecord.amendedAt,
      reason,
    };
  },
});

export const reopenVendorAnswers = mutation({
  args: reopenVendorAnswersValidator,
  handler: async (ctx, args) => {
    const { project, identity, actorUserId } = await assertVendorReviewAccess(ctx, args.projectId);
    await resolveVendorReviewContext(ctx, project, args.vendorUserId);

    if (!Number.isFinite(args.dueAt) || args.dueAt <= Date.now()) {
      throw new Error("Choose a future date to reopen this vendor response window");
    }

    const existingDeadline = await getProjectDeadlineForVendor(ctx, args.projectId, args.vendorUserId);
    const now = Date.now();

    if (existingDeadline) {
      await ctx.db.patch(existingDeadline._id, {
        dueAt: args.dueAt,
        status: "in-progress",
        submittedAt: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("projectDeadlines", {
        companyId: project.companyId,
        projectId: args.projectId,
        targetType: "vendor",
        targetUserId: args.vendorUserId,
        dueAt: args.dueAt,
        status: "in-progress",
        createdAt: now,
        updatedAt: now,
      });
    }

    await recordActivity(ctx, {
      actorUserId,
      actorEmail: identity.email ?? undefined,
      action: "vendor_answers_reopened",
      details: `Reopened vendor responses for ${args.vendorUserId} until ${new Date(args.dueAt).toISOString()}.`,
      companyId: project.companyId,
      projectId: args.projectId,
    });

    return {
      projectId: args.projectId,
      vendorUserId: args.vendorUserId,
      deadlineAt: args.dueAt,
      status: "in-progress" as const,
    };
  },
});
