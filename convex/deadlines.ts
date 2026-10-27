import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const projectDeadlineValidator = v.object({
  projectId: v.id("projects"),
  targetType: v.union(v.literal("vendor"), v.literal("scorer")),
  targetUserId: v.string(),
  dueAt: v.number(),
});

const projectDeadlineSubmitValidator = v.object({
  projectId: v.id("projects"),
  targetType: v.union(v.literal("vendor"), v.literal("scorer")),
  targetUserId: v.string(),
});

function getDeadlineStatus(status: "not-started" | "in-progress" | "submitted") {
  return status;
}

function getReminderMessage(targetUserId: string, status: "not-started" | "in-progress" | "submitted", dueAt: number, now = Date.now()) {
  if (status === "submitted") {
    return `${targetUserId} has submitted their work.`;
  }

  if (new Date(dueAt).getTime() < now) {
    return `${targetUserId} is past due and needs attention.`;
  }

  return `${targetUserId} still needs action before the deadline.`;
}

async function assertProjectDeadlineAccess(ctx: any, projectId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not signed in");
  }

  const project = await ctx.db.get(projectId as any);
  if (!project) {
    throw new Error("Project not found");
  }

  const member = await ctx.db
    .query("projectMembers")
    .filter((q: any) => q.eq(q.field("projectId"), projectId))
    .filter((q: any) => q.eq(q.field("userId"), identity.tokenIdentifier))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();

  if (!member || member.companyId !== project.companyId) {
    throw new Error("Project access denied");
  }

  return { project, identity, member };
}

export const listProjectDeadlines = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { identity, member } = await assertProjectDeadlineAccess(ctx, args.projectId);

    const rows = await ctx.db
      .query("projectDeadlines")
      .withIndex("by_project_target", (q) => q.eq("projectId", args.projectId))
      .collect();

    const visibleRows = member.role === "vendor"
      ? rows.filter((row) => row.targetType === "vendor" && row.targetUserId === identity.tokenIdentifier)
      : rows;

    return visibleRows.map((row) => ({
      _id: row._id,
      companyId: row.companyId,
      projectId: row.projectId,
      targetType: row.targetType,
      targetUserId: row.targetUserId,
      dueAt: row.dueAt,
      status: getDeadlineStatus(row.status),
      submittedAt: row.submittedAt,
      lastReminderAt: row.lastReminderAt,
      reminderMessage: getReminderMessage(row.targetUserId, row.status, row.dueAt),
    }));
  },
});

export const upsertProjectDeadline = mutation({
  args: projectDeadlineValidator,
  handler: async (ctx, args) => {
    const { project, member } = await assertProjectDeadlineAccess(ctx, args.projectId);

    if (member.role !== "company-admin" && member.role !== "company-scorer") {
      throw new Error("Project access denied");
    }

    const targetMembership = await ctx.db
      .query("projectMembers")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("userId"), args.targetUserId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .first();

    if (!targetMembership) {
      throw new Error("Target user is not on this project");
    }

    if (args.targetType === "vendor" && targetMembership.role !== "vendor") {
      throw new Error("Target user is not a vendor on this project");
    }

    if (args.targetType === "scorer" && targetMembership.role !== "company-scorer" && targetMembership.role !== "company-admin") {
      throw new Error("Target user is not a scorer on this project");
    }

    const existing = await ctx.db
      .query("projectDeadlines")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("targetType"), args.targetType))
      .filter((q: any) => q.eq(q.field("targetUserId"), args.targetUserId))
      .first();

    const now = Date.now();
    const record = {
      companyId: project.companyId,
      projectId: args.projectId,
      targetType: args.targetType,
      targetUserId: args.targetUserId,
      dueAt: args.dueAt,
      status: existing?.status ?? "not-started",
      submittedAt: existing?.submittedAt,
      lastReminderAt: existing?.lastReminderAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, record);
      return { ...record, _id: existing._id };
    }

    const id = await ctx.db.insert("projectDeadlines", record);
    return { ...record, _id: id };
  },
});

export const markDeadlineSubmitted = mutation({
  args: projectDeadlineSubmitValidator,
  handler: async (ctx, args) => {
    const { identity, member } = await assertProjectDeadlineAccess(ctx, args.projectId);

      if (member.role === "vendor" && (args.targetType !== "vendor" || args.targetUserId !== identity.tokenIdentifier)) {
      throw new Error("Project access denied");
    }

    if (member.role !== "vendor" && member.role !== "company-admin" && member.role !== "company-scorer") {
      throw new Error("Project access denied");
    }

    const row = await ctx.db
      .query("projectDeadlines")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .filter((q: any) => q.eq(q.field("targetType"), args.targetType))
      .filter((q: any) => q.eq(q.field("targetUserId"), args.targetUserId))
      .first();

    if (!row) {
      throw new Error("Deadline not found");
    }

    const now = Date.now();
    const updated = {
      ...row,
      status: "submitted" as const,
      submittedAt: now,
      updatedAt: now,
    };

    await ctx.db.patch(row._id, updated);
    return {
      _id: row._id,
      companyId: row.companyId,
      projectId: row.projectId,
      targetType: row.targetType,
      targetUserId: row.targetUserId,
      dueAt: row.dueAt,
      status: updated.status,
      submittedAt: updated.submittedAt,
      lastReminderAt: row.lastReminderAt,
      reminderMessage: getReminderMessage(row.targetUserId, updated.status, row.dueAt),
    };
  },
});
