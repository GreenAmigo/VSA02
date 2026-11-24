// Limits for the requirements spreadsheet import.
// Shared by the browser (checked before the file is opened) and the server
// (checked again, because a browser check alone can be skipped).

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 1000;
export const MAX_REQUIREMENT_ID_LENGTH = 40;
export const MAX_REQUIREMENT_TEXT_LENGTH = 4000;
export const ALLOWED_IMPORT_EXTENSIONS = [".csv", ".xlsx"] as const;

type ImportRowShape = { id: string; text: string };

// Returns a plain-English problem, or null when the rows are within limits.
export function requirementImportLimitError(rows: readonly ImportRowShape[]): string | null {
  if (rows.length > MAX_IMPORT_ROWS) {
    return `This import has ${rows.length} rows. The most allowed in one import is ${MAX_IMPORT_ROWS}.`;
  }
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (id.length > MAX_REQUIREMENT_ID_LENGTH) {
      return `Requirement ID "${id.slice(0, MAX_REQUIREMENT_ID_LENGTH)}…" is too long (most allowed is ${MAX_REQUIREMENT_ID_LENGTH} characters).`;
    }
    if (String(row.text ?? "").length > MAX_REQUIREMENT_TEXT_LENGTH) {
      return `Requirement ${id || "(no ID)"} has text longer than ${MAX_REQUIREMENT_TEXT_LENGTH} characters.`;
    }
  }
  return null;
}
