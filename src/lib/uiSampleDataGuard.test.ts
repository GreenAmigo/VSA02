import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenPatterns = [
  /consultantWorkspaceData|companyAccess/i,
  /Acme Health|Beta Logistics|Northwind Labs|Apex Supply|Priya Singh|Nina Foster/i,
];

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      return [fullPath];
    }

    return [];
  });
}

describe("UI sample-data guard", () => {
  it("does not allow static sample-company data in the app layer", () => {
    const files = collectSourceFiles("src").filter((file) => {
      const normalized = file.replace(/\\/g, "/");
      return (
        (normalized.includes("/app/") ||
          normalized.includes("/components/") ||
          normalized.includes("/lib/")) &&
        !normalized.endsWith(".test.ts") &&
        !normalized.endsWith(".test.tsx") &&
        !normalized.endsWith("/uiSampleDataGuard.test.ts")
      );
    });

    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(source)) {
          offenders.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
