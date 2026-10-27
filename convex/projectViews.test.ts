/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 6 project view isolation", () => {
  test("scorers can write views for vendors and vendors only see their own project view rows", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });

    const view = await scorer.mutation(api.projectViews.saveProjectView, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      viewText: "Strong vendor with good delivery track record.",
    });

    expect(view.scorerUserId).toBe("beta-scorer");
    expect(view.vendorUserId).toBe("northwind-vendor");

    const vendorViews = await vendor.query(api.projectViews.listProjectViews, {
      projectId: seeded.projectBId,
    });

    expect(vendorViews).toHaveLength(1);
    expect(vendorViews[0].viewText).toBe("Strong vendor with good delivery track record.");
    expect(vendorViews[0].scorerUserId).toBe("beta-scorer");

    await expect(
      vendor.mutation(api.projectViews.saveProjectView, {
        projectId: seeded.projectBId,
        vendorUserId: "northwind-vendor",
        viewText: "I should not be allowed to write a scorer note.",
      }),
    ).rejects.toThrow("Project access denied");

    await expect(
      admin.query(api.projectViews.listProjectViews, { projectId: seeded.projectBId }),
    ).rejects.toThrow("Project access denied");
  });
});
