import { assertValidScoreValue } from "./security.ts";

export type ScoreValue = 0 | 1;
export type RequirementType = "user-story" | "nfr";

export type RequirementLike = {
  id: string;
  priority: number;
  type: RequirementType;
  status?: "active" | "withdrawn";
};

export type VendorScoreRecord = {
  vendorId: string;
  requirementId: string;
  score: ScoreValue;
  comment?: string;
  enteredBy: string;
  enteredAt: string;
};

export type VendorTotals = {
  vendorId: string;
  userStoryTotal: number;
  nfrTotal: number;
  total: number;
  unmetCount: number;
  missingCount: number;
  scoredCount: number;
};

export function weightedScore(priority: number, score: ScoreValue): number {
  if (priority === 0) {
    return 0;
  }

  return priority * assertValidScoreValue(score);
}

export function calculateVendorTotals(
  requirements: RequirementLike[],
  scores: VendorScoreRecord[],
  vendorId: string,
): VendorTotals {
  const recordsByRequirement = new Map(
    scores
      .filter((entry) => entry.vendorId === vendorId)
      .map((entry) => [entry.requirementId, entry] as const),
  );

  let userStoryTotal = 0;
  let nfrTotal = 0;
  let total = 0;
  let unmetCount = 0;
  let scoredCount = 0;
  let missingCount = 0;

  for (const requirement of requirements) {
    if (requirement.status === "withdrawn" || requirement.priority === 0) {
      continue;
    }

    const match = recordsByRequirement.get(requirement.id);
    if (!match) {
      missingCount += 1;
      continue;
    }

    const scoreValue = assertValidScoreValue(match.score);
    scoredCount += 1;
    const weight = weightedScore(requirement.priority, scoreValue);
    if (requirement.type === "user-story") {
      userStoryTotal += weight;
    } else {
      nfrTotal += weight;
    }

    total += weight;

    if (scoreValue === 0) {
      unmetCount += 1;
    }
  }

  total -= unmetCount;

  return {
    vendorId,
    userStoryTotal,
    nfrTotal,
    total,
    unmetCount,
    missingCount,
    scoredCount,
  };
}

export function calculateDashboardTotals(
  requirements: RequirementLike[],
  scoresByVendor: Record<string, VendorScoreRecord[]>,
): Array<VendorTotals & { vendorName: string }> {
  return Object.entries(scoresByVendor).map(([vendorId, scores]) => ({
    ...calculateVendorTotals(requirements, scores, vendorId),
    vendorName: vendorId,
  }));
}
