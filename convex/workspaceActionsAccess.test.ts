/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("Workspace actions access rules", () => {
  test("company scorers and vendors are rejected by every workspace action endpoint", async () => {
    const t = convexTest({ schema, modules });
    await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health",
      companyBName: "Beta Logistics",
      projectAName: "HR Platform",
      projectBName: "Supply Chain",
    });

    const scorer = t.withIdentity({ tokenIdentifier: "beta-scorer", name: "Beta Scorer", email: "scorer@beta.example" });
    const vendor = t.withIdentity({ tokenIdentifier: "northwind-vendor", name: "Northwind Labs", email: "vendor@northwind.example" });

    await expect(
      scorer.mutation(api.admin.createCompany, { name: "Blocked scorer workspace" }),
    ).rejects.toThrow("Only VS Consultants can manage workspaces");

    await expect(
      vendor.mutation(api.admin.createCompany, { name: "Blocked vendor workspace" }),
    ).rejects.toThrow("Only VS Consultants can manage workspaces");

    await expect(
      scorer.query(api.admin.listActivityLogs, {}),
    ).rejects.toThrow("Only VS Consultants can manage workspaces");

    await expect(
      vendor.query(api.admin.listActivityLogs, {}),
    ).rejects.toThrow("Only VS Consultants can manage workspaces");

    await expect(
      scorer.mutation(api.workspaceSeed.importWorkspaceBundle, { workspaces: [] }),
    ).rejects.toThrow("Consultant access required");

    await expect(
      vendor.mutation(api.workspaceSeed.importWorkspaceBundle, { workspaces: [] }),
    ).rejects.toThrow("Consultant access required");
  });
});
