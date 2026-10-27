/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 7 dashboard totals", () => {
  test("the project dashboard calculates weighted totals from real requirements and scope-checked score rows", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    await scorer.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [
        { id: "REQ-201", text: "Deliver on time", type: "user-story", priority: 9 },
        { id: "REQ-202", text: "Support full traceability", type: "nfr", priority: 3 },
        { id: "REQ-203", text: "Optional feature", type: "user-story", priority: 1 },
      ],
      confirm: true,
    });

    await scorer.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-201",
      score: 1,
      comment: "Good",
    });

    await scorer.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-202",
      score: 0,
      comment: "Needs work",
    });

    await scorer.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-203",
      score: 1,
      comment: "Good",
    });

    await vendor.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-201",
      score: 1,
      comment: "Self-score",
    });

    const dashboard = await scorer.query(api.dashboard.getProjectDashboard, {
      projectId: seeded.projectBId,
    });

    expect(dashboard.leadingVendorUserId).toBe("northwind-vendor");
    expect(dashboard.rows).toHaveLength(1);
    expect(dashboard.rows[0].vendorUserId).toBe("northwind-vendor");
    expect(dashboard.rows[0].userStoryTotal).toBe(10);
    expect(dashboard.rows[0].nfrTotal).toBe(0);
    expect(dashboard.rows[0].total).toBe(9);
    expect(dashboard.rows[0].unmetCount).toBe(1);
    expect(dashboard.rows[0].missingCount).toBe(0);

    await expect(
      vendor.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId }),
    ).rejects.toThrow("Project access denied");

    await expect(
      scorer.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectAId }),
    ).rejects.toThrow("Project access denied");
  });
});
