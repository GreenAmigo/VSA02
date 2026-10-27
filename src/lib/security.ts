export type ValidScore = 0 | 1;
export type ValidPriority = 9 | 3 | 1 | 0;

export function assertValidScoreValue(value: unknown): ValidScore {
  const numericValue = Number(value);
  if (numericValue === 0 || numericValue === 1) {
    return numericValue as ValidScore;
  }

  throw new Error("Scores can only be 0 or 1.");
}

export function assertValidPriorityValue(value: unknown): ValidPriority {
  const numericValue = Number(String(value ?? "").replace(/[^0-9]/g, ""));
  if ([9, 3, 1, 0].includes(numericValue)) {
    return numericValue as ValidPriority;
  }

  throw new Error("Requirement priorities can only be 9, 3, 1 or 0.");
}
