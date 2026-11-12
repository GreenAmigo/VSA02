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
    isTestData: v.optional(v.boolean()),
  }).index("by_slug", ["slug"]),

  consultants: defineTable({
    userId: v.string(),
    email: v.optional(v.string()),
    displayName: v.string(),
    isActive: v.boolean(),
    grantedAt: v.number(),
    grantedBy: v.optional(v.string()),
    isTestData: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  companyMembers: defineTable({
    companyId: v.id("companies"),
    userId: v.string(),
    email: v.optional(v.string()),
    displayName: v.string(),
    role: v.union(v.literal("company-admin"), v.literal("company-scorer"), v.literal("vendor")),
    vendorId: v.optional(v.id("vendorOrganizations")),
    isActive: v.boolean(),
    createdAt: v.number(),
    isTestData: v.optional(v.boolean()),
  }).index("by_company_user", ["companyId", "userId"])
    .index("by_company_role", ["companyId", "role"]),

  vendorOrganizations: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    contactEmail: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("deactivated")),
    createdByUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    isTestData: v.optional(v.boolean()),
  }).index("by_company_name", ["companyId", "name"])
    .index("by_company_status", ["companyId", "status"]),

  workspaceInvites: defineTable({
    companyId: v.id("companies"),
    email: v.string(),
    displayName: v.string(),
    role: v.union(v.literal("company-admin"), v.literal("company-scorer"), v.literal("vendor")),
    vendorId: v.optional(v.id("vendorOrganizations")),
    status: v.union(v.literal("invited"), v.literal("active"), v.literal("deactivated"), v.literal("cancelled"), v.literal("expired")),
    invitedByUserId: v.string(),
    invitedAt: v.number(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    deactivatedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    expiredAt: v.optional(v.number()),
    isTestData: v.optional(v.boolean()),
  }).index("by_company_email", ["companyId", "email"])
    .index("by_company_status", ["companyId", "status"]),

  workspaceDepartments: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    createdByUserId: v.string(),
    createdAt: v.number(),
    isActive: v.boolean(),
    isTestData: v.optional(v.boolean()),
  }).index("by_company_name", ["companyId", "name"]),

  departmentMembers: defineTable({
    companyId: v.id("companies"),
    departmentId: v.id("workspaceDepartments"),
    userId: v.string(),
    email: v.optional(v.string()),
    displayName: v.string(),
    role: v.optional(v.union(v.literal("company-admin"), v.literal("company-scorer"), v.literal("vendor"))),
    createdAt: v.number(),
    isActive: v.boolean(),
  }).index("by_department_user", ["departmentId", "userId"])
    .index("by_company_department", ["companyId", "departmentId"]),

  projects: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    status: v.union(v.literal("draft"), v.literal("active")),
    isTestData: v.optional(v.boolean()),
  }).index("by_company", ["companyId"]),

  projectMembers: defineTable({
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    userId: v.string(),
    role: v.union(v.literal("company-admin"), v.literal("company-scorer"), v.literal("vendor")),
    displayName: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    isTestData: v.optional(v.boolean()),
  }).index("by_project_user", ["projectId", "userId"])
    .index("by_company_project", ["companyId", "projectId"]),

  vendorLoginTokens: defineTable({
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    userId: v.string(),
    email: v.string(),
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_token", ["token"])
    .index("by_project_user", ["projectId", "userId"]),

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

  scores: defineTable({
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    vendorUserId: v.string(),
    requirementId: v.string(),
    score: v.union(v.literal(0), v.literal(1)),
    comment: v.optional(v.string()),
    enteredBy: v.string(),
    enteredAt: v.number(),
  }).index("by_project_vendor", ["projectId", "vendorUserId"])
    .index("by_project_requirement", ["projectId", "requirementId"]),

  projectViews: defineTable({
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    scorerUserId: v.string(),
    vendorUserId: v.string(),
    viewText: v.string(),
    createdAt: v.number(),
  }).index("by_project_vendor", ["projectId", "vendorUserId"])
    .index("by_project_scorer", ["projectId", "scorerUserId"]),

  projectDeadlines: defineTable({
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    targetType: v.union(v.literal("vendor"), v.literal("scorer")),
    targetUserId: v.string(),
    dueAt: v.number(),
    status: v.union(v.literal("not-started"), v.literal("in-progress"), v.literal("submitted")),
    submittedAt: v.optional(v.number()),
    lastReminderAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project_target", ["projectId", "targetType", "targetUserId"])
    .index("by_project_user", ["projectId", "targetUserId"]),

  activityLogs: defineTable({
    actorUserId: v.string(),
    actorEmail: v.optional(v.string()),
    action: v.string(),
    details: v.string(),
    workspaceName: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    projectId: v.optional(v.id("projects")),
    createdAt: v.number(),
  }).index("by_company", ["companyId"])
    .index("by_actor", ["actorUserId"]),
});
