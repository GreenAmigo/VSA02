import test from "node:test";
import assert from "node:assert/strict";

import { assertValidPriorityValue, assertValidScoreValue } from "./security.ts";
import { buildRequirementImportPlan, type RequirementRecord } from "./projectRequirements.ts";
import { calculateVendorTotals } from "./scoring.ts";

test("sample vendor totals match the hand-worked dashboard figures", () => {
  const requirements: Array<{ id: string; priority: 9 | 3 | 1 | 0; type: "user-story" | "nfr"; status: "active" | "withdrawn" }> = [
    { id: "REQ-101", priority: 9, type: "user-story" as const, status: "active" as const },
    { id: "REQ-102", priority: 3, type: "nfr" as const, status: "active" as const },
    { id: "REQ-103", priority: 1, type: "user-story" as const, status: "active" as const },
  ];

  const northwind = calculateVendorTotals(requirements, [
    { vendorId: "northwind", requirementId: "REQ-101", score: 1, enteredBy: "vendor", enteredAt: "2026-10-01T00:00:00.000Z" },
    { vendorId: "northwind", requirementId: "REQ-102", score: 0, enteredBy: "vendor", enteredAt: "2026-10-01T00:00:00.000Z" },
    { vendorId: "northwind", requirementId: "REQ-103", score: 1, enteredBy: "vendor", enteredAt: "2026-10-01T00:00:00.000Z" },
  ], "northwind");

  const summit = calculateVendorTotals(requirements, [
    { vendorId: "summit", requirementId: "REQ-101", score: 1, enteredBy: "vendor", enteredAt: "2026-10-01T00:00:00.000Z" },
    { vendorId: "summit", requirementId: "REQ-102", score: 1, enteredBy: "vendor", enteredAt: "2026-10-01T00:00:00.000Z" },
    { vendorId: "summit", requirementId: "REQ-103", score: 0, enteredBy: "vendor", enteredAt: "2026-10-01T00:00:00.000Z" },
  ], "summit");

  assert.equal(northwind.userStoryTotal, 10);
  assert.equal(northwind.nfrTotal, 0);
  assert.equal(northwind.total, 9);
  assert.equal(summit.userStoryTotal, 9);
  assert.equal(summit.nfrTotal, 3);
  assert.equal(summit.total, 11);
});

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
