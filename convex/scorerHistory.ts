import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export async function scorerHistoryNeedsMigration(ctx: Pick<QueryCtx, "db">, projectId: Id<"projects">) {
  const score = await ctx.db.query("scorerScores")
    .withIndex("by_project_vendor_id_scope_requirement", (q) => q.eq("projectId", projectId).eq("vendorId", undefined))
    .first();
  const completion = await ctx.db.query("scorerCompletions")
    .withIndex("by_project_vendor_id_scope", (q) => q.eq("projectId", projectId).eq("vendorId", undefined))
    .first();
  return Boolean(score || completion);
}

export async function getVendorScorerHistory(
  ctx: Pick<QueryCtx, "db">,
  projectId: Id<"projects">,
  vendorId: Id<"vendorOrganizations">,
) {
  const grouped = new Map<string, Map<string, Doc<"scorerScores">[]>>();
  const rows = ctx.db.query("scorerScores")
    .withIndex("by_project_vendor_id_scope_requirement", (q) => q.eq("projectId", projectId).eq("vendorId", vendorId));
  for await (const row of rows) {
    const requirements = grouped.get(row.scorerScopeKey) ?? new Map<string, Doc<"scorerScores">[]>();
    const scores = requirements.get(row.requirementId) ?? [];
    scores.push(row);
    requirements.set(row.requirementId, scores);
    grouped.set(row.scorerScopeKey, requirements);
  }
  const scores: Doc<"scorerScores">[] = [];
  let hasConflicts = false;
  for (const requirements of grouped.values()) {
    for (const entries of requirements.values()) {
      if (entries.length === 1) scores.push(entries[0]);
      else hasConflicts = true;
    }
  }
  return { scores, hasConflicts, grouped };
}

export async function getVendorScorerCompletion(
  ctx: Pick<QueryCtx, "db">,
  projectId: Id<"projects">,
  vendorId: Id<"vendorOrganizations">,
  scopeKey: string,
) {
  const rows = await ctx.db.query("scorerCompletions")
    .withIndex("by_project_vendor_id_scope", (q) => q.eq("projectId", projectId).eq("vendorId", vendorId).eq("scorerScopeKey", scopeKey))
    .take(2);
  return { completion: rows.length === 1 ? rows[0] : null, hasConflict: rows.length > 1 };
}

export async function assertWritableScorerHistory(
  ctx: Pick<QueryCtx, "db">,
  projectId: Id<"projects">,
  vendorId: Id<"vendorOrganizations">,
  scopeKey: string,
) {
  if (await scorerHistoryNeedsMigration(ctx, projectId)) {
    throw new Error("Company scoring history needs migration before it can be edited. Ask a workspace admin for help.");
  }
  const state = await getVendorScorerHistory(ctx, projectId, vendorId);
  const completion = await getVendorScorerCompletion(ctx, projectId, vendorId, scopeKey);
  if (state.hasConflicts || completion.hasConflict) {
    throw new Error("Company scoring history has conflicting records. Ask a workspace admin to resolve them before editing.");
  }
  return { state, completion: completion.completion };
}
