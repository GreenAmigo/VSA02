import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";

import { buildReportWorkbook, leaderText, reportFileName, type ProjectReport } from "./projectReportExport";

const breakdown = (combined: number) => ({ requirements: combined, nfr: 0, combined, must: combined, should: 0, could: 0 });

const report: ProjectReport = {
  companyName: "Harbor Logistics Test",
  projectName: "Test Project 1",
  projectDescription: "",
  vendorDeadlineAt: null,
  scorerDeadlineAt: null,
  summary: {
    assignedScorerCount: 2,
    maximum: breakdown(18),
    vendors: [{
      vendorId: "v1", vendorName: "Acme Software Test",
      totals: { scorers: breakdown(9), vendorSelf: { requirements: 18, nfr: 0, combined: 18 }, coverage: { scorableRequirements: 2, fullyScored: 2, partlyScored: 0, unscored: 0, vendorAnswered: 2 } },
      scorersCompleted: 2,
      submission: { status: "submitted", submittedAt: Date.UTC(2026, 10, 20), deadlineAt: null },
    }],
    leader: { scorers: { vendorIds: ["v1"], isTie: false, isProvisional: false } },
  },
  vendorNames: [{ vendorId: "v1", vendorName: "Acme Software Test" }],
  comparison: [
    { requirementId: "REQ-1", text: "Sign in", type: "user-story", priority: 9, status: "active", counted: true,
      cells: [{ vendorId: "v1", scorerVerdict: 1, scorersScored: 2, vendorScore: 1, vendorComment: "Yes", vendorAmended: false }] },
    { requirementId: "REQ-2", text: "Reports", type: "user-story", priority: 9, status: "active", counted: true,
      cells: [{ vendorId: "v1", scorerVerdict: 0, scorersScored: 2, vendorScore: 1, vendorComment: "", vendorAmended: true }] },
  ],
  scorerScores: [{ requirementId: "REQ-1", vendorName: "Acme Software Test", scorerName: "Green Test1", departmentName: "Digital", score: 1, comment: "Good", enteredAt: 0 }],
  views: [{ vendorName: "Acme Software Test", scorerName: "Green Test1", departmentName: "Digital", viewText: "Solid", updatedAt: 0 }],
  amendments: [{ requirementId: "REQ-2", vendorName: "Acme Software Test", originalScore: 0, newScore: 1, originalComment: "", newComment: "", amendedBy: "Frazer Maxwell", reason: "Evidence", amendedAt: 0 }],
};

describe("sign-off report Excel export", () => {
  const workbook = buildReportWorkbook(report, new Date(Date.UTC(2026, 10, 23)));
  const rows = (sheet: string) => XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheet], { header: 1 });

  test("has one tab per part of the report", () => {
    expect(workbook.SheetNames).toEqual(["Summary", "Comparison", "Scorer scores", "Overall views", "Amendments"]);
  });

  test("summary shows the leader, the range and each vendor's totals", () => {
    const summary = rows("Summary");
    expect(summary.find((row) => row[0] === "Leading vendor")?.[1]).toBe("Acme Software Test");
    expect(summary.find((row) => row[0] === "Range (all Met)")?.slice(1, 4)).toEqual([18, 0, 18]);
    expect(summary.find((row) => row[0] === "Acme Software Test")?.slice(1, 4)).toEqual([9, 0, 9]);
  });

  test("comparison uses Met / Not met and marks amended vendor answers", () => {
    const comparison = rows("Comparison");
    expect(comparison[0]).toContain("Acme Software Test - scorers");
    expect(comparison[2].slice(6, 8)).toEqual(["Not met", "Met (amended)"]);
  });

  test("scorer scores, views and amendments use names", () => {
    expect(rows("Scorer scores")[1].slice(0, 5)).toEqual(["Acme Software Test", "REQ-1", "Green Test1", "Digital", "Met"]);
    expect(rows("Overall views")[1][3]).toBe("Solid");
    expect(rows("Amendments")[1][6]).toBe("Frazer Maxwell");
  });

  test("leader text explains ties and provisional results, and file names are safe", () => {
    expect(leaderText({ ...report, summary: { ...report.summary, leader: { scorers: { vendorIds: ["v1"], isTie: false, isProvisional: true } } } }))
      .toBe("Acme Software Test (provisional: scoring not complete)");
    expect(reportFileName(report, new Date(Date.UTC(2026, 10, 23)), "xlsx")).toBe("Harbor-Logistics-Test-Test-Project-1-vendor-selection-report-2026-11-23.xlsx");
  });
});
