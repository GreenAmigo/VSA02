/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 2 access checks", () => {
  test("a user can only see companies and projects they belong to", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "frazer-knight-admin" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    const adminCompanies = await admin.query(api.access.listAccessibleCompanies, {});
    const vendorCompanies = await vendor.query(api.access.listAccessibleCompanies, {});
    const vendorProject = await vendor.query(api.access.getProject, { projectId: seeded.projectBId });

    expect(adminCompanies.map((company) => company._id)).toContain(seeded.companyCId);
    expect(vendorCompanies.map((company) => company._id)).not.toContain(seeded.companyAId);
    expect(vendorCompanies.map((company) => company._id)).toContain(seeded.companyBId);
    expect(vendorProject._id).toBe(seeded.projectBId);
  });

  test("Maxwell Knight admin can access their company and is rejected from other projects", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "frazer-knight-admin" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    const accessibleCompanies = await admin.query(api.access.listAccessibleCompanies, {});
    const myCompany = await admin.query(api.access.getCompany, { companyId: seeded.companyCId });

    expect(accessibleCompanies.map((company) => company._id)).toContain(seeded.companyCId);
    expect(myCompany.name).toBe("Maxwell Knight Ltd");
    await expect(vendor.query(api.access.getCompany, { companyId: seeded.companyCId })).rejects.toThrow("Company access denied");
  });

  test("a granted VS Consultant sees every workspace, including a newly created one, and legacy company consultant rows are migrated away", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const previousSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "development";

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "workos_user_frazer_preview",
        email: "frazerknight@hotmail.com",
        displayName: "Frazer Knight",
      });

      const consultant = t.withIdentity({
        tokenIdentifier: "workos_user_frazer_preview",
        email: "frazerknight@hotmail.com",
        name: "Frazer Knight",
      });

      const company = await consultant.query(api.access.getCompany, { companyId: seeded.companyAId });
      const companies = await consultant.query(api.access.listAccessibleCompanies, {});
      const project = await consultant.query(api.access.getProject, { projectId: seeded.projectBId });

      expect(company.name).toBe("Acme Health");
      expect(companies.some((item) => item._id === seeded.companyAId)).toBe(true);
      expect(companies.some((item) => item._id === seeded.companyBId)).toBe(true);
      expect(companies.some((item) => item._id === seeded.companyCId)).toBe(true);
      expect(project._id).toBe(seeded.projectBId);

      const created = await consultant.mutation(api.admin.createCompany, { name: "New Client Workspace" });
      const updatedCompanies = await consultant.query(api.access.listAccessibleCompanies, {});
      expect(updatedCompanies.some((item) => item._id === created.companyId)).toBe(true);

      const access = await consultant.query(api.access.getCurrentUserAccess, {});
      expect(access.isConsultant).toBe(true);
      expect(access.role).toBe("vs-consultant");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });

  test("Consultant grants cannot run in Production", async () => {
    const t = convexTest({ schema, modules });
    const previousSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "production";

      await expect(
        t.mutation(internal.admin.grantConsultantRole, {
          secret: "test-consultant-secret",
          userId: "workos_user_frazer_preview",
          email: "frazerknight@hotmail.com",
          displayName: "Frazer Knight",
        }),
      ).rejects.toThrow("Consultant role grants are disabled in production");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });

  test("missing APP_ENVIRONMENT blocks the grant guard as production", async () => {
    const t = convexTest({ schema, modules });
    const previousSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      delete process.env.APP_ENVIRONMENT;

      await expect(
        t.mutation(internal.admin.grantConsultantRole, {
          secret: "test-consultant-secret",
          userId: "missing-env-user",
          email: "missing-env@example.com",
          displayName: "Missing Env User",
        }),
      ).rejects.toThrow("Consultant role grants are disabled in production");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });

  test("a user cannot become a consultant without the developer grant secret", async () => {
    const t = convexTest({ schema, modules });
    const previousSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "development";

      await expect(
        t.mutation(internal.admin.grantConsultantRole, {
          secret: "wrong-secret",
          userId: "attempted-consultant",
          email: "forge@example.com",
          displayName: "Attempted Consultant",
        }),
      ).rejects.toThrow("Invalid Consultant grant secret");

      const identity = t.withIdentity({
        tokenIdentifier: "attempted-consultant",
        email: "forge@example.com",
        name: "Attempted Consultant",
      });

      const access = await identity.query(api.access.getCurrentUserAccess, {});
      expect(access.isConsultant).toBe(false);
      expect(access.role).toBeNull();
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });

  test("the server resolves WorkOS subject IDs for company-admin and consultant memberships", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const previousSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "development";

      await t.mutation(internal.admin.linkWorkOSUserToCompanyAdmin, {
        secret: "test-consultant-secret",
        companyId: seeded.companyAId,
        seededUserId: "acme-admin",
        workosUserId: "user_123",
        email: "user123@example.com",
        displayName: "User 123",
      });

      const companyAdmin = t.withIdentity({
        subject: "user_123",
        tokenIdentifier: "https://auth.workos.com|user_123",
        email: "user123@example.com",
        name: "User 123",
      });

      const companyAccess = await companyAdmin.query(api.access.getCurrentUserAccess, {});
      const visibleCompanies = await companyAdmin.query(api.access.listAccessibleCompanies, {});

      expect(companyAccess.subject).toBe("user_123");
      expect(companyAccess.tokenIdentifier).toBe("https://auth.workos.com|user_123");
      expect(companyAccess.role).toBe("company-admin");
      expect(visibleCompanies.map((company) => company._id)).toEqual([seeded.companyAId]);

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "user_123",
        email: "user123@example.com",
        displayName: "User 123",
      });

      const consultantAccess = await companyAdmin.query(api.access.getCurrentUserAccess, {});
      expect(consultantAccess.isConsultant).toBe(true);
      expect(consultantAccess.role).toBe("vs-consultant");
      expect(consultantAccess.companyIds.length).toBeGreaterThan(0);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });

  test("a brand-new user signing in for the first time has no role and sees no workspaces", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const firstLogin = t.withIdentity({
      tokenIdentifier: "first-time-user",
      email: "new-user@example.com",
      name: "First Time User",
    });

    const access = await firstLogin.query(api.access.getCurrentUserAccess, {});
    const visibleCompanies = await firstLogin.query(api.access.listAccessibleCompanies, {});

    expect(access.email).toBe("new-user@example.com");
    expect(access.role).toBeNull();
    expect(access.isConsultant).toBe(false);
    expect(access.companyIds).toEqual([]);
    expect(visibleCompanies).toEqual([]);
    await expect(firstLogin.query(api.access.getCompany, { companyId: seeded.companyAId })).rejects.toThrow("Company access denied");
    await expect(firstLogin.query(api.access.listProjectsForCompany, { companyId: seeded.companyAId })).rejects.toThrow("Company access denied");
    await expect(firstLogin.query(api.access.getProject, { projectId: seeded.projectAId })).rejects.toThrow("Project access denied");
  });

  test("a missing or unverified email never accepts a pending workspace invite", async () => {
    const t = convexTest({ schema, modules });
    const previousGrantSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "development";

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "harbor-consultant",
        email: "harbor@maxwellknight.co.uk",
        displayName: "Harbor Consultant",
      });

      const consultant = t.withIdentity({
        tokenIdentifier: "harbor-consultant",
        email: "harbor@maxwellknight.co.uk",
        emailVerified: true,
        name: "Harbor Consultant",
      });

      const company = await consultant.mutation(api.admin.createCompany, {
        name: "Harbor Logistics Test",
        ssoProvider: "google-workspace",
      });

      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Frank Invite",
        email: "frank+invite@maxwellknight.co.uk",
        role: "company-scorer",
      });

      const noEmailUser = t.withIdentity({
        tokenIdentifier: "frank-invite-no-email",
        name: "Frank Invite",
      });

      await noEmailUser.mutation(api.access.acceptPendingInvites, {});
      const noEmailAccess = await noEmailUser.query(api.access.getCurrentUserAccess, {});
      expect(noEmailAccess.role).toBeNull();
      expect(noEmailAccess.companyIds).toEqual([]);

      const unverifiedUser = t.withIdentity({
        tokenIdentifier: "frank-invite-unverified",
        email: "frank+invite@maxwellknight.co.uk",
        emailVerified: false,
        name: "Frank Invite",
      });

      await unverifiedUser.mutation(api.access.acceptPendingInvites, {});
      const unverifiedAccess = await unverifiedUser.query(api.access.getCurrentUserAccess, {});
      expect(unverifiedAccess.role).toBeNull();
      expect(unverifiedAccess.companyIds).toEqual([]);
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
  });

  test("a matching verified email accepts exactly the invited workspace and role", async () => {
    const t = convexTest({ schema, modules });
    const previousGrantSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "development";

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "verified-invite-consultant",
        email: "consultant@maxwellknight.co.uk",
        displayName: "Invite Consultant",
      });

      const consultant = t.withIdentity({
        tokenIdentifier: "verified-invite-consultant",
        email: "consultant@maxwellknight.co.uk",
        emailVerified: true,
        name: "Invite Consultant",
      });

      const company = await consultant.mutation(api.admin.createCompany, {
        name: "Harbor Logistics Test",
        ssoProvider: "google-workspace",
      });

      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Frank Invite",
        email: "frank+invite@maxwellknight.co.uk",
        role: "company-scorer",
      });

      const invitedUser = t.withIdentity({
        tokenIdentifier: "frank-invite-verified",
        email: "frank+invite@maxwellknight.co.uk",
        emailVerified: true,
        name: "Frank Invite",
      });

      await invitedUser.mutation(api.access.acceptPendingInvites, {});

      const access = await invitedUser.query(api.access.getCurrentUserAccess, {});
      const companies = await invitedUser.query(api.access.listAccessibleCompanies, {});

      expect(access.role).toBe("company-scorer");
      expect(access.companyIds).toEqual([company.companyId]);
      expect(companies.map((entry) => entry._id)).toEqual([company.companyId]);
      await expect(invitedUser.query(api.access.getCompany, { companyId: company.companyId })).resolves.toMatchObject({ name: "Harbor Logistics Test" });
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
  });

  test("cancelled, expired or deactivated invites provide no access", async () => {
    const t = convexTest({ schema, modules });
    const previousGrantSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "development";

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "cancelled-invite-consultant",
        email: "consultant@maxwellknight.co.uk",
        displayName: "Invite Consultant",
      });

      const consultant = t.withIdentity({
        tokenIdentifier: "cancelled-invite-consultant",
        email: "consultant@maxwellknight.co.uk",
        emailVerified: true,
        name: "Invite Consultant",
      });

      const company = await consultant.mutation(api.admin.createCompany, {
        name: "Harbor Logistics Test",
        ssoProvider: "google-workspace",
      });

      await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Frank Invite",
        email: "frank+invite@maxwellknight.co.uk",
        role: "company-scorer",
      });

      await consultant.mutation(api.admin.cancelWorkspaceInvite, {
        companyId: company.companyId,
        email: "frank+invite@maxwellknight.co.uk",
      });

      const cancelledUser = t.withIdentity({
        tokenIdentifier: "frank-cancelled",
        email: "frank+invite@maxwellknight.co.uk",
        emailVerified: true,
        name: "Frank Invite",
      });

      await cancelledUser.mutation(api.access.acceptPendingInvites, {});
      const cancelledAccess = await cancelledUser.query(api.access.getCurrentUserAccess, {});
      expect(cancelledAccess.role).toBeNull();
      expect(cancelledAccess.companyIds).toEqual([]);

      const secondInvite = await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Frank Invite",
        email: "frank+invite@maxwellknight.co.uk",
        role: "company-scorer",
      });

      await consultant.mutation(api.admin.expireWorkspaceInvite, {
        companyId: company.companyId,
        inviteId: secondInvite.inviteId,
      });

      const expiredUser = t.withIdentity({
        tokenIdentifier: "frank-expired",
        email: "frank+invite@maxwellknight.co.uk",
        emailVerified: true,
        name: "Frank Invite",
      });

      await expiredUser.mutation(api.access.acceptPendingInvites, {});
      const expiredAccess = await expiredUser.query(api.access.getCurrentUserAccess, {});
      expect(expiredAccess.role).toBeNull();
      expect(expiredAccess.companyIds).toEqual([]);

      const finalInvite = await consultant.mutation(api.admin.inviteWorkspacePerson, {
        companyId: company.companyId,
        name: "Frank Invite",
        email: "frank+invite@maxwellknight.co.uk",
        role: "company-scorer",
      });

      const acceptedUser = t.withIdentity({
        tokenIdentifier: "frank-finalized",
        email: "frank+invite@maxwellknight.co.uk",
        emailVerified: true,
        name: "Frank Invite",
      });

      await acceptedUser.mutation(api.access.acceptPendingInvites, {});
      await consultant.mutation(api.admin.deactivateWorkspacePerson, {
        companyId: company.companyId,
        email: "frank+invite@maxwellknight.co.uk",
      });

      const deactivatedAccess = await acceptedUser.query(api.access.getCurrentUserAccess, {});
      expect(deactivatedAccess.role).toBeNull();
      expect(deactivatedAccess.companyIds).toEqual([]);
      expect(finalInvite).toBeDefined();
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
  });

  test("an Acme company admin sees only Acme Health and is blocked from Beta Logistics", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const acmeAdmin = t.withIdentity({
      tokenIdentifier: "acme-admin",
      email: "acme-admin@acme.example",
      name: "ACME Admin",
    });

    const access = await acmeAdmin.query(api.access.getCurrentUserAccess, {});
    const visibleCompanies = await acmeAdmin.query(api.access.listAccessibleCompanies, {});
    const companyA = await acmeAdmin.query(api.access.getCompany, { companyId: seeded.companyAId });
    const companyAProjects = await acmeAdmin.query(api.access.listProjectsForCompany, { companyId: seeded.companyAId });
    const companyAProject = await acmeAdmin.query(api.access.getProject, { projectId: seeded.projectAId });

    expect(access.role).toBe("company-admin");
    expect(access.companyIds).toEqual([seeded.companyAId]);
    expect(visibleCompanies.map((company) => company._id)).toEqual([seeded.companyAId]);
    expect(visibleCompanies.map((company) => company.name)).toEqual(["Acme Health"]);
    expect(companyA.name).toBe("Acme Health");
    expect(companyAProjects.map((project) => project._id)).toEqual([seeded.projectAId]);
    expect(companyAProject._id).toBe(seeded.projectAId);
    await expect(acmeAdmin.query(api.access.getCompany, { companyId: seeded.companyBId })).rejects.toThrow("Company access denied");
    await expect(acmeAdmin.query(api.access.listProjectsForCompany, { companyId: seeded.companyBId })).rejects.toThrow("Company access denied");
    await expect(acmeAdmin.query(api.access.getProject, { projectId: seeded.projectBId })).rejects.toThrow("Project access denied");
  });

  test("a company admin receives only their workspace and is rejected from consultant access", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const previousGrantSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "development";

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "workos_user_frank_preview",
        email: "frank@maxwellknight.co.uk",
        displayName: "Frank Maxwell",
      });

      const consultantIdentity = t.withIdentity({
        tokenIdentifier: "workos_user_frank_preview",
        email: "frank@maxwellknight.co.uk",
        name: "Frank Maxwell",
      });

      const consultantVisibleCompanies = await consultantIdentity.query(api.access.listAccessibleCompanies, {});
      expect(consultantVisibleCompanies.map((company) => company._id)).toEqual(
        expect.arrayContaining([seeded.companyAId, seeded.companyBId, seeded.companyCId]),
      );

      await t.mutation(internal.admin.linkWorkOSUserToCompanyAdmin, {
        secret: "test-consultant-secret",
        companyId: seeded.companyAId,
        seededUserId: "acme-admin",
        workosUserId: "workos_user_frank_preview",
        email: "frank@maxwellknight.co.uk",
        displayName: "Frank Maxwell",
      });

      const companyAdminIdentity = t.withIdentity({
        tokenIdentifier: "workos_user_frank_preview",
        email: "frank@maxwellknight.co.uk",
        name: "Frank Maxwell",
      });

      const access = await companyAdminIdentity.query(api.access.getCurrentUserAccess, {});
      const visibleCompanies = await companyAdminIdentity.query(api.access.listAccessibleCompanies, {});

      expect(access.role).toBe("company-admin");
      expect(visibleCompanies.map((company) => company._id)).toEqual([seeded.companyAId]);
      await expect(companyAdminIdentity.query(api.access.getCompany, { companyId: seeded.companyBId })).rejects.toThrow("Company access denied");
      await expect(companyAdminIdentity.query(api.admin.listCompanyMembers, { companyId: seeded.companyBId })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
      await expect(companyAdminIdentity.mutation(api.admin.createProject, { companyId: seeded.companyBId, name: "Blocked project" })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
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
  });

  test("preview-only workspace seed data is disabled in Production and labels records as test data", async () => {
    const t = convexTest({ schema, modules });
    const previousSecret = process.env.CONVEX_PREVIEW_SEED_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_PREVIEW_SEED_SECRET = "test-preview-secret";
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "preview";

      const result = await t.mutation(internal.admin.seedPreviewWorkspaceData, {
        secret: "test-preview-secret",
      });

      expect(result.createdCompanies).toBeGreaterThanOrEqual(3);
      expect(result.label).toBe("test-data");

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "seeded-consultant-user",
        email: "seeded-consultant@example.com",
        displayName: "Seeded Consultant",
      });

      const consultant = t.withIdentity({
        tokenIdentifier: "seeded-consultant-user",
        email: "seeded-consultant@example.com",
        name: "Seeded Consultant",
      });

      const companies = await consultant.query(api.access.listAccessibleCompanies, {});
      expect(companies.length).toBeGreaterThanOrEqual(3);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_PREVIEW_SEED_SECRET;
      } else {
        process.env.CONVEX_PREVIEW_SEED_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }

      if (process.env.CONVEX_CONSULTANT_GRANT_SECRET === "test-consultant-secret") {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      }
    }
  });

  test("preview-only workspace seed data cannot run in Production", async () => {
    const t = convexTest({ schema, modules });
    const previousSecret = process.env.CONVEX_PREVIEW_SEED_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_PREVIEW_SEED_SECRET = "test-preview-secret";
      process.env.APP_ENVIRONMENT = "production";

      await expect(
        t.mutation(internal.admin.seedPreviewWorkspaceData, {
          secret: "test-preview-secret",
        }),
      ).rejects.toThrow("Preview/dev seed data is disabled in production");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_PREVIEW_SEED_SECRET;
      } else {
        process.env.CONVEX_PREVIEW_SEED_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });

  test("granting a VS Consultant records an activity log entry", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const previousSecret = process.env.CONVEX_CONSULTANT_GRANT_SECRET;
    const previousAppEnvironment = process.env.APP_ENVIRONMENT;

    try {
      process.env.CONVEX_CONSULTANT_GRANT_SECRET = "test-consultant-secret";
      process.env.APP_ENVIRONMENT = "preview";

      await t.mutation(internal.admin.grantConsultantRole, {
        secret: "test-consultant-secret",
        userId: "audit-consultant-user",
        email: "audit@consultant.example",
        displayName: "Audit Consultant",
        companyId: seeded.companyAId,
      });

      const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });
      const logs = await admin.query(api.admin.listActivityLogs, { companyId: seeded.companyAId });

      expect(logs.some((log) => log.action === "grant_vs_consultant_role")).toBe(true);
      expect(logs.some((log) => log.details.includes("audit-consultant-user"))).toBe(true);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.CONVEX_CONSULTANT_GRANT_SECRET;
      } else {
        process.env.CONVEX_CONSULTANT_GRANT_SECRET = previousSecret;
      }

      if (previousAppEnvironment === undefined) {
        delete process.env.APP_ENVIRONMENT;
      } else {
        process.env.APP_ENVIRONMENT = previousAppEnvironment;
      }
    }
  });
});

