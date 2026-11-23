import { describe, expect, test } from "vitest";
import { averageScorerScore, computeVendorTotals, pickLeaders, type TotalsRequirement } from "./scoreTotals";

// Hand-worked dataset (3 assigned scorers: A, B, C)
//   R1 user story, Must (9)   scorers A1 B1 C0 -> avg 2/3 -> 6      vendor 1 -> 9
//   R2 user story, Should (3) scorers A1 B0    -> avg 1/2 -> 1.5    vendor 0 -> 0
//   R3 NFR, Must (9)          scorers A1 B1 C1 -> avg 1   -> 9      vendor 1 -> 9
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

  test("scorers' totals: priority x average, out of scope and withdrawn excluded, nothing subtracted", () => {
    expect(totals.scorers).toEqual({ requirements: 7.5, nfr: 9, combined: 16.5, must: 15, should: 1.5, could: 0 });
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

  test("awkward averages are rounded to 2 decimal places", () => {
    const thirds = computeVendorTotals({
      requirements: [{ requirementId: "R", type: "user-story", priority: 3, status: "active" }],
      assignedScorerCount: 3,
      scorerScores: [s("R", "A", 1), s("R", "B", 0), s("R", "C", 0)],
      vendorAnswers: [],
    });
    expect(thirds.scorers.combined).toBe(1);
    const sevenths = computeVendorTotals({
      requirements: [{ requirementId: "R", type: "user-story", priority: 1, status: "active" }],
      assignedScorerCount: 7,
      scorerScores: ["A", "B", "C", "D", "E", "F", "G"].map((key, i) => s("R", key, i === 0 ? 1 : 0)),
      vendorAnswers: [],
    });
    expect(sevenths.scorers.combined).toBe(0.14);
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
