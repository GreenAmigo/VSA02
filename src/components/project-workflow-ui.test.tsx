import { describe, expect, it } from "vitest";

import { getProjectDraftError, normalizeProjectName } from "../lib/projectDraft";
import { getPersonInviteDraftError } from "../lib/projectPeople";
import { getRequirementImportValidationError } from "../lib/projectRequirements";
import { getScoringDraftError } from "../lib/projectScoring";

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
});
