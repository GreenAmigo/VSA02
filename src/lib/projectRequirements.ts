import * as XLSX from "xlsx";

import { assertValidPriorityValue } from "./security.ts";

export type RequirementPriority = 9 | 3 | 1 | 0;
export type RequirementType = "user-story" | "nfr";
export type RequirementStatus = "active" | "withdrawn";

export type RequirementRecord = {
  id: string;
  text: string;
  type: RequirementType;
  priority: RequirementPriority;
  status: RequirementStatus;
  updatedAt: string;
};

export type Project = {
  id: string;
  companyId: string;
  name: string;
  createdAt: string;
};

export type RequirementImportSummary = {
  added: number;
  updated: number;
  withdrawn: number;
  total: number;
};

export type RequirementImportIssue = {
  rowIndex: number;
  sheetName: string;
  requirementId?: string;
  reason: string;
  foundHeaders: string[];
};

const requirementHeaderAliases = {
  id: ["requirementid", "requirementidfield", "requirementidcode", "requirementidnumber", "id"],
  text: ["requirementtext", "titletext", "title", "text", "description", "summary", "requirement", "requirementdescription"],
  type: ["type", "requirementtype", "category", "requirementcategory", "kind"],
  priority: ["priority", "priorityvalue", "weight", "scoreweight"],
} as const;

const requirementSheetNames = ["Requirements", "NFRs"] as const;

function normalizeText(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
}

function normalizeHeaderName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isInstructionSheetName(sheetName: string): boolean {
  return normalizeHeaderName(sheetName).includes("instruction");
}

function isRelevantRequirementSheetName(sheetName: string): boolean {
  const normalized = normalizeHeaderName(sheetName);
  return requirementSheetNames.some((name) => normalizeHeaderName(name) === normalized)
    || normalized.includes("requirement")
    || normalized.includes("nfr");
}

function getMatchingHeaderKey(row: Record<string, unknown>, candidates: readonly string[]): string | null {
  const normalizedRows = Object.keys(row).map((key) => ({ raw: key, normalized: normalizeHeaderName(key) }));

  for (const candidate of candidates) {
    const match = normalizedRows.find((entry) => entry.normalized === candidate || entry.normalized.includes(candidate));
    if (match) {
      return match.raw;
    }
  }

  return null;
}

function isBlankRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => String(value ?? "").trim() === "");
}

export function buildRequirementTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const requirementsHeader = ["Requirement ID", "Title/Text", "Type", "Priority", "Category"];
  const nfrHeader = ["Requirement ID", "Title/Text", "Type", "Priority", "Category"];
  const requirementsRows = [
    requirementsHeader,
    ["REQ-101", "Role-based admin access", "user-story", 9, "Security"],
  ];
  const nfrRows = [
    nfrHeader,
    ["NFR-101", "99.9% availability", "nfr", 9, "Availability"],
  ];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(requirementsRows), "Requirements");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(nfrRows), "NFRs");

  return workbook;
}

export function parseRequirementFileWithIssues(file: File): Promise<{ rows: RequirementRecord[]; issues: RequirementImportIssue[]; sheetNames: string[] }> {
  return (async () => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", raw: true });
    const candidates = workbook.SheetNames.filter((sheetName) => !isInstructionSheetName(sheetName));
    const relevantSheets = candidates.filter((sheetName) => isRelevantRequirementSheetName(sheetName)) || candidates;
    const sheetNames = relevantSheets.length > 0 ? relevantSheets : candidates;
    const rows: RequirementRecord[] = [];
    const issues: RequirementImportIssue[] = [];

    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        continue;
      }

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: "",
        raw: true,
      });

      for (let index = 0; index < rawRows.length; index += 1) {
        const rawRow = rawRows[index];
        if (!rawRow || isBlankRow(rawRow)) {
          continue;
        }

        const foundHeaders = Object.keys(rawRow).map((key) => String(key));
        const idKey = getMatchingHeaderKey(rawRow, requirementHeaderAliases.id);
        const textKey = getMatchingHeaderKey(rawRow, requirementHeaderAliases.text);
        if (!idKey || !textKey) {
          const missing = [];
          if (!idKey) {
            missing.push("Requirement ID");
          }
          if (!textKey) {
            missing.push("Requirement Text");
          }
          issues.push({
            rowIndex: index + 2,
            sheetName,
            reason: `Missing required heading${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Found headings: ${foundHeaders.join(", ") || "none"}.`,
            foundHeaders,
          });
          continue;
        }

        const requirementId = normalizeRequirementId(rawRow[idKey]);
        const requirementText = normalizeText(rawRow[textKey]);
        if (!requirementId) {
          issues.push({
            rowIndex: index + 2,
            sheetName,
            reason: `Row has an empty Requirement ID. Found headings: ${foundHeaders.join(", ") || "none"}.`,
            foundHeaders,
          });
          continue;
        }

        if (!requirementText) {
          issues.push({
            rowIndex: index + 2,
            sheetName,
            reason: `Row has an empty requirement text. Found headings: ${foundHeaders.join(", ") || "none"}.`,
            foundHeaders,
            requirementId,
          });
          continue;
        }

        const typeKey = getMatchingHeaderKey(rawRow, requirementHeaderAliases.type);
        const priorityKey = getMatchingHeaderKey(rawRow, requirementHeaderAliases.priority);
        let type: RequirementType = requirementTypeFromValue(
          typeKey ? rawRow[typeKey] : sheetName.toLowerCase().includes("nfr") ? "nfr" : "user-story",
        );

        if (typeKey && rawRow[typeKey] === "Functional") {
          type = "user-story";
        }

        const priority = priorityKey ? requirementPriorityFromValue(rawRow[priorityKey]) : 3;

        rows.push({
          id: requirementId,
          text: requirementText,
          type,
          priority,
          status: "active",
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return { rows, issues, sheetNames };
  })();
}

export async function parseRequirementFile(file: File): Promise<RequirementRecord[]> {
  const parsed = await parseRequirementFileWithIssues(file);
  return parsed.rows;
}

export function normalizeRequirementId(value: unknown): string {
  return normalizeText(value)
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^A-Z0-9-_.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function requirementPriorityFromValue(value: unknown): RequirementPriority {
  const rawText = String(value ?? "").trim();
  if (!rawText) {
    return 3;
  }

  return assertValidPriorityValue(rawText);
}

export function requirementTypeFromValue(value: unknown): RequirementType {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized.includes("nfr") || normalized.includes("non-functional")) {
    return "nfr";
  }

  return "user-story";
}

export function toRequirementRecord(row: Record<string, unknown>): RequirementRecord | null {
  const requirementId =
    normalizeRequirementId(
      row["Requirement ID"] ??
        row["requirementId"] ??
        row["RequirementId"] ??
        row["ID"] ??
        row["id"] ??
        row["Requirement"] ??
        row["Req ID"],
    );

  const requirementText = normalizeText(
    row["Requirement Text"] ??
      row["Requirement"] ??
      row["Text"] ??
      row["Description"] ??
      row["summary"] ??
      row["Requirement Description"],
  );

  if (!requirementId || !requirementText) {
    return null;
  }

  return {
    id: requirementId,
    text: requirementText,
    type: requirementTypeFromValue(
      row["Type"] ?? row["Requirement Type"] ?? row["Category"] ?? row["type"] ?? "user-story",
    ),
    priority: requirementPriorityFromValue(
      row["Priority"] ?? row["priority"] ?? row["Weight"] ?? row["scoreWeight"] ?? 3,
    ),
    status: "active",
    updatedAt: new Date().toISOString(),
  };
}

export function buildRequirementImportPlan(
  existing: RequirementRecord[],
  incoming: RequirementRecord[],
): { next: RequirementRecord[]; summary: RequirementImportSummary } {
  const existingById = new Map(existing.map((record) => [record.id, record]));
  const incomingById = new Map(incoming.map((record) => [record.id, record]));
  const seenIds = new Set<string>();
  const next = [...existing];
  let added = 0;
  let updated = 0;
  let withdrawn = 0;

  for (const record of incoming) {
    const current = existingById.get(record.id);
    seenIds.add(record.id);

    if (!current) {
      added += 1;
      next.push({ ...record, status: "active" });
      continue;
    }

    if (
      current.text !== record.text ||
      current.type !== record.type ||
      current.priority !== record.priority
    ) {
      updated += 1;
    }

    const index = next.findIndex((item) => item.id === record.id);
    const updatedRecord: RequirementRecord = {
      ...record,
      status: "active",
      updatedAt: new Date().toISOString(),
    };

    if (index >= 0) {
      next[index] = updatedRecord;
    } else {
      next.push(updatedRecord);
    }
  }

  for (const record of existing) {
    if (!seenIds.has(record.id) && record.status !== "withdrawn") {
      withdrawn += 1;
      const index = next.findIndex((item) => item.id === record.id);
      const withdrawnRecord: RequirementRecord = {
        ...record,
        status: "withdrawn",
        updatedAt: new Date().toISOString(),
      };

      if (index >= 0) {
        next[index] = withdrawnRecord;
      } else {
        next.push(withdrawnRecord);
      }
    }
  }

  const finalList: RequirementRecord[] = next
    .map((record): RequirementRecord => ({
      ...record,
      status: record.status === "withdrawn" ? "withdrawn" : "active",
      updatedAt: new Date().toISOString(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    next: finalList,
    summary: {
      added,
      updated,
      withdrawn,
      total: finalList.length,
    },
  };
}

export function getRequirementImportValidationError(rows: RequirementRecord[]): string | null {
  if (!rows.length) {
    return "Upload a spreadsheet with at least one valid requirement row.";
  }

  return null;
}

export function buildProjectId(companyId: string, name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "project";

  return `${companyId}-proj-${slug}`;
}
