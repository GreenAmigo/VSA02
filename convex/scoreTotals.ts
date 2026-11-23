// Shared scoring maths for the vendor comparison grid and the project dashboard.
// Pure functions only (no database access), so every total is computed one way
// and can be proven with small hand-worked examples in scoreTotals.test.ts.

export type TotalsPriority = 9 | 3 | 1 | 0;

export type TotalsRequirement = {
  requirementId: string;
  type: "user-story" | "nfr";
  priority: TotalsPriority;
  status: "active" | "withdrawn";
};

export type TotalsScorerScore = {
  requirementId: string;
  scorerKey: string;
  score: 0 | 1;
};

export type TotalsVendorAnswer = {
  requirementId: string;
  score: 0 | 1;
};

export type TotalsBreakdown = {
  requirements: number;
  nfr: number;
  combined: number;
  must: number;
  should: number;
  could: number;
};

export type VendorTotals = {
  scorers: TotalsBreakdown;
  vendorSelf: TotalsBreakdown;
  coverage: {
    scorableRequirements: number;
    fullyScored: number;
    partlyScored: number;
    unscored: number;
    vendorAnswered: number;
  };
};

/** Out of scope (priority 0) and withdrawn requirements never count towards totals. */
export function isScorable(requirement: TotalsRequirement): boolean {
  return requirement.status === "active" && requirement.priority !== 0;
}

/** Average of the scorers' 0/1 scores for one requirement, counting each scorer once. */
export function averageScorerScore(
  scores: TotalsScorerScore[],
): { average: number | null; count: number } {
  const byScorer = new Map<string, 0 | 1>();
  for (const row of scores) byScorer.set(row.scorerKey, row.score);
  const count = byScorer.size;
  if (count === 0) return { average: null, count: 0 };
  let sum = 0;
  for (const score of byScorer.values()) sum += score;
  return { average: sum / count, count };
}

function emptyBreakdown(): TotalsBreakdown {
  return { requirements: 0, nfr: 0, combined: 0, must: 0, should: 0, could: 0 };
}

function addWeighted(breakdown: TotalsBreakdown, requirement: TotalsRequirement, value: number) {
  const weighted = requirement.priority * value;
  if (requirement.type === "nfr") breakdown.nfr += weighted;
  else breakdown.requirements += weighted;
  if (requirement.priority === 9) breakdown.must += weighted;
  else if (requirement.priority === 3) breakdown.should += weighted;
  else if (requirement.priority === 1) breakdown.could += weighted;
}

/** Rounds to 2 decimal places so averages like 1/3 x 9 don't show floating-point noise. */
export function roundTotal(value: number): number {
  return Math.round(value * 100) / 100;
}

function finish(breakdown: TotalsBreakdown): TotalsBreakdown {
  return {
    requirements: roundTotal(breakdown.requirements),
    nfr: roundTotal(breakdown.nfr),
    combined: roundTotal(breakdown.requirements + breakdown.nfr),
    must: roundTotal(breakdown.must),
    should: roundTotal(breakdown.should),
    could: roundTotal(breakdown.could),
  };
}

/**
 * Weighted totals for ONE vendor organisation.
 * - scorers: priority x average of company scorers' scores (the official total)
 * - vendorSelf: priority x the vendor's own answer (for comparison only)
 * Nothing is ever subtracted: a 0 score simply adds nothing.
 */
export function computeVendorTotals(input: {
  requirements: TotalsRequirement[];
  scorerScores: TotalsScorerScore[];
  vendorAnswers: TotalsVendorAnswer[];
  assignedScorerCount: number;
}): VendorTotals {
  const scorerByRequirement = new Map<string, TotalsScorerScore[]>();
  for (const row of input.scorerScores) {
    const list = scorerByRequirement.get(row.requirementId) ?? [];
    list.push(row);
    scorerByRequirement.set(row.requirementId, list);
  }
  const vendorByRequirement = new Map<string, 0 | 1>();
  for (const row of input.vendorAnswers) vendorByRequirement.set(row.requirementId, row.score);

  const scorers = emptyBreakdown();
  const vendorSelf = emptyBreakdown();
  const coverage = { scorableRequirements: 0, fullyScored: 0, partlyScored: 0, unscored: 0, vendorAnswered: 0 };

  for (const requirement of input.requirements) {
    if (!isScorable(requirement)) continue;
    coverage.scorableRequirements += 1;

    const { average, count } = averageScorerScore(scorerByRequirement.get(requirement.requirementId) ?? []);
    if (average !== null) addWeighted(scorers, requirement, average);
    if (count === 0) coverage.unscored += 1;
    else if (input.assignedScorerCount > 0 && count >= input.assignedScorerCount) coverage.fullyScored += 1;
    else coverage.partlyScored += 1;

    const vendorScore = vendorByRequirement.get(requirement.requirementId);
    if (vendorScore !== undefined) {
      addWeighted(vendorSelf, requirement, vendorScore);
      coverage.vendorAnswered += 1;
    }
  }

  return { scorers: finish(scorers), vendorSelf: finish(vendorSelf), coverage };
}

/**
 * Picks the vendor(s) with the highest combined total.
 * Returns no leader when nobody has scored anything yet; returns several ids for a tie.
 */
export function pickLeaders(rows: Array<{ vendorId: string; combined: number; hasAnyScore: boolean }>): {
  vendorIds: string[];
  isTie: boolean;
} {
  const scored = rows.filter((row) => row.hasAnyScore);
  if (scored.length === 0) return { vendorIds: [], isTie: false };
  const best = Math.max(...scored.map((row) => row.combined));
  const vendorIds = scored.filter((row) => row.combined === best).map((row) => row.vendorId);
  return { vendorIds, isTie: vendorIds.length > 1 };
}
