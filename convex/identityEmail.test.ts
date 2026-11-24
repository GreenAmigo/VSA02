/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { verifiedIdentityEmail } from "./identityEmail";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

describe("verified email only", () => {
  test("the helper ignores unverified or missing emails", () => {
    expect(verifiedIdentityEmail({ email: " Admin@Beta.Example ", emailVerified: true })).toBe("admin@beta.example");
    expect(verifiedIdentityEmail({ email: "admin@beta.example", emailVerified: false })).toBeUndefined();
    expect(verifiedIdentityEmail({ email: "admin@beta.example" })).toBeUndefined();
    expect(verifiedIdentityEmail(null)).toBeUndefined();
  });

  test("a stranger using an admin's email without verification gets no access", async () => {
    const t = convexTest({ schema, modules });
    const seeded = await t.mutation(internal.access.seedScenario, {
      companyAName: "Acme Health", companyBName: "Beta Logistics", projectAName: "HR Platform", projectBName: "Supply Chain",
    });
    // Same email as the real Beta admin, but a different login and NOT verified.
    const impostor = t.withIdentity({ tokenIdentifier: "impostor", subject: "impostor", email: "admin@beta.example" });
    const access = await impostor.query(api.access.getCurrentUserAccess, {});
    expect(access.companyIds).toEqual([]);
    expect(access.role).toBeNull();
    await expect(impostor.query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId }))
      .rejects.toThrow("Only consultants and company admins");
    await expect(impostor.mutation(api.requirements.applyRequirementImport, {
      projectId: seeded.projectBId, rows: [{ id: "X", text: "Injected", type: "user-story", priority: 9 }], confirm: true,
    })).rejects.toThrow();
    // The real admin, matched by their user ID, still has access.
    await expect(t.withIdentity({ tokenIdentifier: "beta-admin" })
      .query(api.dashboard.getProjectDashboard, { projectId: seeded.projectBId })).resolves.toBeTruthy();
  });
});
