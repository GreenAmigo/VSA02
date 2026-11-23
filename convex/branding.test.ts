/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules: Record<string, () => Promise<unknown>> = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest({ schema, modules });
  const seeded = await t.mutation(internal.access.seedScenario, {
    companyAName: "Acme Health", companyBName: "Beta Logistics", projectAName: "HR Platform", projectBName: "Supply Chain",
  });
  await t.run((ctx) => ctx.db.insert("consultants", { userId: "platform-consultant", displayName: "Consultant", isActive: true, grantedAt: 1 }));
  const consultant = t.withIdentity({ tokenIdentifier: "platform-consultant", subject: "platform-consultant" });
  const store = (type: string, bytes = 100) => t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })));
  return { t, seeded, consultant, store };
}

describe("Client branding", () => {
  test("a consultant sets the name and logo; workspace members, the header data and reports get them", async () => {
    const { t, seeded, consultant, store } = await setup();
    const logo = await store("image/png");
    await consultant.mutation(api.branding.setCompanyBranding, { companyId: seeded.companyBId, brandName: "Beta Group", logoStorageId: logo });

    const scorerAccess = await t.withIdentity({ tokenIdentifier: "beta-scorer" }).query(api.access.getCurrentUserAccess, {});
    const brand = scorerAccess.branding.find((row) => row.companyId === seeded.companyBId);
    expect(brand?.brandName).toBe("Beta Group");
    expect(brand?.logoUrl).toBeTruthy();
    // Other companies' members don't receive Beta's branding.
    const acmeAccess = await t.withIdentity({ tokenIdentifier: "acme-admin" }).query(api.access.getCurrentUserAccess, {});
    expect(acmeAccess.branding.some((row) => row.companyId === seeded.companyBId)).toBe(false);

    const report = await t.withIdentity({ tokenIdentifier: "beta-admin" }).query(api.report.getProjectReport, { projectId: seeded.projectBId });
    expect(report.brandName).toBe("Beta Group");
    expect(report.brandLogoUrl).toBeTruthy();

    const log = await t.run((ctx) => ctx.db.query("activityLogs").collect());
    expect(log.some((row) => row.action === "update_workspace_branding" && row.companyId === seeded.companyBId)).toBe(true);
  });

  test("replacing a logo deletes the old file; removing it clears it", async () => {
    const { t, seeded, consultant, store } = await setup();
    const first = await store("image/png");
    const second = await store("image/jpeg");
    await consultant.mutation(api.branding.setCompanyBranding, { companyId: seeded.companyBId, logoStorageId: first });
    await consultant.mutation(api.branding.setCompanyBranding, { companyId: seeded.companyBId, logoStorageId: second });
    expect(await t.run((ctx) => ctx.storage.getUrl(first))).toBeNull();
    await consultant.mutation(api.branding.removeCompanyBrandLogo, { companyId: seeded.companyBId });
    expect(await t.run((ctx) => ctx.storage.getUrl(second))).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(seeded.companyBId)))?.brandLogoStorageId).toBeUndefined();
  });

  test("rejects SVG and other file types, and files over 1 MB, and deletes the rejected upload", async () => {
    const { t, seeded, consultant, store } = await setup();
    const svg = await store("image/svg+xml");
    const svgResult = await consultant.mutation(api.branding.setCompanyBranding, { companyId: seeded.companyBId, logoStorageId: svg });
    expect(svgResult.error).toContain("PNG, JPEG or WebP");
    expect(await t.run((ctx) => ctx.storage.getUrl(svg))).toBeNull();
    const huge = await store("image/png", 1024 * 1024 + 1);
    const hugeResult = await consultant.mutation(api.branding.setCompanyBranding, { companyId: seeded.companyBId, logoStorageId: huge });
    expect(hugeResult.error).toContain("1 MB or smaller");
    expect(await t.run((ctx) => ctx.storage.getUrl(huge))).toBeNull();
    // Nothing was saved on the workspace.
    expect((await t.run((ctx) => ctx.db.get(seeded.companyBId)))?.brandLogoStorageId).toBeUndefined();
  });

  test("only VS Consultants can change branding or get an upload address", async () => {
    const { t, seeded, store } = await setup();
    const logo = await store("image/png");
    for (const user of ["beta-admin", "beta-scorer", "northwind-vendor"]) {
      const who = t.withIdentity({ tokenIdentifier: user });
      await expect(who.mutation(api.branding.setCompanyBranding, { companyId: seeded.companyBId, brandName: "Hacked" }))
        .rejects.toThrow("Only VS Consultants");
      await expect(who.mutation(api.branding.setCompanyBranding, { companyId: seeded.companyBId, logoStorageId: logo }))
        .rejects.toThrow("Only VS Consultants");
      await expect(who.mutation(api.branding.generateBrandLogoUploadUrl, {})).rejects.toThrow("Only VS Consultants");
      await expect(who.mutation(api.branding.removeCompanyBrandLogo, { companyId: seeded.companyBId })).rejects.toThrow("Only VS Consultants");
    }
    expect((await t.run((ctx) => ctx.db.get(seeded.companyBId)))?.brandName).toBeUndefined();
  });

  test("display names over 80 characters are rejected", async () => {
    const { seeded, consultant } = await setup();
    await expect(consultant.mutation(api.branding.setCompanyBranding, { companyId: seeded.companyBId, brandName: "x".repeat(81) }))
      .rejects.toThrow("at most 80 characters");
  });
});
