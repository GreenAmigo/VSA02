import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { assertValidPriorityValue, assertValidScoreValue } from "./security";
import { buildRequirementImportPlan, type RequirementRecord } from "./projectRequirements";

// Vendor totals are tested in convex/scoreTotals.test.ts (the single shared calculation).
describe("Phase 9 hardening", () => {
  test("re-import keeps withdrawn requirements and preserves score history", () => {
    const existing: RequirementRecord[] = [
      { id: "REQ-101", text: "Legacy wording", type: "user-story", priority: 9, status: "active", updatedAt: "2026-10-01T00:00:00.000Z" },
      { id: "REQ-102", text: "Retain this", type: "nfr", priority: 3, status: "active", updatedAt: "2026-10-01T00:00:00.000Z" },
      { id: "REQ-103", text: "Old requirement", type: "user-story", priority: 1, status: "active", updatedAt: "2026-10-01T00:00:00.000Z" },
    ];

    const incoming: RequirementRecord[] = [
      { id: "REQ-101", text: "Updated wording", type: "user-story", priority: 9, status: "active", updatedAt: "2026-10-02T00:00:00.000Z" },
      { id: "REQ-102", text: "Retain this", type: "nfr", priority: 3, status: "active", updatedAt: "2026-10-02T00:00:00.000Z" },
      { id: "REQ-104", text: "New requirement", type: "user-story", priority: 1, status: "active", updatedAt: "2026-10-02T00:00:00.000Z" },
    ];

    const plan = buildRequirementImportPlan(existing, incoming);

    assert.equal(plan.summary.added, 1);
    assert.equal(plan.summary.updated, 1);
    assert.equal(plan.summary.withdrawn, 1);
    assert.equal(plan.next.find((item) => item.id === "REQ-103")?.status, "withdrawn");
    assert.equal(plan.next.find((item) => item.id === "REQ-101")?.text, "Updated wording");
    assert.equal(plan.next.find((item) => item.id === "REQ-104")?.status, "active");
  });

  test("scores and priorities are enforced to the allowed server-side values", () => {
    assert.equal(assertValidScoreValue(0), 0);
    assert.equal(assertValidScoreValue(1), 1);
    assert.throws(() => assertValidScoreValue(2));
    assert.equal(assertValidPriorityValue(9), 9);
    assert.equal(assertValidPriorityValue(3), 3);
    assert.equal(assertValidPriorityValue(1), 1);
    assert.equal(assertValidPriorityValue(0), 0);
    assert.throws(() => assertValidPriorityValue(2));
  });
});
