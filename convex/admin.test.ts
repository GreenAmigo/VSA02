/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
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

