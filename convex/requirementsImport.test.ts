/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 4 requirement import preview and confirm", () => {
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
});

