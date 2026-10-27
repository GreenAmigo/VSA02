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

function normalizeText(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
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

export async function parseRequirementFile(file: File): Promise<RequirementRecord[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: true,
  });

  return rows
    .map((row) => toRequirementRecord(row))
    .filter((row): row is RequirementRecord => row !== null);
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

export function buildProjectId(companyId: string, name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "project";

  return `${companyId}-proj-${slug}`;
}
