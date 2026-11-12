/// <reference types="vite/client" />

import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
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

describe("admin console actions", () => {
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

      const vendor = await admin.mutation(api.admin.addProjectVendor, {
        companyId: company.companyId,
        projectId: project.projectId,
        displayName: "Northwind Labs",
        email: "vendor@northwind.example",
      });

      const scorer = await admin.mutation(api.admin.addProjectScorer, {
        companyId: company.companyId,
        projectId: project.projectId,
        displayName: "Sam Lee",
        email: "sam@acme.example",
        role: "individual",
      });

      expect(vendor.displayName).toBe("Northwind Labs");
      expect(scorer.displayName).toBe("Sam Lee");
      expect(vendor.role).toBe("vendor");
      expect(scorer.role).toBe("company-scorer");
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
        await admin.mutation(api.admin.addProjectScorer, {
          companyId: company.companyId,
          projectId: project.projectId,
          displayName: `Scorer ${index + 1}`,
          email: `scorer${index + 1}@example.com`,
          role: "individual",
        });
      }

      await expect(admin.mutation(api.admin.addProjectScorer, {
        companyId: company.companyId,
        projectId: project.projectId,
        displayName: "Scorer 21",
        email: "scorer21@example.com",
        role: "individual",
      })).rejects.toThrow("Project scorer limit reached");
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

    try {
      process.env.APP_ENVIRONMENT = "development";
      process.env.CONVEX_PREVIEW_SEED_SECRET = "test-preview-seed-secret";

      await t.mutation(api.workspaceSeed.importWorkspaceBundle, { workspaces: [workspace] });
      await t.mutation(api.workspaceSeed.importWorkspaceBundle, { workspaces: [{ ...workspace, slug: "acme-health-v2" }] });

      const seededIdentity = t.withIdentity({
        tokenIdentifier: "seed-import",
        email: "seed-import@example.com",
        name: "Seed Importer",
      });

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

      const department = await consultant.mutation((api as any).admin.createWorkspaceDepartment, {
        companyId: company.companyId,
        name: "Operations",
      });

      await consultant.mutation((api as any).admin.addWorkspaceDepartmentMember, {
        companyId: company.companyId,
        departmentId: department.departmentId,
        userId: "phase3b-consultant",
      });

      const departments = await consultant.query((api as any).admin.listWorkspaceDepartments, { companyId: company.companyId });
      expect(departments).toHaveLength(1);
      expect(departments[0].name).toBe("Operations");
      expect(departments[0].members.some((member: any) => member.userId === "phase3b-consultant")).toBe(true);
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
      });
      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: companyB.companyId,
        name: "Beta Admin",
        email: "beta.admin@example.com",
        role: "company-admin",
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

