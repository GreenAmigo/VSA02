import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS } from "../../convex/importLimits";
import { buildRequirementTemplateWorkbook, getRequirementImportValidationError, parseRequirementFileWithIssues, toRequirementImportRows } from "./projectRequirements";

describe("requirements import", () => {
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
    const xlsxParsed = await parseRequirementFileWithIssues(xlsxFile);
    const xlsxResult = toRequirementImportRows(xlsxParsed.rows);
    expect(xlsxResult).toHaveLength(4);
    expect(xlsxResult.map((row) => row.id).sort()).toEqual(["NFR-101", "NFR-102", "REQ-101", "REQ-102"]);

    const csvContent = [
      "Requirement ID,Title/Text,Type,Priority,Category",
      "REQ-201,SSO support,user-story,9,Security",
      "NFR-201,Encryption at rest,nfr,3,Security",
    ].join("\n");
    const csvFile = new File([csvContent], "requirements.csv", { type: "text/csv" });
    const csvParsed = await parseRequirementFileWithIssues(csvFile);
    const csvResult = toRequirementImportRows(csvParsed.rows);
    expect(csvResult).toHaveLength(2);
    expect(csvResult[0].id).toBe("REQ-201");

    expect(csvParsed.issues).toEqual([]);
    expect(csvParsed.rows).toHaveLength(2);
  });

  it("keeps valid rows and rejects a row with an invalid priority", async () => {
    const workbook = buildRequirementTemplateWorkbook();
    workbook.Sheets.Requirements = XLSX.utils.aoa_to_sheet([
      ["Requirement ID", "Title/Text", "Type", "Priority", "Category"],
      ["REQ-101", "Role-based access control", "user-story", 9, "Security"],
      ["REQ-102", "Audit retention policy", "user-story", 99, "Compliance"],
      ["REQ-103", "Password reset flow", "user-story", 3, "Security"],
    ]);

    const xlsxBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const xlsxFile = new File([xlsxBuffer], "template.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const parsed = await parseRequirementFileWithIssues(xlsxFile);

    expect(parsed.rows.map((row) => row.id).sort()).toEqual(["NFR-101", "REQ-101", "REQ-103"]);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0].reason).toContain("Row 3");
    expect(parsed.issues[0].reason).toContain("priority 99 isn't allowed");
    expect(parsed.issues[0].reason).toContain("Use 9, 3, 1 or 0");
  });

  it("refuses files that are the wrong type, too big, fake .xlsx, or have too many rows", async () => {
    await expect(parseRequirementFileWithIssues(new File(["x"], "requirements.xls"))).rejects.toThrow("Only .csv and .xlsx files can be imported.");
    await expect(parseRequirementFileWithIssues(new File(["x"], "requirements.exe"))).rejects.toThrow("Only .csv and .xlsx files can be imported.");

    const tooBig = new File([new Uint8Array(MAX_IMPORT_FILE_BYTES + 1)], "big.csv", { type: "text/csv" });
    await expect(parseRequirementFileWithIssues(tooBig)).rejects.toThrow("larger than 5 MB");

    const fakeXlsx = new File(["Requirement ID,Title/Text\nREQ-1,Hello"], "renamed.xlsx");
    await expect(parseRequirementFileWithIssues(fakeXlsx)).rejects.toThrow("not a real Excel workbook");

    const lines = ["Requirement ID,Title/Text,Type,Priority"];
    for (let index = 1; index <= MAX_IMPORT_ROWS + 5; index += 1) {
      lines.push(`REQ-${index},Requirement ${index},user-story,9`);
    }
    const tooManyRows = new File([lines.join("\n")], "many.csv", { type: "text/csv" });
    await expect(parseRequirementFileWithIssues(tooManyRows)).rejects.toThrow(`more than ${MAX_IMPORT_ROWS} rows`);

    const atLimit = new File([lines.slice(0, MAX_IMPORT_ROWS + 1).join("\n")], "limit.csv", { type: "text/csv" });
    const parsed = await parseRequirementFileWithIssues(atLimit);
    expect(parsed.rows).toHaveLength(MAX_IMPORT_ROWS);
  });
});
