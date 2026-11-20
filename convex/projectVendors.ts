import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export type ProjectVendor = {
  assignmentId: Id<"projectVendors">;
  assignedAt: number;
  vendorId: Id<"vendorOrganizations">;
  vendorName: string;
  contacts: Doc<"companyMembers">[];
  primaryContact: Doc<"companyMembers"> | null;
};

export async function assertNoOtherActiveVendorContact(
  ctx: Pick<QueryCtx, "db">,
  companyId: Id<"companies">,
  vendorId: Id<"vendorOrganizations">,
  exceptUserId?: string,
) {
  const members = ctx.db.query("companyMembers")
    .withIndex("by_company_role", (q) => q.eq("companyId", companyId).eq("role", "vendor"));
  for await (const member of members) {
    if (member.isActive && member.vendorId === vendorId && member.userId !== exceptUserId) {
      throw new Error(`This vendor already has an active contact, ${member.displayName}. Deactivate them first to invite someone else.`);
    }
  }
}

export async function getProjectVendors(
  ctx: Pick<QueryCtx, "db">,
  project: { _id: Id<"projects">; companyId: Id<"companies"> },
): Promise<ProjectVendor[]> {
  const contactsByVendor = new Map<Id<"vendorOrganizations">, Doc<"companyMembers">[]>();
  const members = ctx.db.query("companyMembers")
    .withIndex("by_company_role", (q) => q.eq("companyId", project.companyId).eq("role", "vendor"));
  for await (const member of members) {
    if (member.isActive && member.vendorId) {
      const contacts = contactsByVendor.get(member.vendorId) ?? [];
      contacts.push(member);
      contactsByVendor.set(member.vendorId, contacts);
    }
  }

  const vendors: ProjectVendor[] = [];
  const assignments = ctx.db.query("projectVendors")
    .withIndex("by_company_project", (q) => q.eq("companyId", project.companyId).eq("projectId", project._id));
  for await (const assignment of assignments) {
    const organization = await ctx.db.get(assignment.vendorId);
    if (!organization || organization.companyId !== project.companyId) {
      throw new Error("Project vendor organisation not found in this workspace");
    }
    const contacts = contactsByVendor.get(assignment.vendorId) ?? [];
    vendors.push({
      assignmentId: assignment._id,
      assignedAt: assignment.createdAt,
      vendorId: organization._id,
      vendorName: organization.name,
      contacts,
      primaryContact: contacts.length === 1 ? contacts[0] : null,
    });
  }
  return vendors;
}

export function findProjectVendorByUserId(vendors: ProjectVendor[], userId: string) {
  const matches = vendors.filter((vendor) => vendor.contacts.some((contact) => contact.userId === userId));
  if (matches.length > 1) throw new Error("This contact has conflicting vendor organisation links. Ask a workspace admin to resolve them.");
  return matches[0] ?? null;
}

export async function findVendorMembershipForIdentity(
  ctx: Pick<QueryCtx, "db">,
  companyId: Id<"companies">,
  identity: { subject?: string; tokenIdentifier?: string; email?: string },
) {
  const userIds = [identity.subject, identity.tokenIdentifier].filter((id): id is string => Boolean(id));
  const email = identity.email?.trim().toLowerCase();
  const matches: Doc<"companyMembers">[] = [];
  const memberships = ctx.db.query("companyMembers")
    .withIndex("by_company_role", (q) => q.eq("companyId", companyId).eq("role", "vendor"));
  for await (const member of memberships) {
    if (member.isActive && (userIds.includes(member.userId) || (email && member.email?.trim().toLowerCase() === email))) {
      matches.push(member);
    }
  }
  if (matches.length > 1) throw new Error("This contact has multiple vendor memberships. Ask a workspace admin to resolve them.");
  return matches[0] ?? null;
}

export async function hasVendorMembershipForIdentity(
  ctx: Pick<QueryCtx, "db">,
  identity: { subject?: string; tokenIdentifier?: string; email?: string },
) {
  const userIds = new Set([identity.subject, identity.tokenIdentifier].filter((id): id is string => Boolean(id)));
  for (const userId of userIds) {
    const members = ctx.db.query("companyMembers").withIndex("by_user", (q) => q.eq("userId", userId));
    for await (const member of members) {
      if (member.isActive && member.role === "vendor") return true;
    }
  }
  const email = identity.email?.trim().toLowerCase();
  if (email) {
    const members = ctx.db.query("companyMembers").withIndex("by_email", (q) => q.eq("email", email));
    for await (const member of members) {
      if (member.isActive && member.role === "vendor") return true;
    }
  }
  return false;
}

export async function resolveProjectVendorContact(
  ctx: Pick<QueryCtx, "db">,
  project: { _id: Id<"projects">; companyId: Id<"companies"> },
  identity: { subject?: string; tokenIdentifier?: string; email?: string },
) {
  const member = await findVendorMembershipForIdentity(ctx, project.companyId, identity);
  if (!member?.vendorId) return null;
  const vendorId = member.vendorId;
  const organization = await ctx.db.get(vendorId);
  if (!organization || organization.companyId !== project.companyId) return null;
  const assignment = await ctx.db.query("projectVendors")
    .withIndex("by_project_vendor", (q) => q.eq("projectId", project._id).eq("vendorId", vendorId))
    .unique();
  if (!assignment || assignment.companyId !== project.companyId) return null;
  return { member, organization, assignment };
}
