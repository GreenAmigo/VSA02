/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 8 deadline and reminder logic", () => {
  test("scorers and vendors can see their deadline state, and vendors can only update their own submitted status", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });

    const vendorDeadline = await scorer.mutation(api.deadlines.upsertProjectDeadline, {
      projectId: seeded.projectBId,
      targetType: "vendor",
      targetUserId: "northwind-vendor",
      dueAt: Date.now() + 1000 * 60 * 60 * 24,
    });

    expect(vendorDeadline.targetUserId).toBe("northwind-vendor");
    expect(vendorDeadline.status).toBe("not-started");

    const vendorRows = await vendor.query(api.deadlines.listProjectDeadlines, {
      projectId: seeded.projectBId,
    });

    expect(vendorRows).toHaveLength(1);
    expect(vendorRows[0].targetType).toBe("vendor");
    expect(vendorRows[0].status).toBe("not-started");

    const updated = await vendor.mutation(api.deadlines.markDeadlineSubmitted, {
      projectId: seeded.projectBId,
      targetType: "vendor",
      targetUserId: "northwind-vendor",
    });

    expect(updated.status).toBe("submitted");
    expect(updated.submittedAt).toBeTypeOf("number");

    const allRows = await scorer.query(api.deadlines.listProjectDeadlines, {
      projectId: seeded.projectBId,
    });

    expect(allRows.some((row) => row.targetUserId === "northwind-vendor" && row.status === "submitted")).toBe(true);

    await expect(
      vendor.mutation(api.deadlines.markDeadlineSubmitted, {
        projectId: seeded.projectBId,
        targetType: "vendor",
        targetUserId: "beta-scorer",
      }),
    ).rejects.toThrow("Project access denied");
  });
});
