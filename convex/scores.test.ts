/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Phase 5 score audit trail", () => {
  test("a scorer can submit a score and the audit trail records who entered it and when", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const admin = t.withIdentity({ tokenIdentifier: "acme-admin" });

    await admin.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectAId,
      rows: [
        {
          id: "REQ-101",
          text: "Support role-based access",
          type: "user-story",
          priority: 9,
        },
      ],
      confirm: true,
    });

    const submitted = await admin.mutation(api.scores.submitScore, {
      projectId: seeded.projectAId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-101",
      score: 1,
      comment: "Matches the requirement",
    });

    expect(submitted.enteredBy).toBe("acme-admin");
    expect(submitted.enteredAt).toBeTypeOf("number");

    const history = await admin.query(api.scores.listScoreHistory, {
      projectId: seeded.projectAId,
    });

    expect(history).toHaveLength(1);
    expect(history[0].vendorUserId).toBe("northwind-vendor");
    expect(history[0].enteredBy).toBe("acme-admin");
    expect(history[0].enteredAt).toBe(submitted.enteredAt);
  });

  test("vendors can only score their own project row and cannot reach another vendor's submission", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(api.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor" });
    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer" });

    await scorer.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId,
      rows: [
        {
          id: "REQ-201",
          text: "Deliver on-time shipping",
          type: "nfr",
          priority: 3,
        },
      ],
      confirm: true,
    });

    await vendor.mutation(api.scores.submitScore, {
      projectId: seeded.projectBId,
      vendorUserId: "northwind-vendor",
      requirementId: "REQ-201",
      score: 0,
      comment: "We are still behind on this item",
    });

    const history = await vendor.query(api.scores.listScoreHistory, {
      projectId: seeded.projectBId,
    });

    expect(history).toHaveLength(1);
    expect(history[0].vendorUserId).toBe("northwind-vendor");
    expect(history[0].enteredBy).toBe("northwind-vendor");

    await expect(
      vendor.mutation(api.scores.submitScore, {
        projectId: seeded.projectBId,
        vendorUserId: "other-vendor",
        requirementId: "REQ-201",
        score: 1,
      }),
    ).rejects.toThrow("Vendor can only score their own submission");

    await expect(
      vendor.query(api.scores.listScoreHistory, { projectId: seeded.projectAId }),
    ).rejects.toThrow("Project access denied");
  });
});
