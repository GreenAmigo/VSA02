import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export async function getProjectVendorAnswerState(
  ctx: Pick<QueryCtx, "db">,
  project: { _id: Id<"projects">; companyId: Id<"companies"> },
) {
  const grouped = new Map<Id<"vendorOrganizations">, Map<string, Doc<"scores">[]>>();
  let migrationRequired = false;
  const rows = ctx.db.query("scores")
    .withIndex("by_project_requirement", (q) => q.eq("projectId", project._id));
  for await (const row of rows) {
    if (row.companyId !== project.companyId) throw new Error("A vendor answer belongs to a different workspace.");
    if (!row.vendorId) {
      migrationRequired = true;
      continue;
    }
    const requirements = grouped.get(row.vendorId) ?? new Map<string, Doc<"scores">[]>();
    const answers = requirements.get(row.requirementId) ?? [];
    answers.push(row);
    requirements.set(row.requirementId, answers);
    grouped.set(row.vendorId, requirements);
  }
  return { grouped, migrationRequired };
}

export function getUnconflictedVendorAnswers(
  state: Awaited<ReturnType<typeof getProjectVendorAnswerState>>,
  vendorId: Id<"vendorOrganizations">,
) {
  const result = new Map<string, Doc<"scores">>();
  for (const [requirementId, answers] of state.grouped.get(vendorId) ?? []) {
    if (answers.length === 1) result.set(requirementId, answers[0]);
  }
  return result;
}

export function requireWritableVendorAnswer(
  state: Awaited<ReturnType<typeof getProjectVendorAnswerState>>,
  vendorId: Id<"vendorOrganizations">,
  requirementId: string,
) {
  if (state.migrationRequired) {
    throw new Error("Vendor answers need migration before they can be edited. Ask a workspace admin for help.");
  }
  const answers = state.grouped.get(vendorId)?.get(requirementId) ?? [];
  if (answers.length > 1) {
    throw new Error("This requirement has conflicting vendor answers. Ask a workspace admin to resolve them before editing.");
  }
  return answers[0] ?? null;
}
