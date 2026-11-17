/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Vendor restrictions", () => {
  test("vendors are rejected outside their assigned project and company", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      companyCName: "Maxwell Knight Ltd",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    await expect(vendor.query(api.access.getCompany, { companyId: seeded.companyAId })).rejects.toThrow("Company access denied");
    await expect(vendor.query(api.access.getProject, { projectId: seeded.projectAId })).rejects.toThrow("Project access denied");
    await expect(vendor.query(api.access.listProjectRequirements, { projectId: seeded.projectAId })).rejects.toThrow("Project access denied");

    await expect(
      vendor.mutation(api.vendorAuth.requestVendorMagicLink, {
        projectId: seeded.projectAId,
        email: "vendor@northwind.example",
      }),
    ).rejects.toThrow("Vendor not assigned to this project");
  });

  test("a vendor can only see their own project member row, not other scorers or vendors", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    const members = await vendor.query(api.admin.listProjectMembers, { projectId: seeded.projectBId });

    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("vendor");
    expect(members[0].userId).toBe("northwind-vendor");
    expect(members.every((member: any) => member.userId === "northwind-vendor")).toBe(true);
  });

  test("a vendor only receives the project and company data that is explicitly allowed", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    const accessibleCompanies = await vendor.query(api.access.listAccessibleCompanies, {});
    const companyProjects = await vendor.query(api.access.listProjectsForCompany, { companyId: seeded.companyBId });
    const project = await vendor.query(api.access.getProject, { projectId: seeded.projectBId });
    const requirements = await vendor.query(api.access.listProjectRequirements, { projectId: seeded.projectBId });
    const access = await vendor.query(api.access.getCurrentUserAccess, {});

    expect(access.role).toBe("vendor");
    expect(access.isConsultant).toBe(false);
    expect(access.companyIds).toContain(seeded.companyBId);
    expect(accessibleCompanies.map((company: any) => company._id)).toEqual([seeded.companyBId]);
    expect(companyProjects.map((projectItem: any) => projectItem._id)).toEqual([seeded.projectBId]);
    expect(project._id).toBe(seeded.projectBId);
    expect(requirements.every((row: any) => row.priority === undefined)).toBe(true);
    expect(requirements.every((row: any) => row.type === undefined)).toBe(true);
    await expect(vendor.query(api.admin.listWorkspaceDepartments, { companyId: seeded.companyBId })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    await expect(vendor.query(api.admin.listWorkspaceVendors, { companyId: seeded.companyBId })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
  });

  test("vendors are rejected from invites, project creation, department and member-assignment functions", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const department = await admin.mutation(api.admin.createWorkspaceDepartment, {
      companyId: seeded.companyBId,
      name: "Blocked department",
    });

    await expect(vendor.query(api.admin.listCompanyMembers, { companyId: seeded.companyBId })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    await expect(vendor.mutation(api.admin.createProject, { companyId: seeded.companyBId, name: "Blocked project" })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    await expect(vendor.mutation(api.admin.inviteWorkspacePerson, { companyId: seeded.companyBId, name: "Blocked person", email: "blocked@example.com", role: "company-scorer" })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    await expect(vendor.mutation(api.admin.addProjectScorer, { companyId: seeded.companyBId, projectId: seeded.projectBId, displayName: "Blocked scorer", email: "blocked@example.com", role: "individual" })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    await expect(vendor.mutation(api.admin.addProjectVendor, { companyId: seeded.companyBId, projectId: seeded.projectBId, displayName: "Blocked vendor" })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    await expect(vendor.mutation(api.admin.addWorkspaceDepartmentMember, { companyId: seeded.companyBId, departmentId: department.departmentId, userId: "blocked-user" })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
  });
});

