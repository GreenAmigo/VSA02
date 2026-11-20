import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export async function vendorDeadlinesNeedMigration(ctx: Pick<QueryCtx, "db">, projectId: Id<"projects">) {
  const rows = ctx.db.query("projectDeadlines")
    .withIndex("by_project_target", (q) => q.eq("projectId", projectId).eq("targetType", "vendor"));
  for await (const row of rows) {
    if (!row.vendorId) return true;
  }
  return false;
}

export async function getVendorDeadline(
  ctx: Pick<QueryCtx, "db">,
  projectId: Id<"projects">,
  vendorId: Id<"vendorOrganizations">,
) {
  const rows = await ctx.db.query("projectDeadlines")
    .withIndex("by_project_vendor_id", (q) => q.eq("projectId", projectId).eq("vendorId", vendorId))
    .take(2);
  if (rows.some((row) => row.targetType !== "vendor")) {
    throw new Error("A vendor deadline is linked to the wrong type of record.");
  }
  return { deadline: rows.length === 1 ? rows[0] : null, hasConflict: rows.length > 1 };
}

export async function requireWritableVendorDeadline(
  ctx: Pick<QueryCtx, "db">,
  projectId: Id<"projects">,
  vendorId: Id<"vendorOrganizations">,
) {
  if (await vendorDeadlinesNeedMigration(ctx, projectId)) {
    throw new Error("Vendor deadline history needs migration before changes can be made. Ask a workspace admin for help.");
  }
  const state = await getVendorDeadline(ctx, projectId, vendorId);
  if (state.hasConflict) {
    throw new Error("This vendor has conflicting deadlines. Ask a workspace admin to resolve them before making changes.");
  }
  return state.deadline;
}
