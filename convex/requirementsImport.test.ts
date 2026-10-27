/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 4 requirement import preview and confirm", () => {
  test("import preview counts changes and applies only after confirm", async () => {
    const t = convexTest({ schema, modules });

    const seeded = await t.mutation(api.access.seedScenario, {
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

    const seeded = await t.mutation(api.access.seedScenario, {
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
});
