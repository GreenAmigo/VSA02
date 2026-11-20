import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const answerDetails = v.object({
  answerId: v.id("scores"),
  contactUserId: v.string(),
  contactName: v.string(),
  requirementId: v.string(),
  score: v.union(v.literal(0), v.literal(1)),
  comment: v.union(v.string(), v.null()),
  enteredAt: v.number(),
  amendedAt: v.union(v.number(), v.null()),
});

async function resolveOrganisation(
  ctx: MutationCtx,
  row: Doc<"scores">,
  companyId: Id<"companies">,
) {
  const members = await ctx.db.query("companyMembers")
    .withIndex("by_company_user", (q) => q.eq("companyId", companyId).eq("userId", row.vendorUserId))
    .take(2);
  const contactName = members.length === 1 ? members[0].displayName : row.vendorUserId;
  const details = {
    answerId: row._id,
    contactUserId: row.vendorUserId,
    contactName,
    requirementId: row.requirementId,
    score: row.score,
    comment: row.comment ?? null,
    enteredAt: row.enteredAt,
    amendedAt: row.amendedAt ?? null,
  };
  if (row.companyId !== companyId) return { matched: false, details, reason: "Answer belongs to a different workspace." } as const;
  if (row.vendorId) {
    const vendor = await ctx.db.get(row.vendorId);
    if (!vendor || vendor.companyId !== companyId) return { matched: false, details, reason: "Stored organisation is not in this workspace." } as const;
    return { matched: true, details, vendor } as const;
  }
  if (members.length !== 1 || members[0].role !== "vendor" || !members[0].vendorId) {
    return { matched: false, details, reason: "Contact does not have exactly one linked vendor membership." } as const;
  }
  const vendor = await ctx.db.get(members[0].vendorId);
  if (!vendor || vendor.companyId !== companyId) {
    return { matched: false, details, reason: "Contact's organisation is not in this workspace." } as const;
  }
  return { matched: true, details, vendor } as const;
}

export const backfillVendorAnswerOrganizations = internalMutation({
  args: {
    projectId: v.id("projects"),
    linksRepaired: v.boolean(),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    changes: v.array(v.object({
      answer: answerDetails,
      vendorId: v.id("vendorOrganizations"),
      vendorName: v.string(),
    })),
    unresolved: v.array(v.object({ answer: answerDetails, reason: v.string() })),
    conflicts: v.array(v.object({
      vendorId: v.id("vendorOrganizations"),
      vendorName: v.string(),
      requirementId: v.string(),
      answers: v.array(answerDetails),
    })),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (!["development", "preview"].includes((process.env.APP_ENVIRONMENT ?? "production").trim().toLowerCase())) {
      throw new Error("Vendor answer backfill is only available in development or preview.");
    }
    if (!args.linksRepaired) throw new Error("Repair and review the contact links before running this backfill.");
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found.");
    const page = await ctx.db.query("scores")
      .withIndex("by_project_requirement", (q) => q.eq("projectId", args.projectId))
      .paginate({ numItems: 50, cursor: args.cursor ?? null });
    const changes: Array<{ answer: typeof answerDetails.type; vendorId: Id<"vendorOrganizations">; vendorName: string }> = [];
    const unresolved: Array<{ answer: typeof answerDetails.type; reason: string }> = [];
    const conflicts: Array<{ vendorId: Id<"vendorOrganizations">; vendorName: string; requirementId: string; answers: Array<typeof answerDetails.type> }> = [];

    for (const requirementId of new Set(page.page.map((row) => row.requirementId))) {
      const requirements = ctx.db.query("requirements")
        .withIndex("by_company_requirement", (q) => q.eq("companyId", project.companyId).eq("requirementId", requirementId));
      let requirementCount = 0;
      for await (const requirement of requirements) {
        if (requirement.projectId === args.projectId) requirementCount++;
      }
      const related = await ctx.db.query("scores")
        .withIndex("by_project_requirement", (q) => q.eq("projectId", args.projectId).eq("requirementId", requirementId))
        .take(1001);
      if (related.length > 1000) throw new Error("Too many answers for one requirement to review safely.");
      const candidates = await Promise.all(related.map(async (row) => ({
        row,
        result: await resolveOrganisation(ctx, row, project.companyId),
      })));
      const byVendor = new Map<Id<"vendorOrganizations">, typeof candidates>();
      for (const candidate of candidates) {
        if (candidate.result.matched) {
          const vendorId = candidate.result.vendor._id;
          const group = byVendor.get(vendorId) ?? [];
          group.push(candidate);
          byVendor.set(vendorId, group);
        }
      }
      for (const group of byVendor.values()) {
        if (group.length < 2) continue;
        const result = group[0].result;
        if (!result.matched) continue;
        conflicts.push({
          vendorId: result.vendor._id,
          vendorName: result.vendor.name,
          requirementId,
          answers: group.map((candidate) => candidate.result.details),
        });
      }
      const pageIds = new Set(page.page.map((row) => row._id));
      for (const { row, result } of candidates) {
        if (!pageIds.has(row._id)) continue;
        if (requirementCount !== 1) {
          unresolved.push({ answer: result.details, reason: "Requirement is missing or duplicated in this project." });
        } else if (!result.matched) {
          unresolved.push({ answer: result.details, reason: result.reason });
        } else if (!row.vendorId) {
          await ctx.db.patch(row._id, { vendorId: result.vendor._id });
          changes.push({ answer: result.details, vendorId: result.vendor._id, vendorName: result.vendor.name });
        }
      }
    }
    return { changes, unresolved, conflicts, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});
