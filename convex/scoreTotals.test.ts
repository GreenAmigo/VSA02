import { describe, expect, test } from "vitest";
import { averageScorerScore, computeMaximumTotals, computeVendorTotals, pickLeaders, scorerOutcome, type TotalsRequirement } from "./scoreTotals";

// Hand-worked dataset (3 assigned scorers: A, B, C)
// Scorers' verdict per requirement: average >= 0.5 is Met (1), otherwise Not Met (0).
//   R1 user story, Must (9)   scorers A1 B1 C0 -> avg 2/3 -> Met -> 9   vendor 1 -> 9
//   R2 user story, Should (3) scorers A1 B0    -> avg 1/2 -> Met -> 3   vendor 0 -> 0
//   R3 NFR, Must (9)          scorers A1 B1 C1 -> avg 1   -> Met -> 9   vendor 1 -> 9
//   R4 NFR, Could (1)         no scorer scores -> unscored          vendor 1 -> 1
//   R0 out of scope (0)       ignored everywhere
//   RW withdrawn              ignored everywhere
const requirements: TotalsRequirement[] = [
  { requirementId: "R1", type: "user-story", priority: 9, status: "active" },
  { requirementId: "R2", type: "user-story", priority: 3, status: "active" },
  { requirementId: "R3", type: "nfr", priority: 9, status: "active" },
  { requirementId: "R4", type: "nfr", priority: 1, status: "active" },
  { requirementId: "R0", type: "user-story", priority: 0, status: "active" },
  { requirementId: "RW", type: "nfr", priority: 3, status: "withdrawn" },
];
const s = (requirementId: string, scorerKey: string, score: 0 | 1) => ({ requirementId, scorerKey, score });

describe("dashboard scoring maths", () => {
  const totals = computeVendorTotals({
    requirements,
    assignedScorerCount: 3,
    scorerScores: [
      s("R1", "A", 1), s("R1", "B", 1), s("R1", "C", 0),
      s("R2", "A", 1), s("R2", "B", 0),
      s("R3", "A", 1), s("R3", "B", 1), s("R3", "C", 1),
      s("R0", "A", 1), s("RW", "A", 1),
    ],
    vendorAnswers: [
      { requirementId: "R1", score: 1 }, { requirementId: "R2", score: 0 },
      { requirementId: "R3", score: 1 }, { requirementId: "R4", score: 1 },
      { requirementId: "R0", score: 1 }, { requirementId: "RW", score: 1 },
    ],
  });

  test("scorers' totals: priority x Met/Not Met verdict, out of scope and withdrawn excluded, nothing subtracted", () => {
    expect(totals.scorers).toEqual({ requirements: 12, nfr: 9, combined: 21, must: 18, should: 3, could: 0 });
  });

  test("vendor self-score totals are calculated the same way", () => {
    expect(totals.vendorSelf).toEqual({ requirements: 9, nfr: 10, combined: 19, must: 18, should: 0, could: 1 });
  });

  test("coverage counts fully, partly and un-scored requirements", () => {
    expect(totals.coverage).toEqual({ scorableRequirements: 4, fullyScored: 2, partlyScored: 1, unscored: 1, vendorAnswered: 4 });
  });

  test("a scorer is counted once per requirement", () => {
    expect(averageScorerScore([s("R1", "A", 1), s("R1", "A", 0), s("R1", "B", 1)])).toEqual({ average: 0.5, count: 2 });
  });

  test("verdict: 0.5 or more is Met, under 0.5 is Not Met", () => {
    expect(scorerOutcome(1 / 2)).toBe(1);
    expect(scorerOutcome(4 / 8)).toBe(1);
    expect(scorerOutcome(3 / 8)).toBe(0);
    expect(scorerOutcome(1 / 3)).toBe(0);
    expect(scorerOutcome(0)).toBe(0);
    const eight = (mets: number) => computeVendorTotals({
      requirements: [{ requirementId: "R", type: "user-story", priority: 9, status: "active" }],
      assignedScorerCount: 8,
      scorerScores: ["A", "B", "C", "D", "E", "F", "G", "H"].map((key, i) => s("R", key, i < mets ? 1 : 0)),
      vendorAnswers: [],
    }).scorers.combined;
    expect(eight(4)).toBe(9);
    expect(eight(3)).toBe(0);
  });

  test("range: every scorable requirement Met (R1 9 + R2 3 requirements, R3 9 + R4 1 NFRs)", () => {
    expect(computeMaximumTotals(requirements)).toEqual({ requirements: 12, nfr: 10, combined: 22, must: 18, should: 3, could: 1 });
  });

  test("leader: highest combined total, ties reported, no leader before anyone scores", () => {
    expect(pickLeaders([
      { vendorId: "X", combined: 16.5, hasAnyScore: true },
      { vendorId: "Y", combined: 12, hasAnyScore: true },
    ])).toEqual({ vendorIds: ["X"], isTie: false });
    expect(pickLeaders([
      { vendorId: "X", combined: 12, hasAnyScore: true },
      { vendorId: "Y", combined: 12, hasAnyScore: true },
    ])).toEqual({ vendorIds: ["X", "Y"], isTie: true });
    expect(pickLeaders([
      { vendorId: "X", combined: 0, hasAnyScore: false },
      { vendorId: "Y", combined: 0, hasAnyScore: false },
    ])).toEqual({ vendorIds: [], isTie: false });
  });
});
