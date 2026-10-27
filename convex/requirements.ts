import { mutation } from "./_generated/server";
import { v } from "convex/values";

const requirementRowValidator = v.object({
  id: v.string(),
  text: v.string(),
  type: v.union(v.literal("user-story"), v.literal("nfr")),
  priority: v.union(v.literal(9), v.literal(3), v.literal(1), v.literal(0)),
  status: v.optional(v.union(v.literal("active"), v.literal("withdrawn"))),
});

function isProjectMember(userId: string, role: string | undefined) {
  return userId && role !== undefined && (role === "company-admin" || role === "company-scorer");
}

async function assertProjectImportAccess(ctx: any, projectId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const project = await ctx.db.get(projectId as any);
  if (!project) {
    throw new Error("Project not found");
  }

  const projectMember = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), projectId))
    .filter((q: any) => q.eq(q.field("userId"), identity.tokenIdentifier))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();

  if (!projectMember || !isProjectMember(identity.tokenIdentifier, projectMember.role)) {
    throw new Error("Project access denied");
  }

  if (projectMember.companyId !== project.companyId) {
    throw new Error("Project access denied");
  }

  return { project, identity };
}

function buildRequirementPlan(projectId: string, companyId: string, existing: any[], rows: any[]) {
  const existingById = new Map(existing.map((item) => [item.requirementId, item]));
  const incomingById = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const next: any[] = [...existing];
  let added = 0;
  let updated = 0;
  let withdrawn = 0;

  for (const row of rows) {
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
    changes: rows.map((row) => {
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
    const { project } = await assertProjectImportAccess(ctx, args.projectId);
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

    const { project } = await assertProjectImportAccess(ctx, args.projectId);
    const existing = await ctx.db
      .query("requirements")
      .withIndex("by_company_project", (q) =>
        q.eq("companyId", project.companyId).eq("projectId", args.projectId),
      )
      .collect();

    const plan = buildRequirementPlan(project._id, project.companyId, existing, args.rows);
    const seen = new Set<string>();

    for (const row of args.rows) {
      const match = existing.find((item) => item.requirementId === row.id);
      seen.add(row.id);

      if (!match) {
        await ctx.db.insert("requirements", {
          companyId: project.companyId,
          projectId: args.projectId,
          requirementId: row.id,
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

    return {
      projectId: args.projectId,
      count: args.rows.length,
      summary: plan.summary,
    };
  },
});
