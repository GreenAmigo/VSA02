import * as XLSX from "xlsx";

// Shape of api.report.getProjectReport (kept local so this file has no server imports).
export type ProjectReport = {
  companyName: string;
  brandName?: string | null;
  brandLogoUrl?: string | null;
  projectName: string;
  projectDescription: string;
  vendorDeadlineAt: number | null;
  scorerDeadlineAt: number | null;
  summary: {
    assignedScorerCount: number;
    maximum: { requirements: number; nfr: number; combined: number; must: number; should: number; could: number };
    vendors: Array<{
      vendorId: string;
      vendorName: string;
      totals: {
        scorers: { requirements: number; nfr: number; combined: number; must: number; should: number; could: number };
        vendorSelf: { requirements: number; nfr: number; combined: number };
        coverage: { scorableRequirements: number; fullyScored: number; partlyScored: number; unscored: number; vendorAnswered: number };
      };
      scorersCompleted: number;
      submission: { status: "not-started" | "in-progress" | "submitted"; submittedAt: number | null; deadlineAt: number | null };
    }>;
    leader: { scorers: { vendorIds: string[]; isTie: boolean; isProvisional: boolean } };
  };
  vendorNames: Array<{ vendorId: string; vendorName: string }>;
  comparison: Array<{
    requirementId: string;
    text: string;
    type: "user-story" | "nfr";
    priority: 9 | 3 | 1 | 0;
    status: "active" | "withdrawn";
    counted: boolean;
    cells: Array<{ vendorId: string; scorerVerdict: 0 | 1 | null; scorersScored: number; vendorScore: 0 | 1 | null; vendorComment: string; vendorAmended: boolean }>;
  }>;
  scorerScores: Array<{ requirementId: string; vendorName: string; scorerName: string; departmentName: string; score: 0 | 1; comment: string; enteredAt: number }>;
  views: Array<{ vendorName: string; scorerName: string; departmentName: string; viewText: string; updatedAt: number }>;
  amendments: Array<{ requirementId: string; vendorName: string; originalScore: 0 | 1; newScore: 0 | 1; originalComment: string; newComment: string; amendedBy: string; reason: string; amendedAt: number }>;
};

export function priorityName(priority: 9 | 3 | 1 | 0) {
  return priority === 9 ? "Must" : priority === 3 ? "Should" : priority === 1 ? "Could" : "Out of scope";
}

export function metLabel(value: 0 | 1 | null) {
  return value === null ? "Unscored" : value === 1 ? "Met" : "Not met";
}

export function formatReportDate(timestamp: number | null | undefined) {
  return typeof timestamp === "number" ? new Date(timestamp).toLocaleDateString("en-GB") : "";
}

export function leaderText(report: ProjectReport) {
  const leader = report.summary.leader.scorers;
  const names = leader.vendorIds.map((id) => report.summary.vendors.find((row) => row.vendorId === id)?.vendorName ?? id);
  if (names.length === 0) return "No leading vendor yet";
  return `${names.join(" and ")}${leader.isTie ? " (tie)" : ""}${leader.isProvisional ? " (provisional: scoring not complete)" : ""}`;
}

const STATUS_NAMES = { "not-started": "Not started", "in-progress": "In progress", submitted: "Submitted" } as const;

/** Builds the Excel workbook: Summary, Comparison, Scorer scores, Overall views, Amendments. */
export function buildReportWorkbook(report: ProjectReport, generatedAt: Date) {
  const workbook = XLSX.utils.book_new();
  const max = report.summary.maximum;

  const summary: Array<Array<string | number>> = [
    [`${report.projectName} - vendor selection report`],
    ["Company", report.brandName || report.companyName],
    ["Generated", generatedAt.toLocaleString("en-GB")],
    ["Vendor deadline", formatReportDate(report.vendorDeadlineAt)],
    ["Scorer deadline", formatReportDate(report.scorerDeadlineAt)],
    ["Leading vendor", leaderText(report)],
    ["Scoring rule", SCORING_RULE_TEXT],
    [],
    ["Vendor", "Requirements", "NFRs", "Combined", "Must", "Should", "Could", "Vendor self-score total", "Requirements fully scored", "Vendor status", "Submitted"],
    ["Range (all Met)", max.requirements, max.nfr, max.combined, max.must, max.should, max.could, "", "", "", ""],
    ...report.summary.vendors.map((vendor) => [
      vendor.vendorName,
      vendor.totals.scorers.requirements,
      vendor.totals.scorers.nfr,
      vendor.totals.scorers.combined,
      vendor.totals.scorers.must,
      vendor.totals.scorers.should,
      vendor.totals.scorers.could,
      vendor.totals.vendorSelf.combined,
      `${vendor.totals.coverage.fullyScored} of ${vendor.totals.coverage.scorableRequirements}`,
      STATUS_NAMES[vendor.submission.status],
      formatReportDate(vendor.submission.submittedAt),
    ]),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), "Summary");

  const vendorHeaders = report.vendorNames.flatMap((vendor) => [
    `${vendor.vendorName} - scorers`, `${vendor.vendorName} - vendor self-score`, `${vendor.vendorName} - vendor comment`,
  ]);
  const comparison: Array<Array<string | number>> = [
    ["Requirement ID", "Requirement", "Type", "Priority", "Status", "Counted in totals", ...vendorHeaders],
    ...report.comparison.map((row) => [
      row.requirementId,
      row.text,
      row.type === "nfr" ? "NFR" : "Requirement",
      priorityName(row.priority),
      row.status === "withdrawn" ? "Withdrawn" : "Active",
      row.counted ? "Yes" : "No",
      ...row.cells.flatMap((cell) => [
        metLabel(cell.scorerVerdict),
        `${metLabel(cell.vendorScore)}${cell.vendorAmended ? " (amended)" : ""}`,
        cell.vendorComment,
      ]),
    ]),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(comparison), "Comparison");

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Vendor", "Requirement ID", "Scorer", "Department (when scored)", "Score", "Comment", "Date"],
    ...report.scorerScores.map((row) => [row.vendorName, row.requirementId, row.scorerName, row.departmentName, metLabel(row.score), row.comment, formatReportDate(row.enteredAt)]),
  ]), "Scorer scores");

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Vendor", "Scorer", "Department", "Overall view", "Last updated"],
    ...report.views.map((row) => [row.vendorName, row.scorerName, row.departmentName, row.viewText, formatReportDate(row.updatedAt)]),
  ]), "Overall views");

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Vendor", "Requirement ID", "Original", "New", "Original comment", "New comment", "Amended by", "Reason", "Date"],
    ...report.amendments.map((row) => [row.vendorName, row.requirementId, metLabel(row.originalScore), metLabel(row.newScore), row.originalComment, row.newComment, row.amendedBy, row.reason, formatReportDate(row.amendedAt)]),
  ]), "Amendments");

  return workbook;
}

export const REPORT_VERSION = "v1.0";

/** "[Project Name] - Vendor Selection Report v1.0" (without extension), safe for Windows file names. */
export function reportTitle(report: ProjectReport) {
  const project = report.projectName.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim() || "Project";
  return `${project} - Vendor Selection Report ${REPORT_VERSION}`;
}

export function reportFileName(report: ProjectReport, extension: "xlsx" | "pdf") {
  return `${reportTitle(report)}.${extension}`;
}

export const SCORING_RULE_TEXT = "Met = 1, Not met = 0. Weighted total = priority (Must 9, Should 3, Could 1) x the scorers' verdict (Met if at least half of the scorers said Met). Out of scope and withdrawn requirements are excluded.";

export function downloadReportWorkbook(report: ProjectReport) {
  XLSX.writeFile(buildReportWorkbook(report, new Date()), reportFileName(report, "xlsx"));
}
