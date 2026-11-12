import { mutation } from "./_generated/server";
import { v } from "convex/values";

const requirementRowValidator = v.object({
  id: v.string(),
  text: v.string(),
  type: v.union(v.literal("user-story"), v.literal("nfr")),
  priority: v.union(v.literal(9), v.literal(3), v.literal(1), v.literal(0)),
  status: v.optional(v.union(v.literal("active"), v.literal("withdrawn"))),
});

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
  return null;
}

async function canImportOrEditRequirements(ctx: any, projectId: string, identity: any) {
  const project = await ctx.db.get(projectId as any);
  if (!project) {
    throw new Error("Project not found");
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

  const consultantRow = await getActiveConsultantRow(ctx, userIds);
  const isAdminProjectMember = projectMembership && projectMembership.role === "company-admin";
  const isAdminCompanyMember = companyMembership && companyMembership.role === "company-admin";

  if (consultantRow || isAdminProjectMember || isAdminCompanyMember) {
    return { project, identity, allowed: true };
  }

  return { project, identity, allowed: false };
}

function buildRequirementPlan(projectId: string, companyId: string, existing: any[], rows: any[]) {
  const existingById = new Map(existing.map((item) => [item.requirementId, item]));
  const incomingById = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const next: any[] = [...existing];
  let added = 0;
  let updated = 0;
  let withdrawn = 0;
  const rejected: Array<{ requirementId: string; reason: string }> = [];
  const seenIds = new Set<string>();

  for (const row of rows) {
    const requirementId = String(row.id ?? "").trim();
    if (!requirementId) {
      rejected.push({ requirementId: "", reason: "missing ID" });
      continue;
    }
    if (seenIds.has(requirementId)) {
      rejected.push({ requirementId, reason: "duplicate ID" });
      continue;
    }
    seenIds.add(requirementId);
    const current = existingById.get(row.id);
    seen.add(row.id);

    if (!current) {
      added += 1;
      next.push({
        companyId,
        projectId,
        requirementId: row.id,
        text: row.text,
        type: row.type,
        priority: row.priority,
        status: row.status ?? "active",
        createdAt: Date.now(),
      });
      continue;
    }

    const changed =
      current.text !== row.text ||
      current.type !== row.type ||
      current.priority !== row.priority ||
      current.status !== (row.status ?? "active");

    if (changed) {
      updated += 1;
    }

    const index = next.findIndex((item) => item.requirementId === row.id);
    if (index >= 0) {
      next[index] = {
        ...current,
        text: row.text,
        type: row.type,
        priority: row.priority,
        status: row.status ?? "active",
      };
    }
  }

  for (const item of existing) {
    if (!seen.has(item.requirementId) && item.status !== "withdrawn") {
      withdrawn += 1;
      const index = next.findIndex((entry) => entry.requirementId === item.requirementId);
      if (index >= 0) {
        next[index] = { ...item, status: "withdrawn" };
      }
    }
  }

  return {
    next,
    summary: { added, updated, withdrawn, total: next.length },
    rejected,
    changes: rows
      .filter((row) => !!String(row.id ?? "").trim())
      .filter((row) => !rejected.some((item) => item.requirementId === String(row.id ?? "").trim() && item.reason === "duplicate ID"))
      .map((row) => {
        const current = existingById.get(row.id);
        if (!current) {
          return { id: row.id, action: "add" };
        }
        if (
          current.text !== row.text ||
          current.type !== row.type ||
          current.priority !== row.priority ||
          current.status !== (row.status ?? "active")
        ) {
          return { id: row.id, action: "update" };
        }
        return { id: row.id, action: "unchanged" };
      }),
  };
}

export const previewRequirementImport = mutation({
  args: {
    projectId: v.id("projects"),
    rows: v.array(requirementRowValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const { project, allowed } = await canImportOrEditRequirements(ctx, args.projectId, identity);
    if (!allowed) {
      throw new Error("Project access denied");
    }

    const existing = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) =>
        q.eq("companyId", project.companyId).eq("projectId", args.projectId),
      )
      .collect();

    const plan = buildRequirementPlan(project._id, project.companyId, existing, args.rows);
    return {
      projectId: args.projectId,
      companyId: project.companyId,
      summary: plan.summary,
      changes: plan.changes,
      rejected: plan.rejected,
    };
  },
});

export const applyRequirementImport = mutation({
  args: {
    projectId: v.id("projects"),
    rows: v.array(requirementRowValidator),
    confirm: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.confirm) {
      throw new Error("Confirm required before applying import");
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }

    const { project, allowed } = await canImportOrEditRequirements(ctx, args.projectId, identity);
    if (!allowed) {
      throw new Error("Project access denied");
    }

    const existing = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) =>
        q.eq("companyId", project.companyId).eq("projectId", args.projectId),
      )
      .collect();

    const plan = buildRequirementPlan(project._id, project.companyId, existing, args.rows);
    const seen = new Set<string>();
    const rejectedCount = plan.rejected.length;

    for (const row of args.rows) {
      const requirementId = String(row.id ?? "").trim();
      if (!requirementId || plan.rejected.some((issue) => issue.requirementId === requirementId)) {
        continue;
      }

      const match = existing.find((item) => item.requirementId === requirementId);
      seen.add(requirementId);

      if (!match) {
        await ctx.db.insert("requirements", {
          companyId: project.companyId,
          projectId: args.projectId,
          requirementId,
          text: row.text,
          type: row.type,
          priority: row.priority,
          status: row.status ?? "active",
          createdAt: Date.now(),
        });
        continue;
      }

      await ctx.db.patch(match._id, {
        text: row.text,
        type: row.type,
        priority: row.priority,
        status: row.status ?? "active",
      });
    }

    for (const item of existing) {
      if (!seen.has(item.requirementId) && item.status !== "withdrawn") {
        await ctx.db.patch(item._id, { status: "withdrawn" });
      }
    }

    await ctx.db.insert("activityLogs", {
      actorUserId: identity.subject ?? identity.tokenIdentifier ?? "system",
      actorEmail: identity.email ?? undefined,
      action: "import_requirements",
      details: `Imported project requirements: ${plan.summary.added} added, ${plan.summary.updated} changed, ${plan.summary.withdrawn} withdrawn, ${rejectedCount} rejected.`,
      companyId: project.companyId,
      projectId: args.projectId,
      createdAt: Date.now(),
    });

    return {
      projectId: args.projectId,
      count: args.rows.length,
      summary: plan.summary,
      rejected: plan.rejected,
    };
  },
});
