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
    await expect(vendor.mutation((api as any).admin.updateProject, { companyId: seeded.companyBId, projectId: seeded.projectBId, name: "Blocked rename" })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    await expect(vendor.mutation((api as any).admin.archiveProject, { companyId: seeded.companyBId, projectId: seeded.projectBId })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    await expect(vendor.mutation((api as any).admin.restoreProject, { companyId: seeded.companyBId, projectId: seeded.projectBId })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    await expect(vendor.mutation(api.admin.inviteWorkspacePerson, { companyId: seeded.companyBId, name: "Blocked person", email: "blocked@example.com", role: "company-scorer" })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    await expect(vendor.mutation(api.admin.addProjectScorer, { companyId: seeded.companyBId, projectId: seeded.projectBId, displayName: "Blocked scorer", email: "blocked@example.com" })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    await expect(vendor.mutation(api.admin.addProjectVendor, { companyId: seeded.companyBId, projectId: seeded.projectBId, displayName: "Blocked vendor" })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
    await expect(vendor.mutation(api.admin.addWorkspaceDepartmentMember, { companyId: seeded.companyBId, departmentId: department.departmentId, userId: "blocked-user" })).rejects.toThrow("Only company admins or VS Consultants can manage this company");
  });

  test("vendors and scorers are blocked from consultant/admin vendor-response review APIs", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-901", text: "Restricted endpoint test", type: "user-story", priority: 9, status: "active" }],
      confirm: true,
    });

    await vendor.mutation((api as any).scores.saveVendorAnswer, {
      projectId: seeded.projectBId,
      requirementId: "REQ-901",
      score: 1,
      comment: "Vendor answer",
    });

    await expect(
      vendor.query((api as any).scores.listProjectVendorResponses, { projectId: seeded.projectBId }),
    ).rejects.toThrow("Only consultants and company admins can review vendor responses");
    await expect(
      scorer.query((api as any).scores.listProjectVendorResponses, { projectId: seeded.projectBId }),
    ).rejects.toThrow("Only consultants and company admins can review vendor responses");

    await expect(
      vendor.query((api as any).scores.getVendorResponseReview, { projectId: seeded.projectBId, vendorUserId: "northwind-vendor" }),
    ).rejects.toThrow("Only consultants and company admins can review vendor responses");
    await expect(
      scorer.query((api as any).scores.getVendorResponseReview, { projectId: seeded.projectBId, vendorUserId: "northwind-vendor" }),
    ).rejects.toThrow("Only consultants and company admins can review vendor responses");

    await admin.mutation((api as any).admin.updateProject, {
      companyId: seeded.companyBId,
      projectId: seeded.projectBId,
      name: "Supply Chain",
      vendorDeadline: Date.now() - 1000,
    });

    await expect(
      vendor.mutation((api as any).scores.amendVendorScore, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        requirementId: "REQ-901",
        score: 0,
        reason: "Blocked",
      }),
    ).rejects.toThrow("Only consultants and company admins can review vendor responses");
    await expect(
      scorer.mutation((api as any).scores.reopenVendorAnswers, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        dueAt: Date.now() + 1000 * 60 * 60,
      }),
    ).rejects.toThrow("Only consultants and company admins can review vendor responses");
  });

  test("vendors cannot use scorer scoring APIs", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "beta-admin" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-920", text: "Scorer-only API row", type: "user-story", priority: 9, status: "active" }],
      confirm: true,
    });

    await expect(
      vendor.query((api as any).scores.getScorerWorkboard, { projectId: seeded.projectBId }),
    ).rejects.toThrow("Only assigned scorers can score this project");

    await expect(
      vendor.query((api as any).scores.getScorerVendorGrid, { projectId: seeded.projectBId, vendorUserId: "northwind-vendor" }),
    ).rejects.toThrow("Only assigned scorers can score this project");

    await expect(
      vendor.mutation((api as any).scores.saveScorerScore, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        requirementId: "REQ-920",
        score: 1,
      }),
    ).rejects.toThrow("Only assigned scorers can score this project");

    await expect(
      vendor.mutation((api as any).scores.completeScorerVendor, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
      }),
    ).rejects.toThrow("Only assigned scorers can score this project");
  });
});

