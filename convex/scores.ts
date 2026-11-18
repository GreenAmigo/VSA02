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
  comment: v.optional(v.string()),
  reason: v.string(),
});

const vendorResponseReviewValidator = v.object({
  projectId: v.id("projects"),
  vendorUserId: v.string(),
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

  const userIds = getIdentityUserIds(identity);
  const member = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), projectId))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(identity.name?.trim() ? [q.eq(q.field("displayName"), identity.name.trim())] : []),
    ))
    .first();

  if (!member || (member.role !== "company-admin" && member.role !== "company-scorer" && member.role !== "vendor")) {
    throw new Error("Project access denied");
  }

  if (member.companyId !== project.companyId) {
    throw new Error("Project access denied");
  }

  return { project, identity, member };
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

  const companyAdmin = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
    .filter((q: any) => q.eq(q.field("role"), "company-admin"))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
      ...(identity.name?.trim() ? [q.eq(q.field("displayName"), identity.name.trim())] : []),
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

  const actorUserId = identity.subject ?? identity.tokenIdentifier ?? companyAdmin?.userId ?? consultant?.userId ?? "system";
  const actorDisplayName = identity.name?.trim() || companyAdmin?.displayName || consultant?.displayName || "Admin";

  return { project, identity, actorUserId, actorDisplayName };
}

async function resolveVendorReviewContext(ctx: any, project: any, vendorUserId: string) {
  const trimmedVendorUserId = vendorUserId.trim();
  if (!trimmedVendorUserId) {
    throw new Error("Select a vendor before opening vendor responses");
  }

  const companyVendorMembership = await ctx.db
    .query("companyMembers")
    .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
    .filter((q: any) => q.eq(q.field("role"), "vendor"))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.eq(q.field("userId"), trimmedVendorUserId))
    .first();

  if (!companyVendorMembership?.vendorId) {
    throw new Error("Vendor not assigned to this workspace");
  }

  const projectVendor = await ctx.db
    .query("projectVendors")
    .filter((q: any) => q.eq(q.field("projectId"), project._id))
    .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
    .filter((q: any) => q.eq(q.field("vendorId"), companyVendorMembership.vendorId))
    .first();

  if (!projectVendor) {
    throw new Error("Vendor not assigned to this project");
  }

  const vendorOrg = await ctx.db.get(projectVendor.vendorId);
  return {
    vendorUserId: trimmedVendorUserId,
    vendorId: projectVendor.vendorId,
    vendorName: vendorOrg?.name ?? companyVendorMembership.displayName ?? "Vendor",
    vendorDisplayName: companyVendorMembership.displayName ?? vendorOrg?.name ?? "Vendor",
  };
}

async function assertScorerAccess(ctx: any, projectId: string): Promise<{ project: any; identity: any; userIds: string[]; displayName: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const project: any = await ctx.db.get(projectId as any);
  if (!project) {
    throw new Error("Project not found");
  }

  const userIds = getIdentityUserIds(identity);
  const displayName = identity.name?.trim() || identity.email?.trim() || identity.tokenIdentifier || "Scorer";

  return { project, identity, userIds, displayName };
}

async function resolveScorerScopes(ctx: any, project: any, identity: any, userIds: string[]) {
  const scopeMap = new Map<string, { scopeKey: string; scopeType: "individual" | "department"; label: string }>();

  const projectScorerMemberships = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), project._id))
    .filter((q: any) => q.eq(q.field("role"), "company-scorer"))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();

  const individualAssignments = projectScorerMemberships.filter((row: any) =>
    userIds.includes(row.userId) || (identity.name?.trim() ? row.displayName === identity.name.trim() : false),
  );

  for (const assignment of individualAssignments) {
    scopeMap.set(`individual:${assignment.userId}`, {
      scopeKey: `individual:${assignment.userId}`,
      scopeType: "individual",
      label: assignment.displayName,
    });
  }

  const departmentAssignments = projectScorerMemberships.filter((row: any) => Boolean(row.departmentId || row.departmentName));
  if (departmentAssignments.length > 0) {
    const deptMemberships = await ctx.db
      .query("departmentMembers")
      .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .filter((q: any) => q.or(
        ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
        ...(identity.email?.trim().toLowerCase() ? [q.eq(q.field("email"), identity.email.trim().toLowerCase())] : []),
        ...(identity.name?.trim() ? [q.eq(q.field("displayName"), identity.name.trim())] : []),
      ))
      .collect();

    const deptIds = new Set(deptMemberships.map((row: any) => row.departmentId));
    const deptNames = new Set<string>();
    for (const row of deptMemberships) {
      const dept = await ctx.db.get(row.departmentId);
      if (dept?.name) {
        deptNames.add(dept.name);
      }
    }

    for (const assignment of departmentAssignments) {
      const assignedToDepartment = (assignment.departmentId && deptIds.has(assignment.departmentId))
        || (assignment.departmentName && deptNames.has(assignment.departmentName));

      if (!assignedToDepartment) {
        continue;
      }

      const scopeIdentity = assignment.departmentId ? String(assignment.departmentId) : (assignment.departmentName as string);
      const scopeKey = `department:${scopeIdentity}`;
      scopeMap.set(scopeKey, {
        scopeKey,
        scopeType: "department",
        label: assignment.departmentName || assignment.displayName,
      });
    }
  }

  const scopes = Array.from(scopeMap.values());
  if (scopes.length === 0) {
    throw new Error("Only assigned scorers can score this project");
  }

  return scopes;
}

function resolveActiveScope(scopes: Array<{ scopeKey: string; scopeType: "individual" | "department"; label: string }>, requestedScopeKey?: string) {
  if (requestedScopeKey) {
    const exact = scopes.find((scope) => scope.scopeKey === requestedScopeKey);
    if (exact) {
      return exact;
    }
  }

  return scopes[0];
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
  const assignments = await ctx.db
    .query("projectVendors")
    .filter((q: any) => q.eq(q.field("projectId"), project._id))
    .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
    .collect();

  const vendorRows = await Promise.all(assignments.map(async (assignment: any) => {
    const vendorOrg = await ctx.db.get(assignment.vendorId);
    const contacts = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
      .filter((q: any) => q.eq(q.field("role"), "vendor"))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .filter((q: any) => q.eq(q.field("vendorId"), assignment.vendorId))
      .collect();

    const selectedContact = contacts.sort((a: any, b: any) => a.createdAt - b.createdAt)[0] ?? null;
    return {
      vendorId: assignment.vendorId,
      vendorName: vendorOrg?.name ?? "Vendor",
      vendorUserId: selectedContact?.userId ?? null,
      vendorContactName: selectedContact?.displayName ?? null,
    };
  }));

  return vendorRows.filter((row) => Boolean(row.vendorUserId));
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
    const companyMembership = await ctx.db
      .query("companyMembers")
      .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
      .filter((q: any) => q.eq(q.field("userId"), member.userId))
      .filter((q: any) => q.eq(q.field("role"), "vendor"))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    const vendorOrganization = companyMembership?.vendorId
      ? await ctx.db.get(companyMembership.vendorId)
      : null;

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
      vendorOrganizationName: vendorOrganization?.name ?? companyMembership?.displayName ?? "Vendor organisation",
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
          amendedByDisplayName: answer?.amendedByDisplayName ?? null,
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

    const assignments = await ctx.db
      .query("projectVendors")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
      .collect();

    const rows = await Promise.all(assignments.map(async (assignment) => {
      const vendorOrg = await ctx.db.get(assignment.vendorId);
      const contacts = await ctx.db
        .query("companyMembers")
        .filter((q: any) => q.eq(q.field("companyId"), project.companyId))
        .filter((q: any) => q.eq(q.field("role"), "vendor"))
        .filter((q: any) => q.eq(q.field("isActive"), true))
        .filter((q: any) => q.eq(q.field("vendorId"), assignment.vendorId))
        .collect();

      const sortedContacts = contacts.sort((a, b) => a.createdAt - b.createdAt);
      const selectedContact = sortedContacts[0] ?? null;
      const vendorUserIds = sortedContacts.map((contact) => contact.userId);
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
        vendorId: assignment.vendorId,
        vendorName: vendorOrg?.name ?? "Vendor",
        vendorUserId: selectedContact?.userId ?? null,
        vendorContactName: selectedContact?.displayName ?? null,
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

    const amendments = await ctx.db
      .query("scoreAmendments")
      .withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", vendorContext.vendorUserId))
      .collect();

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
          amendedByDisplayName: entry.amendedByDisplayName,
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
        amendedByDisplayName: score?.amendedByDisplayName ?? null,
        amendedAt: score?.amendedAt ?? null,
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

export const getScorerWorkboard = query({
  args: scorerWorkboardValidator,
  handler: async (ctx, args) => {
    const { project, identity, userIds } = await assertScorerAccess(ctx, args.projectId);
    const scopes = await resolveScorerScopes(ctx, project, identity, userIds);
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
    const scopes = await resolveScorerScopes(ctx, project, identity, userIds);
    const activeScope = resolveActiveScope(scopes, args.scopeKey);
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

      for (const row of allScorerScores) {
        if (row.scorerScopeKey === activeScope.scopeKey) {
          continue;
        }

        const current = peerScoresByRequirementId.get(row.requirementId) ?? [];
        current.push({
          scopeKey: row.scorerScopeKey,
          scopeLabel: row.scorerScopeLabel,
          score: row.score,
          comment: row.comment ?? "",
          enteredByDisplayName: row.enteredByDisplayName,
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
        ownScore: own?.score ?? null,
        ownComment: own?.comment ?? "",
        ownEnteredByDisplayName: own?.enteredByDisplayName ?? null,
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
    const { project, identity, userIds, displayName } = await assertScorerAccess(ctx, args.projectId);
    const scopes = await resolveScorerScopes(ctx, project, identity, userIds);
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
      enteredByUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      enteredByDisplayName: displayName,
      enteredAt: now,
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
    const { project, identity, userIds, displayName } = await assertScorerAccess(ctx, args.projectId);
    const scopes = await resolveScorerScopes(ctx, project, identity, userIds);
    const activeScope = resolveActiveScope(scopes, args.scopeKey);

    const vendorRows = await listAssignedVendorUsers(ctx, project);
    if (!vendorRows.some((row) => row.vendorUserId === args.vendorUserId)) {
      throw new Error("Vendor is not assigned to this project");
    }

    const requirements = await listScoringRequirements(ctx, project);
    const scopeScores = await ctx.db
      .query("scorerScores")
      .withIndex("by_project_vendor_scope", (q) => q.eq("projectId", args.projectId).eq("vendorUserId", args.vendorUserId).eq("scorerScopeKey", activeScope.scopeKey))
      .collect();
    const answeredCount = new Set(scopeScores.map((row) => row.requirementId)).size;

    const now = Date.now();
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
      updatedByUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      updatedByDisplayName: displayName,
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
      details: `Marked scorer scoring complete for ${args.vendorUserId} (${activeScope.label}).`,
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
