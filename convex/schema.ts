import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  companies: defineTable({
    name: v.string(),
    slug: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    isActive: v.boolean(),
    ssoProvider: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  companyMembers: defineTable({
    companyId: v.id("companies"),
    userId: v.string(),
    email: v.optional(v.string()),
    displayName: v.string(),
    role: v.union(v.literal("company-admin"), v.literal("company-scorer"), v.literal("vendor")),
    isActive: v.boolean(),
    createdAt: v.number(),
  }).index("by_company_user", ["companyId", "userId"])
    .index("by_company_role", ["companyId", "role"]),

  projects: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    status: v.union(v.literal("draft"), v.literal("active")),
  }).index("by_company", ["companyId"]),

  requirements: defineTable({
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    requirementId: v.string(),
    text: v.string(),
    type: v.union(v.literal("user-story"), v.literal("nfr")),
    priority: v.union(v.literal(9), v.literal(3), v.literal(1), v.literal(0)),
    status: v.union(v.literal("active"), v.literal("withdrawn")),
    createdAt: v.number(),
  }).index("by_company_project", ["companyId", "projectId"])
    .index("by_company_requirement", ["companyId", "requirementId"]),
});
