import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function updateMemberDisplayName(ctx: MutationCtx, member: Doc<"companyMembers">, displayName: string) {
  await ctx.db.patch(member._id, { displayName });
  const projectMembers = ctx.db.query("projectMembers")
    .withIndex("by_company_user", (q) => q.eq("companyId", member.companyId).eq("userId", member.userId));
  for await (const assignment of projectMembers) {
    await ctx.db.patch(assignment._id, { displayName });
  }
  const departmentMembers = ctx.db.query("departmentMembers")
    .withIndex("by_company_user", (q) => q.eq("companyId", member.companyId).eq("userId", member.userId));
  for await (const assignment of departmentMembers) {
    await ctx.db.patch(assignment._id, { displayName });
  }
}

export const MISSING_PERSON_NAME = "Name not set — ask an admin to update it";

export function isPersonName(value: string | null | undefined, userId: string) {
  const name = value?.trim();
  return Boolean(name && name !== userId && !/^(scorer|admin|vendor)$/i.test(name) && !name.includes("|") && !name.includes("@")
    && !/^workos[_-]/i.test(name)
    && !/^user[_:-]/i.test(name)
    && !/^org[_:-]/i.test(name));
}

export function personDisplayName(value: string | null | undefined, userId = "") {
  return isPersonName(value, userId) ? value!.trim() : MISSING_PERSON_NAME;
}

export function recordedPersonName(currentName: string | undefined, snapshot: string | null | undefined, userId: string) {
  return currentName && currentName !== MISSING_PERSON_NAME ? currentName : personDisplayName(snapshot, userId);
}

export async function getWorkspacePersonName(ctx: Pick<QueryCtx, "db">, companyId: Id<"companies"> | undefined, userId: string, snapshot?: string | null) {
  if (companyId) {
    const members = ctx.db.query("companyMembers")
      .withIndex("by_company_user", (q) => q.eq("companyId", companyId).eq("userId", userId));
    for await (const member of members) {
      if (isPersonName(member.displayName, userId)) return member.displayName.trim();
    }
  }
  const consultant = await ctx.db.query("consultants").withIndex("by_user", (q) => q.eq("userId", userId)).first();
  if (isPersonName(consultant?.displayName, userId)) return consultant!.displayName.trim();
  return personDisplayName(snapshot, userId);
}

export async function getScorerDisplayNames(
  ctx: Pick<QueryCtx, "db">,
  project: { _id: Id<"projects">; companyId: Id<"companies"> },
  additionalUserIds: string[] = [],
) {
  const names = new Map<string, string>();
  const userIds = new Set(additionalUserIds);
  const assignments = ctx.db.query("projectMembers")
    .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", project._id));
  for await (const assignment of assignments) {
    if (assignment.role !== "vendor") {
      userIds.add(assignment.userId);
      if (isPersonName(assignment.displayName, assignment.userId)) {
        names.set(assignment.userId, assignment.displayName.trim());
      }
    }
  }
  for (const userId of userIds) {
    const members = ctx.db.query("companyMembers")
      .withIndex("by_company_user", (q) => q.eq("companyId", project.companyId).eq("userId", userId));
    for await (const member of members) {
      if (member.role !== "vendor" && isPersonName(member.displayName, member.userId)) {
        names.set(member.userId, member.displayName.trim());
        if (member.isActive) break;
      }
    }
  }
  return names;
}

export function resolveScorerDisplayName(params: {
  enteredByUserId?: string | null;
  enteredByDisplayName?: string | null;
  displayNameByUserId: Map<string, string>;
}) {
  const userId = params.enteredByUserId ?? "";
  const name = params.displayNameByUserId.get(userId);
  if (name) return name;
  return personDisplayName(params.enteredByDisplayName, userId);
}
