import { mutation, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertConsultantAccess, recordActivity } from "./admin";

// Ordinary image formats only. SVG is deliberately excluded because it can carry scripts.
export const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_LOGO_BYTES = 1024 * 1024;
export const MAX_BRAND_NAME_LENGTH = 80;

/** Branding for one workspace, or null if none is set. */
export async function getCompanyBranding(ctx: Pick<QueryCtx, "storage">, company: Doc<"companies">) {
  if (!company.brandName && !company.brandLogoStorageId) return null;
  const logoUrl = company.brandLogoStorageId ? await ctx.storage.getUrl(company.brandLogoStorageId) : null;
  return { companyId: company._id, brandName: company.brandName ?? null, logoUrl };
}

/** Step 1 of a logo upload: a one-time upload address. VS Consultants only. */
export const generateBrandLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await assertConsultantAccess(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Sets a workspace's display name and/or logo. VS Consultants only.
 * Returns { error } for a rejected logo file (wrong type or too large), which is deleted.
 */
export const setCompanyBranding = mutation({
  args: {
    companyId: v.id("companies"),
    brandName: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const identity = await assertConsultantAccess(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Workspace not found.");

    const patch: { brandName?: string; brandLogoStorageId?: Id<"_storage"> } = {};
    if (args.brandName !== undefined) {
      const name = args.brandName.trim();
      if (name.length > MAX_BRAND_NAME_LENGTH) throw new Error(`The display name can be at most ${MAX_BRAND_NAME_LENGTH} characters.`);
      patch.brandName = name || undefined;
    }

    if (args.logoStorageId) {
      const file = await ctx.db.system.get("_storage", args.logoStorageId);
      if (!file) throw new Error("The uploaded logo could not be found. Please try again.");
      const problem = !file.contentType || !ALLOWED_LOGO_TYPES.includes(file.contentType)
        ? "The logo must be a PNG, JPEG or WebP image."
        : file.size > MAX_LOGO_BYTES ? "The logo must be 1 MB or smaller." : null;
      if (problem) {
        // Return (not throw) so the deletion of the rejected file is kept:
        // a thrown error would roll back everything this mutation did, including the delete.
        await ctx.storage.delete(args.logoStorageId);
        return { error: problem };
      }
      if (company.brandLogoStorageId && company.brandLogoStorageId !== args.logoStorageId) {
        await ctx.storage.delete(company.brandLogoStorageId);
      }
      patch.brandLogoStorageId = args.logoStorageId;
    }

    await ctx.db.patch(args.companyId, patch);
    await recordActivity(ctx, {
      actorUserId: identity.subject ?? identity.tokenIdentifier,
      actorEmail: identity.email ?? undefined,
      action: "update_workspace_branding",
      details: [
        args.brandName !== undefined ? `Display name set to "${patch.brandName ?? ""}"` : null,
        args.logoStorageId ? "Logo updated" : null,
      ].filter(Boolean).join(". ") || "Branding updated",
      workspaceName: company.name,
      companyId: args.companyId,
    });
    return { error: null };
  },
});

/** Removes a workspace's logo. VS Consultants only. */
export const removeCompanyBrandLogo = mutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const identity = await assertConsultantAccess(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Workspace not found.");
    if (company.brandLogoStorageId) {
      await ctx.storage.delete(company.brandLogoStorageId);
      await ctx.db.patch(args.companyId, { brandLogoStorageId: undefined });
      await recordActivity(ctx, {
        actorUserId: identity.subject ?? identity.tokenIdentifier,
        actorEmail: identity.email ?? undefined,
        action: "update_workspace_branding",
        details: "Logo removed",
        workspaceName: company.name,
        companyId: args.companyId,
      });
    }
    return null;
  },
});
