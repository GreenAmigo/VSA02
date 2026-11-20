import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

type HistoryRow = Doc<"scorerScores"> | Doc<"scorerCompletions"> | Doc<"projectViews"> | Doc<"projectDeadlines"> | Doc<"scoreAmendments">;

const recordValidator = v.union(
  schema.doc("scorerScores"), schema.doc("scorerCompletions"), schema.doc("projectViews"),
  schema.doc("projectDeadlines"), schema.doc("scoreAmendments"),
);
const matchedValidator = v.object({
  record: recordValidator,
  contactName: v.string(),
  vendorId: v.id("vendorOrganizations"),
  vendorName: v.string(),
});

async function resolveHistory(ctx: MutationCtx, row: HistoryRow, companyId: Id<"companies">) {
  const userId = "targetUserId" in row ? row.targetUserId : row.vendorUserId;
  const members = await ctx.db.query("companyMembers")
    .withIndex("by_company_user", (q) => q.eq("companyId", companyId).eq("userId", userId))
    .take(2);
  const contactName = members.length === 1 ? members[0].displayName : userId;
  if (row.companyId !== companyId) return { matched: false, contactName, reason: "Record belongs to a different workspace." } as const;
  let vendorId = row.vendorId;
  if (!vendorId && "originalScore" in row) {
    const answers = await ctx.db.query("scores")
      .withIndex("by_project_requirement", (q) => q.eq("projectId", row.projectId).eq("requirementId", row.requirementId))
      .take(1001);
    if (answers.length > 1000) throw new Error("Too many answers for one requirement to review safely.");
    const matchingAnswers = answers.filter((answer) => answer.companyId === companyId && answer.vendorUserId === row.vendorUserId);
    if (matchingAnswers.length !== 1 || !matchingAnswers[0].vendorId) {
      return { matched: false, contactName, reason: "History does not match exactly one snapshotted vendor answer." } as const;
    }
    vendorId = matchingAnswers[0].vendorId;
  }
  if (!vendorId) {
    if (members.length !== 1 || members[0].role !== "vendor" || !members[0].vendorId) {
      return { matched: false, contactName, reason: "Contact does not have exactly one linked vendor membership." } as const;
    }
    vendorId = members[0].vendorId;
  }
  const vendor = await ctx.db.get(vendorId);
  if (!vendor || vendor.companyId !== companyId) {
    return { matched: false, contactName, reason: "Organisation is not in this workspace." } as const;
  }
  return { matched: true, contactName, vendor } as const;
}

async function relatedHistory(ctx: MutationCtx, row: HistoryRow): Promise<HistoryRow[]> {
  if ("originalScore" in row) return [row];
  if ("targetType" in row) {
    return await ctx.db.query("projectDeadlines")
      .withIndex("by_project_target", (q) => q.eq("projectId", row.projectId).eq("targetType", "vendor"))
      .take(1001);
  }
  if ("viewText" in row) {
    return await ctx.db.query("projectViews")
      .withIndex("by_project_scorer", (q) => q.eq("projectId", row.projectId).eq("scorerUserId", row.scorerUserId))
      .take(1001);
  }
  if ("score" in row) {
    return await ctx.db.query("scorerScores")
      .withIndex("by_project_scope_requirement", (q) => q.eq("projectId", row.projectId)
        .eq("scorerScopeKey", row.scorerScopeKey).eq("requirementId", row.requirementId))
      .take(1001);
  }
  return await ctx.db.query("scorerCompletions")
    .withIndex("by_project_scope", (q) => q.eq("projectId", row.projectId).eq("scorerScopeKey", row.scorerScopeKey))
    .take(1001);
}

export const backfillVendorHistoryOrganizations = internalMutation({
  args: {
    projectId: v.id("projects"),
    recordType: v.union(v.literal("scorerScores"), v.literal("scorerCompletions"), v.literal("projectViews"), v.literal("projectDeadlines"), v.literal("scoreAmendments")),
    linksRepaired: v.boolean(),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    changes: v.array(matchedValidator),
    unresolved: v.array(v.object({ record: recordValidator, contactName: v.string(), reason: v.string() })),
    conflicts: v.array(v.object({ vendorId: v.id("vendorOrganizations"), vendorName: v.string(), records: v.array(matchedValidator) })),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (!["development", "preview"].includes((process.env.APP_ENVIRONMENT ?? "production").trim().toLowerCase())) {
      throw new Error("Vendor history backfill is only available in development or preview.");
    }
    if (!args.linksRepaired) throw new Error("Repair and review the contact links before running this backfill.");
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found.");
    const options = { numItems: 25, cursor: args.cursor ?? null };
    const page = args.recordType === "scorerScores"
      ? await ctx.db.query("scorerScores").withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId)).paginate(options)
      : args.recordType === "scorerCompletions"
        ? await ctx.db.query("scorerCompletions").withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId)).paginate(options)
        : args.recordType === "projectViews"
          ? await ctx.db.query("projectViews").withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId)).paginate(options)
          : args.recordType === "projectDeadlines"
            ? await ctx.db.query("projectDeadlines").withIndex("by_project_target", (q) => q.eq("projectId", args.projectId).eq("targetType", "vendor")).paginate(options)
            : await ctx.db.query("scoreAmendments").withIndex("by_project_vendor", (q) => q.eq("projectId", args.projectId)).paginate(options);
    const changes: Array<typeof matchedValidator.type> = [];
    const unresolved: Array<{ record: HistoryRow; contactName: string; reason: string }> = [];
    const conflicts: Array<{ vendorId: Id<"vendorOrganizations">; vendorName: string; records: Array<typeof matchedValidator.type> }> = [];
    const reported = new Set<string>();

    for (const row of page.page) {
      const result = await resolveHistory(ctx, row, project.companyId);
      if (!result.matched) {
        unresolved.push({ record: row, contactName: result.contactName, reason: result.reason });
        continue;
      }
      const related = await relatedHistory(ctx, row);
      if (related.length > 1000) throw new Error("Too many related history records to review safely.");
      const matches: Array<typeof matchedValidator.type> = [];
      for (const other of related) {
        const candidate = await resolveHistory(ctx, other, project.companyId);
        if (candidate.matched && candidate.vendor._id === result.vendor._id) {
          matches.push({ record: other, contactName: candidate.contactName, vendorId: candidate.vendor._id, vendorName: candidate.vendor.name });
        }
      }
      if (matches.length > 1) {
        const key = matches.map((match) => match.record._id).sort().join(":");
        if (!reported.has(key)) {
          conflicts.push({ vendorId: result.vendor._id, vendorName: result.vendor.name, records: matches });
          reported.add(key);
        }
        continue;
      }
      if (!row.vendorId) {
        await ctx.db.patch(row._id, { vendorId: result.vendor._id });
        changes.push({ record: row, contactName: result.contactName, vendorId: result.vendor._id, vendorName: result.vendor.name });
      }
    }
    return { changes, unresolved, conflicts, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});
