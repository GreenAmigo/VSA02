import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { getProjectDraftError, normalizeProjectName } from "../lib/projectDraft";
import { getPersonInviteDraftError } from "../lib/projectPeople";
import { buildRequirementTemplateWorkbook, getRequirementImportValidationError, parseRequirementFile, parseRequirementFileWithIssues } from "../lib/projectRequirements";
import { getScoringDraftError, getScoringModeMeta } from "../lib/projectScoring";

describe("project creation screen", () => {
  it("normalizes the project name before it is saved", () => {
    expect(normalizeProjectName("  Payroll Platform  ")).toBe("Payroll Platform");
    expect(normalizeProjectName("  payroll   platform  ")).toBe("payroll platform");
  });

  it("requires a company and a meaningful project name", () => {
    expect(getProjectDraftError(null, "")).toBe("Select a company before creating a project.");
    expect(getProjectDraftError("company-123", "  ")).toBe("Project name is required.");
    expect(getProjectDraftError("company-123", "AI")).toBe("Project name must be at least 3 characters long.");
    expect(getProjectDraftError("company-123", "Payroll Platform")).toBeNull();
  });

  it("requires a valid spreadsheet import before confirmation", () => {
    expect(getRequirementImportValidationError([])).toBe("Upload a spreadsheet with at least one valid requirement row.");
    expect(getRequirementImportValidationError([
      { id: "REQ-1", text: "Security review", type: "user-story", priority: 9, status: "active", updatedAt: "2026-11-05T00:00:00.000Z" },
    ])).toBeNull();
  });

  it("reads the generated requirements and NFR template workbook and csv through the same importer contract", async () => {
    const workbook = buildRequirementTemplateWorkbook();
    const requirementsRows = [
      ["REQ-101", "Role-based access control", "user-story", 9, "Security"],
      ["REQ-102", "Audit retention policy", "user-story", 3, "Compliance"],
    ];
    const nfrRows = [
      ["NFR-101", "99.9% availability", "nfr", 9, "Availability"],
      ["NFR-102", "End-to-end encryption", "nfr", 3, "Security"],
    ];
    workbook.Sheets.Requirements = XLSX.utils.aoa_to_sheet([
      ["Requirement ID", "Title/Text", "Type", "Priority", "Category"],
      ...requirementsRows,
    ]);
    workbook.Sheets.NFRs = XLSX.utils.aoa_to_sheet([
      ["Requirement ID", "Title/Text", "Type", "Priority", "Category"],
      ...nfrRows,
    ]);

    const xlsxBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const xlsxFile = new File([xlsxBuffer], "template.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const xlsxResult = await parseRequirementFile(xlsxFile);
    expect(xlsxResult).toHaveLength(4);
    expect(xlsxResult.map((row) => row.id).sort()).toEqual(["NFR-101", "NFR-102", "REQ-101", "REQ-102"]);

    const csvContent = [
      "Requirement ID,Title/Text,Type,Priority,Category",
      "REQ-201,SSO support,user-story,9,Security",
      "NFR-201,Encryption at rest,nfr,3,Security",
    ].join("\n");
    const csvFile = new File([csvContent], "requirements.csv", { type: "text/csv" });
    const csvResult = await parseRequirementFile(csvFile);
    expect(csvResult).toHaveLength(2);
    expect(csvResult[0].id).toBe("REQ-201");

    const issues = await parseRequirementFileWithIssues(csvFile);
    expect(issues.issues).toEqual([]);
    expect(issues.rows).toHaveLength(2);
  });

  it("requires a valid person invite before sending", () => {
    expect(getPersonInviteDraftError("", "alex@example.com")).toBe("Full name is required.");
    expect(getPersonInviteDraftError("Alex Turner", "")).toBe("Email is required.");
    expect(getPersonInviteDraftError("Alex Turner", "not-an-email")).toBe("Enter a valid email address.");
    expect(getPersonInviteDraftError("Alex Turner", "alex@example.com")).toBeNull();
  });

  it("requires a valid score draft before submission", () => {
    expect(getScoringDraftError(null, "REQ-1", "Needs review", 1)).toBe("Select a vendor before submitting a score.");
    expect(getScoringDraftError("vendor-1", null, "Needs review", 0)).toBe("Select a requirement before submitting a score.");
    expect(getScoringDraftError("vendor-1", "REQ-1", "", 0)).toBe("Add a note when scoring a requirement as not met.");
    expect(getScoringDraftError("vendor-1", "REQ-1", "Works as expected", 1)).toBeNull();
  });

  it("describes the scorer mode separately from vendor self-scoring", () => {
    expect(getScoringModeMeta("company-scorer")).toEqual({
      heading: "Scorer scoring",
      detail: "Score each vendor against the current requirement.",
    });
    expect(getScoringModeMeta("vendor")).toEqual({
      heading: "Vendor self-score",
      detail: "Submit your own evaluation for the current requirement.",
    });
  });
});
