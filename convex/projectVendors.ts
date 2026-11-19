import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export type ProjectVendor = {
  vendorId: Id<"vendorOrganizations">;
  vendorName: string;
  contacts: Doc<"companyMembers">[];
  primaryContact: Doc<"companyMembers"> | null;
};

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
    contacts.sort((a, b) => a.createdAt - b.createdAt);
    vendors.push({
      vendorId: organization._id,
      vendorName: organization.name,
      contacts,
      primaryContact: contacts[0] ?? null,
    });
  }
  return vendors;
}

export function findProjectVendorByUserId(vendors: ProjectVendor[], userId: string) {
  return vendors.find((vendor) => vendor.contacts.some((contact) => contact.userId === userId)) ?? null;
}
