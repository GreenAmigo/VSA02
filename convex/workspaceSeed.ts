import { mutation } from "./_generated/server";
import { verifiedIdentityEmail } from "./identityEmail";
import { v } from "convex/values";

const workspaceProjectValidator = v.object({
  id: v.string(),
  name: v.string(),
  status: v.union(v.literal("Active"), v.literal("Draft")),
  vendorCount: v.number(),
  scorerCount: v.number(),
  requirementCount: v.number(),
  leadingVendor: v.string(),
});

const workspacePersonValidator = v.object({
  id: v.string(),
  name: v.string(),
  role: v.string(),
  team: v.string(),
  project: v.string(),
});

const workspaceVendorValidator = v.object({
  id: v.string(),
  name: v.string(),
  status: v.union(v.literal("Active"), v.literal("Invited"), v.literal("Submitted")),
  project: v.string(),
  score: v.number(),
});

const workspaceRequirementValidator = v.object({
  id: v.string(),
  title: v.string(),
  type: v.union(v.literal("Functional"), v.literal("Non-Functional")),
  priority: v.union(v.literal("High"), v.literal("Medium"), v.literal("Low")),
  status: v.union(v.literal("Active"), v.literal("Draft")),
});

const workspaceScoreValidator = v.object({
  scorer: v.string(),
  vendor: v.string(),
  score: v.number(),
  status: v.union(v.literal("Submitted"), v.literal("Pending")),
});

const workspaceSeedValidator = v.object({
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  domain: v.string(),
  projects: v.array(workspaceProjectValidator),
  people: v.array(workspacePersonValidator),
  vendors: v.array(workspaceVendorValidator),
  requirements: v.array(workspaceRequirementValidator),
  scores: v.array(workspaceScoreValidator),
});

function toProjectStatus(value: "Active" | "Draft") {
  return value === "Draft" ? "draft" : "active";
}

function toRequirementType(type: "Functional" | "Non-Functional") {
  return type === "Functional" ? "user-story" : "nfr";
}

function toRequirementPriority(priority: "High" | "Medium" | "Low") {
  if (priority === "High") return 9;
  if (priority === "Medium") return 3;
  return 1;
}

function toRequirementStatus(status: "Active" | "Draft") {
  return status === "Active" ? "active" : "withdrawn";
}

async function assertConsultantAccess(ctx: any, identity: { subject?: string; tokenIdentifier?: string; email?: string | null }) {
  const userIds = Array.from(new Set([identity.subject, identity.tokenIdentifier].filter((value): value is string => Boolean(value))));
  const normalizedEmail = verifiedIdentityEmail(identity);

  const consultant = await ctx.db
    .query("consultants")
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .filter((q: any) => q.or(
      ...userIds.map((userId) => q.eq(q.field("userId"), userId)),
      ...(normalizedEmail ? [q.eq(q.field("email"), normalizedEmail)] : []),
    ))
    .first();

  if (!consultant) {
    throw new Error("Consultant access required");
  }
}

export const importWorkspaceBundle = mutation({
  args: {
    workspaces: v.array(workspaceSeedValidator),
  },
  handler: async (ctx, { workspaces }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not signed in");
    }
    await assertConsultantAccess(ctx, identity);

    if (workspaces.some((workspace) => workspace.scores.length > 0)) {
      throw new Error("This import cannot safely match scores to vendor organisations and requirements. Remove the scores before importing; score import needs to be redesigned.");
    }

    const actorUserId = identity?.tokenIdentifier ?? "seed-import";
    const actorEmail = identity?.email ?? undefined;
    const actorName = identity?.name ?? "Seed importer";

    const results: Array<{ workspaceName: string; companyId: string; projectIds: string[] }> = [];

    for (const workspace of workspaces) {
      const matchingCompanies = await ctx.db
        .query("companies")
        .filter((q) => q.eq(q.field("slug"), workspace.slug))
        .collect();

      let company = matchingCompanies[0] ?? await ctx.db
        .query("companies")
        .filter((q) => q.eq(q.field("name"), workspace.name))
        .first();

      if (!company) {
        const companyId = await ctx.db.insert("companies", {
          name: workspace.name,
          slug: workspace.slug,
          createdBy: actorUserId,
          createdAt: Date.now(),
          isActive: true,
          ssoProvider: "json-import",
        });

        const createdCompany = await ctx.db.get(companyId);
        if (!createdCompany) {
          throw new Error(`Failed to create company for ${workspace.name}`);
        }

        company = createdCompany;
      } else {
        await ctx.db.patch(company._id, {
          name: workspace.name,
          slug: workspace.slug,
          createdBy: actorUserId,
          isActive: true,
          ssoProvider: "json-import",
        });
      }

      if (!company) {
        throw new Error(`Failed to resolve company for ${workspace.name}`);
      }

      if (matchingCompanies.length > 1) {
        for (const duplicate of matchingCompanies.slice(1)) {
          await ctx.db.patch(duplicate._id, { isActive: false });
        }
      }

      const companyMember = await ctx.db
        .query("companyMembers")
        .filter((q) => q.eq(q.field("companyId"), company._id))
        .filter((q) => q.eq(q.field("userId"), actorUserId))
        .first();

      if (!companyMember) {
        await ctx.db.insert("companyMembers", {
          companyId: company._id,
          userId: actorUserId,
          email: actorEmail,
          displayName: actorName,
          role: "company-admin",
          isActive: true,
          createdAt: Date.now(),
        });
      }

      const projectIds: string[] = [];

      for (const project of workspace.projects) {
        let projectDoc = await ctx.db
          .query("projects")
          .filter((q) => q.eq(q.field("companyId"), company._id))
          .filter((q) => q.eq(q.field("name"), project.name))
          .first();

        if (!projectDoc) {
          const projectId = await ctx.db.insert("projects", {
            companyId: company._id,
            name: project.name,
            createdBy: actorUserId,
            createdAt: Date.now(),
            status: toProjectStatus(project.status),
          });

          const createdProject = await ctx.db.get(projectId);
          if (!createdProject) {
            throw new Error(`Failed to create project ${project.name}`);
          }

          projectDoc = createdProject;
        } else {
          await ctx.db.patch(projectDoc._id, {
            name: project.name,
            status: toProjectStatus(project.status),
          });
        }

        if (!projectDoc) {
          throw new Error(`Failed to resolve project ${project.name}`);
        }

        const projectMember = await ctx.db
          .query("projectMembers")
          .filter((q) => q.eq(q.field("projectId"), projectDoc._id))
          .filter((q) => q.eq(q.field("userId"), actorUserId))
          .first();

        if (!projectMember) {
          await ctx.db.insert("projectMembers", {
            companyId: company._id,
            projectId: projectDoc._id,
            userId: actorUserId,
            role: "company-admin",
            displayName: actorName,
            isActive: true,
            createdAt: Date.now(),
          });
        }

        for (const requirement of workspace.requirements) {
          const existingRequirement = await ctx.db
            .query("requirements")
            .filter((q) => q.eq(q.field("companyId"), company._id))
            .filter((q) => q.eq(q.field("projectId"), projectDoc._id))
            .filter((q) => q.eq(q.field("requirementId"), requirement.id))
            .first();

          if (!existingRequirement) {
            await ctx.db.insert("requirements", {
              companyId: company._id,
              projectId: projectDoc._id,
              requirementId: requirement.id,
              text: requirement.title,
              type: toRequirementType(requirement.type),
              priority: toRequirementPriority(requirement.priority),
              status: toRequirementStatus(requirement.status),
              createdAt: Date.now(),
            });
          }
        }

        projectIds.push(projectDoc._id);
      }

      results.push({
        workspaceName: workspace.name,
        companyId: company._id,
        projectIds,
      });
    }

    return {
      importedCount: results.length,
      workspaces: results,
    };
  },
});
