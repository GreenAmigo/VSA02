/// <reference types="vite/client" />

import * as XLSX from "xlsx";
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { MAX_IMPORT_ROWS, MAX_REQUIREMENT_ID_LENGTH, MAX_REQUIREMENT_TEXT_LENGTH } from "./importLimits";
import { buildRequirementTemplateWorkbook, parseRequirementFileWithIssues, toRequirementImportRows } from "../src/lib/projectRequirements";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 4 requirement import preview and confirm", () => {
  test("a vendor's stale admin or consultant role cannot edit requirements", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("consultants", {
        userId: "northwind-vendor", displayName: "Stale consultant", isActive: true, grantedAt: Date.now(),
      });
      await ctx.db.insert("projectMembers", {
        companyId: seeded.companyBId, projectId: seeded.projectBId, userId: "northwind-vendor",
        role: "company-admin", displayName: "Stale admin", isActive: true, createdAt: Date.now(),
      });
    });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    await expect(vendor.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId, rows: [], confirm: true,
    })).rejects.toThrow("Project access denied");
    await expect(vendor.mutation(api.requirements.updateRequirementPriority, {
      projectId: seeded.projectBId, requirementId: "REQ-1", priority: 9,
    })).rejects.toThrow("Only consultants and company admins");
  });

  test("a matching admin name does not authorize requirement edits", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const outsider = t.withIdentity({ tokenIdentifier: "unrelated-user", email: "unrelated@example.com", name: "Beta Admin" });
    await expect(outsider.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId, rows: [], confirm: true,
    })).rejects.toThrow("Project access denied");
    await expect(outsider.mutation(api.requirements.updateRequirementPriority, {
      projectId: seeded.projectBId, requirementId: "REQ-1", priority: 9,
    })).rejects.toThrow("Only consultants and company admins");
  });

  test("template parser output matches previewRequirementImport validator contract", async () => {
    const t = convexTest({ schema, modules });

    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });

    const workbook = buildRequirementTemplateWorkbook();
    workbook.Sheets.Requirements = XLSX.utils.aoa_to_sheet([
      ["Requirement ID", "Title/Text", "Type", "Priority", "Category"],
      ["REQ-901", "Identity federation", "user-story", 9, "Security"],
      ["REQ-902", "Audit export", "user-story", 3, "Compliance"],
    ]);
    workbook.Sheets.NFRs = XLSX.utils.aoa_to_sheet([
      ["Requirement ID", "Title/Text", "Type", "Priority", "Category"],
      ["NFR-901", "99.95% availability", "nfr", 9, "Availability"],
    ]);

    const xlsxBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([xlsxBuffer], "requirements-template.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const parsed = await parseRequirementFileWithIssues(file);
    expect(parsed.issues).toEqual([]);

    const rows = toRequirementImportRows(parsed.rows);
    expect(rows).toHaveLength(3);

    await expect(
      admin.mutation(api.requirements.previewRequirementImport, {
        projectId: seeded.projectAId,
        rows,
      }),
    ).resolves.toMatchObject({
      summary: { added: 3 },
    });
  });

  test("import preview counts changes and applies only after confirm", async () => {
    const t = convexTest({ schema, modules });

    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });
    const rows: Array<{ id: string; text: string; type: "user-story" | "nfr"; priority: 9 | 3 | 1 | 0; status?: "active" | "withdrawn" }> = [
      { id: "REQ-101", text: "Role-based admin access", type: "user-story", priority: 9, status: "active" },
      { id: "REQ-102", text: "Audit log retention", type: "nfr", priority: 3, status: "active" },
    ];

    const preview = await admin.mutation(api.requirements.previewRequirementImport, {
      projectId: seeded.projectAId,
      rows,
    });

    expect(preview.summary.added).toBe(2);
    expect(preview.summary.total).toBe(2);

    await expect(
      admin.mutation(api.requirements.applyRequirementImport, {
        projectId: seeded.projectAId,
        rows,
        confirm: false,
      }),
    ).rejects.toThrow("Confirm required");

    const applied = await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectAId,
      rows,
      confirm: true,
    });

    expect(applied.count).toBe(2);
    expect(applied.summary.added).toBe(2);
  });

  test("non-admin and wrong-project import attempts are rejected", async () => {
    const t = convexTest({ schema, modules });

    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });
    const rows: Array<{ id: string; text: string; type: "user-story" | "nfr"; priority: 9 | 3 | 1 | 0; status?: "active" | "withdrawn" }> = [{ id: "REQ-111", text: "Supplier compliance", type: "user-story", priority: 9, status: "active" }];

    await expect(
      vendor.mutation(api.requirements.previewRequirementImport, {
        projectId: seeded.projectAId,
        rows,
      }),
    ).rejects.toThrow("Project access denied");

    await expect(
      admin.mutation(api.requirements.previewRequirementImport, {
        projectId: seeded.projectBId,
        rows,
      }),
    ).rejects.toThrow("Project access denied");
  });

  test("assigned scorers can view requirements without priorities but are rejected from all requirement writes; vendors are blocked from all requirement access", async () => {
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
      rows: [
        { id: "REQ-201", text: "Deliver on time", type: "user-story", priority: 9 },
        { id: "REQ-202", text: "Support traceability", type: "nfr", priority: 3 },
      ],
      confirm: true,
    });

    const scorerView = await scorer.query(api.access.listProjectRequirements, {
      projectId: seeded.projectBId,
    });

    expect(scorerView).toHaveLength(2);
    expect(scorerView[0]).toMatchObject({ requirementId: "REQ-201", text: "Deliver on time" });
    expect("priority" in scorerView[0]).toBe(false);
    expect("type" in scorerView[0]).toBe(true);

    await expect(async () => {
      await scorer.mutation(api.requirements.previewRequirementImport, {
        projectId: seeded.projectBId,
        rows: [{ id: "REQ-999", text: "Forbidden import", type: "user-story", priority: 1 }],
      });
    }).rejects.toThrow("Project access denied");

    await expect(async () => {
      await scorer.mutation(api.requirements.applyRequirementImport, {
        projectId: seeded.projectBId,
        rows: [{ id: "REQ-999", text: "Forbidden import", type: "user-story", priority: 1 }],
        confirm: true,
      });
    }).rejects.toThrow("Project access denied");

    const vendorView = await vendor.query(api.access.listProjectRequirements, {
      projectId: seeded.projectBId,
    });

    expect(vendorView).toHaveLength(2);
    expect(vendorView[0]).toMatchObject({ requirementId: "REQ-201", text: "Deliver on time" });
    expect("priority" in vendorView[0]).toBe(false);
    expect("type" in vendorView[0]).toBe(false);

    await expect(async () => {
      await vendor.mutation(api.requirements.previewRequirementImport, {
        projectId: seeded.projectBId,
        rows: [{ id: "REQ-998", text: "Forbidden vendor import", type: "nfr", priority: 9 }],
      });
    }).rejects.toThrow("Project access denied");

    await expect(async () => {
      await vendor.mutation(api.requirements.applyRequirementImport, {
        projectId: seeded.projectBId,
        rows: [{ id: "REQ-998", text: "Forbidden vendor import", type: "nfr", priority: 9 }],
        confirm: true,
      });
    }).rejects.toThrow("Project access denied");

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [{ id: "REQ-201", text: "Deliver on time", type: "user-story", priority: 1 }],
      confirm: true,
    });

    const priorityUpdated = await scorer.query(api.access.listProjectRequirements, {
      projectId: seeded.projectBId,
    });
    expect("priority" in priorityUpdated[0]).toBe(false);
  });

  test("consultant and admin users can update requirement priority, scorers and vendors are rejected, and invalid values are refused", async () => {
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
      rows: [{ id: "REQ-500", text: "Central audit logging", type: "user-story", priority: 9 }],
      confirm: true,
    });

    const updated = await admin.mutation(api.requirements.updateRequirementPriority, {
      projectId: seeded.projectBId,
      requirementId: "REQ-500",
      priority: 0,
    });

    expect(updated.priority).toBe(0);
    expect(updated.requirementId).toBe("REQ-500");

    await expect(
      scorer.mutation(api.requirements.updateRequirementPriority, {
        projectId: seeded.projectBId,
        requirementId: "REQ-500",
        priority: 3,
      }),
    ).rejects.toThrow("Only consultants and company admins can change priorities");

    await expect(
      vendor.mutation(api.requirements.updateRequirementPriority, {
        projectId: seeded.projectBId,
        requirementId: "REQ-500",
        priority: 1,
      }),
    ).rejects.toThrow("Only consultants and company admins can change priorities");

    await expect(
      admin.mutation(api.requirements.updateRequirementPriority, {
        projectId: seeded.projectBId,
        requirementId: "REQ-500",
        priority: 2 as any,
      }),
    ).rejects.toThrow("Priority must be one of 9, 3, 1, or 0");

    const vendorView = await vendor.query(api.access.listProjectRequirements, {
      projectId: seeded.projectBId,
    });

    expect(vendorView[0]).toMatchObject({ requirementId: "REQ-500", text: "Central audit logging" });
    expect("priority" in vendorView[0]).toBe(false);
  });

  test("the server refuses imports that are too large, even if the browser check is skipped", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics",
      projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });
    const row = (index: number) => ({ id: `REQ-${index}`, text: `Requirement ${index}`, type: "user-story" as const, priority: 9 as const });

    const tooMany = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => row(index + 1));
    await expect(admin.mutation(api.requirements.previewRequirementImport, {
      projectId: seeded.projectAId, rows: tooMany,
    })).rejects.toThrow(`most allowed in one import is ${MAX_IMPORT_ROWS}`);
    await expect(admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectAId, rows: tooMany, confirm: true,
    })).rejects.toThrow(`most allowed in one import is ${MAX_IMPORT_ROWS}`);

    await expect(admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectAId, rows: [{ ...row(1), text: "x".repeat(MAX_REQUIREMENT_TEXT_LENGTH + 1) }], confirm: true,
    })).rejects.toThrow(`longer than ${MAX_REQUIREMENT_TEXT_LENGTH} characters`);

    await expect(admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectAId, rows: [{ ...row(1), id: "R".repeat(MAX_REQUIREMENT_ID_LENGTH + 1) }], confirm: true,
    })).rejects.toThrow("is too long");

    // Nothing was written by the refused imports.
    const saved = await t.run(async (ctx) => ctx.db.query("requirements")
      .withIndex("by_company_project", (q) => q.eq("companyId", seeded.companyAId).eq("projectId", seeded.projectAId))
      .collect());
    expect(saved.some((item) => item.requirementId === "REQ-1" && item.text.length > MAX_REQUIREMENT_TEXT_LENGTH)).toBe(false);
    expect(saved.some((item) => item.requirementId.length > MAX_REQUIREMENT_ID_LENGTH)).toBe(false);

    // A normal import still works.
    const ok = await admin.mutation(api.requirements.previewRequirementImport, { projectId: seeded.projectAId, rows: [row(777)] });
    expect(ok.summary).toBeTruthy();
  });
});
