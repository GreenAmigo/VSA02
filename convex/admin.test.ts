/// <reference types="vite/client" />

import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

async function withConsultantGrantEnvironment<T>(run: () => Promise<T>) {
  const previousGrantSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
  const previousAppEnvironment = process.env.APP_ENVIRONMENT;

  try {
    process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
    process.env.APP_ENVIRONMENT = "development";
    return await run();
  } finally {
    if (previousGrantSecret === undefined) {
      delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    } else {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousGrantSecret;
    }

    if (previousAppEnvironment === undefined) {
      delete process.env.APP_ENVIRONMENT;
    } else {
      process.env.APP_ENVIRONMENT = previousAppEnvironment;
    }
  }
}

async function grantConsultant(t: ReturnType<typeof convexTest>, userId: string, email: string, displayName: string) {
  await t.mutation(internal.admin.grantConsultantRole, {
    secret: "test-consultant-secret",
    userId,
    email,
    displayName,
  });
}

async function getFirstDepartmentId(actor: any, companyId: any) {
  const departments = await actor.query((api as any).admin.listWorkspaceDepartments, { companyId });
  if (!departments[0]?.departmentId) {
    throw new Error("No department found for invite setup");
  }
  return departments[0].departmentId;
}

const seedLegacyProjectMember = mutation({
  args: {
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    userId: v.string(),
    displayName: v.string(),
    role: v.union(v.literal("company-scorer"), v.literal("vendor")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("projectMembers", {
      companyId: args.companyId,
      projectId: args.projectId,
      userId: args.userId,
      displayName: args.displayName,
      role: args.role,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

describe("admin console actions", () => {
  test("vendor invitations cannot duplicate or move a contact between organisations", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "invite-admin", "admin@example.com", "Admin");
      const admin = t.withIdentity({ tokenIdentifier: "invite-admin" });
      const company = await admin.mutation(api.admin.createCompany, { name: "Invite workspace" });
      const first = await admin.mutation(api.admin.addWorkspaceVendor, {
        companyId: company.companyId, name: "First vendor", contactEmail: "contact@example.com",
      });
      const second = await admin.mutation(api.admin.addWorkspaceVendor, {
        companyId: company.companyId, name: "Second vendor",
      });
      expect(await admin.query(api.admin.listVendorContacts, {
        companyId: company.companyId, vendorId: first.vendorId,
      })).toEqual([]);
      const invite = { companyId: company.companyId, vendorId: first.vendorId, name: "Contact", email: "contact@example.com" };
      await admin.mutation(api.admin.inviteVendorContact, invite);
      await admin.mutation(api.admin.inviteVendorContact, { ...invite, email: " CONTACT@example.com " });
      await expect(admin.mutation(api.admin.inviteVendorContact, { ...invite, vendorId: second.vendorId }))
        .rejects.toThrow("already linked or invited");
      await expect(admin.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId, name: "Contact", email: invite.email, role: "vendor",
      })).rejects.toThrow("Manage contacts");
      await t.mutation(internal.access.acceptPendingInvitesForUser, { userId: "vendor-contact", email: invite.email });
      await expect(admin.mutation(api.admin.inviteVendorContact, { ...invite, vendorId: second.vendorId }))
        .rejects.toThrow("already linked or invited");
      const contacts = await admin.query(api.admin.listVendorContacts, { companyId: company.companyId, vendorId: first.vendorId });
      expect(contacts).toHaveLength(1);
      expect(contacts[0]).toMatchObject({ userId: "vendor-contact", status: "active", source: "member" });
      expect(await admin.query(api.admin.listVendorContacts, { companyId: company.companyId, vendorId: second.vendorId })).toEqual([]);
    });
  });

  test("a matching display name does not authorize name edits or project roster access", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const target = await t.run((ctx) => ctx.db.query("companyMembers")
      .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "beta-scorer")).unique());
    if (!target) throw new Error("Missing test scorer");
    const spoofedAdmin = t.withIdentity({ tokenIdentifier: "unrelated-user", email: "unrelated@example.com", name: "Beta Admin" });
    await expect(spoofedAdmin.mutation(api.admin.updateWorkspacePersonName, {
      companyId: seeded.companyBId, memberId: target._id, displayName: "Changed Name",
    })).rejects.toThrow("Only company admins");
    const scorerWithAdminName = t.withIdentity({ tokenIdentifier: "beta-scorer", name: "Beta Admin" });
    await expect(scorerWithAdminName.mutation(api.admin.updateWorkspacePersonName, {
      companyId: seeded.companyBId, memberId: target._id, displayName: "Changed Name",
    })).rejects.toThrow("Only company admins");
    const spoofedScorer = t.withIdentity({ tokenIdentifier: "unrelated-user", email: "unrelated@example.com", name: "Beta Scorer" });
    await expect(spoofedScorer.query(api.admin.listProjectMembers, { projectId: seeded.projectBId }))
      .rejects.toThrow("Project access denied");
  });

  test("activity actor names are resolved within each workspace without falling back to email", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      const seeded = await t.mutation(internal.access.seedScenario, {
        companyAName: "Acme Health", companyBName: "Beta Logistics",
        projectAName: "HR Platform", projectBName: "Supply Chain",
      });
      await grantConsultant(t, "activity-consultant", "consultant@example.com", "Activity Consultant");
      await t.run(async (ctx) => {
        await ctx.db.insert("companyMembers", {
          companyId: seeded.companyAId, userId: "beta-scorer", displayName: "Other Workspace Name",
          role: "company-scorer", isActive: true, createdAt: Date.now(),
        });
        for (const companyId of [seeded.companyAId, seeded.companyBId]) {
          await ctx.db.insert("activityLogs", {
            companyId, actorUserId: "beta-scorer", actorEmail: "scorer@example.com",
            action: "name_test", details: "Changed something.", createdAt: Date.now(),
          });
        }
        await ctx.db.insert("activityLogs", {
          companyId: seeded.companyBId, actorUserId: "user_unknown", actorEmail: "unknown@example.com",
          action: "name_test", details: "Changed something.", createdAt: Date.now(),
        });
      });
      const consultant = t.withIdentity({ tokenIdentifier: "activity-consultant" });
      const logs = (await consultant.query(api.admin.listActivityLogs, {})).filter((log) => log.action === "name_test");
      expect(logs.find((log) => log.companyId === seeded.companyAId)?.actorLabel).toBe("Other Workspace Name");
      expect(logs.find((log) => log.companyId === seeded.companyBId && log.actorUserId === "beta-scorer")?.actorLabel).toBe("Beta Scorer");
      expect(logs.find((log) => log.actorUserId === "user_unknown")?.actorLabel).toBe("Name not set — ask an admin to update it");
    });
  });

  test("admins and consultants can rename people and vendor contacts, with workspace checks and activity logs", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      const seeded = await t.mutation(internal.access.seedScenario, {
        companyAName: "Acme Health", companyBName: "Beta Logistics",
        projectAName: "HR Platform", projectBName: "Supply Chain",
      });
      await grantConsultant(t, "name-consultant", "consultant@example.com", "Name Consultant");
      const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
      const consultant = t.withIdentity({ tokenIdentifier: "name-consultant" });
      const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
      const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
      const targets = await t.run(async (ctx) => {
        const person = await ctx.db.query("companyMembers")
          .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "beta-scorer")).unique();
        const contact = await ctx.db.query("companyMembers")
          .withIndex("by_company_user", (q) => q.eq("companyId", seeded.companyBId).eq("userId", "northwind-vendor")).unique();
        if (!person || !contact?.vendorId) throw new Error("Missing test members");
        return { personId: person._id, contactId: contact._id, vendorId: contact.vendorId };
      });
      await expect(scorer.mutation(api.admin.updateWorkspacePersonName, {
        companyId: seeded.companyBId, memberId: targets.personId, displayName: "Blocked",
      })).rejects.toThrow("Only company admins");
      await expect(vendor.mutation(api.admin.updateWorkspacePersonName, {
        companyId: seeded.companyBId, memberId: targets.contactId, displayName: "Blocked",
      })).rejects.toThrow("Only company admins");
      await expect(consultant.mutation(api.admin.updateWorkspacePersonName, {
        companyId: seeded.companyAId, memberId: targets.personId, displayName: "Wrong Workspace",
      })).rejects.toThrow("Person not found in this workspace");
      await expect(admin.mutation(api.admin.updateWorkspacePersonName, {
        companyId: seeded.companyBId, memberId: targets.personId, displayName: "name@example.com",
      })).rejects.toThrow("not an email address");
      await admin.mutation(api.admin.updateWorkspacePersonName, {
        companyId: seeded.companyBId, memberId: targets.personId, displayName: "Updated Scorer",
      });
      await consultant.mutation(api.admin.updateWorkspacePersonName, {
        companyId: seeded.companyBId, memberId: targets.contactId, displayName: "Updated Contact",
      });
      const people = await admin.query(api.admin.listWorkspacePeople, { companyId: seeded.companyBId });
      expect(people.find((person) => person.userId === "beta-scorer")?.name).toBe("Updated Scorer");
      const contacts = await admin.query(api.admin.listVendorContacts, { companyId: seeded.companyBId, vendorId: targets.vendorId });
      expect(contacts.find((contact) => contact.userId === "northwind-vendor")?.name).toBe("Updated Contact");
      const roster = await admin.query(api.admin.listProjectMembers, { projectId: seeded.projectBId });
      expect(roster.find((row) => row.userId === "beta-scorer")?.displayName).toBe("Updated Scorer");
      const logs = await admin.query(api.admin.listActivityLogs, { companyId: seeded.companyBId });
      expect(logs.filter((log) => log.action === "update_workspace_person_name")).toHaveLength(2);
      expect(logs.some((log) => log.details.includes("Name: Beta Scorer -> Updated Scorer"))).toBe(true);

      const departmentId = await getFirstDepartmentId(admin, seeded.companyBId);
      const invite = await admin.mutation(api.admin.inviteWorkspacePerson, {
        companyId: seeded.companyBId, name: "Old Invite", email: "pending@example.com", role: "company-scorer", departmentId,
      });
      await admin.mutation(api.admin.updateWorkspacePersonName, {
        companyId: seeded.companyBId, inviteId: invite.inviteId, displayName: "New Invite",
      });
      await t.mutation(internal.access.acceptPendingInvitesForUser, {
        userId: "pending-user", email: "pending@example.com", displayName: "WorkOS Name",
      });
      const updatedPeople = await admin.query(api.admin.listWorkspacePeople, { companyId: seeded.companyBId });
      expect(updatedPeople.find((person) => person.userId === "pending-user")?.name).toBe("New Invite");
    });
  });

  test("project roster uses workspace scorer display names", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    await t.run(async (ctx) => {
      const assignment = await ctx.db.query("projectMembers")
        .withIndex("by_project_user", (q) => q.eq("projectId", seeded.projectBId).eq("userId", "beta-scorer")).unique();
      if (!assignment) throw new Error("Missing test assignment");
      await ctx.db.patch(assignment._id, { displayName: "scorer@beta.example" });
    });
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const roster = await admin.query(api.admin.listProjectMembers, { projectId: seeded.projectBId });
    expect(roster.find((row) => row.userId === "beta-scorer")?.displayName).toBe("Beta Scorer");
  });

  test("project roster uses vendor assignments and limits vendors to their own contact", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    const roster = await admin.query(api.admin.listProjectMembers, { projectId: seeded.projectBId });
    expect(roster.filter((row) => row.role === "vendor")).toHaveLength(1);
    expect(roster.find((row) => row.role === "vendor")?.displayName).toBe("Northwind Labs");
    const vendorRoster = await vendor.query(api.admin.listProjectMembers, { projectId: seeded.projectBId });
    expect(vendorRoster).toHaveLength(1);
    expect(vendorRoster[0].userId).toBe("northwind-vendor");
    await t.run(async (ctx) => {
      const assignment = await ctx.db.query("projectVendors")
        .withIndex("by_company_project", (q) => q.eq("companyId", seeded.companyBId).eq("projectId", seeded.projectBId)).first();
      if (!assignment) throw new Error("Missing test assignment");
      await ctx.db.delete(assignment._id);
    });
    await expect(vendor.query(api.admin.listProjectMembers, { projectId: seeded.projectBId })).rejects.toThrow("Project access denied");
    const unassignedRoster = await admin.query(api.admin.listProjectMembers, { projectId: seeded.projectBId });
    expect(unassignedRoster.filter((row) => row.role === "vendor")).toHaveLength(0);
  });

  test("company and project creation creates the expected company and project membership records", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "acme-admin", "acme-admin@example.com", "ACME Admin");

      const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });

      const company = await admin.mutation(api.admin.createCompany, {
        name: "Acme Health",
        ssoProvider: "microsoft-entra",
      });

      const project = await admin.mutation(api.admin.createProject, {
        companyId: company.companyId,
        name: "HR Platform Vendor Selection",
      });

      const members: ReadonlyArray<{ role: string }> = await admin.query(api.admin.listCompanyMembers, { companyId: company.companyId });
      const projectMembers: ReadonlyArray<{ role: string }> = await admin.query(api.admin.listProjectMembers, { projectId: project.projectId });

      expect(company.name).toBe("Acme Health");
      expect(project.companyId).toBe(company.companyId);
      expect(members.some((member) => member.role === "company-admin")).toBe(true);
      expect(projectMembers.some((member) => member.role === "company-admin")).toBe(true);
    });
  });

  test("a project member can load the project roster without being a company admin", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "acme-admin", "acme-admin@example.com", "ACME Admin");

      const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });
      const company = await admin.mutation(api.admin.createCompany, {
        name: "Green Workspace",
        ssoProvider: "google-workspace",
      });
      const project = await admin.mutation(api.admin.createProject, {
        companyId: company.companyId,
        name: "Green Assigned Project",
      });

      await admin.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Green Test1",
        email: "green-test-one@example.com",
        role: "company-scorer",
        departmentId: await getFirstDepartmentId(admin, company.companyId),
      });

      await t.mutation(internal.access.acceptPendingInvitesForUser, {
        userId: "green-test-one",
        email: "green-test-one@example.com",
        displayName: "Green Test1",
      });

      await admin.mutation(api.admin.addProjectScorer, {
        companyId: company.companyId,
        projectId: project.projectId,
        userId: "green-test-one",
        displayName: "Green Test1",
        email: "green-test-one@example.com",
      });

      const scorer = t.withIdentity({
        tokenIdentifier: "green-test-one",
        email: "green-test-one@example.com",
        name: "Green Test1",
        emailVerified: true,
      });

      const projectDetail = await scorer.query(api.access.getProject, { projectId: project.projectId });
      const roster = await scorer.query(api.admin.listProjectMembers, { projectId: project.projectId });

      expect(projectDetail._id).toBe(project.projectId);
      expect(roster.some((member: { displayName: string }) => member.displayName === "Green Test1")).toBe(true);
    });
  });

  test("a vendor contact assigned in two workspaces can open both projects and no unassigned project", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "multi-vendor-consultant", "consultant@example.com", "Consultant");

      const consultant = t.withIdentity({
        tokenIdentifier: "multi-vendor-consultant",
        email: "consultant@example.com",
        name: "Consultant",
      });

      const harbor = await consultant.mutation(api.admin.createCompany, {
        name: "Harbor Logistics Test",
        ssoProvider: "google-workspace",
      });
      const northway = await consultant.mutation(api.admin.createCompany, {
        name: "Northway Health Test",
        ssoProvider: "microsoft-entra",
      });

      const harborAssigned = await consultant.mutation(api.admin.createProject, {
        companyId: harbor.companyId,
        name: "Test Project 1",
      });
      const harborHidden = await consultant.mutation(api.admin.createProject, {
        companyId: harbor.companyId,
        name: "Hidden Harbor Project",
      });
      const northwayAssigned = await consultant.mutation(api.admin.createProject, {
        companyId: northway.companyId,
        name: "Test Project Frank",
      });

      const acmeHarbor = await consultant.mutation(api.admin.addWorkspaceVendor, {
        companyId: harbor.companyId,
        name: "Acme Software Test",
        contactEmail: "greenamigo+vendor@hotmail.co.uk",
      });
      const acmeNorthway = await consultant.mutation(api.admin.addWorkspaceVendor, {
        companyId: northway.companyId,
        name: "Acme Software Test",
        contactEmail: "greenamigo+vendor@hotmail.co.uk",
      });

      await consultant.mutation(api.admin.addProjectVendor, {
        companyId: harbor.companyId,
        projectId: harborAssigned.projectId,
        vendorId: acmeHarbor.vendorId,
      });
      await consultant.mutation(api.admin.addProjectVendor, {
        companyId: northway.companyId,
        projectId: northwayAssigned.projectId,
        vendorId: acmeNorthway.vendorId,
      });

      await consultant.mutation((api as any).admin.inviteVendorContact, {
        companyId: harbor.companyId,
        vendorId: acmeHarbor.vendorId,
        name: "Green Vendor",
        email: "greenamigo+vendor@hotmail.co.uk",
      });
      await consultant.mutation((api as any).admin.inviteVendorContact, {
        companyId: northway.companyId,
        vendorId: acmeNorthway.vendorId,
        name: "Green Vendor",
        email: "greenamigo+vendor@hotmail.co.uk",
      });

      await t.mutation(internal.access.acceptPendingInvitesForUser, {
        userId: "green-vendor-user",
        email: "greenamigo+vendor@hotmail.co.uk",
        displayName: "Green Vendor",
      });

      const vendor = t.withIdentity({
        tokenIdentifier: "green-vendor-user",
        email: "greenamigo+vendor@hotmail.co.uk",
        name: "Green Vendor",
      });

      const harborProject = await vendor.query(api.access.getProject, { projectId: harborAssigned.projectId });
      const northwayProject = await vendor.query(api.access.getProject, { projectId: northwayAssigned.projectId });

      expect(harborProject._id).toBe(harborAssigned.projectId);
      expect(northwayProject._id).toBe(northwayAssigned.projectId);
      await expect(vendor.query(api.access.getProject, { projectId: harborHidden.projectId })).rejects.toThrow("Project access denied");
    });
  });

  test("a scorer in two workspaces sees each workspace project data separately", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "multi-scorer-consultant", "consultant@example.com", "Consultant");

      const consultant = t.withIdentity({
        tokenIdentifier: "multi-scorer-consultant",
        email: "consultant@example.com",
        name: "Consultant",
      });

      const harbor = await consultant.mutation(api.admin.createCompany, {
        name: "Harbor Logistics Test",
        ssoProvider: "google-workspace",
      });
      const northway = await consultant.mutation(api.admin.createCompany, {
        name: "Northway Health Test",
        ssoProvider: "microsoft-entra",
      });

      const harborAssigned = await consultant.mutation(api.admin.createProject, {
        companyId: harbor.companyId,
        name: "Harbor Assigned",
      });
      const harborUnassigned = await consultant.mutation(api.admin.createProject, {
        companyId: harbor.companyId,
        name: "Harbor Unassigned",
      });
      const northwayAssigned = await consultant.mutation(api.admin.createProject, {
        companyId: northway.companyId,
        name: "Northway Assigned",
      });
      const northwayUnassigned = await consultant.mutation(api.admin.createProject, {
        companyId: northway.companyId,
        name: "Northway Unassigned",
      });

      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: harbor.companyId,
        name: "Green Test1",
        email: "green.multi@example.com",
        role: "company-scorer",
        departmentId: await getFirstDepartmentId(consultant, harbor.companyId),
      });
      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: northway.companyId,
        name: "Green Test1",
        email: "green.multi@example.com",
        role: "company-scorer",
        departmentId: await getFirstDepartmentId(consultant, northway.companyId),
      });

      await t.mutation(internal.access.acceptPendingInvitesForUser, {
        userId: "green-multi-user",
        email: "green.multi@example.com",
        displayName: "Green Test1",
      });

      await consultant.mutation(api.admin.addProjectScorer, {
        companyId: harbor.companyId,
        projectId: harborAssigned.projectId,
        userId: "green-multi-user",
        displayName: "Green Test1",
        email: "green.multi@example.com",
      });
      await consultant.mutation(api.admin.addProjectScorer, {
        companyId: northway.companyId,
        projectId: northwayAssigned.projectId,
        userId: "green-multi-user",
        displayName: "Green Test1",
        email: "green.multi@example.com",
      });

      const scorer = t.withIdentity({
        tokenIdentifier: "green-multi-user",
        email: "green.multi@example.com",
        name: "Green Test1",
      });

      const harborProjects = await scorer.query((api as any).access.listDashboardProjects, { companyId: harbor.companyId });
      const northwayProjects = await scorer.query((api as any).access.listDashboardProjects, { companyId: northway.companyId });

      expect(harborProjects.some((project: { _id: string }) => project._id === harborAssigned.projectId)).toBe(true);
      expect(harborProjects.some((project: { _id: string }) => project._id === harborUnassigned.projectId)).toBe(false);
      expect(northwayProjects.some((project: { _id: string }) => project._id === northwayAssigned.projectId)).toBe(true);
      expect(northwayProjects.some((project: { _id: string }) => project._id === northwayUnassigned.projectId)).toBe(false);
    });
  });

  test("project detail queries load for consultant, admin, scorer, and vendor when allowed", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "role-load-consultant", "consultant@example.com", "Consultant");

      const consultant = t.withIdentity({
        tokenIdentifier: "role-load-consultant",
        email: "consultant@example.com",
        name: "Consultant",
      });

      const company = await consultant.mutation(api.admin.createCompany, {
        name: "Role Load Workspace",
        ssoProvider: "google-workspace",
      });
      const project = await consultant.mutation(api.admin.createProject, {
        companyId: company.companyId,
        name: "Role Load Project",
      });

      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Role Scorer",
        email: "role.scorer@example.com",
        role: "company-scorer",
        departmentId: await getFirstDepartmentId(consultant, company.companyId),
      });
      await t.mutation(internal.access.acceptPendingInvitesForUser, {
        userId: "role-scorer-user",
        email: "role.scorer@example.com",
        displayName: "Role Scorer",
      });
      await consultant.mutation(api.admin.addProjectScorer, {
        companyId: company.companyId,
        projectId: project.projectId,
        userId: "role-scorer-user",
        displayName: "Role Scorer",
        email: "role.scorer@example.com",
      });

      const vendorOrg = await consultant.mutation(api.admin.addWorkspaceVendor, {
        companyId: company.companyId,
        name: "Role Vendor Org",
        contactEmail: "role.vendor@example.com",
      });
      await consultant.mutation(api.admin.addProjectVendor, {
        companyId: company.companyId,
        projectId: project.projectId,
        vendorId: vendorOrg.vendorId,
      });
      await consultant.mutation((api as any).admin.inviteVendorContact, {
        companyId: company.companyId,
        vendorId: vendorOrg.vendorId,
        name: "Role Vendor",
        email: "role.vendor@example.com",
      });
      await t.mutation(internal.access.acceptPendingInvitesForUser, {
        userId: "role-vendor-user",
        email: "role.vendor@example.com",
        displayName: "Role Vendor",
      });

      const admin = t.withIdentity({
        tokenIdentifier: "role-load-consultant",
        email: "consultant@example.com",
        name: "Consultant",
      });
      const scorer = t.withIdentity({
        tokenIdentifier: "role-scorer-user",
        email: "role.scorer@example.com",
        name: "Role Scorer",
      });
      const vendor = t.withIdentity({
        tokenIdentifier: "role-vendor-user",
        email: "role.vendor@example.com",
        name: "Role Vendor",
      });

      await expect(consultant.query(api.access.getProject, { projectId: project.projectId })).resolves.toBeTruthy();
      await expect(consultant.query((api as any).access.listProjectRequirements, { projectId: project.projectId })).resolves.toBeTruthy();
      await expect(consultant.query(api.admin.listProjectMembers, { projectId: project.projectId })).resolves.toBeTruthy();

      await expect(admin.query(api.access.getProject, { projectId: project.projectId })).resolves.toBeTruthy();
      await expect(admin.query((api as any).access.listProjectRequirements, { projectId: project.projectId })).resolves.toBeTruthy();
      await expect(admin.query(api.admin.listProjectMembers, { projectId: project.projectId })).resolves.toBeTruthy();

      await expect(scorer.query(api.access.getProject, { projectId: project.projectId })).resolves.toBeTruthy();
      await expect(scorer.query((api as any).access.listProjectRequirements, { projectId: project.projectId })).resolves.toBeTruthy();
      await expect(scorer.query(api.admin.listProjectMembers, { projectId: project.projectId })).resolves.toBeTruthy();

      await expect(vendor.query(api.access.getProject, { projectId: project.projectId })).resolves.toBeTruthy();
      await expect(vendor.query((api as any).access.listProjectRequirements, { projectId: project.projectId })).resolves.toBeTruthy();
      await expect(vendor.query((api as any).scores.listVendorAnswerRequirements, { projectId: project.projectId })).resolves.toBeTruthy();
    });
  });

  test("listProjectMembers ignores leftover legacy generated rows without writing", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "acme-admin", "acme-admin@example.com", "ACME Admin");

      const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });
      const company = await admin.mutation(api.admin.createCompany, {
        name: "Legacy Row Test",
        ssoProvider: "microsoft-entra",
      });
      const project = await admin.mutation(api.admin.createProject, {
        companyId: company.companyId,
        name: "Legacy Member Project",
      });

      await t.mutation(seedLegacyProjectMember as any, {
        companyId: company.companyId,
        projectId: project.projectId,
        userId: "vendor-legacy-member",
        displayName: "Legacy Vendor Member",
        role: "vendor",
      });

      const members = await admin.query(api.admin.listProjectMembers, { projectId: project.projectId });
      expect(members.some((member: { userId: string }) => member.userId === "vendor-legacy-member")).toBe(false);

      const membersAfter = await admin.query(api.admin.listProjectMembers, { projectId: project.projectId });
      expect(membersAfter.some((member: { userId: string }) => member.userId === "vendor-legacy-member")).toBe(false);
    });
  });

  test("project vendor and scorer assignment creates project-scoped rows", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "acme-admin", "acme-admin@example.com", "ACME Admin");

      const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });

      const company = await admin.mutation(api.admin.createCompany, {
        name: "Acme Health",
        ssoProvider: "microsoft-entra",
      });

      const project = await admin.mutation(api.admin.createProject, {
        companyId: company.companyId,
        name: "HR Platform",
      });

      const vendorOrg = await admin.mutation(api.admin.addWorkspaceVendor, {
        companyId: company.companyId,
        name: "Northwind Labs",
        contactEmail: "vendor@northwind.example",
      });

      const vendor = await admin.mutation(api.admin.addProjectVendor, {
        companyId: company.companyId,
        projectId: project.projectId,
        vendorId: vendorOrg.vendorId,
      });

      await admin.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Sam Lee",
        email: "sam@acme.example",
        role: "company-scorer",
        departmentId: await getFirstDepartmentId(admin, company.companyId),
      });

      await t.mutation(internal.access.acceptPendingInvitesForUser, {
        userId: "sam-lee",
        email: "sam@acme.example",
        displayName: "Sam Lee",
      });

      const scorer = await admin.mutation(api.admin.addProjectScorer, {
        companyId: company.companyId,
        projectId: project.projectId,
        userId: "sam-lee",
        displayName: "Sam Lee",
        email: "sam@acme.example",
      });

      expect(vendor.displayName).toBe("Northwind Labs");
      expect(scorer.displayName).toBe("Sam Lee");
      expect(vendor.role).toBe("vendor");
      expect(scorer.role).toBe("company-scorer");
    });
  });

  test("inviting a company admin or scorer without a department is rejected", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "invite-dept-consultant", "invite-dept@example.com", "Invite Dept Consultant");

      const admin = t.withIdentity({ tokenIdentifier: "invite-dept-consultant" });
      const company = await admin.mutation(api.admin.createCompany, {
        name: "Invite Department Requirement",
        ssoProvider: "google-workspace",
      });

      await expect(admin.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "No Department",
        email: "no.department@example.com",
        role: "company-scorer",
      })).rejects.toThrow("Select a department before inviting a company admin or scorer.");
    });
  });

  test("projects cannot assign department scorer rows", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "project-scorer-consultant", "project-scorer@example.com", "Project Scorer Consultant");

      const admin = t.withIdentity({ tokenIdentifier: "project-scorer-consultant" });
      const company = await admin.mutation(api.admin.createCompany, {
        name: "No Department Scorer Rows",
        ssoProvider: "google-workspace",
      });
      const project = await admin.mutation(api.admin.createProject, {
        companyId: company.companyId,
        name: "Scorer Assignment Project",
      });

      await expect(admin.mutation(api.admin.addProjectScorer, {
        companyId: company.companyId,
        projectId: project.projectId,
        userId: "department:operations",
        displayName: "Operations",
        email: "operations@example.com",
      })).rejects.toThrow("Workspace person not found");
    });
  });

  test("projects store their description and deadlines and enforce score and vendor assignment limits", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "acme-admin", "acme-admin@example.com", "ACME Admin");

      const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });
      const company = await admin.mutation(api.admin.createCompany, {
        name: "Acme Health",
        ssoProvider: "microsoft-entra",
      });

      const vendorDeadline = Date.now() + 1000 * 60 * 60 * 24 * 7;
      const scorerDeadline = Date.now() + 1000 * 60 * 60 * 24 * 14;
      const project = await admin.mutation(api.admin.createProject, {
        companyId: company.companyId,
        name: "Data Platform Selection",
        description: "Select a vendor for the new CRM data platform.",
        vendorDeadline,
        scorerDeadline,
      });

      expect(project.description).toBe("Select a vendor for the new CRM data platform.");
      expect(project.vendorDeadline).toBe(vendorDeadline);
      expect(project.scorerDeadline).toBe(scorerDeadline);

      for (let index = 0; index < 10; index += 1) {
        await admin.mutation(api.admin.addProjectVendor, {
          companyId: company.companyId,
          projectId: project.projectId,
          displayName: `Vendor ${index + 1}`,
          email: `vendor${index + 1}@example.com`,
        });
      }

      await expect(admin.mutation(api.admin.addProjectVendor, {
        companyId: company.companyId,
        projectId: project.projectId,
        displayName: "Vendor 11",
        email: "vendor11@example.com",
      })).rejects.toThrow("Project vendor limit reached");

      for (let index = 0; index < 20; index += 1) {
        const email = `scorer${index + 1}@example.com`;
        const userId = `user-scorer-${index + 1}`;
        await admin.mutation(api.admin.inviteWorkspacePerson, {
          companyId: company.companyId,
          name: `Scorer ${index + 1}`,
          email,
          role: "company-scorer",
          departmentId: await getFirstDepartmentId(admin, company.companyId),
        });
        await t.mutation(internal.access.acceptPendingInvitesForUser, {
          userId,
          email,
          displayName: `Scorer ${index + 1}`,
        });
        await admin.mutation(api.admin.addProjectScorer, {
          companyId: company.companyId,
          projectId: project.projectId,
          userId,
          displayName: `Scorer ${index + 1}`,
          email,
        });
      }

      await admin.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Scorer 21",
        email: "scorer21@example.com",
        role: "company-scorer",
        departmentId: await getFirstDepartmentId(admin, company.companyId),
      });
      await t.mutation(internal.access.acceptPendingInvitesForUser, {
        userId: "user-scorer-21",
        email: "scorer21@example.com",
        displayName: "Scorer 21",
      });

      await expect(admin.mutation(api.admin.addProjectScorer, {
        companyId: company.companyId,
        projectId: project.projectId,
        userId: "user-scorer-21",
        displayName: "Scorer 21",
        email: "scorer21@example.com",
      })).rejects.toThrow("Project scorer limit reached");
    });
  });

  test("company admins can edit project details, archive and restore, with activity log entries", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "edit-project-admin", "edit.project.admin@example.com", "Edit Project Admin");

      const admin = t.withIdentity({ tokenIdentifier: "edit-project-admin" });
      const company = await admin.mutation(api.admin.createCompany, {
        name: "Project Edit Workspace",
        ssoProvider: "google-workspace",
      });

      const project = await admin.mutation(api.admin.createProject, {
        companyId: company.companyId,
        name: "Initial Name",
        description: "Initial description",
        vendorDeadline: Date.now() + 1000 * 60 * 60,
        scorerDeadline: Date.now() + 1000 * 60 * 60 * 2,
      });

      await expect(admin.mutation((api as any).admin.updateProject, {
        companyId: company.companyId,
        projectId: project.projectId,
        name: "Updated Name",
        description: "Updated description",
        vendorDeadline: Date.now() + 1000 * 60 * 60 * 3,
        scorerDeadline: Date.now() + 1000 * 60 * 60,
      })).rejects.toThrow("Scorer deadline can't be before the vendor deadline");

      const updated = await admin.mutation((api as any).admin.updateProject, {
        companyId: company.companyId,
        projectId: project.projectId,
        name: "Updated Name",
        description: "Updated description",
        vendorDeadline: Date.now() + 1000 * 60 * 60,
        scorerDeadline: Date.now() + 1000 * 60 * 60 * 4,
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.description).toBe("Updated description");

      const archived = await admin.mutation((api as any).admin.archiveProject, {
        companyId: company.companyId,
        projectId: project.projectId,
      });
      expect(archived.isArchived).toBe(true);

      const restored = await admin.mutation((api as any).admin.restoreProject, {
        companyId: company.companyId,
        projectId: project.projectId,
      });
      expect(restored.isArchived).toBe(false);

      const logs = await admin.query(api.admin.listActivityLogs, { companyId: company.companyId });
      expect(logs.some((entry: { action: string }) => entry.action === "update_project")).toBe(true);
      expect(logs.some((entry: { action: string }) => entry.action === "archive_project")).toBe(true);
      expect(logs.some((entry: { action: string }) => entry.action === "restore_project")).toBe(true);
    });
  });

  test("scorers and vendors are rejected from project edit and archive actions", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      const seeded = await t.mutation(internal.access.seedScenario, {
        companyAName: "Acme Health",
        companyBName: "Beta Logistics",
        projectAName: "HR Platform",
        projectBName: "Supply Chain",
      });

      const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer", email: "scorer@beta.example", name: "Beta Scorer", emailVerified: true });
      const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor", email: "vendor@northwind.example", name: "Northwind Labs", emailVerified: true });

      await expect(scorer.mutation((api as any).admin.updateProject, {
        companyId: seeded.companyBId,
        projectId: seeded.projectBId,
        name: "Blocked scorer edit",
      })).rejects.toThrow("Only company admins or VS Consultants can manage this company");

      await expect(vendor.mutation((api as any).admin.updateProject, {
        companyId: seeded.companyBId,
        projectId: seeded.projectBId,
        name: "Blocked vendor edit",
      })).rejects.toThrow("Only company admins or VS Consultants can manage this company");

      await expect(scorer.mutation((api as any).admin.archiveProject, {
        companyId: seeded.companyBId,
        projectId: seeded.projectBId,
      })).rejects.toThrow("Only company admins or VS Consultants can manage this company");

      await expect(vendor.mutation((api as any).admin.restoreProject, {
        companyId: seeded.companyBId,
        projectId: seeded.projectBId,
      })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    });
  });

  test("re-importing a workspace by the same stable id does not create duplicate companies", async () => {
    const t = convexTest({ schema, modules });
    const workspace = {
      id: "acme-health-seed",
      slug: "acme-health",
      name: "Acme Health",
      domain: "acme.example",
      projects: [{
        id: "proj-acme-hr",
        name: "HR Platform",
        status: "Active" as const,
        vendorCount: 1,
        scorerCount: 1,
        requirementCount: 1,
        leadingVendor: "Northwind Labs",
      }],
      people: [{
        id: "person-acme-admin",
        name: "Frank Maxwell",
        role: "company-admin",
        team: "Operations",
        project: "HR Platform",
      }],
      vendors: [{
        id: "vendor-northwind",
        name: "Northwind Labs",
        status: "Active" as const,
        project: "HR Platform",
        score: 88,
      }],
      requirements: [{
        id: "REQ-101",
        title: "Recruitment workflow reporting",
        type: "Functional" as const,
        priority: "High" as const,
        status: "Active" as const,
      }],
      scores: [{
        scorer: "Frank Maxwell",
        vendor: "Northwind Labs",
        score: 88,
        status: "Submitted" as const,
      }],
    };

    const previousAppEnvironment = process.env.APP_ENVIRONMENT;
    const previousSeedSecret = process.env.CONVEX_PREVIEW_SEED_SECRET;
    const previousGrantSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;

    try {
      process.env.APP_ENVIRONMENT = "development";
      process.env.CONVEX_PREVIEW_SEED_SECRET = "test-preview-seed-secret";
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "seed-import",
        email: "seed-import@example.com",
        displayName: "Seed Importer",
      });

      const seededIdentity = t.withIdentity({
        tokenIdentifier: "seed-import",
        email: "seed-import@example.com",
        name: "Seed Importer",
      });

      await seededIdentity.mutation(api.workspaceSeed.importWorkspaceBundle, { workspaces: [workspace] });
      await seededIdentity.mutation(api.workspaceSeed.importWorkspaceBundle, { workspaces: [{ ...workspace, slug: "acme-health-v2" }] });

      const companies: ReadonlyArray<{ name: string; _id: string }> = await seededIdentity.query(api.access.listAccessibleCompanies, {});
      const acmeCompanies = companies.filter((company: { name: string; _id: string }) => company.name === "Acme Health");
      expect(acmeCompanies).toHaveLength(1);

      const sameUserSeed = await t.mutation(internal.admin.seedPreviewWorkspaceData, {
        secret: "test-preview-seed-secret",
      });
      const reSeedList: ReadonlyArray<{ name: string; _id: string }> = await seededIdentity.query(api.access.listAccessibleCompanies, {});
      const reSeedAcme = reSeedList.filter((company: { name: string; _id: string }) => company.name === "Acme Health");

      expect(sameUserSeed.createdCompanies).toBeGreaterThan(0);
      expect(reSeedAcme).toHaveLength(1);
    } finally {
      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }

      if (previousSeedSecret === undefined) {
        delete process.env.CONVEX_PREVIEW_SEED_SECRET;
      } else {
        process.env.CONVEX_PREVIEW_SEED_SECRET = previousSeedSecret;
      }

      if (previousGrantSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousGrantSecret;
      }
    }
  });

  test("a VS Consultant can archive and restore a workspace, and archive hides it from company users", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      const seeded = await t.mutation(internal.access.seedScenario, {
        companyAName: "Acme Health",
        companyBName: "Beta Logistics",
        companyCName: "Maxwell Knight Ltd",
        projectAName: "HR Platform",
        projectBName: "Supply Chain",
      });
      await grantConsultant(t, "workspace-consultant", "consultant@example.com", "Workspace Consultant");

      const consultant = t.withIdentity({ tokenIdentifier: "workspace-consultant" });
      const companyAdmin = t.withIdentity({ tokenIdentifier: "acme-admin" });

      const archived = await consultant.mutation(api.admin.archiveCompany, {
        companyId: seeded.companyAId,
      });

      expect(archived.isActive).toBe(false);

      const visibleCompanies: ReadonlyArray<{ _id: string }> = await companyAdmin.query(api.access.listAccessibleCompanies, {});
      expect(visibleCompanies.some((item) => item._id === seeded.companyAId)).toBe(false);
      await expect(companyAdmin.query(api.access.getCompany, { companyId: seeded.companyAId })).rejects.toThrow("Company access denied");

      const restored = await consultant.mutation(api.admin.restoreCompany, {
        companyId: seeded.companyAId,
      });

      expect(restored.isActive).toBe(true);
      const visibleAfterRestore = await companyAdmin.query(api.access.listAccessibleCompanies, {});
      expect(visibleAfterRestore.some((item) => item._id === seeded.companyAId)).toBe(true);
    });
  });

  test("vendor contacts are blocked from company screens and cannot manage another workspace's vendors", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "consultant-user", "consultant@example.com", "Consultant User");

      const consultant = t.withIdentity({ tokenIdentifier: "consultant-user" });
      const companyA = await consultant.mutation(api.admin.createCompany, { name: "Acme Health", ssoProvider: "microsoft-entra" });
      const companyB = await consultant.mutation(api.admin.createCompany, { name: "Beta Logistics", ssoProvider: "google-workspace" });

      const vendorOrg = await consultant.mutation((api as any).admin.addWorkspaceVendor, {
        companyId: companyA.companyId,
        name: "Northwind Labs",
        contactEmail: "vendor@northwind.example",
      });

      await consultant.mutation((api as any).admin.inviteVendorContact, {
        companyId: companyA.companyId,
        vendorId: vendorOrg.vendorId,
        name: "Northwind Contact",
        email: "northwind-contact@example.com",
      });

      const vendorIdentity = t.withIdentity({ tokenIdentifier: "vendor-contact-user", email: "northwind-contact@example.com", name: "Northwind Contact" });
      await vendorIdentity.action((api as any).access.acceptPendingInvites, {});

      await expect(vendorIdentity.query((api as any).admin.listWorkspacePeople, { companyId: companyA.companyId })).rejects.toThrow();
      await expect(vendorIdentity.query((api as any).admin.listWorkspaceDepartments, { companyId: companyA.companyId })).rejects.toThrow();
      await expect(vendorIdentity.query((api as any).admin.listActivityLogs, { companyId: companyA.companyId })).rejects.toThrow();
      await expect(vendorIdentity.query((api as any).admin.listWorkspaceVendors, { companyId: companyB.companyId })).rejects.toThrow();

      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: companyA.companyId,
        name: "Acme Admin",
        email: "admin@acme.example.com",
        role: "company-admin",
        departmentId: await getFirstDepartmentId(consultant, companyA.companyId),
      });

      const companyAdminIdentity = t.withIdentity({ tokenIdentifier: "company-admin-user", email: "admin@acme.example.com", name: "Acme Admin" });
      await companyAdminIdentity.action((api as any).access.acceptPendingInvites, {});

      await expect(companyAdminIdentity.mutation((api as any).admin.addWorkspaceVendor, {
        companyId: companyB.companyId,
        name: "Barn Owl Outsourcing",
        contactEmail: "hello@barnowl.example",
      })).rejects.toThrow();
    });
  });

  test("only VS Consultants can create, archive, restore, and delete workspaces", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });

      await grantConsultant(t, "workspace-consultant", "consultant@example.com", "Workspace Consultant");
      const consultant = t.withIdentity({ tokenIdentifier: "workspace-consultant" });
      const company = await consultant.mutation(api.admin.createCompany, {
        name: "Atlas Medical",
        ssoProvider: "google-workspace",
      });

      const companyAdmin = t.withIdentity({ tokenIdentifier: "regular-company-admin" });

      await expect(companyAdmin.mutation(api.admin.createCompany, {
        name: "Blocked Workspace",
      })).rejects.toThrow("Only VS Consultants can manage workspaces");

      await expect(companyAdmin.mutation(api.admin.archiveCompany, {
        companyId: company.companyId,
      })).rejects.toThrow("Only VS Consultants can manage workspaces");

      await expect(companyAdmin.mutation(api.admin.restoreCompany, {
        companyId: company.companyId,
      })).rejects.toThrow("Only VS Consultants can manage workspaces");

      await expect(companyAdmin.mutation(api.admin.deleteCompany, {
        companyId: company.companyId,
        confirmationName: "Atlas Medical",
      })).rejects.toThrow("Only VS Consultants can manage workspaces");
    });
  });

  test("workspace delete requires archive first and exact name match", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "workspace-delete-consultant", "delete-consultant@example.com", "Delete Consultant");

      const consultant = t.withIdentity({ tokenIdentifier: "workspace-delete-consultant" });

      const company = await consultant.mutation(api.admin.createCompany, {
        name: "Atlas Medical",
        ssoProvider: "google-workspace",
      });

      const project = await consultant.mutation(api.admin.createProject, {
        companyId: company.companyId,
        name: "Procurement Review",
      });

      await expect(consultant.mutation(api.admin.deleteCompany, {
        companyId: company.companyId,
        confirmationName: "Atlas Medical",
      })).rejects.toThrow("archive this workspace first");

      await consultant.mutation(api.admin.archiveCompany, {
        companyId: company.companyId,
      });

      await expect(consultant.mutation(api.admin.deleteCompany, {
        companyId: company.companyId,
        confirmationName: "Wrong Name",
      })).rejects.toThrow("match the workspace name");

      const deleted = await consultant.mutation(api.admin.deleteCompany, {
        companyId: company.companyId,
        confirmationName: "Atlas Medical",
      });

      expect(project.projectId).toBeTruthy();
      expect(deleted.companyId).toBe(company.companyId);
      expect(deleted.deletedProjects).toBeGreaterThanOrEqual(1);
    });
  });

  test("workspace lifecycle actions write the expected activity log rows", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "activity-log-consultant", "activity-log@consultant.example", "Activity Log Consultant");

      const consultant = t.withIdentity({ tokenIdentifier: "activity-log-consultant" });

      const created = await consultant.mutation(api.admin.createCompany, {
        name: "Delete Me Test",
        ssoProvider: "google-workspace",
      });

      await consultant.mutation(api.admin.archiveCompany, {
        companyId: created.companyId,
      });

      await consultant.mutation(api.admin.restoreCompany, {
        companyId: created.companyId,
      });

      await consultant.mutation(api.admin.archiveCompany, {
        companyId: created.companyId,
      });

      await consultant.mutation(api.admin.deleteCompany, {
        companyId: created.companyId,
        confirmationName: "Delete Me Test",
      });

      const logs: ReadonlyArray<{ action: string; companyId?: string; workspaceName?: string }> = await consultant.query(api.admin.listActivityLogs, {});
      const companyLogs = logs.filter((log: { action: string; companyId?: string; workspaceName?: string }) => log.companyId === created.companyId);
      const actions = companyLogs.map((log: { action: string; companyId?: string; workspaceName?: string }) => log.action);

      expect(actions).toEqual(expect.arrayContaining([
        "create_workspace",
        "archive_workspace",
        "restore_workspace",
        "delete_workspace",
      ]));

      expect(companyLogs.some((log) => log.action === "create_workspace" && log.workspaceName === "Delete Me Test")).toBe(true);
      expect(companyLogs.some((log) => log.action === "archive_workspace" && log.workspaceName === "Delete Me Test")).toBe(true);
      expect(companyLogs.some((log) => log.action === "delete_workspace" && log.workspaceName === "Delete Me Test")).toBe(true);
    });
  });

  test("consultants can see all lifecycle activity logs and company admins cannot", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "audit-log-consultant", "audit-log@consultant.example", "Audit Log Consultant");

      const consultant = t.withIdentity({ tokenIdentifier: "audit-log-consultant" });
      const companyAdmin = t.withIdentity({ tokenIdentifier: "regular-company-admin" });

      const company = await consultant.mutation(api.admin.createCompany, {
        name: "Delete Me Test",
        ssoProvider: "google-workspace",
      });

      await consultant.mutation(api.admin.archiveCompany, {
        companyId: company.companyId,
      });

      await consultant.mutation(api.admin.deleteCompany, {
        companyId: company.companyId,
        confirmationName: "Delete Me Test",
      });

      const consultantLogs: ReadonlyArray<{ action: string; companyId?: string; workspaceName?: string }> = await consultant.query(api.admin.listActivityLogs, {});
      const companyRows = consultantLogs.filter((log: { action: string; companyId?: string; workspaceName?: string }) => log.companyId === company.companyId);

      expect(companyRows.length).toBeGreaterThanOrEqual(3);
      expect(companyRows.some((log) => log.action === "delete_workspace" && log.workspaceName === "Delete Me Test")).toBe(true);
      await expect(companyAdmin.query(api.admin.listActivityLogs, {})).rejects.toThrow("Only VS Consultants can manage workspaces");
    });
  });

  test("a consultant can cancel a pending invitation and the activity log records the action", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "phase3a-consultant", "phase3a@consultant.example", "Phase 3A Consultant");

      const consultant = t.withIdentity({ tokenIdentifier: "phase3a-consultant" });
      const company = await consultant.mutation(api.admin.createCompany, {
        name: "Phase 3A Company",
        ssoProvider: "google-workspace",
      });

      await consultant.mutation((api as any).admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Aisha Ali",
        email: "aisha@phase3a.example",
        role: "company-scorer",
        departmentId: await getFirstDepartmentId(consultant, company.companyId),
      });

      await consultant.mutation((api as any).admin.cancelWorkspaceInvite, {
        companyId: company.companyId,
        email: "aisha@phase3a.example",
      });

      const people = await consultant.query((api as any).admin.listWorkspacePeople, { companyId: company.companyId });
      expect(people.some((person: any) => person.email === "aisha@phase3a.example" && person.status === "cancelled")).toBe(true);

      const logs = await consultant.query(api.admin.listActivityLogs, { companyId: company.companyId });
      expect(logs.some((log: any) => log.action === "cancel_workspace_invite" && log.details.includes("aisha@phase3a.example"))).toBe(true);
    });
  });

  test("a consultant can create departments and assign members to them", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "phase3b-consultant", "phase3b@consultant.example", "Phase 3B Consultant");

      const consultant = t.withIdentity({ tokenIdentifier: "phase3b-consultant" });
      const company = await consultant.mutation(api.admin.createCompany, {
        name: "Phase 3B Company",
        ssoProvider: "google-workspace",
      });

      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Ops Member",
        email: "ops.member@phase3b.example",
        role: "company-scorer",
        departmentId: await getFirstDepartmentId(consultant, company.companyId),
      });

      await t.mutation(internal.access.acceptPendingInvitesForUser, {
        userId: "ops-member",
        email: "ops.member@phase3b.example",
        displayName: "Ops Member",
      });

      const department = await consultant.mutation((api as any).admin.createWorkspaceDepartment, {
        companyId: company.companyId,
        name: "Operations",
      });

      await consultant.mutation((api as any).admin.addWorkspaceDepartmentMember, {
        companyId: company.companyId,
        departmentId: department.departmentId,
        userId: "ops-member",
      });

      const departments = await consultant.query((api as any).admin.listWorkspaceDepartments, { companyId: company.companyId });
      const operations = departments.find((row: any) => row.name === "Operations");
      expect(operations).toBeDefined();
      if (!operations) {
        throw new Error("Operations department was not created");
      }
      expect(operations.members.some((member: any) => member.userId === "ops-member")).toBe(true);
    });
  });

  test("reactivation restores access for a previously deactivated workspace person", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "reactivate-consultant", "reactivate@consultant.example", "Reactivation Consultant");

      const consultant = t.withIdentity({ tokenIdentifier: "reactivate-consultant" });
      const company = await consultant.mutation(api.admin.createCompany, {
        name: "Reactivate Company",
        ssoProvider: "google-workspace",
      });

      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Reactivated User",
        email: "reactivate.user@example.com",
        role: "company-scorer",
        departmentId: await getFirstDepartmentId(consultant, company.companyId),
      });

      const invitedUser = t.withIdentity({
        tokenIdentifier: "reactivate-member",
        email: "reactivate.user@example.com",
        emailVerified: true,
        name: "Reactivated User",
      });

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "reactivate-member", email: "reactivate.user@example.com", email_verified: true, name: "Reactivated User" }), { status: 200 }));
        await invitedUser.action(api.access.acceptPendingInvites, {});
      } finally {
        globalThis.fetch = originalFetch;
      }

      let access: { role: string | null; companyIds: string[] } = await invitedUser.query(api.access.getCurrentUserAccess, {});
      expect(access.role).toBe("company-scorer");
      expect(access.companyIds).toEqual([company.companyId]);

      await consultant.mutation(api.admin.deactivateWorkspacePerson, {
        companyId: company.companyId,
        email: "reactivate.user@example.com",
      });

      access = await invitedUser.query(api.access.getCurrentUserAccess, {});
      expect(access.role).toBeNull();
      expect(access.companyIds).toEqual([]);

      await consultant.mutation(api.admin.reactivateWorkspacePerson, {
        companyId: company.companyId,
        email: "reactivate.user@example.com",
      });

      access = await invitedUser.query(api.access.getCurrentUserAccess, {});
      expect(access.role).toBe("company-scorer");
      expect(access.companyIds).toEqual([company.companyId]);
    });
  });

  test("a company admin cannot reactivate someone from another workspace", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "cross-admin-consultant", "cross@consultant.example", "Cross Admin Consultant");

      const consultant = t.withIdentity({ tokenIdentifier: "cross-admin-consultant" });
      const companyA = await consultant.mutation(api.admin.createCompany, {
        name: "Alpha Workspace",
        ssoProvider: "google-workspace",
      });
      const companyB = await consultant.mutation(api.admin.createCompany, {
        name: "Beta Workspace",
        ssoProvider: "google-workspace",
      });

      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: companyA.companyId,
        name: "Alpha Admin",
        email: "alpha.admin@example.com",
        role: "company-admin",
        departmentId: await getFirstDepartmentId(consultant, companyA.companyId),
      });
      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: companyB.companyId,
        name: "Beta Admin",
        email: "beta.admin@example.com",
        role: "company-admin",
        departmentId: await getFirstDepartmentId(consultant, companyB.companyId),
      });

      const alphaAdmin = t.withIdentity({
        tokenIdentifier: "alpha-admin",
        email: "alpha.admin@example.com",
        emailVerified: true,
        name: "Alpha Admin",
      });
      const betaAdmin = t.withIdentity({
        tokenIdentifier: "beta-admin",
        email: "beta.admin@example.com",
        emailVerified: true,
        name: "Beta Admin",
      });

      const originalFetch = globalThis.fetch;
      try {
        const fetchMock = vi.fn()
          .mockResolvedValueOnce(new Response(JSON.stringify({ id: "alpha-admin", email: "alpha.admin@example.com", email_verified: true, name: "Alpha Admin" }), { status: 200 }))
          .mockResolvedValueOnce(new Response(JSON.stringify({ id: "beta-admin", email: "beta.admin@example.com", email_verified: true, name: "Beta Admin" }), { status: 200 }));
        globalThis.fetch = fetchMock;
        await alphaAdmin.action(api.access.acceptPendingInvites, {});
        await betaAdmin.action(api.access.acceptPendingInvites, {});
      } finally {
        globalThis.fetch = originalFetch;
      }

      await consultant.mutation(api.admin.deactivateWorkspacePerson, {
        companyId: companyB.companyId,
        email: "beta.admin@example.com",
      });

      await expect(alphaAdmin.mutation(api.admin.reactivateWorkspacePerson, {
        companyId: companyB.companyId,
        email: "beta.admin@example.com",
      })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    });
  });

  test("a consultant sees each workspace person once and accepted invites do not appear as extra people", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "people-unique-consultant", "people@consultant.example", "People Unique Consultant");

      const consultant = t.withIdentity({ tokenIdentifier: "people-unique-consultant" });
      const company = await consultant.mutation(api.admin.createCompany, {
        name: "People Unique Company",
        ssoProvider: "google-workspace",
      });

      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Single Person",
        email: "single.person@example.com",
        role: "company-scorer",
        departmentId: await getFirstDepartmentId(consultant, company.companyId),
      });

      const invitedUser = t.withIdentity({
        tokenIdentifier: "single-person-user",
        email: "single.person@example.com",
        emailVerified: true,
        name: "Single Person",
      });

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "single-person-user", email: "single.person@example.com", email_verified: true, name: "Single Person" }), { status: 200 }));
        await invitedUser.action(api.access.acceptPendingInvites, {});
      } finally {
        globalThis.fetch = originalFetch;
      }

      const people = await consultant.query(api.admin.listWorkspacePeople, { companyId: company.companyId });
      const matching = people.filter((person: any) => person.email === "single.person@example.com");
      expect(matching).toHaveLength(1);
      expect(matching[0].status).toBe("active");
    });
  });

  test("a consultant can invite a person and the matching verified email accepts the invite after sign-in", async () => {
    await withConsultantGrantEnvironment(async () => {
      const t = convexTest({ schema, modules });
      await grantConsultant(t, "phase3a-consultant", "phase3a@consultant.example", "Phase 3A Consultant");

      const consultant = t.withIdentity({ tokenIdentifier: "phase3a-consultant" });
      const company = await consultant.mutation(api.admin.createCompany, {
        name: "Phase 3A Company",
        ssoProvider: "google-workspace",
      });

      await consultant.mutation((api as any).admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Aisha Ali",
        email: "aisha@phase3a.example",
        role: "company-scorer",
        departmentId: await getFirstDepartmentId(consultant, company.companyId),
      });

      const people = await consultant.query((api as any).admin.listWorkspacePeople, { companyId: company.companyId });
      expect(people.some((person: any) => person.email === "aisha@phase3a.example" && person.status === "invited")).toBe(true);

      const invitedUser = t.withIdentity({
        tokenIdentifier: "aisha-phase3a",
        email: "aisha@phase3a.example",
        emailVerified: true,
        name: "Aisha Ali",
      });

      await invitedUser.action(api.access.acceptPendingInvites, {});

      const access = await invitedUser.query(api.access.getCurrentUserAccess, {});
      const companyAccess: ReadonlyArray<{ _id: string }> = await invitedUser.query(api.access.listAccessibleCompanies, {});

      expect(access.isConsultant).toBe(false);
      expect(access.role).toBe("company-scorer");
      expect(access.companyIds).toEqual(expect.arrayContaining([company.companyId]));
      expect(companyAccess.some((item) => item._id === company.companyId)).toBe(true);
    });
  });
});

