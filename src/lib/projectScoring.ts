export function getScoringDraftError(
  vendorUserId: string | null,
  requirementId: string | null,
  comment: string,
  score: 0 | 1,
): string | null {
  if (!vendorUserId) {
    return "Select a vendor before submitting a score.";
  }

  if (!requirementId) {
    return "Select a requirement before submitting a score.";
  }

  if (score === 0 && !comment.trim()) {
    return "Add a note when scoring a requirement as not met.";
  }

  return null;
}
