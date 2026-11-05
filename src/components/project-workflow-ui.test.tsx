import { describe, expect, it } from "vitest";

import { getProjectDraftError, normalizeProjectName } from "../lib/projectDraft";
import { getRequirementImportValidationError } from "../lib/projectRequirements";

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
});
