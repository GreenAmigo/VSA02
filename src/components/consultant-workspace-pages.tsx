"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ConsultantHomeHeader } from "./consultant-home-header";

type WorkspaceShellWorkspace = {
  id: string;
  slug: string;
  name: string;
  isTestData: boolean;
  projects: Array<{ id: string; name: string; vendorCount: number; scorerCount: number; status: string }>;
  people: Array<{ id: string; name: string }>;
  vendors: Array<{ id: string; name: string }>;
  requirements: Array<{ id: string; title: string }>;
  scores: Array<{ scorer: string; vendor: string; score: number; status: string }>;
};

type WorkspaceRole = "consultant" | "company-admin" | "company-scorer" | "vendor";
type CompanyId = Id<"companies">;

type WorkspaceBreadcrumb = { label: string; href?: string };

function StatusPill({ label, className = "border-slate-700 bg-slate-800 text-slate-200" }: { label: string; className?: string }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${className}`}>
      {label}
    </span>
  );
}

function toDateInputValue(timestamp?: number | null) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromDateInputValue(value: string) {
  if (!value.trim()) {
    return null;
  }

  return new Date(value).getTime();
}

function requirementTypeLabel(type: "user-story" | "nfr") {
  return type === "user-story" ? "Requirement/User story" : "NFR";
}

function priorityLabel(priority: 9 | 3 | 1 | 0) {
  if (priority === 9) {
    return "P9 Critical";
  }
  if (priority === 3) {
    return "P3 High";
  }
  if (priority === 1) {
    return "P1 Low";
  }
  return "P0 Out of scope";
}

function priorityPillClassName(priority: 9 | 3 | 1 | 0) {
  if (priority === 9) {
    return "border-rose-500/50 bg-rose-500/10 text-rose-200";
  }
  if (priority === 3) {
    return "border-amber-500/50 bg-amber-500/10 text-amber-200";
  }
  if (priority === 1) {
    return "border-sky-500/50 bg-sky-500/10 text-sky-200";
  }
  return "border-slate-700 bg-slate-900 text-slate-300";
}

type ProjectDetailProject = {
  _id: string;
  companyId: string;
  name: string;
  description?: string | null;
  vendorDeadline?: number | null;
  scorerDeadline?: number | null;
  scorerCanSeePeerScores?: boolean;
  status: "draft" | "active";
  isArchived?: boolean;
  createdAt?: number;
};

function ProjectEditPanel({ companyId, projectId, project }: { companyId: string; projectId: string; project: ProjectDetailProject }) {
  const updateProject = useMutation((api as any).admin.updateProject);
  const archiveProject = useMutation((api as any).admin.archiveProject);
  const restoreProject = useMutation((api as any).admin.restoreProject);
  const [projectNotice, setProjectNotice] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [projectDraft, setProjectDraft] = useState({
    name: "",
    description: "",
    vendorDeadline: "",
    scorerDeadline: "",
    scorerCanSeePeerScores: false,
  });

  useEffect(() => {
    setProjectDraft({
      name: project.name,
      description: project.description ?? "",
      vendorDeadline: toDateInputValue(project.vendorDeadline),
      scorerDeadline: toDateInputValue(project.scorerDeadline),
      scorerCanSeePeerScores: Boolean(project.scorerCanSeePeerScores),
    });
  }, [project.name, project.description, project.vendorDeadline, project.scorerDeadline, project.scorerCanSeePeerScores]);

  const handleSaveProject = async () => {
    const trimmedName = projectDraft.name.trim();
    const vendorDeadline = fromDateInputValue(projectDraft.vendorDeadline);
    const scorerDeadline = fromDateInputValue(projectDraft.scorerDeadline);

    if (!trimmedName) {
      setProjectNotice({ kind: "error", message: "Project name is required." });
      return;
    }

    if (vendorDeadline !== null && scorerDeadline !== null && scorerDeadline < vendorDeadline) {
      setProjectNotice({ kind: "error", message: "Scorer deadline can't be before the vendor deadline." });
      return;
    }

    setBusy(true);
    setProjectNotice(null);
    try {
      await updateProject({
        companyId: companyId as any,
        projectId: projectId as any,
        name: trimmedName,
        description: projectDraft.description.trim() || undefined,
        vendorDeadline,
        scorerDeadline,
        scorerCanSeePeerScores: projectDraft.scorerCanSeePeerScores,
      });
      setProjectNotice({ kind: "success", message: "Project details updated." });
      setIsEditingProject(false);
    } catch (error) {
      setProjectNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to update this project." });
    } finally {
      setBusy(false);
    }
  };

  const handleArchiveProject = async () => {
    if (!window.confirm("Archive this project? You can restore it later.")) {
      return;
    }

    setBusy(true);
    setProjectNotice(null);
    try {
      await archiveProject({ companyId: companyId as any, projectId: projectId as any });
      setProjectNotice({ kind: "success", message: "Project archived." });
    } catch (error) {
      setProjectNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to archive this project." });
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreProject = async () => {
    setBusy(true);
    setProjectNotice(null);
    try {
      await restoreProject({ companyId: companyId as any, projectId: projectId as any });
      setProjectNotice({ kind: "success", message: "Project restored." });
    } catch (error) {
      setProjectNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to restore this project." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Edit project</h3>
        <button
          type="button"
          onClick={() => setIsEditingProject((current) => !current)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-500"
        >
          {isEditingProject ? "Close editor" : "Edit project"}
        </button>
      </div>

      <p className="mb-4 text-sm text-slate-400">
        Rules applied: project name is required, and scorer deadline cannot be before the vendor deadline.
      </p>

      {projectNotice ? (
        <div className={`mb-4 rounded-xl border px-3 py-2 text-sm ${projectNotice.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`}>
          {projectNotice.message}
        </div>
      ) : null}

      {isEditingProject ? (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-slate-300 md:col-span-2">
            <span className="mb-2 block">Project name</span>
            <input
              value={projectDraft.name}
              onChange={(event) => setProjectDraft((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>

          <label className="block text-sm text-slate-300 md:col-span-2">
            <span className="mb-2 block">Description</span>
            <textarea
              value={projectDraft.description}
              onChange={(event) => setProjectDraft((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>

          <label className="block text-sm text-slate-300">
            <span className="mb-2 block">Vendor deadline</span>
            <input
              type="date"
              value={projectDraft.vendorDeadline}
              onChange={(event) => setProjectDraft((current) => ({ ...current, vendorDeadline: event.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>

          <label className="block text-sm text-slate-300">
            <span className="mb-2 block">Scorer deadline</span>
            <input
              type="date"
              value={projectDraft.scorerDeadline}
              onChange={(event) => setProjectDraft((current) => ({ ...current, scorerDeadline: event.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
            <input
              type="checkbox"
              checked={projectDraft.scorerCanSeePeerScores}
              onChange={(event) => setProjectDraft((current) => ({ ...current, scorerCanSeePeerScores: event.target.checked }))}
            />
            Allow scorers to see each other&apos;s scores for this project
          </label>

          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleSaveProject()}
                disabled={busy}
                className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60"
              >
                Save changes
              </button>
              <button
                type="button"
                onClick={() => {
                  setProjectDraft({
                    name: project.name,
                    description: project.description ?? "",
                    vendorDeadline: toDateInputValue(project.vendorDeadline),
                    scorerDeadline: toDateInputValue(project.scorerDeadline),
                    scorerCanSeePeerScores: Boolean(project.scorerCanSeePeerScores),
                  });
                  setProjectNotice(null);
                }}
                disabled={busy}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
              >
                Reset
              </button>
            </div>

            {project.isArchived ? (
              <button
                type="button"
                onClick={() => void handleRestoreProject()}
                disabled={busy}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:border-emerald-400 disabled:opacity-60"
              >
                Restore project
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleArchiveProject()}
                disabled={busy}
                className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 hover:border-rose-400 disabled:opacity-60"
              >
                Archive project
              </button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ScoringSettingsPanel({ companyId, projectId, project }: { companyId: string; projectId: string; project: ProjectDetailProject }) {
  const updateProject = useMutation((api as any).admin.updateProject);
  const [scorerCanSeePeerScores, setScorerCanSeePeerScores] = useState(Boolean(project.scorerCanSeePeerScores));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    setScorerCanSeePeerScores(Boolean(project.scorerCanSeePeerScores));
  }, [project.scorerCanSeePeerScores]);

  const saveSettings = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await updateProject({
        companyId: companyId as any,
        projectId: projectId as any,
        name: project.name,
        description: project.description ?? undefined,
        vendorDeadline: project.vendorDeadline ?? null,
        scorerDeadline: project.scorerDeadline ?? null,
        scorerCanSeePeerScores,
      });
      setNotice({ kind: "success", message: "Scoring settings saved." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to save scoring settings." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Scoring settings</h3>
        <StatusPill
          label={scorerCanSeePeerScores ? "Peer scores ON" : "Peer scores OFF"}
          className={scorerCanSeePeerScores ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-slate-700 bg-slate-900 text-slate-200"}
        />
      </div>

      <p className="mb-3 text-sm text-slate-400">
        Default is OFF. When ON, scorers can see other scorer scores and comments for this project only after they mark their own scoring complete for that vendor.
      </p>

      <label className="mb-4 flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={scorerCanSeePeerScores}
          onChange={(event) => setScorerCanSeePeerScores(event.target.checked)}
        />
        Allow scorers to see other scorer scores and comments
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={busy}
          className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60"
        >
          Save scoring settings
        </button>
      </div>

      {notice ? (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-sm ${notice.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`}>
          {notice.message}
        </div>
      ) : null}
    </section>
  );
}

function VendorResponsesPanel({ projectId }: { projectId: string }) {
  const selectedReviewRef = useRef<HTMLDivElement | null>(null);
  const vendorResponses = useQuery((api as any).scores.listProjectVendorResponses, { projectId: projectId as any }) as
    | Array<{
      vendorId: string;
      vendorName: string;
      vendorUserId: string | null;
      vendorContactName: string | null;
      status: "not-started" | "in-progress" | "submitted";
      answeredCount: number;
      totalRequirements: number;
      submittedAt: number | null;
      deadlineAt: number | null;
    }>
    | undefined;

  const [selectedVendorUserId, setSelectedVendorUserId] = useState("");
  const [editingRequirementId, setEditingRequirementId] = useState("");
  const [amendDraft, setAmendDraft] = useState<{ score: 0 | 1; comment: string; reason: string }>({ score: 1, comment: "", reason: "" });
  const [reopenDate, setReopenDate] = useState("");
  const [collapsedRequirementIds, setCollapsedRequirementIds] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const linkedVendorUserId = params.get("vendorUserId")?.trim();
    if (linkedVendorUserId) {
      setSelectedVendorUserId(linkedVendorUserId);
    }
  }, []);

  useEffect(() => {
    if (!vendorResponses || vendorResponses.length === 0) {
      setSelectedVendorUserId("");
      return;
    }

    const hasSelectedVendor = vendorResponses.some((row) => row.vendorUserId === selectedVendorUserId);
    if (hasSelectedVendor) {
      return;
    }

    const firstWithContact = vendorResponses.find((row) => Boolean(row.vendorUserId));
    setSelectedVendorUserId(firstWithContact?.vendorUserId ?? "");
  }, [vendorResponses, selectedVendorUserId]);

  useEffect(() => {
    if (!selectedVendorUserId || !selectedReviewRef.current) {
      return;
    }

    selectedReviewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedVendorUserId]);

  const selectedReview = useQuery(
    (api as any).scores.getVendorResponseReview,
    selectedVendorUserId ? { projectId: projectId as any, vendorUserId: selectedVendorUserId } : "skip",
  ) as
    | {
      projectId: string;
      vendorUserId: string;
      vendorName: string;
      vendorContactName: string;
      deadlineAt: number | null;
      deadlineLocked: boolean;
      rows: Array<{
        requirementId: string;
        text: string;
        type: "user-story" | "nfr";
        priority: 9 | 3 | 1 | 0;
        score: 0 | 1 | null;
        comment: string;
        amendedByDisplayName: string | null;
        amendedAt: number | null;
        scorerScores: Array<{
          scopeKey: string;
          scopeLabel: string;
          score: 0 | 1;
          comment: string;
          enteredByDisplayName: string;
          scorerDepartmentName: string;
          enteredAt: number;
        }>;
        history: Array<{
          originalScore: 0 | 1;
          newScore: 0 | 1;
          originalComment: string;
          newComment: string;
          amendedByDisplayName: string;
          amendedAt: number;
          reason: string;
        }>;
      }>;
    }
    | undefined;

  const scorerViews = useQuery(
    (api as any).projectViews.listProjectViews,
    selectedVendorUserId ? { projectId: projectId as any, vendorUserId: selectedVendorUserId } : "skip",
  ) as
    | {
      projectId: string;
      vendorUserId: string | null;
      canViewAll: boolean;
      peerVisibilityEnabled: boolean;
      peerViewsUnlocked: boolean;
      rows: Array<{
        _id: string;
        projectId: string;
        scorerUserId: string;
        scorerDisplayName: string;
        isOwnView: boolean;
        vendorUserId: string;
        viewText: string;
        scorerDepartmentId: string | null;
        scorerDepartmentName: string;
        createdAt: number;
        updatedAt: number;
      }>;
    }
    | undefined;

  const amendVendorScore = useMutation((api as any).scores.amendVendorScore);
  const reopenVendorAnswers = useMutation((api as any).scores.reopenVendorAnswers);

  const beginAmend = (row: { requirementId: string; score: 0 | 1 | null; comment: string }) => {
    if (row.score === null) {
      setNotice({ kind: "error", message: "Only answered rows can be amended." });
      return;
    }

    setNotice(null);
    setEditingRequirementId(row.requirementId);
    setAmendDraft({
      score: row.score,
      comment: row.comment ?? "",
      reason: "",
    });
  };

  const saveAmendment = async (requirementId: string) => {
    if (!selectedVendorUserId || !selectedReview) {
      return;
    }

    const trimmedReason = amendDraft.reason.trim();
    if (!trimmedReason) {
      setNotice({ kind: "error", message: "A reason is required before saving an amendment." });
      return;
    }

    try {
      setBusy(true);
      setNotice(null);
      await amendVendorScore({
        projectId: projectId as any,
        vendorUserId: selectedVendorUserId,
        requirementId,
        score: amendDraft.score,
        comment: amendDraft.comment.trim() || undefined,
        reason: trimmedReason,
      });
      setNotice({ kind: "success", message: "Vendor answer amended and saved." });
      setEditingRequirementId("");
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to amend this answer." });
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async () => {
    if (!selectedVendorUserId) {
      setNotice({ kind: "error", message: "Select a vendor contact before reopening answers." });
      return;
    }

    const dueAt = fromDateInputValue(reopenDate);
    if (dueAt === null) {
      setNotice({ kind: "error", message: "Choose a reopening date." });
      return;
    }

    try {
      setBusy(true);
      setNotice(null);
      await reopenVendorAnswers({
        projectId: projectId as any,
        vendorUserId: selectedVendorUserId,
        dueAt,
      });
      setNotice({ kind: "success", message: "Vendor response window reopened for this contact." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to reopen vendor responses." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Vendor responses</h3>
      </div>

      {vendorResponses === undefined ? (
        <p className="text-sm text-slate-400">Loading vendor responses...</p>
      ) : vendorResponses.length === 0 ? (
        <p className="text-sm text-slate-400">No vendors are assigned to this project yet.</p>
      ) : (
        <div className="space-y-3">
          {vendorResponses.map((vendor) => (
            <div key={vendor.vendorId} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-white">{vendor.vendorName}</p>
                  <p className="text-xs text-slate-400">Contact: {vendor.vendorContactName || "No active contact linked"}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusPill label={vendor.status === "not-started" ? "Not started" : vendor.status === "in-progress" ? "In progress" : "Submitted"} className="border-slate-700 bg-slate-900 text-slate-100" />
                  <StatusPill label={`${vendor.answeredCount} / ${vendor.totalRequirements} answered`} className="border-sky-500/40 bg-sky-500/10 text-sky-200" />
                  {vendor.submittedAt ? <StatusPill label={`Submitted ${new Date(vendor.submittedAt).toLocaleDateString()}`} className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200" /> : null}
                  {vendor.deadlineAt ? <StatusPill label={`Due ${new Date(vendor.deadlineAt).toLocaleDateString()}`} className="border-amber-500/40 bg-amber-500/10 text-amber-200" /> : null}
                </div>
              </div>

              <div className="mt-3">
                {vendor.vendorUserId ? (
                  <button
                    type="button"
                    onClick={() => {
                      const targetVendorUserId = vendor.vendorUserId as string;
                      setSelectedVendorUserId(targetVendorUserId);
                      setEditingRequirementId("");
                      setNotice(null);
                      setReopenDate("");
                      if (typeof window !== "undefined") {
                        const nextUrl = new URL(window.location.href);
                        nextUrl.searchParams.set("vendorUserId", targetVendorUserId);
                        window.history.replaceState({}, "", nextUrl.toString());
                      }
                    }}
                    className={`rounded-xl border px-3 py-2 text-sm ${selectedVendorUserId === vendor.vendorUserId ? "border-sky-500/60 bg-sky-500/10 text-sky-100" : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500"}`}
                  >
                    View scores
                  </button>
                ) : (
                  <p className="text-xs text-slate-400">Add an active vendor contact to view and amend scores.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {notice ? (
        <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${notice.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`}>
          {notice.message}
        </div>
      ) : null}

      {selectedVendorUserId ? (
        <div ref={selectedReviewRef} className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          {selectedReview === undefined ? (
            <p className="text-sm text-slate-400">Loading selected vendor answers...</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-white">{selectedReview.vendorName}</h4>
                  <p className="text-xs text-slate-400">Contact: {selectedReview.vendorContactName}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label={selectedReview.deadlineLocked ? "Deadline locked" : "Read-only until deadline"} className={selectedReview.deadlineLocked ? "border-rose-500/40 bg-rose-500/10 text-rose-200" : "border-slate-700 bg-slate-900 text-slate-200"} />
                  {selectedReview.deadlineAt ? <StatusPill label={`Current due ${new Date(selectedReview.deadlineAt).toLocaleDateString()}`} className="border-amber-500/40 bg-amber-500/10 text-amber-200" /> : null}
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <label className="text-sm text-slate-300">
                  <span className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-400">Reopen for this vendor</span>
                  <input
                    type="date"
                    value={reopenDate}
                    onChange={(event) => setReopenDate(event.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleReopen()}
                  disabled={busy}
                  className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:border-sky-400 disabled:opacity-60"
                >
                  Reopen for this vendor
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCollapsedRequirementIds(() => Object.fromEntries(selectedReview.rows.map((row) => [row.requirementId, true])))}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
                  >
                    Collapse all
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollapsedRequirementIds({})}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
                  >
                    Expand all
                  </button>
                </div>
                {selectedReview.rows.map((row) => {
                  const isCollapsed = Boolean(collapsedRequirementIds[row.requirementId]);
                  const isEditing = editingRequirementId === row.requirementId;

                  return (
                    <div key={row.requirementId} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{row.requirementId}</p>
                          <p className="mt-1 text-sm text-slate-100">{row.text}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <StatusPill label={requirementTypeLabel(row.type)} className="border-slate-700 bg-slate-900 text-slate-200" />
                            <StatusPill label={priorityLabel(row.priority)} className={priorityPillClassName(row.priority)} />
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-300">
                          <p>Vendor score: {row.score === null ? "-" : row.score}</p>
                          <p className="mt-1 max-w-xs truncate" title={row.comment || ""}>Comment: {row.comment || "(none)"}</p>
                          {row.amendedByDisplayName && row.amendedAt ? (
                            <p className="mt-1 text-slate-400">Amended by {row.amendedByDisplayName} on {new Date(row.amendedAt).toLocaleString()}</p>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setCollapsedRequirementIds((current) => ({ ...current, [row.requirementId]: !isCollapsed }))}
                            className="mt-2 rounded-xl border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                          >
                            {isCollapsed ? "Expand" : "Collapse"}
                          </button>
                        </div>
                      </div>

                      {isCollapsed ? null : (
                        <>

                      {selectedReview.deadlineLocked ? (
                        <div className="mt-3">
                          {row.score === null ? (
                            <p className="text-xs text-slate-400">No vendor answer to amend yet.</p>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => beginAmend(row)}
                                className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:border-amber-400"
                              >
                                Amend
                              </button>

                              {isEditing ? (
                                <div className="mt-3 grid gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 md:grid-cols-2">
                                  <label className="text-sm text-slate-300">
                                    <span className="mb-1 block">New score</span>
                                    <select
                                      value={amendDraft.score}
                                      onChange={(event) => setAmendDraft((current) => ({ ...current, score: Number(event.target.value) as 0 | 1 }))}
                                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                                    >
                                      <option value={0}>0</option>
                                      <option value={1}>1</option>
                                    </select>
                                  </label>

                                  <label className="text-sm text-slate-300 md:col-span-2">
                                    <span className="mb-1 block">New comment</span>
                                    <textarea
                                      value={amendDraft.comment}
                                      onChange={(event) => setAmendDraft((current) => ({ ...current, comment: event.target.value }))}
                                      rows={2}
                                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                                    />
                                  </label>

                                  <label className="text-sm text-slate-300 md:col-span-2">
                                    <span className="mb-1 block">Reason for amendment</span>
                                    <textarea
                                      value={amendDraft.reason}
                                      onChange={(event) => setAmendDraft((current) => ({ ...current, reason: event.target.value }))}
                                      rows={2}
                                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                                    />
                                  </label>

                                  <div className="md:col-span-2 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void saveAmendment(row.requirementId)}
                                      disabled={busy}
                                      className="rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60"
                                    >
                                      Save amendment
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingRequirementId("")}
                                      disabled={busy}
                                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-slate-400">Amendments unlock only after the vendor deadline.</p>
                      )}

                      {row.scorerScores.length > 0 ? (
                        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-slate-300">Scorer scores (with recorded department)</p>
                          <div className="mt-2 space-y-1 text-xs text-slate-300">
                            {row.scorerScores.map((entry) => (
                              <p key={`${row.requirementId}-${entry.scopeKey}-${entry.enteredAt}`}>
                                {entry.scopeLabel}: {entry.score} ({entry.enteredByDisplayName}) - Department: {entry.scorerDepartmentName}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {row.history.length > 0 ? (
                        <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                          <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] text-slate-300">Amendment history ({row.history.length})</summary>
                          <div className="mt-3 space-y-2 text-xs text-slate-300">
                            {row.history.map((entry, index) => (
                              <div key={`${row.requirementId}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                                <p>Score: {entry.originalScore}{" -> "}{entry.newScore}</p>
                                <p>Comment: {entry.originalComment || "(none)"}{" -> "}{entry.newComment || "(none)"}</p>
                                <p>By: {entry.amendedByDisplayName} on {new Date(entry.amendedAt).toLocaleString()}</p>
                                <p>Reason: {entry.reason}</p>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-300">Scorer overall views</p>
                {scorerViews === undefined ? (
                  <p className="mt-2 text-xs text-slate-400">Loading scorer views...</p>
                ) : scorerViews.rows.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">No scorer views saved for this vendor yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {scorerViews.rows.map((row) => (
                      <div key={row._id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-xs text-slate-200">
                        <p className="font-medium text-slate-100">{row.scorerDisplayName}</p>
                        <p className="text-slate-400">Department at entry: {row.scorerDepartmentName}</p>
                        <p className="text-slate-400">Last updated: {new Date(row.updatedAt).toLocaleString()}</p>
                        <p className="mt-1 whitespace-pre-wrap text-slate-200">{row.viewText || "(no text)"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ScorerScoringPanel({ projectId, scorerDeadlineAt }: { projectId: string; scorerDeadlineAt?: number | null }) {
  const [selectedScopeKey, setSelectedScopeKey] = useState("");
  const [selectedVendorUserId, setSelectedVendorUserId] = useState("");
  const [collapsedRequirementIds, setCollapsedRequirementIds] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busyKey, setBusyKey] = useState("");
  const [viewDraft, setViewDraft] = useState("");
  const [viewSaveState, setViewSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [viewLastSavedAt, setViewLastSavedAt] = useState<number | null>(null);
  const [hydratedViewVendorId, setHydratedViewVendorId] = useState("");
  const saveViewTimerRef = useRef<number | null>(null);

  const workboard = useQuery(
    (api as any).scores.getScorerWorkboard,
    { projectId: projectId as any, scopeKey: selectedScopeKey || undefined },
  ) as
    | {
      projectId: string;
      scorerCanSeePeerScores: boolean;
      scorerScopes: Array<{ scopeKey: string; scopeType: "individual" | "department"; label: string }>;
      activeScopeKey: string;
      vendors: Array<{
        vendorId: string;
        vendorName: string;
        vendorUserId: string;
        vendorContactName: string | null;
        answeredCount: number;
        totalRequirements: number;
        status: "not-started" | "in-progress" | "completed";
        completedAt: number | null;
        lastScoredAt: number | null;
      }>;
    }
    | undefined;

  useEffect(() => {
    if (!workboard) {
      return;
    }

    if (!selectedScopeKey || !workboard.scorerScopes.some((scope) => scope.scopeKey === selectedScopeKey)) {
      setSelectedScopeKey(workboard.activeScopeKey);
    }

    if (!selectedVendorUserId || !workboard.vendors.some((vendor) => vendor.vendorUserId === selectedVendorUserId)) {
      setSelectedVendorUserId(workboard.vendors[0]?.vendorUserId ?? "");
    }
  }, [workboard, selectedScopeKey, selectedVendorUserId]);

  const grid = useQuery(
    (api as any).scores.getScorerVendorGrid,
    workboard && selectedVendorUserId
      ? { projectId: projectId as any, vendorUserId: selectedVendorUserId, scopeKey: selectedScopeKey || undefined }
      : "skip",
  ) as
    | {
      projectId: string;
      vendorUserId: string;
      vendorName: string;
      vendorContactName: string | null;
      scorerScope: { scopeKey: string; scopeType: "individual" | "department"; label: string };
      canSeePeerScores: boolean;
      isCompleted: boolean;
      completedAt: number | null;
      rows: Array<{
        requirementId: string;
        text: string;
        type: "user-story" | "nfr";
        priority: 9 | 3 | 1 | 0;
        ownScore: 0 | 1 | null;
        ownComment: string;
        ownEnteredByDisplayName: string | null;
        ownEnteredAt: number | null;
        vendorScore: 0 | 1 | null;
        vendorComment: string | null;
        peerScores: Array<{ scopeKey: string; scopeLabel: string; score: 0 | 1; comment: string; enteredByDisplayName: string; enteredAt: number }>;
      }>;
    }
    | undefined;

  const saveScorerScore = useMutation((api as any).scores.saveScorerScore);
  const completeScorerVendor = useMutation((api as any).scores.completeScorerVendor);
  const reopenScorerVendor = useMutation((api as any).scores.reopenScorerVendor);
  const saveProjectView = useMutation((api as any).projectViews.saveProjectView);
  const scorerViews = useQuery(
    (api as any).projectViews.listProjectViews,
    selectedVendorUserId ? { projectId: projectId as any, vendorUserId: selectedVendorUserId } : "skip",
  ) as
    | {
      projectId: string;
      vendorUserId: string | null;
      canViewAll: boolean;
      peerVisibilityEnabled: boolean;
      peerViewsUnlocked: boolean;
      rows: Array<{
        _id: string;
        projectId: string;
        scorerUserId: string;
        scorerDisplayName: string;
        isOwnView: boolean;
        vendorUserId: string;
        viewText: string;
        scorerDepartmentId: string | null;
        scorerDepartmentName: string;
        createdAt: number;
        updatedAt: number;
      }>;
    }
    | undefined;

  useEffect(() => () => {
    if (saveViewTimerRef.current !== null) {
      window.clearTimeout(saveViewTimerRef.current);
      saveViewTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!selectedVendorUserId || !scorerViews) {
      return;
    }

    const ownView = scorerViews.rows.find((row) => row.isOwnView) ?? null;
    setViewDraft(ownView?.viewText ?? "");
    setViewLastSavedAt(ownView?.updatedAt ?? null);
    setViewSaveState("idle");
    setHydratedViewVendorId(selectedVendorUserId);
  }, [selectedVendorUserId, scorerViews]);

  const scheduleViewSave = (nextText: string) => {
    if (!selectedVendorUserId) {
      return;
    }

    if (saveViewTimerRef.current !== null) {
      window.clearTimeout(saveViewTimerRef.current);
      saveViewTimerRef.current = null;
    }

    setViewSaveState("saving");
    saveViewTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await saveProjectView({
            projectId: projectId as any,
            vendorUserId: selectedVendorUserId,
            viewText: nextText,
          });
          setViewLastSavedAt(saved.updatedAt ?? Date.now());
          setViewSaveState("saved");
        } catch (error) {
          setViewSaveState("error");
          setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to save scorer views." });
        }
      })();
    }, 650);
  };

  const saveScore = async (payload: { requirementId: string; score: 0 | 1; comment: string }) => {
    if (!selectedVendorUserId || !selectedScopeKey) {
      return;
    }

    const requestKey = `${payload.requirementId}:${payload.score}:${payload.comment}`;
    setBusyKey(requestKey);
    setNotice(null);
    try {
      await saveScorerScore({
        projectId: projectId as any,
        vendorUserId: selectedVendorUserId,
        requirementId: payload.requirementId,
        score: payload.score,
        comment: payload.comment.trim() || undefined,
        scopeKey: selectedScopeKey,
      });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to save scorer value." });
    } finally {
      setBusyKey("");
    }
  };

  const markComplete = async () => {
    if (!selectedVendorUserId || !selectedScopeKey) {
      return;
    }

    setNotice(null);
    setBusyKey("complete");
    try {
      await completeScorerVendor({
        projectId: projectId as any,
        vendorUserId: selectedVendorUserId,
        scopeKey: selectedScopeKey,
      });
      setNotice({ kind: "success", message: "Scoring marked complete for this vendor. Vendor responses are now visible for comparison." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to mark scorer completion." });
    } finally {
      setBusyKey("");
    }
  };

  const reopenCompletion = async () => {
    if (!selectedVendorUserId || !selectedScopeKey) {
      return;
    }

    setNotice(null);
    setBusyKey("reopen");
    try {
      await reopenScorerVendor({
        projectId: projectId as any,
        vendorUserId: selectedVendorUserId,
        scopeKey: selectedScopeKey,
      });
      setNotice({ kind: "success", message: "Scorer completion reopened for this vendor." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to reopen scorer completion." });
    } finally {
      setBusyKey("");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Scorer scoring</h3>
      </div>

      {workboard === undefined ? (
        <p className="text-sm text-slate-400">Loading scorer workboard...</p>
      ) : (
        <>
          <p className="mb-4 text-xs text-slate-400">You always score as yourself. Peer scorer values remain read-only and only appear after you complete your own scoring when peer visibility is enabled.</p>

          <div className="space-y-3">
            {workboard.vendors.map((vendor) => (
              <button
                key={vendor.vendorUserId}
                type="button"
                onClick={() => setSelectedVendorUserId(vendor.vendorUserId)}
                className={`w-full rounded-xl border p-3 text-left ${selectedVendorUserId === vendor.vendorUserId ? "border-sky-500/50 bg-sky-500/10" : "border-slate-800 bg-slate-950/60 hover:border-slate-600"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-white">{vendor.vendorName}</p>
                    <p className="text-xs text-slate-400">Contact: {vendor.vendorContactName || "Unknown"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill label={vendor.status === "not-started" ? "Not started" : vendor.status === "in-progress" ? "In progress" : "Completed"} className="border-slate-700 bg-slate-900 text-slate-100" />
                    <StatusPill label={`${vendor.answeredCount} / ${vendor.totalRequirements}`} className="border-sky-500/40 bg-sky-500/10 text-sky-200" />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {notice ? (
            <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${notice.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`}>
              {notice.message}
            </div>
          ) : null}

          {grid ? (
            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-white">Scoring {grid.vendorName}</p>
                  <p className="text-xs text-slate-400">Own scorer column: {grid.scorerScope.label}</p>
                </div>
                {grid.isCompleted ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      label={`Completed on ${grid.completedAt ? new Date(grid.completedAt).toLocaleDateString() : "today"}`}
                      className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    />
                    {(!scorerDeadlineAt || scorerDeadlineAt > Date.now()) ? (
                      <button
                        type="button"
                        onClick={() => void reopenCompletion()}
                        disabled={busyKey === "reopen"}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
                      >
                        Reopen
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void markComplete()}
                    disabled={busyKey === "complete"}
                    className="rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60"
                  >
                    Mark complete
                  </button>
                )}
              </div>

              {!grid.isCompleted ? (
                <p className="mb-3 text-xs text-slate-400">Vendor self-scores and comments appear only after you mark this vendor as complete.</p>
              ) : null}

              {grid.canSeePeerScores ? (
                <p className="mb-3 text-xs text-slate-400">Peer scorer columns are enabled for this project.</p>
              ) : null}

              <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950/85 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-100">Overall views (separate from requirement scoring)</p>
                  <span className="text-xs text-slate-400">
                    {viewSaveState === "saving"
                      ? "Saving..."
                      : viewSaveState === "saved"
                        ? `Saved${viewLastSavedAt ? ` ${new Date(viewLastSavedAt).toLocaleTimeString()}` : ""}`
                        : viewSaveState === "error"
                          ? "Save failed"
                          : "Ready"}
                  </span>
                </div>
                <textarea
                  value={hydratedViewVendorId === selectedVendorUserId ? viewDraft : ""}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setViewDraft(nextValue);
                    scheduleViewSave(nextValue);
                  }}
                  placeholder="Write your overall view of this vendor..."
                  rows={4}
                  disabled={Boolean(scorerDeadlineAt && scorerDeadlineAt <= Date.now())}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400 disabled:opacity-60"
                />
                {scorerDeadlineAt && scorerDeadlineAt <= Date.now() ? (
                  <p className="mt-2 text-xs text-rose-300">Scorer deadline has passed. Reopen the deadline to edit scorer views.</p>
                ) : null}

                {!scorerViews?.peerVisibilityEnabled ? (
                  <p className="mt-2 text-xs text-slate-400">Peer scorer views are off for this project.</p>
                ) : !scorerViews.peerViewsUnlocked ? (
                  <p className="mt-2 text-xs text-slate-400">Complete your scoring for this vendor to unlock peer scorer views.</p>
                ) : scorerViews.rows.some((row) => !row.isOwnView) ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Peer scorer views</p>
                    {scorerViews.rows.filter((row) => !row.isOwnView).map((row) => (
                      <div key={row._id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-xs text-slate-200">
                        <p className="font-medium text-slate-100">{row.scorerDisplayName}</p>
                        <p className="text-slate-400">Department at entry: {row.scorerDepartmentName}</p>
                        <p className="mt-1 whitespace-pre-wrap">{row.viewText || "(no text)"}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">No peer scorer views saved yet.</p>
                )}
              </div>

              <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCollapsedRequirementIds(() => Object.fromEntries(grid.rows.map((row) => [row.requirementId, true])))}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
                >
                  Collapse all
                </button>
                <button
                  type="button"
                  onClick={() => setCollapsedRequirementIds({})}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
                >
                  Expand all
                </button>
              </div>

              <div className="space-y-3">
                {grid.rows.map((row) => {
                  const isCollapsed = Boolean(collapsedRequirementIds[row.requirementId]);
                  return (
                  <div key={row.requirementId} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{row.requirementId}</p>
                        <p className="text-sm text-slate-100">{row.text}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusPill label={requirementTypeLabel(row.type)} className="border-slate-700 bg-slate-900 text-slate-200" />
                          <StatusPill label={priorityLabel(row.priority)} className={priorityPillClassName(row.priority)} />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCollapsedRequirementIds((current) => ({ ...current, [row.requirementId]: !isCollapsed }))}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                      >
                        {isCollapsed ? "Expand" : "Collapse"}
                      </button>
                    </div>

                    {isCollapsed ? null : (
                      <>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm text-slate-300">
                        <span className="mb-1 block">Your score</span>
                        <select
                          value={row.ownScore ?? ""}
                          onChange={(event) => void saveScore({ requirementId: row.requirementId, score: Number(event.target.value) as 0 | 1, comment: row.ownComment })}
                          disabled={busyKey.startsWith(`${row.requirementId}:`)}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                        >
                          <option value="">Choose</option>
                          <option value={0}>0</option>
                          <option value={1}>1</option>
                        </select>
                      </label>

                      <label className="text-sm text-slate-300">
                        <span className="mb-1 block">Your comment</span>
                        <textarea
                          defaultValue={row.ownComment}
                          onBlur={(event) => {
                            if (row.ownScore === null) {
                              setNotice({ kind: "error", message: "Choose 0 or 1 before saving a scorer comment." });
                              return;
                            }

                            void saveScore({ requirementId: row.requirementId, score: row.ownScore, comment: event.target.value });
                          }}
                          rows={2}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                        />
                      </label>
                    </div>

                    {grid.isCompleted ? (
                      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-200">
                        <p>Vendor score: {row.vendorScore === null ? "-" : row.vendorScore}</p>
                        <p className="mt-1 truncate" title={row.vendorComment ?? ""}>Vendor comment: {row.vendorComment || "(none)"}</p>
                      </div>
                    ) : null}

                    {grid.canSeePeerScores && row.peerScores.length > 0 ? (
                      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                        <p className="mb-2 uppercase tracking-[0.14em] text-slate-400">Peer scores</p>
                        <div className="space-y-2">
                          {row.peerScores.map((peer) => (
                            <div key={`${row.requirementId}-${peer.scopeKey}-${peer.enteredAt}`} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                              <p className="text-slate-100">{peer.scopeLabel}: {peer.score}</p>
                              <p className="text-slate-400">By {peer.enteredByDisplayName} on {new Date(peer.enteredAt).toLocaleDateString()}</p>
                              <p className="mt-1 text-slate-300">{peer.comment || "(no comment)"}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                      </>
                    )}
                  </div>
                );
                })}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function LongValue({ value, wrap = false, className = "" }: { value: string; wrap?: boolean; className?: string }) {
  const wrapClass = wrap ? "break-all" : "truncate";
  return (
    <span title={value} className={`block min-w-0 ${wrapClass} ${className}`}>
      {value}
    </span>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  const wrapValue = value.length > 40;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm shadow-slate-950/20">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <div className="mt-3 min-w-0">
        <LongValue value={value} wrap={wrapValue} className="text-base font-semibold text-white sm:text-lg" />
      </div>
      <p className="mt-1 text-xs text-slate-400 sm:text-sm">{helper}</p>
    </div>
  );
}

function WorkspaceBreadcrumbs({ items }: { items: WorkspaceBreadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex items-center gap-2">
          {index > 0 ? <span className="text-slate-600">›</span> : null}
          {item.href ? (
            <Link href={item.href} className="transition hover:text-slate-200">
              {item.label}
            </Link>
          ) : (
            <span className="text-slate-300">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}

function shouldShowPreviewDebugLine() {
  if (typeof window === "undefined") {
    return false;
  }

  const environment = process.env.NEXT_PUBLIC_APP_ENVIRONMENT?.trim().toLowerCase() ?? "";
  const hostname = window.location.hostname.toLowerCase();
  return environment === "preview" || hostname.includes("preview") || hostname.includes("vspreview");
}

function WorkspaceShell({
  workspace,
  activeTab,
  breadcrumbs,
  role = "consultant",
  userEmail,
  serverRole,
  serverLookupId,
  showConsultantLinks = true,
  children,
}: {
  workspace: WorkspaceShellWorkspace;
  activeTab: "overview" | "projects" | "people" | "departments" | "vendors" | "requirements" | "scoring";
  breadcrumbs?: WorkspaceBreadcrumb[];
  role?: WorkspaceRole;
  userEmail?: string | null;
  serverRole?: string | null;
  serverLookupId?: string | null;
  showConsultantLinks?: boolean;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const tabsByRole: Record<WorkspaceRole, Array<{ key: string; label: string; href: string }>> = {
    consultant: [
      { key: "overview", label: "Overview", href: `/workspaces/${workspace.slug}` },
      { key: "projects", label: "Projects", href: `/workspaces/${workspace.slug}/projects` },
      { key: "people", label: "People", href: `/workspaces/${workspace.slug}/people` },
      { key: "departments", label: "Departments", href: `/workspaces/${workspace.slug}/departments` },
      { key: "vendors", label: "Vendors", href: `/workspaces/${workspace.slug}/vendors` },
      { key: "requirements", label: "Requirements", href: `/workspaces/${workspace.slug}/requirements` },
      { key: "scoring", label: "Scoring", href: `/workspaces/${workspace.slug}/scoring` },
    ],
    "company-admin": [
      { key: "overview", label: "Overview", href: `/workspaces/${workspace.slug}` },
      { key: "people", label: "People", href: `/workspaces/${workspace.slug}/people` },
      { key: "departments", label: "Departments", href: `/workspaces/${workspace.slug}/departments` },
      { key: "vendors", label: "Vendors", href: `/workspaces/${workspace.slug}/vendors` },
    ],
    "company-scorer": [{ key: "overview", label: "Overview", href: `/workspaces/${workspace.slug}` }],
    vendor: [
      { key: "overview", label: "My projects", href: `/workspaces/${workspace.slug}` },
    ],
  };

  const tabs = tabsByRole[role ?? "consultant"] ?? tabsByRole.consultant;
  const roleLabel =
    role === "consultant" ? "VS Consultant" : role === "company-admin" ? "Company admin" : role === "company-scorer" ? "Company scorer" : "Vendor";
  const isVendorShell = role === "vendor";
  const sanitizedBreadcrumbs = isVendorShell || role !== "consultant"
    ? (breadcrumbs ?? []).filter((item) => item.label !== "All workspaces")
    : breadcrumbs;
  const projectNavHref = isVendorShell
    ? `/workspaces/${workspace.slug}`
    : `/workspaces/${workspace.slug}/projects`;
  const canSeeProjectsLink = role === "consultant" || role === "company-admin" || role === "company-scorer" || role === "vendor";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {menuOpen ? (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
        />
      ) : null}

      <aside className={`fixed inset-y-0 left-0 z-50 w-80 shrink-0 border-r border-slate-800 bg-slate-950/90 p-5 transition-transform duration-200 lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Authorized</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-white">{role === "consultant" ? "Workspace directory" : role === "vendor" ? "Vendor navigation" : "Workspace navigation"}</h2>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 lg:hidden"
            >
              Close
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Company</p>
          <div className="mt-3 space-y-2">
            <Link href={`/workspaces/${workspace.slug}`} className="block rounded-xl border border-sky-500 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 hover:border-sky-400">
              <span className="block truncate" title={workspace.name}>{workspace.name}</span>
            </Link>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Signed in</p>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p className="truncate" title={userEmail ?? "Unknown user"}>{userEmail ?? "Unknown user"}</p>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{roleLabel}</p>
          </div>
        </div>

        {role === "consultant" && showConsultantLinks ? (
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Workspace actions</p>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <Link href="/workspaces" className="block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 hover:border-slate-500">
                All workspaces
              </Link>
              <Link href="/workspaces/activity" className="block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 hover:border-slate-500">
                Activity log
              </Link>
              <Link
                href={`/workspaces/${workspace.slug}/import`}
                className="block rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sky-100 hover:border-sky-400"
              >
                Bulk data import
              </Link>
              <button type="button" className="w-full rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
                Add company workspace
              </button>
            </div>
          </div>
        ) : null}

        {role === "vendor" ? (
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Vendor links</p>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <Link href="/workspaces" className="block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 hover:border-slate-500">
                My workspaces
              </Link>
              <Link href={`/workspaces/${workspace.slug}`} className="block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 hover:border-slate-500">
                My projects
              </Link>
            </div>
          </div>
        ) : null}
      </aside>

      <main className="min-h-screen lg:ml-80">
        <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex items-center gap-2 lg:hidden">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-500"
                >
                  Menu
                </button>
              </div>
              {sanitizedBreadcrumbs && sanitizedBreadcrumbs.length > 0 ? <WorkspaceBreadcrumbs items={sanitizedBreadcrumbs} /> : null}
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Workspace landing</p>
                  <h1 className="mt-2 truncate text-2xl font-semibold text-white" title={workspace.name}>{workspace.name}</h1>
                </div>
                {workspace.isTestData ? <StatusPill label="TEST" className="border-rose-500/50 bg-rose-500/10 text-rose-200" /> : null}
              </div>
            </div>
            <div className="flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3 xl:ml-auto">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Signed in</p>
              <p className="truncate text-sm font-medium text-white" title={userEmail ?? "Unknown user"}>{userEmail ?? "Unknown user"}</p>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{roleLabel}</p>
              {canSeeProjectsLink ? (
                <Link
                  href={projectNavHref}
                  className="mt-1 inline-flex w-fit rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs text-sky-200 hover:border-sky-400"
                >
                  Projects
                </Link>
              ) : null}
              {shouldShowPreviewDebugLine() ? (
                <p className="text-[10px] text-slate-400">
                  Preview debug: role {serverRole ?? roleLabel}, lookup {serverLookupId ?? "unknown"}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        <div className="space-y-6 p-6">
          {tabs.length > 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <Link
                    key={tab.key}
                    href={tab.href}
                    className={`rounded-xl border px-3 py-2 text-sm capitalize ${activeTab === tab.key ? "border-sky-500 bg-sky-500/10 text-sky-200" : "border-slate-700 bg-slate-950 text-slate-300"}`}
                  >
                    {tab.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {children}
        </div>
      </main>
    </div>
  );
}

export function ConsultantWorkspaceDirectoryPage() {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [workspaceFilter, setWorkspaceFilter] = useState<"active" | "archived">("active");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workingWorkspaceId, setWorkingWorkspaceId] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [openActionsWorkspaceId, setOpenActionsWorkspaceId] = useState<CompanyId | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: CompanyId; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: CompanyId; name: string } | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");

  const createCompany = useMutation(api.admin.createCompany);
  const archiveCompany = useMutation(api.admin.archiveCompany);
  const restoreCompany = useMutation(api.admin.restoreCompany);
  const deleteCompany = useMutation(api.admin.deleteCompany);

  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;

  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; companyIds?: string[] }
    | undefined;

  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as
    | Array<{ _id: CompanyId; name: string; isTestData?: boolean; isActive?: boolean }>
    | undefined;

  const router = useRouter();
  const singleCompany = !access?.isConsultant && companies && companies.length === 1 ? companies[0] : null;

  useEffect(() => {
    if (singleCompany) {
      router.replace(`/workspaces/${singleCompany._id}`);
    }
  }, [router, singleCompany]);

  const consultantWorkspaces = useQuery(
    api.admin.listWorkspacesForConsultant,
    isProtectedLoading || !access?.isConsultant ? "skip" : {},
  ) as Array<{ _id: CompanyId; name: string; isTestData?: boolean; isActive?: boolean }> | undefined;

  if (isProtectedLoading || access === undefined || companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  if (singleCompany) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Opening your workspace…</div>;
  }

  const canViewAnything = Boolean(access.isConsultant || access.role || companies.length);
  if (!canViewAnything) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">
        <div className="max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Access required</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">No workspace access</h1>
          <p className="mt-3 text-slate-300">Signed in as {access.email ?? user?.email ?? "unknown user"}</p>
          <p className="mt-2 text-sm text-slate-400">Server role: {access.role ?? "none"}</p>
          <p className="mt-4 text-sm text-slate-400">No membership was found for this account, so there are no workspaces to show.</p>
        </div>
      </div>
    );
  }

  const totalCompanies = access.isConsultant ? (consultantWorkspaces?.length ?? 0) : companies.length;
  const displayRole = access.isConsultant ? "VS Consultant" : access.role ?? "User";
  const allConsultantWorkspaces = consultantWorkspaces ?? [];
  const activeConsultantWorkspaces = allConsultantWorkspaces.filter((workspace) => workspace.isActive !== false);
  const archivedConsultantWorkspaces = allConsultantWorkspaces.filter((workspace) => workspace.isActive === false);
  const visibleWorkspaces = access.isConsultant
    ? (workspaceFilter === "archived" ? archivedConsultantWorkspaces : activeConsultantWorkspaces)
    : companies;

  const handleCreateWorkspace = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newWorkspaceName.trim()) {
      return;
    }

    setWorkspaceNotice(null);
    setWorkingWorkspaceId("create");
    try {
      await createCompany({ name: newWorkspaceName.trim() });
      setNewWorkspaceName("");
      setShowCreateForm(false);
      setWorkspaceFilter("active");
      setWorkspaceNotice({ kind: "success", message: "Workspace created successfully." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create workspace";
      setWorkspaceNotice({ kind: "error", message });
    } finally {
      setWorkingWorkspaceId(null);
    }
  };

  const handleArchiveWorkspace = async (companyId: CompanyId) => {
    setWorkspaceNotice(null);
    setWorkingWorkspaceId(companyId);
    try {
      await archiveCompany({ companyId });
      setArchiveTarget(null);
      setOpenActionsWorkspaceId(null);
      setWorkspaceNotice({ kind: "success", message: "Workspace archived." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to archive workspace";
      setWorkspaceNotice({ kind: "error", message });
    } finally {
      setWorkingWorkspaceId(null);
    }
  };

  const handleRestoreWorkspace = async (companyId: CompanyId) => {
    setWorkspaceNotice(null);
    setWorkingWorkspaceId(companyId);
    try {
      await restoreCompany({ companyId });
      setOpenActionsWorkspaceId(null);
      setWorkspaceNotice({ kind: "success", message: "Workspace restored." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to restore workspace";
      setWorkspaceNotice({ kind: "error", message });
    } finally {
      setWorkingWorkspaceId(null);
    }
  };

  const handleDeleteWorkspace = async (companyId: CompanyId, typedName: string) => {
    if (!typedName.trim()) {
      return;
    }

    setWorkspaceNotice(null);
    setWorkingWorkspaceId(companyId);
    try {
      await deleteCompany({
        companyId,
        confirmationName: typedName.trim(),
      });
      setDeleteTarget(null);
      setDeleteConfirmationName("");
      setOpenActionsWorkspaceId(null);
      setWorkspaceNotice({ kind: "success", message: "Workspace deleted permanently." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete workspace";
      setWorkspaceNotice({ kind: "error", message });
    } finally {
      setWorkingWorkspaceId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <ConsultantHomeHeader
        isConsultant={Boolean(access.isConsultant)}
        displayRole={displayRole}
        email={access.email ?? user?.email ?? "Unknown user"}
        onToggleCreate={() => {
          setShowCreateForm((value) => !value);
          setWorkspaceNotice(null);
        }}
      />

      {access.isConsultant ? (
        <div className="border-b border-slate-800 bg-slate-950/40 px-6 py-3">
          <Link href="/workspaces/activity" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500">
            Activity log
          </Link>
        </div>
      ) : null}

      <div className="space-y-6 p-6">
        {workspaceNotice ? (
          <section className={`rounded-2xl border p-4 text-sm ${workspaceNotice.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-rose-500/40 bg-rose-500/10 text-rose-100"}`}>
            {workspaceNotice.message}
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total companies" value={String(totalCompanies)} helper="Visible workspaces from Convex" />
          <StatCard label="Role" value={displayRole} helper="Current access from server" />
          <StatCard label="Signed in" value={access.email ?? user?.email ?? "Unknown"} helper="WorkOS session" />
          <StatCard label="Company IDs" value={String(access.companyIds?.length ?? companies.length)} helper="Server-authorized memberships" />
        </section>

        {access.isConsultant && showCreateForm ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Create workspace</h2>
            <p className="mt-2 text-sm text-slate-400">Create a company workspace using the real server mutation.</p>
            <form onSubmit={handleCreateWorkspace} className="mt-4 flex flex-col gap-3 md:flex-row">
              <input
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                placeholder="Company name"
              />
              <button
                type="submit"
                disabled={workingWorkspaceId === "create" || !newWorkspaceName.trim()}
                className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60"
              >
                Create
              </button>
            </form>
          </section>
        ) : null}

        {access.isConsultant ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setWorkspaceFilter("active")}
                className={`rounded-xl border px-3 py-2 text-sm ${workspaceFilter === "active" ? "border-sky-500 bg-sky-500/10 text-sky-100" : "border-slate-700 bg-slate-950 text-slate-300"}`}
              >
                Active ({activeConsultantWorkspaces.length})
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceFilter("archived")}
                className={`rounded-xl border px-3 py-2 text-sm ${workspaceFilter === "archived" ? "border-amber-500/60 bg-amber-500/10 text-amber-100" : "border-slate-700 bg-slate-950 text-slate-300"}`}
              >
                Archived ({archivedConsultantWorkspaces.length})
              </button>
            </div>
          </section>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-2">
          {visibleWorkspaces.map((company) => (
            <div key={company._id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <Link href={`/workspaces/${company._id}`} className="block">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-sky-300">Company workspace</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">{company.name}</h2>
                  </div>
                  <div className="flex gap-2">
                    {company.isActive === false ? <StatusPill label="ARCHIVED" className="border-amber-500/50 bg-amber-500/10 text-amber-200" /> : null}
                    {company.isTestData ? <StatusPill label="TEST" className="border-rose-500/50 bg-rose-500/10 text-rose-200" /> : null}
                  </div>
                </div>
              </Link>

              {access.isConsultant ? (
                <div className="relative mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOpenActionsWorkspaceId((current: CompanyId | null) => (current === company._id ? null : company._id))}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-500"
                  >
                    Actions
                  </button>

                  {openActionsWorkspaceId === company._id ? (
                    <div className="absolute right-0 top-11 z-20 w-52 rounded-xl border border-slate-700 bg-slate-950 p-2 shadow-xl shadow-black/40">
                      {company.isActive === false ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleRestoreWorkspace(company._id)}
                            disabled={workingWorkspaceId === company._id}
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-sky-200 hover:bg-slate-900 disabled:opacity-60"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget({ id: company._id, name: company.name });
                              setDeleteConfirmationName("");
                            }}
                            disabled={workingWorkspaceId === company._id}
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-slate-900 disabled:opacity-60"
                          >
                            Delete permanently
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setArchiveTarget({ id: company._id, name: company.name })}
                          disabled={workingWorkspaceId === company._id}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-amber-200 hover:bg-slate-900 disabled:opacity-60"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">Read-only workspace view for company users.</p>
              )}
            </div>
          ))}

          {visibleWorkspaces.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-300">
              {access.isConsultant && workspaceFilter === "archived"
                ? "No archived workspaces."
                : "No workspaces to show."}
            </div>
          ) : null}
        </section>

        {archiveTarget ? (
          <section className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-5 text-amber-100">
            <h2 className="text-lg font-semibold">Archive workspace</h2>
            <p className="mt-2 text-sm">Archive {archiveTarget.name}? This hides it from company users until restored.</p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => handleArchiveWorkspace(archiveTarget.id)}
                disabled={workingWorkspaceId === archiveTarget.id}
                className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
              >
                Confirm archive
              </button>
              <button
                type="button"
                onClick={() => setArchiveTarget(null)}
                className="rounded-xl border border-amber-300/50 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        {deleteTarget ? (
          <section className="rounded-2xl border border-rose-500/50 bg-rose-500/10 p-5 text-rose-100">
            <h2 className="text-lg font-semibold">Delete workspace permanently</h2>
            <p className="mt-2 text-sm">Type the exact workspace name to enable delete: {deleteTarget.name}</p>
            <input
              value={deleteConfirmationName}
              onChange={(event) => setDeleteConfirmationName(event.target.value)}
              className="mt-4 w-full rounded-xl border border-rose-300/40 bg-slate-950 px-3 py-2 text-white outline-none focus:border-rose-300"
              placeholder="Type workspace name exactly"
            />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => handleDeleteWorkspace(deleteTarget.id, deleteConfirmationName)}
                disabled={workingWorkspaceId === deleteTarget.id || deleteConfirmationName.trim() !== deleteTarget.name.trim()}
                className="rounded-xl bg-rose-300 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
              >
                Delete permanently
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmationName("");
                }}
                className="rounded-xl border border-rose-300/50 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

export function ConsultantActivityLogPage() {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean }
    | undefined;
  const logs = useQuery(api.admin.listActivityLogs, isProtectedLoading || !access?.isConsultant ? "skip" : {}) as
    | Array<{
        _id: string;
        action: string;
        details: string;
        summary?: string;
        detailLines?: string[];
        changedFields?: Array<{ label: string; before: string; after: string }>;
        workspaceLabel?: string | null;
        actorLabel?: string | null;
        projectName?: string | null;
        workspaceName?: string | null;
        companyId?: string | null;
        actorUserId?: string | null;
        actorEmail?: string | null;
        createdAt: number;
      }>
    | undefined;

  if (isProtectedLoading || access === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  if (!access.isConsultant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">
        <div className="max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Access required</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">No access to activity log</h1>
          <p className="mt-3 text-slate-300">Signed in as {access.email ?? user?.email ?? "unknown user"}</p>
          <p className="mt-2 text-sm text-slate-400">Role: {access.role ?? "none"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Consultant view</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Activity log</h1>
          </div>
          <Link href="/workspaces" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500">
            Back to consultant home
          </Link>
        </div>
      </header>

      <div className="space-y-6 p-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Recent actions</h2>
            <StatusPill label="Server filtered" className="border-sky-500/40 bg-sky-500/10 text-sky-200" />
          </div>

          {logs && logs.length > 0 ? (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log._id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusPill label={log.action.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} className="border-sky-500/40 bg-sky-500/10 text-sky-200" />
                      <span className="text-sm font-medium text-white">{log.workspaceLabel ?? log.workspaceName ?? "Deleted workspace"}</span>
                      {log.projectName ? <span className="text-xs text-slate-400">Project: {log.projectName}</span> : null}
                    </div>
                    <span className="text-xs text-slate-400">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.createdAt))}</span>
                  </div>

                  <p className="mt-2 text-sm text-slate-200">{log.summary ?? log.details}</p>

                  {log.changedFields && log.changedFields.length > 0 ? (
                    <details className="mt-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                      <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] text-slate-300">Changed fields ({log.changedFields.length})</summary>
                      <div className="mt-2 space-y-2 text-xs text-slate-300">
                        {log.changedFields.map((field) => (
                          <div key={`${log._id}-${field.label}`} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2">
                            <p className="font-medium text-slate-200">{field.label}</p>
                            <p className="text-slate-400">Before: {field.before}</p>
                            <p className="text-slate-400">After: {field.after}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : (
                    <details className="mt-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                      <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] text-slate-300">Details</summary>
                      <div className="mt-2 space-y-1 text-xs text-slate-300">
                        {(log.detailLines && log.detailLines.length > 0 ? log.detailLines : [log.details]).map((line, index) => (
                          <p key={`${log._id}-detail-${index}`}>{line}</p>
                        ))}
                      </div>
                    </details>
                  )}

                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                    <span>Actor: {log.actorLabel ?? log.actorEmail ?? log.actorUserId ?? "Unknown actor"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
              No activity yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConsultantWorkspaceOverviewPage({ companyId }: { companyId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;

  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as any;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const projects = useQuery((api as any).access.listDashboardProjects, isProtectedLoading || !companyId ? "skip" : { companyId: companyId as any }) as
    | Array<{ _id: string; name: string; description?: string | null; vendorDeadline?: number | null; scorerDeadline?: number | null; status: "draft" | "active"; createdAt?: number }>
    | undefined;

  if (isProtectedLoading || access === undefined || companies === undefined || projects === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const matchesCompany = companies.some((company) => company._id === companyId) || access.isConsultant;
  if (!matchesCompany) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">
        <div className="max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Access denied</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Company access denied</h1>
          <p className="mt-3 text-slate-300">Signed in as {access.email ?? user?.email ?? "unknown user"}</p>
          <p className="mt-2 text-sm text-slate-400">Requested company: {companyId}</p>
        </div>
      </div>
    );
  }

  const workspace: WorkspaceShellWorkspace = {
    id: companyId,
    slug: companyId,
    name: companies.find((company) => company._id === companyId)?.name ?? companies[0]?.name ?? "Workspace",
    isTestData: false,
    projects: projects.map((project) => ({
      id: project._id,
      name: project.name,
      vendorCount: 0,
      scorerCount: 0,
      status: project.status,
    })),
    people: [],
    vendors: [],
    requirements: [],
    scores: [],
  };
  const canManageWorkspace = Boolean(access.isConsultant || access.role === "company-admin");
  const isVendorView = Boolean(access.isVendor);
  const visibleProjects = projects.slice().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const upcomingDeadlines = visibleProjects
    .map((project) => ({
      ...project,
      nextDeadline: project.vendorDeadline && project.scorerDeadline
        ? Math.min(project.vendorDeadline, project.scorerDeadline)
        : project.vendorDeadline ?? project.scorerDeadline ?? null,
    }))
    .sort((a, b) => (a.nextDeadline ?? Number.MAX_SAFE_INTEGER) - (b.nextDeadline ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 3);

  return (
    <WorkspaceShell
      workspace={workspace}
      activeTab="overview"
      breadcrumbs={isVendorView
        ? [{ label: workspace.name }]
        : [
            { label: "All workspaces", href: "/workspaces" },
            { label: workspace.name },
          ]}
      role={access.isConsultant ? "consultant" : access.isVendor ? "vendor" : access.role === "company-admin" ? "company-admin" : access.role === "company-scorer" ? "company-scorer" : "company-admin"}
      userEmail={access.email ?? user?.email ?? "Unknown"}
      serverRole={access.isConsultant ? "vs-consultant" : access.role ?? "none"}
      serverLookupId={access.subject ?? access.tokenIdentifier ?? "unknown"}
      showConsultantLinks={Boolean(access.isConsultant)}
    >
      {isVendorView ? (
        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Vendor home</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{access.displayName ?? "Vendor organisation"}</h2>
              <p className="mt-2 text-sm text-slate-300">Working with {workspace.name}</p>
            </div>

            <div className="space-y-3">
              {visibleProjects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                  No projects assigned yet.
                </div>
              ) : (
                visibleProjects.map((project) => (
                  <div key={project._id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-base font-medium text-white">{project.name}</p>
                        <p className="mt-1 text-sm text-slate-400">{project.description || "No description added yet."}</p>
                      </div>
                      {project.vendorDeadline ? (
                        <StatusPill label={`Vendor due ${new Date(project.vendorDeadline).toLocaleDateString()}`} className="border-amber-500/50 bg-amber-500/10 text-amber-200" />
                      ) : null}
                    </div>
                    <div className="mt-3 flex gap-3">
                      <Link href={`/workspaces/${workspace.slug}/projects/${project._id}`} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
                        Open project
                      </Link>
                      <Link href={`/workspaces/${workspace.slug}/projects/${project._id}/answer-requirements`} className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:border-sky-400">
                        Score requirements
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">What needs action</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              {upcomingDeadlines.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                  No project deadlines are set yet.
                </div>
              ) : (
                upcomingDeadlines.map((project) => (
                  <div key={project._id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">{project.name}</p>
                      <StatusPill label={project.status === "active" ? "Open" : "Draft"} />
                    </div>
                    {project.nextDeadline ? (
                      <p className="mt-2 text-xs text-slate-400">Next deadline: {new Date(project.nextDeadline).toLocaleDateString()}</p>
                    ) : null}
                    <Link href={`/workspaces/${workspace.slug}/projects/${project._id}/answer-requirements`} className="mt-3 inline-block text-sm text-sky-300 hover:text-sky-200">
                      Score requirements
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Company" value={workspace.name} helper="Visible via Convex access" />
            <StatCard label="Role" value={access.isConsultant ? "VS Consultant" : access.role ?? "User"} helper="Server role" />
            <StatCard label="Email" value={access.email ?? user?.email ?? "Unknown"} helper="Signed-in user" />
            <StatCard label="Company ID" value={workspace.id} helper="Authorized workspace" />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">My projects</h2>
                {canManageWorkspace ? (
                  <Link href={`/workspaces/${workspace.slug}/projects`} className="text-sm text-sky-300 hover:text-sky-200">
                    View all projects
                  </Link>
                ) : null}
              </div>

              <div className="space-y-3">
                {visibleProjects.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                    No projects assigned yet.
                  </div>
                ) : (
                  visibleProjects.map((project) => {
                    const nextDeadline = project.vendorDeadline && project.scorerDeadline
                      ? Math.min(project.vendorDeadline, project.scorerDeadline)
                      : project.vendorDeadline ?? project.scorerDeadline ?? null;

                    return (
                      <Link
                        key={project._id}
                        href={`/workspaces/${workspace.slug}/projects/${project._id}`}
                        className="block rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition hover:border-sky-500/50 hover:bg-slate-950"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-base font-medium text-white">{project.name}</p>
                            <p className="mt-1 text-sm text-slate-400">{project.description || "No description added yet."}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <StatusPill label={project.status === "active" ? "Active" : "Draft"} />
                            {nextDeadline ? (
                              <StatusPill label={`Due ${new Date(nextDeadline).toLocaleDateString()}`} className="border-amber-500/50 bg-amber-500/10 text-amber-200" />
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold text-white">What needs action</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                {upcomingDeadlines.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                    No project deadlines are set yet.
                  </div>
                ) : (
                  upcomingDeadlines.map((project) => (
                    <div key={project._id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{project.name}</p>
                        <StatusPill label={project.status === "active" ? "Open" : "Draft"} />
                      </div>
                      {project.nextDeadline ? (
                        <p className="mt-2 text-xs text-slate-400">Next deadline: {new Date(project.nextDeadline).toLocaleDateString()}</p>
                      ) : null}
                      <Link href={`/workspaces/${workspace.slug}/projects/${project._id}`} className="mt-3 inline-block text-sm text-sky-300 hover:text-sky-200">
                        Open project
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </WorkspaceShell>
  );
}

export function ConsultantWorkspaceDepartmentsPage({ companyId }: { companyId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as any;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const departments = useQuery((api as any).admin.listWorkspaceDepartments, isProtectedLoading || !companyId ? "skip" : { companyId }) as
    | Array<{ departmentId: string; name: string; isActive?: boolean; memberCount?: number; members: Array<{ userId: string; displayName: string; email?: string | null; role?: string }> }>
    | undefined;

  const createDepartment = useMutation((api as any).admin.createWorkspaceDepartment);
  const renameDepartment = useMutation((api as any).admin.renameWorkspaceDepartment);
  const deactivateDepartment = useMutation((api as any).admin.deactivateWorkspaceDepartment);
  const [departmentName, setDepartmentName] = useState("");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (isProtectedLoading || access === undefined || companies === undefined || departments === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  const canManagePeople = access.isConsultant || access.role === "company-admin";
  if (!company || !canManagePeople) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  const workspace = {
    id: companyId,
    slug: companyId,
    name: company.name,
    isTestData: false,
    projects: [],
    people: [],
    vendors: [],
    requirements: [],
    scores: [],
  };
  const activeDepartments = departments.filter((department) => department.isActive !== false);

  const handleCreateDepartment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = departmentName.trim();
    if (!trimmedName) {
      setNotice({ kind: "error", message: "Enter a department name before creating it." });
      return;
    }

    setBusy(true);
    try {
      await createDepartment({ companyId: companyId as any, name: trimmedName });
      setDepartmentName("");
      setNotice({ kind: "success", message: `Created the ${trimmedName} department.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to create the department." });
    } finally {
      setBusy(false);
    }
  };

  const handleRenameDepartment = async (department: { departmentId: string; name: string }) => {
    const nextName = (renameDrafts[department.departmentId] ?? department.name).trim();
    if (!nextName) {
      setNotice({ kind: "error", message: "Department name is required." });
      return;
    }
    if (nextName === department.name) {
      setNotice({ kind: "error", message: "Enter a different name before saving." });
      return;
    }

    setBusy(true);
    try {
      await renameDepartment({ companyId: companyId as any, departmentId: department.departmentId as any, name: nextName });
      setNotice({ kind: "success", message: `Renamed ${department.name} to ${nextName}.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to rename this department." });
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivateDepartment = async (department: { departmentId: string; name: string }) => {
    const confirmed = window.confirm(`Deactivate ${department.name}?`);
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await deactivateDepartment({ companyId: companyId as any, departmentId: department.departmentId as any });
      setNotice({ kind: "success", message: `Deactivated ${department.name}.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to deactivate this department." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkspaceShell
      workspace={workspace}
      activeTab="departments"
      breadcrumbs={[
        { label: "All workspaces", href: "/workspaces" },
        { label: company.name, href: `/workspaces/${companyId}` },
        { label: "Departments" },
      ]}
      role={access.isConsultant ? "consultant" : access.role === "company-admin" ? "company-admin" : "company-scorer"}
      userEmail={access.email ?? user?.email ?? "Unknown"}
      showConsultantLinks={Boolean(access.isConsultant)}
    >
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Departments</h2>
          <StatusPill label={`${activeDepartments.length} active`} className="border-sky-500/40 bg-sky-500/10 text-sky-200" />
        </div>

        {notice ? (
          <div className={`mb-4 rounded-2xl border p-4 text-sm ${notice.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-rose-500/40 bg-rose-500/10 text-rose-100"}`}>
            {notice.message}
          </div>
        ) : null}

        {canManagePeople ? (
          <form onSubmit={handleCreateDepartment} className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 md:flex-row">
            <input
              value={departmentName}
              onChange={(event) => setDepartmentName(event.target.value)}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
              placeholder="Department name"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60"
            >
              Create department
            </button>
          </form>
        ) : null}

        {activeDepartments.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
            No active departments are configured yet for this workspace.
          </div>
        ) : (
          <div className="space-y-4">
            {activeDepartments.map((department) => (
              <div key={department.departmentId} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-white">{department.name}</h3>
                  <StatusPill label={`${department.memberCount ?? department.members.length} people`} className="border-slate-700 bg-slate-900 text-slate-200" />
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <input
                    value={renameDrafts[department.departmentId] ?? department.name}
                    onChange={(event) => setRenameDrafts((current) => ({ ...current, [department.departmentId]: event.target.value }))}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                  />
                  <button
                    type="button"
                    onClick={() => void handleRenameDepartment(department)}
                    disabled={busy}
                    className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:border-sky-400 disabled:opacity-60"
                  >
                    Save name
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeactivateDepartment(department)}
                    disabled={busy}
                    className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:border-rose-400 disabled:opacity-60"
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}

export function ConsultantWorkspaceProjectsPage({ companyId }: { companyId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; companyIds?: string[] }
    | undefined;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const projects = useQuery(api.access.listProjectsForCompany, isProtectedLoading || !companyId ? "skip" : { companyId: companyId as any }) as
    | Array<{ _id: string; name: string; description?: string | null; vendorDeadline?: number | null; scorerDeadline?: number | null; status: "draft" | "active"; createdAt?: number }>
    | undefined;
  const createProject = useMutation(api.admin.createProject);
  const [draft, setDraft] = useState({ name: "", description: "", vendorDeadline: "", scorerDeadline: "" });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isProtectedLoading || access === undefined || companies === undefined || projects === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  const canManageProjects = Boolean(access.isConsultant || access.role === "company-admin");
  if (!company || !canManageProjects) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const projectName = draft.name.trim();
    if (!projectName) {
      setNotice("Project name is required.");
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      await createProject({
        companyId: companyId as any,
        name: projectName,
        description: draft.description.trim() || undefined,
        vendorDeadline: draft.vendorDeadline ? new Date(draft.vendorDeadline).getTime() : undefined,
        scorerDeadline: draft.scorerDeadline ? new Date(draft.scorerDeadline).getTime() : undefined,
      });
      setDraft({ name: "", description: "", vendorDeadline: "", scorerDeadline: "" });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create the project.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkspaceShell
      workspace={{
        id: companyId,
        slug: companyId,
        name: company.name,
        isTestData: false,
        projects: projects.map((project) => ({
          id: project._id,
          name: project.name,
          vendorCount: 0,
          scorerCount: 0,
          status: project.status,
        })),
        people: [],
        vendors: [],
        requirements: [],
        scores: [],
      }}
      activeTab="projects"
      breadcrumbs={[
        { label: "All workspaces", href: "/workspaces" },
        { label: company.name, href: `/workspaces/${companyId}` },
        { label: "Projects" },
      ]}
      role={access.isConsultant ? "consultant" : access.role === "company-admin" ? "company-admin" : access.role === "company-scorer" ? "company-scorer" : "vendor"}
      userEmail={access.email ?? user?.email ?? "Unknown"}
      showConsultantLinks={Boolean(access.isConsultant)}
    >
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Workspace projects</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Project portfolio</h2>
        </div>

        <form onSubmit={handleCreate} className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 md:grid-cols-2">
          <label className="block text-sm text-slate-300 md:col-span-2">
            <span className="mb-2 block">Project name</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
              placeholder="HR platform selection"
            />
          </label>

          <label className="block text-sm text-slate-300 md:col-span-2">
            <span className="mb-2 block">Description</span>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
              placeholder="Describe the sourcing goal and scope"
            />
          </label>

          <label className="block text-sm text-slate-300">
            <span className="mb-2 block">Vendor deadline</span>
            <input
              type="date"
              value={draft.vendorDeadline}
              onChange={(event) => setDraft((current) => ({ ...current, vendorDeadline: event.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>

          <label className="block text-sm text-slate-300">
            <span className="mb-2 block">Scorer deadline</span>
            <input
              type="date"
              value={draft.scorerDeadline}
              onChange={(event) => setDraft((current) => ({ ...current, scorerDeadline: event.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>

          {notice ? <p className="md:col-span-2 text-sm text-rose-300">{notice}</p> : null}

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Creating…" : "New project"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Existing projects</h2>
          <span className="text-sm text-slate-400">{projects.length} total</span>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
            No projects are configured for this workspace yet.
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <Link
                key={project._id}
                href={`/workspaces/${companyId}/projects/${project._id}`}
                className="block rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition hover:border-sky-500/50 hover:bg-slate-950"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-white">{project.name}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {project.description || "No description added yet."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <StatusPill label={project.status === "active" ? "Active" : "Draft"} />
                    {project.vendorDeadline ? <StatusPill label={`Vendor due ${new Date(project.vendorDeadline).toLocaleDateString()}`} className="border-amber-500/50 bg-amber-500/10 text-amber-200" /> : null}
                    {project.scorerDeadline ? <StatusPill label={`Scorer due ${new Date(project.scorerDeadline).toLocaleDateString()}`} className="border-violet-500/50 bg-violet-500/10 text-violet-200" /> : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}

export function ConsultantWorkspaceProjectDetailPage({ companyId, projectId }: { companyId: string; projectId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as any;
  const canManageWorkspace = Boolean(access && (access.isConsultant || access.role === "company-admin"));
  const canManageProjects = Boolean(access && (access.isConsultant || access.role === "company-admin"));
  const isVendorView = Boolean(access?.isVendor || access?.role === "vendor");
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const project = useQuery(api.access.getProject, isProtectedLoading || !projectId ? "skip" : { projectId: projectId as any }) as
    | ProjectDetailProject
    | undefined;
  const projectMembers = useQuery(api.admin.listProjectMembers, isProtectedLoading || !projectId ? "skip" : { projectId: projectId as any }) as
    | Array<{ _id: string; projectId: string; userId: string; role: string; displayName: string; isActive: boolean; createdAt?: number }>
    | undefined;
  const requirements = useQuery(api.access.listProjectRequirements, isProtectedLoading || !projectId ? "skip" : { projectId: projectId as any }) as
    | Array<{ _id: string; requirementId: string; text: string; type?: string; priority?: number; status: "active" | "withdrawn" }>
    | undefined;
  const vendorScoringPanel = useQuery(
    (api as any).scores.listVendorAnswerRequirements,
    isProtectedLoading || !projectId || !isVendorView ? "skip" : { projectId: projectId as any },
  ) as
    | {
      vendorOrganizationName: string;
      projectName: string;
      projectDescription?: string | null;
      deadlineAt?: number | null;
      deadlineLocked: boolean;
      status: "not-started" | "in-progress" | "submitted";
      answeredCount: number;
      totalRequirements: number;
    }
    | undefined;
  const workspacePeople = useQuery((api as any).admin.listWorkspacePeople, isProtectedLoading || !companyId || !canManageWorkspace ? "skip" : { companyId }) as
    | Array<{ id: string; userId?: string | null; name: string; email: string; role: string; status: string; source: string; departmentId?: string | null; departmentName?: string | null }>
    | undefined;
  const departments = useQuery((api as any).admin.listWorkspaceDepartments, isProtectedLoading || !companyId || !canManageWorkspace ? "skip" : { companyId }) as
    | Array<{ departmentId: string; name: string; isActive?: boolean; memberCount?: number; members: Array<{ userId: string; displayName: string; email?: string | null; role?: string }> }>
    | undefined;
  const workspaceVendors = useQuery((api as any).admin.listWorkspaceVendors, isProtectedLoading || !companyId || !canManageWorkspace ? "skip" : { companyId }) as
    | Array<{ vendorId: string; name: string; contactEmail?: string | null; status: string; contactCount?: number }>
    | undefined;
  const addProjectScorer = useMutation(api.admin.addProjectScorer);
  const addProjectVendor = useMutation(api.admin.addProjectVendor);
  const [scorerDraft, setScorerDraft] = useState({ selectedUserId: "" });
  const [selectedProgressDepartmentId, setSelectedProgressDepartmentId] = useState("");
  const [vendorDraft, setVendorDraft] = useState({ selectedVendorId: "" });
  const [notice, setNotice] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const scoringProgress = useQuery(
    (api as any).scores.getProjectScoringProgress,
    isProtectedLoading || !projectId || !canManageProjects
      ? "skip"
      : { projectId: projectId as any, departmentId: selectedProgressDepartmentId || undefined },
  ) as
    | {
      projectId: string;
      vendors: Array<{ vendorUserId: string; vendorName: string; vendorContactName: string | null }>;
      groups: Array<{
        departmentId: string | null;
        departmentName: string;
        groupType: "default" | "current" | "historical";
        completedPairs: number;
        totalPairs: number;
        scorers: Array<{ displayName: string; departmentName: string; completedPairs: number; totalPairs: number; historicalDepartmentNames: string[]; selectedDepartmentScoreCount: number }>;
      }>;
    }
    | undefined;

  if (isProtectedLoading || access === undefined || companies === undefined || project === undefined || projectMembers === undefined || requirements === undefined || (isVendorView && vendorScoringPanel === undefined)) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  const isScorerView = access.role === "company-scorer";
  const workspacePeopleList = canManageWorkspace ? (workspacePeople ?? []) : [];
  const departmentsList = canManageWorkspace ? (departments ?? []).filter((department) => department.isActive !== false) : [];
  const workspaceVendorsList = canManageWorkspace ? (workspaceVendors ?? []) : [];
  const assignableScorers = workspacePeopleList.filter((person) =>
    person.status === "active"
    && person.source === "member"
    && (person.role === "company-scorer" || person.role === "company-admin")
    && Boolean(person.departmentId),
  );
  const assignableVendors = workspaceVendorsList.filter((vendor) => vendor.status === "active");
  const selectedScorer = assignableScorers.find((person) => person.id === scorerDraft.selectedUserId) ?? null;
  const selectedVendor = assignableVendors.find((vendor) => vendor.vendorId === vendorDraft.selectedVendorId) ?? null;
  const mixedHistoryScorerCount = scoringProgress
    ? scoringProgress.groups.reduce(
        (total, group) => total + group.scorers.filter((scorer) => scorer.historicalDepartmentNames.length > 0).length,
        0,
      )
    : 0;

  if (!company || !project) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  const handleAddScorer = async () => {
    if (!selectedScorer) {
      setNotice({ kind: "error", message: "Select a workspace person before assigning them as a scorer." });
      return;
    }

    const isAlreadyAssigned = projectMembers.some((member) => member.userId === selectedScorer.userId || member.displayName === selectedScorer.name);
    if (isAlreadyAssigned) {
      setNotice({ kind: "error", message: `${selectedScorer.name} is already assigned to this project.` });
      return;
    }

    try {
      setBusy(true);
      setNotice(null);
      await addProjectScorer({
        companyId: companyId as any,
        projectId: projectId as any,
        userId: selectedScorer.userId ?? undefined,
        displayName: selectedScorer.name.trim(),
        email: selectedScorer.email.trim(),
      });
      setScorerDraft({ selectedUserId: "" });
      setNotice({ kind: "success", message: "Scorer assigned to the project." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to assign scorer." });
    } finally {
      setBusy(false);
    }
  };

  const handleAddVendor = async () => {
    if (!selectedVendor) {
      setNotice({ kind: "error", message: "Select a workspace vendor before assigning it to the project." });
      return;
    }

    const isAlreadyAssigned = projectMembers.some((member) => member.userId === selectedVendor.vendorId || member.displayName === selectedVendor.name);
    if (isAlreadyAssigned) {
      setNotice({ kind: "error", message: `${selectedVendor.name} is already assigned to this project.` });
      return;
    }

    try {
      setBusy(true);
      setNotice(null);
      await addProjectVendor({
        companyId: companyId as any,
        projectId: projectId as any,
        vendorId: selectedVendor.vendorId as any,
      });
      setVendorDraft({ selectedVendorId: "" });
      setNotice({ kind: "success", message: "Vendor added to the project." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to assign vendor." });
    } finally {
      setBusy(false);
    }
  };


  return (
    <WorkspaceShell
      workspace={{
        id: companyId,
        slug: companyId,
        name: company.name,
        isTestData: false,
        projects: [],
        people: workspacePeopleList.map((person) => ({ id: person.id, name: person.name })),
        vendors: workspaceVendorsList.map((vendor) => ({ id: vendor.vendorId, name: vendor.name })),
        requirements: [],
        scores: [],
      }}
      activeTab="projects"
      breadcrumbs={isVendorView
        ? [
            { label: "My projects", href: `/workspaces/${companyId}` },
            { label: project.name },
          ]
        : [
            { label: "All workspaces", href: "/workspaces" },
            { label: company.name, href: `/workspaces/${companyId}` },
            { label: "Projects", href: `/workspaces/${companyId}/projects` },
            { label: project.name },
          ]}
      role={access.isConsultant ? "consultant" : access.role === "company-admin" ? "company-admin" : access.role === "company-scorer" ? "company-scorer" : "vendor"}
      userEmail={access.email ?? user?.email ?? "Unknown"}
      serverRole={access.isConsultant ? "vs-consultant" : access.role ?? "none"}
      serverLookupId={access.subject ?? access.tokenIdentifier ?? "unknown"}
      showConsultantLinks={Boolean(access.isConsultant)}
    >
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Project</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{isVendorView ? (vendorScoringPanel?.projectName ?? project.name) : project.name}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label={project.status === "active" ? "Active" : "Draft"} />
            {project.isArchived ? <StatusPill label="Archived" className="border-rose-500/50 bg-rose-500/10 text-rose-200" /> : null}
            {(isVendorView ? vendorScoringPanel?.deadlineAt : project.vendorDeadline)
              ? <StatusPill label={`Vendor due ${new Date((isVendorView ? vendorScoringPanel?.deadlineAt : project.vendorDeadline) as number).toLocaleDateString()}`} className="border-amber-500/50 bg-amber-500/10 text-amber-200" />
              : null}
            {!isVendorView && project.scorerDeadline ? <StatusPill label={`Scorer due ${new Date(project.scorerDeadline).toLocaleDateString()}`} className="border-violet-500/50 bg-violet-500/10 text-violet-200" /> : null}
          </div>
        </div>

        <p className="text-sm text-slate-300">{(isVendorView ? vendorScoringPanel?.projectDescription : project.description) || "No description for this project yet."}</p>
      </section>

      {!isVendorView && canManageProjects ? <ProjectEditPanel companyId={companyId} projectId={projectId} project={project} /> : null}

      {!isVendorView && canManageProjects ? <ScoringSettingsPanel companyId={companyId} projectId={projectId} project={project} /> : null}

      {!isVendorView && canManageProjects ? <VendorResponsesPanel projectId={projectId} /> : null}

      {!isVendorView && canManageProjects ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">Scoring progress by department</h3>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                label={`${mixedHistoryScorerCount} mixed history`}
                className="border-amber-500/40 bg-amber-500/10 text-amber-200"
              />
              <select
                value={selectedProgressDepartmentId}
                onChange={(event) => setSelectedProgressDepartmentId(event.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
              >
                <option value="">All departments</option>
                {departmentsList.map((department) => (
                  <option key={department.departmentId} value={department.departmentId}>{department.name}</option>
                ))}
              </select>
            </div>
          </div>

          {scoringProgress === undefined ? (
            <p className="text-sm text-slate-400">Loading scorer progress...</p>
          ) : scoringProgress.groups.length === 0 ? (
            <p className="text-sm text-slate-400">No assigned scorers yet for this filter.</p>
          ) : (
            <div className="space-y-4">
              {scoringProgress.groups.map((group) => (
                <div key={group.departmentId ?? group.departmentName} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-semibold text-white">{group.departmentName}</p>
                    <StatusPill label={`${group.completedPairs} / ${group.totalPairs} completed`} className="border-sky-500/40 bg-sky-500/10 text-sky-200" />
                  </div>
                  <div className="space-y-2">
                    {group.scorers.map((scorer) => (
                      <div key={`${group.departmentName}-${scorer.displayName}`} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                        <div>
                          <span className="text-sm text-slate-100">{scorer.displayName}, {group.groupType === "historical" ? scorer.departmentName ?? "Current department" : group.departmentName}</span>
                          {group.groupType === "historical" ? (
                            <p className="text-xs text-slate-400">{`${scorer.selectedDepartmentScoreCount} scores recorded under this department`}</p>
                          ) : scorer.historicalDepartmentNames.length > 0 ? (
                            <p className="text-xs text-slate-400">{`some scores entered while in ${scorer.historicalDepartmentNames.join(", ")}`}</p>
                          ) : null}
                        </div>
                        <span className="text-xs text-slate-300">{scorer.completedPairs} / {scorer.totalPairs} vendors completed</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!isVendorView && isScorerView ? <ScorerScoringPanel projectId={projectId} scorerDeadlineAt={project.scorerDeadline ?? null} /> : null}

      {isVendorView ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Vendor organisation</p>
              <p className="mt-2 text-lg font-semibold text-white">{vendorScoringPanel?.vendorOrganizationName ?? access.displayName ?? "Vendor"}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Progress</p>
              <p className="mt-2 text-lg font-semibold text-white">{vendorScoringPanel?.answeredCount ?? 0} of {vendorScoringPanel?.totalRequirements ?? 0} answered</p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">Status: {(vendorScoringPanel?.status ?? "not-started").replace("-", " ")}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Deadline</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {vendorScoringPanel?.deadlineAt ? new Date(vendorScoringPanel.deadlineAt).toLocaleDateString() : "Not set"}
              </p>
              <p className="mt-1 text-xs text-slate-400">Vendor deadline only</p>
            </div>
          </div>

          <div className="mt-5">
            <Link
              href={`/workspaces/${companyId}/projects/${projectId}/answer-requirements`}
              className="inline-flex rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400"
            >
              Score requirements
            </Link>
          </div>
        </section>
      ) : null}

      {canManageProjects ? (
        <>
          <section className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h3 className="text-lg font-semibold text-white">Assign scorers</h3>
              <div className="mt-4 space-y-3">
                <select
                  value={scorerDraft.selectedUserId}
                  onChange={(event) => setScorerDraft((current) => ({ ...current, selectedUserId: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                >
                  <option value="">Select a workspace person</option>
                  {assignableScorers.map((person) => (
                    <option key={person.id} value={person.id}>{person.name} — {person.email} — {person.departmentName}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">Project scoring assignments are individual only. Each person keeps their workspace department.</p>
                <button type="button" onClick={() => void handleAddScorer()} disabled={busy || !selectedScorer} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60">
                  Add scorer
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h3 className="text-lg font-semibold text-white">Assign vendors</h3>
              <div className="mt-4 space-y-3">
                <select
                  value={vendorDraft.selectedVendorId}
                  onChange={(event) => setVendorDraft((current) => ({ ...current, selectedVendorId: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                >
                  <option value="">Select a workspace vendor</option>
                  {assignableVendors.map((vendor) => (
                    <option key={vendor.vendorId} value={vendor.vendorId}>{vendor.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => void handleAddVendor()} disabled={busy || !selectedVendor} className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-200 hover:border-sky-400 disabled:opacity-60">
                  Add vendor
                </button>
              </div>
            </div>
          </section>

          {notice ? (
            <div className={`rounded-xl border px-3 py-2 text-sm ${notice.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`}>
              {notice.message}
            </div>
          ) : null}
        </>
      ) : null}

      {!isVendorView ? (
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Requirements</h3>
          <Link href={`/workspaces/${companyId}/requirements`} className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:border-sky-400">
            Open import / requirements
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Active rows</p>
            <p className="mt-2 text-2xl font-semibold text-white">{requirements.filter((row) => row.status === "active").length}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Access</p>
            <p className="mt-2 text-base font-medium text-slate-200">{canManageProjects ? "Consultant / admin" : "Read-only"}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Import</p>
            <p className="mt-2 text-base font-medium text-slate-200">{canManageProjects ? "Allowed" : "Blocked"}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-400">The canonical import flow is in the project requirements screen and remains restricted to consultants and company admins.</p>
      </section>
      ) : null}

      {!isVendorView ? (
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-lg font-semibold text-white">Assigned members</h3>
        <div className="mt-4 space-y-3">
          {projectMembers.length === 0 ? (
            <p className="text-sm text-slate-400">No people or vendors are assigned yet.</p>
          ) : (
            projectMembers.map((member) => (
              <div key={member._id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div>
                  <p className="font-medium text-white">{member.displayName}</p>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{member.role}</p>
                </div>
                <StatusPill label={member.role === "company-admin" ? "Admin" : member.role === "company-scorer" ? "Scorer" : "Vendor"} className="border-slate-700 bg-slate-900 text-slate-200" />
              </div>
            ))
          )}
        </div>
      </section>
      ) : null}
    </WorkspaceShell>
  );
}

export function VendorProjectAnswerRequirementsPage({ companyId, projectId }: { companyId: string; projectId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;

  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as any;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const panel = useQuery((api as any).scores.listVendorAnswerRequirements, isProtectedLoading || !projectId ? "skip" : { projectId: projectId as any }) as
    | {
      companyName: string;
      projectName: string;
      projectDescription?: string | null;
      vendorOrganizationName: string;
      deadlineAt?: number | null;
      deadlineLocked: boolean;
      submittedAt?: number | null;
      status: "not-started" | "in-progress" | "submitted";
      answeredCount: number;
      totalRequirements: number;
      rows: Array<{
        requirementId: string;
        text: string;
        score: 0 | 1 | null;
        comment: string;
        amendedByDisplayName?: string | null;
        amendedAt?: number | null;
      }>;
    }
    | undefined;

  const saveVendorAnswer = useMutation((api as any).scores.saveVendorAnswer);
  const submitVendorAnswers = useMutation((api as any).scores.submitVendorAnswers);

  const [drafts, setDrafts] = useState<Record<string, { score: 0 | 1 | null; comment: string }>>({});
  const [collapsedRequirementIds, setCollapsedRequirementIds] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!panel) {
      return;
    }

    const nextDrafts: Record<string, { score: 0 | 1 | null; comment: string }> = {};
    for (const row of panel.rows) {
      nextDrafts[row.requirementId] = {
        score: row.score,
        comment: row.comment ?? "",
      };
    }
    setDrafts(nextDrafts);
  }, [panel]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(saveTimers.current)) {
        clearTimeout(timer);
      }
    };
  }, []);

  if (isProtectedLoading || access === undefined || companies === undefined || panel === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  if (!access.isVendor) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">No access.</div>;
  }

  const company = companies.find((item) => item._id === companyId);
  if (!company) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">No access.</div>;
  }

  const saveRow = (requirementId: string, nextDraft: { score: 0 | 1 | null; comment: string }) => {
    setDrafts((current) => ({ ...current, [requirementId]: nextDraft }));
    setNotice(null);

    if (panel.deadlineLocked || nextDraft.score === null) {
      return;
    }

    setSaveState((current) => ({ ...current, [requirementId]: "saving" }));
    if (saveTimers.current[requirementId]) {
      clearTimeout(saveTimers.current[requirementId]);
    }

    saveTimers.current[requirementId] = setTimeout(() => {
      void saveVendorAnswer({
        projectId: projectId as any,
        requirementId,
        score: nextDraft.score as 0 | 1,
        comment: nextDraft.comment.trim() || undefined,
      })
        .then(() => {
          setSaveState((current) => ({ ...current, [requirementId]: "saved" }));
        })
        .catch((error: unknown) => {
          setSaveState((current) => ({ ...current, [requirementId]: "error" }));
          setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to save this answer." });
        });
    }, 450);
  };

  const handleSubmit = async () => {
    if (panel.deadlineLocked) {
      return;
    }

    const confirmed = window.confirm("Submit your answers now? You can keep editing them until the vendor deadline.");
    if (!confirmed) {
      return;
    }

    try {
      await submitVendorAnswers({ projectId: projectId as any, confirm: true });
      setNotice({ kind: "success", message: "Answers submitted. You can keep editing until the deadline." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to submit answers." });
    }
  };

  return (
    <WorkspaceShell
      workspace={{
        id: companyId,
        slug: companyId,
        name: company.name,
        isTestData: false,
        projects: [],
        people: [],
        vendors: [],
        requirements: [],
        scores: [],
      }}
      activeTab="projects"
      breadcrumbs={[
        { label: "My projects", href: `/workspaces/${companyId}` },
        { label: panel.projectName, href: `/workspaces/${companyId}/projects/${projectId}` },
        { label: "Score requirements" },
      ]}
      role="vendor"
      userEmail={access.email ?? user?.email ?? "Unknown"}
      serverRole={access.role ?? "vendor"}
      serverLookupId={access.subject ?? access.tokenIdentifier ?? "unknown"}
      showConsultantLinks={false}
    >
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Vendor scoring</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{panel.projectName}</h2>
            <p className="mt-2 text-sm text-slate-300">{panel.projectDescription || "No description for this project yet."}</p>
          </div>
          <div className="space-y-2 text-right text-sm text-slate-300">
            <p>{panel.answeredCount} of {panel.totalRequirements} answered</p>
            <p className="uppercase tracking-[0.14em] text-slate-400">Status: {panel.status.replace("-", " ")}</p>
            <p>Vendor due: {panel.deadlineAt ? new Date(panel.deadlineAt).toLocaleDateString() : "Not set"}</p>
          </div>
        </div>

        {panel.deadlineLocked ? (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            This scoring window is now read-only because the vendor deadline has passed.
          </div>
        ) : null}

        {notice ? (
          <div className={`mt-4 rounded-xl border p-3 text-sm ${notice.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-rose-500/40 bg-rose-500/10 text-rose-100"}`}>
            {notice.message}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setCollapsedRequirementIds(() => Object.fromEntries(panel.rows.map((row) => [row.requirementId, true])))}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
          >
            Collapse all
          </button>
          <button
            type="button"
            onClick={() => setCollapsedRequirementIds({})}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
          >
            Expand all
          </button>
        </div>
        {panel.rows.map((row) => {
          const isCollapsed = Boolean(collapsedRequirementIds[row.requirementId]);
          const draft = drafts[row.requirementId] ?? { score: row.score, comment: row.comment ?? "" };
          const unanswered = draft.score === null;
          const state = saveState[row.requirementId] ?? "idle";

          return (
            <div key={row.requirementId} className={`rounded-2xl border p-4 ${unanswered ? "border-amber-500/40 bg-amber-500/5" : "border-slate-800 bg-slate-900"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{row.requirementId}</p>
                  <p className="mt-2 text-sm text-slate-100">{row.text}</p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <p>{state === "saving" ? "Saving..." : state === "saved" ? "Saved" : state === "error" ? "Save failed" : unanswered ? "Unanswered" : "Ready"}</p>
                  <button
                    type="button"
                    onClick={() => setCollapsedRequirementIds((current) => ({ ...current, [row.requirementId]: !isCollapsed }))}
                    className="mt-2 rounded-xl border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                  >
                    {isCollapsed ? "Expand" : "Collapse"}
                  </button>
                </div>
              </div>

              {isCollapsed ? null : (
                <>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-200">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name={`score-${row.requirementId}`}
                        checked={draft.score === 0}
                        disabled={panel.deadlineLocked}
                        onChange={() => saveRow(row.requirementId, { ...draft, score: 0 })}
                      />
                      0
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name={`score-${row.requirementId}`}
                        checked={draft.score === 1}
                        disabled={panel.deadlineLocked}
                        onChange={() => saveRow(row.requirementId, { ...draft, score: 1 })}
                      />
                      1
                    </label>
                  </div>

                  <textarea
                    value={draft.comment}
                    onChange={(event) => saveRow(row.requirementId, { ...draft, comment: event.target.value })}
                    disabled={panel.deadlineLocked}
                    rows={2}
                    placeholder="Optional comment"
                    className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400 disabled:opacity-70"
                  />

                  {panel.deadlineLocked && row.amendedByDisplayName ? (
                    <p className="mt-2 text-xs text-slate-400">Amended by {row.amendedByDisplayName}</p>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={panel.deadlineLocked}
          className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          Submit
        </button>
      </section>
    </WorkspaceShell>
  );
}

export function ConsultantWorkspacePeoplePage({ companyId }: { companyId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; companyIds?: string[] }
    | undefined;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const people = useQuery((api as any).admin.listWorkspacePeople, isProtectedLoading || !companyId ? "skip" : { companyId }) as
    | Array<{ id: string; userId?: string | null; name: string; email: string; role: string; status: string; source: string; departmentId?: string | null; departmentName?: string | null }>
    | undefined;
  const departments = useQuery((api as any).admin.listWorkspaceDepartments, isProtectedLoading || !companyId ? "skip" : { companyId }) as
    | Array<{ departmentId: string; name: string; isActive?: boolean }>
    | undefined;

  const invitePerson = useMutation((api as any).admin.inviteWorkspacePerson);
  const cancelInvite = useMutation((api as any).admin.cancelWorkspaceInvite);
  const deactivatePerson = useMutation((api as any).admin.deactivateWorkspacePerson);
  const reactivatePerson = useMutation((api as any).admin.reactivateWorkspacePerson);
  const updateWorkspacePersonDepartment = useMutation((api as any).admin.updateWorkspacePersonDepartment);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "company-scorer" as "company-admin" | "company-scorer" | "vendor", departmentId: "" });
  const [departmentDrafts, setDepartmentDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (isProtectedLoading || access === undefined || companies === undefined || people === undefined || departments === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  const canManagePeople = access.isConsultant || access.role === "company-admin";
  if (!company || !canManagePeople) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  const members = people.filter((person) => person.source === "member");
  const invitations = people.filter((person) => person.source === "invite");
  const activeDepartments = departments.filter((department) => department.isActive !== false);

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = inviteForm.email.trim();
    if (!inviteForm.name.trim() || !trimmedEmail) {
      setNotice({ kind: "error", message: "Enter a name and email before inviting a person." });
      return;
    }
    if ((inviteForm.role === "company-admin" || inviteForm.role === "company-scorer") && !inviteForm.departmentId) {
      setNotice({ kind: "error", message: "Select a department before inviting a company admin or scorer." });
      return;
    }

    setBusy(true);
    try {
      await invitePerson({
        companyId: companyId as any,
        name: inviteForm.name.trim(),
        email: trimmedEmail,
        role: inviteForm.role,
        departmentId: inviteForm.role === "vendor" ? undefined : (inviteForm.departmentId as any),
      });
      setInviteForm({ name: "", email: "", role: "company-scorer", departmentId: "" });
      setNotice({ kind: "success", message: "Invite created. The person will be linked automatically on their next verified sign-in." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to invite this person." });
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateDepartment = async (person: { id: string; userId?: string | null; name: string; departmentId?: string | null; role: string }) => {
    if (!person.userId || person.role === "vendor") {
      return;
    }

    const nextDepartmentId = departmentDrafts[person.id] ?? person.departmentId ?? "";
    if (!nextDepartmentId) {
      setNotice({ kind: "error", message: "Select a department before saving." });
      return;
    }
    if (nextDepartmentId === person.departmentId) {
      return;
    }

    setBusy(true);
    try {
      await updateWorkspacePersonDepartment({ companyId: companyId as any, userId: person.userId, departmentId: nextDepartmentId as any });
      setNotice({ kind: "success", message: `Updated ${person.name}'s department.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to update department." });
    } finally {
      setBusy(false);
    }
  };

  const handleCancelInvite = async (person: { email: string; name: string }) => {
    const confirmed = window.confirm(`Cancel the pending invitation for ${person.email}?`);
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await cancelInvite({
        companyId: companyId as any,
        email: person.email,
      });
      setNotice({ kind: "success", message: `Cancelled the invitation for ${person.name} (${person.email}).` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to cancel this invite." });
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async (person: { email: string; userId?: string | null }) => {
    const confirmed = window.confirm(`Deactivate ${person.email} and remove their workspace access?`);
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await deactivatePerson({
        companyId: companyId as any,
        email: person.email,
        userId: person.userId ?? undefined,
      });
      setNotice({ kind: "success", message: `Deactivated ${person.email}. Score history stays intact.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to deactivate this person." });
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async (person: { email: string; userId?: string | null }) => {
    const confirmed = window.confirm(`Reactivate ${person.email} and restore their previous access?`);
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await reactivatePerson({
        companyId: companyId as any,
        email: person.email,
        userId: person.userId ?? undefined,
      });
      setNotice({ kind: "success", message: `Reactivated ${person.email}. Their previous access has been restored.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to reactivate this person." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkspaceShell
      workspace={{
        id: companyId,
        slug: companyId,
        name: company.name,
        isTestData: false,
        projects: [],
        people: [],
        vendors: [],
        requirements: [],
        scores: [],
      }}
      activeTab="people"
      breadcrumbs={[
        { label: "All workspaces", href: "/workspaces" },
        { label: company.name, href: `/workspaces/${companyId}` },
        { label: "People" },
      ]}
      role={access.isConsultant ? "consultant" : access.role === "company-admin" ? "company-admin" : "company-scorer"}
      userEmail={access.email ?? user?.email ?? "Unknown"}
      showConsultantLinks={Boolean(access.isConsultant)}
    >
      <div className="space-y-6">
        {notice ? (
          <div className={`rounded-2xl border p-4 text-sm ${notice.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-rose-500/40 bg-rose-500/10 text-rose-100"}`}>
            {notice.message}
          </div>
        ) : null}

        {canManagePeople ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Invite a person</h2>
            <form onSubmit={handleInvite} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_180px_220px_auto]">
              <input
                value={inviteForm.name}
                onChange={(event) => setInviteForm((current) => ({ ...current, name: event.target.value }))}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                placeholder="Full name"
              />
              <input
                value={inviteForm.email}
                onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                placeholder="person@example.com"
              />
              <select
                value={inviteForm.role}
                onChange={(event) => setInviteForm((current) => ({
                  ...current,
                  role: event.target.value as "company-admin" | "company-scorer" | "vendor",
                  departmentId: event.target.value === "vendor" ? "" : current.departmentId,
                }))}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
              >
                <option value="company-admin">Company admin</option>
                <option value="company-scorer">Company scorer</option>
                <option value="vendor">Vendor</option>
              </select>
              <select
                value={inviteForm.departmentId}
                onChange={(event) => setInviteForm((current) => ({ ...current, departmentId: event.target.value }))}
                disabled={inviteForm.role === "vendor"}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400 disabled:opacity-60"
              >
                <option value="">Select department</option>
                {activeDepartments.map((department) => (
                  <option key={department.departmentId} value={department.departmentId}>{department.name}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60"
              >
                Invite
              </button>
            </form>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">People</h2>
            <StatusPill label={`${members.length} people`} className="border-sky-500/40 bg-sky-500/10 text-sky-200" />
          </div>

          {members.length === 0 ? (
            <p className="text-sm text-slate-400">No workspace members yet.</p>
          ) : (
            <div className="space-y-3">
              {members.map((person) => (
                <div key={person.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-white" title={person.name}>{person.name}</p>
                      <p className="truncate text-sm text-slate-400" title={person.email}>{person.email}</p>
                      {person.role !== "vendor" ? <p className="mt-1 text-xs text-slate-400">Department: {person.departmentName ?? "Not set"}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill
                        label={person.status === "deactivated" ? "Deactivated" : "Active"}
                        className={
                          person.status === "active"
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                            : "border-amber-500/50 bg-amber-500/10 text-amber-200"
                        }
                      />
                      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                        {person.role}
                      </span>
                    </div>
                  </div>

                  {person.status === "active" && person.userId && person.role !== "vendor" ? (
                    <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                      <select
                        value={departmentDrafts[person.id] ?? person.departmentId ?? ""}
                        onChange={(event) => setDepartmentDrafts((current) => ({ ...current, [person.id]: event.target.value }))}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                      >
                        <option value="">Select department</option>
                        {activeDepartments.map((department) => (
                          <option key={department.departmentId} value={department.departmentId}>{department.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleUpdateDepartment(person)}
                        disabled={busy}
                        className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:border-sky-400 disabled:opacity-60"
                      >
                        Save department
                      </button>
                    </div>
                  ) : null}

                  {person.status === "active" && person.userId ? (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleDeactivate(person)}
                        disabled={busy}
                        className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:border-rose-400 disabled:opacity-60"
                      >
                        Deactivate
                      </button>
                    </div>
                  ) : null}

                  {person.status === "deactivated" && person.userId ? (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleReactivate(person)}
                        disabled={busy}
                        className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 hover:border-emerald-400 disabled:opacity-60"
                      >
                        Reactivate
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {invitations.length > 0 ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Invitations</h2>
              <StatusPill label={`${invitations.length} pending`} className="border-sky-500/40 bg-sky-500/10 text-sky-200" />
            </div>

            <div className="space-y-3">
              {invitations.map((person) => (
                <div key={person.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-white" title={person.name}>{person.name}</p>
                      <p className="truncate text-sm text-slate-400" title={person.email}>{person.email}</p>
                      {person.role !== "vendor" ? <p className="mt-1 text-xs text-slate-400">Department: {person.departmentName ?? "Not set"}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill
                        label={person.status === "cancelled" ? "Cancelled" : person.status === "expired" ? "Expired" : "Invited"}
                        className={
                          person.status === "cancelled" || person.status === "expired"
                            ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                            : "border-sky-500/40 bg-sky-500/10 text-sky-200"
                        }
                      />
                      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                        {person.role}
                      </span>
                    </div>
                  </div>

                  {person.status === "invited" ? (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleCancelInvite(person)}
                        disabled={busy}
                        className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:border-rose-400 disabled:opacity-60"
                      >
                        Cancel invitation
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}

export function ConsultantWorkspaceVendorContactsPage({ companyId, vendorId }: { companyId: string; vendorId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as any;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const vendors = useQuery((api as any).admin.listWorkspaceVendors, isProtectedLoading || !companyId ? "skip" : { companyId }) as
    | Array<{ vendorId: string; name: string; contactEmail: string | null; status: string; contactCount: number }>
    | undefined;
  const contacts = useQuery((api as any).admin.listVendorContacts, isProtectedLoading || !companyId || !vendorId ? "skip" : { companyId, vendorId }) as
    | Array<{ id: string; userId?: string | null; name: string; email: string; role: string; status: string; source: string }>
    | undefined;

  const invitePerson = useMutation((api as any).admin.inviteVendorContact);
  const cancelInvite = useMutation((api as any).admin.cancelVendorContactInvite);
  const deactivateContact = useMutation((api as any).admin.deactivateVendorContact);
  const reactivateContact = useMutation((api as any).admin.reactivateVendorContact);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (isProtectedLoading || access === undefined || companies === undefined || contacts === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  const canManage = access.isConsultant || access.role === "company-admin";
  if (!company || !canManage) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = contactName.trim();
    const email = contactEmail.trim();
    if (!name || !email) {
      setNotice({ kind: "error", message: "Add both a name and email for the vendor contact." });
      return;
    }

    setBusy(true);
    try {
      await invitePerson({ companyId: companyId as any, vendorId: vendorId as any, name, email });
      setContactName("");
      setContactEmail("");
      setNotice({ kind: "success", message: `Invited ${name} to this vendor organization.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Invite failed." });
    } finally {
      setBusy(false);
    }
  };

  const handleCancelInvite = async (entry: { email: string }) => {
    setBusy(true);
    try {
      await cancelInvite({ companyId: companyId as any, vendorId: vendorId as any, email: entry.email });
      setNotice({ kind: "success", message: `Cancelled the invite for ${entry.email}.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to cancel the invite." });
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async (entry: { userId: string | null; name: string }) => {
    if (!entry.userId) {
      return;
    }

    const confirmed = window.confirm(`Deactivate ${entry.name}?`);
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await deactivateContact({ companyId: companyId as any, vendorId: vendorId as any, userId: entry.userId });
      setNotice({ kind: "success", message: `${entry.name} has been deactivated.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to deactivate this person." });
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async (entry: { userId: string | null; name: string }) => {
    if (!entry.userId) {
      return;
    }

    const confirmed = window.confirm(`Reactivate ${entry.name}?`);
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await reactivateContact({ companyId: companyId as any, vendorId: vendorId as any, userId: entry.userId });
      setNotice({ kind: "success", message: `${entry.name} has been reactivated.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to reactivate this person." });
    } finally {
      setBusy(false);
    }
  };

  const activeContacts = contacts.filter((entry) => entry.status === "active");
  const invitedContacts = contacts.filter((entry) => entry.status !== "active" && entry.source === "invite");
  const vendorName = vendors?.find((vendor) => vendor.vendorId === vendorId)?.name ?? "Vendor contact";

  return (
    <WorkspaceShell
      workspace={{
        id: companyId,
        slug: companyId,
        name: company.name,
        isTestData: false,
        projects: [],
        people: [],
        vendors: [],
        requirements: [],
        scores: [],
      }}
      activeTab="vendors"
      breadcrumbs={[
        { label: "All workspaces", href: "/workspaces" },
        { label: company.name, href: `/workspaces/${companyId}` },
        { label: "Vendors", href: `/workspaces/${companyId}/vendors` },
        { label: vendorName },
      ]}
      role={access.isConsultant ? "consultant" : access.role === "company-admin" ? "company-admin" : "company-scorer"}
      userEmail={access.email ?? user?.email ?? "Unknown"}
      showConsultantLinks={Boolean(access.isConsultant)}
    >
      <div className="space-y-6">
        {notice ? (
          <div className={`rounded-2xl border p-4 text-sm ${notice.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-rose-500/40 bg-rose-500/10 text-rose-100"}`}>
            {notice.message}
          </div>
        ) : null}

        <form onSubmit={handleInvite} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <input value={contactName} onChange={(event) => setContactName(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" placeholder="Contact name" />
            <input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" placeholder="Contact email" type="email" />
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={busy} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60">Invite contact</button>
          </div>
        </form>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Active contacts</h2>
            <div className="mt-4 space-y-3">
              {activeContacts.length === 0 ? <p className="text-sm text-slate-400">No active contacts yet.</p> : null}
              {activeContacts.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white" title={entry.name}>{entry.name}</p>
                      <p className="truncate text-sm text-slate-400" title={entry.email}>{entry.email}</p>
                    </div>
                    <button type="button" onClick={() => void handleDeactivate(entry as any)} className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">Deactivate</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Pending invites</h2>
            <div className="mt-4 space-y-3">
              {invitedContacts.length === 0 ? <p className="text-sm text-slate-400">No pending invites.</p> : null}
              {invitedContacts.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white" title={entry.name}>{entry.name}</p>
                      <p className="truncate text-sm text-slate-400" title={entry.email}>{entry.email}</p>
                    </div>
                    <button type="button" onClick={() => void handleCancelInvite(entry as any)} className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </WorkspaceShell>
  );
}

export function ConsultantWorkspaceVendorsPage({ companyId }: { companyId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as any;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const canManage = Boolean(access?.isConsultant || access?.role === "company-admin");
  const showVendorHome = Boolean(access?.isVendor && access.vendorId);
  const vendors = useQuery((api as any).admin.listWorkspaceVendors, isProtectedLoading || !companyId || !(canManage || showVendorHome) ? "skip" : { companyId }) as
    | Array<{ vendorId: string; name: string; contactEmail: string | null; status: string; contactCount: number }>
    | undefined;
  const vendorProjects = useQuery(
    api.access.listProjectsForCompany,
    isProtectedLoading || !companyId || !showVendorHome ? "skip" : { companyId: companyId as any },
  ) as Array<{ _id: string; name: string; description?: string | null; vendorDeadline?: number | null; status: "draft" | "active" }> | undefined;

  const createVendor = useMutation((api as any).admin.addWorkspaceVendor);
  const updateVendor = useMutation((api as any).admin.updateWorkspaceVendor);
  const deactivateVendor = useMutation((api as any).admin.deactivateWorkspaceVendor);
  const reactivateVendor = useMutation((api as any).admin.reactivateWorkspaceVendor);
  const [vendorName, setVendorName] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (isProtectedLoading || access === undefined || companies === undefined || (showVendorHome && vendorProjects === undefined)) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  if (!company && !access.isConsultant) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  if (showVendorHome) {
    const vendorNameText = (vendors ?? []).find((vendor) => vendor.vendorId === access.vendorId)?.name ?? "Vendor organisation";
    const companyName = company?.name ?? "Unknown workspace";
    return (
      <WorkspaceShell
        workspace={{
          id: companyId,
          slug: companyId,
          name: companyName,
          isTestData: false,
          projects: [],
          people: [],
          vendors: [],
          requirements: [],
          scores: [],
        }}
        activeTab="vendors"
        breadcrumbs={[
          { label: "All workspaces", href: "/workspaces" },
          { label: companyName, href: `/workspaces/${companyId}` },
          { label: "Vendors" },
        ]}
        role="vendor"
        userEmail={access.email ?? user?.email ?? "Unknown"}
        showConsultantLinks={false}
      >
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Vendor home</p>
          <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl" title={vendorNameText}>{vendorNameText}</h1>
          <p className="mt-2 text-base text-slate-300">Working with {companyName}</p>

          <div className="mt-6 space-y-3">
            {vendorProjects && vendorProjects.length > 0 ? (
              vendorProjects.map((project) => (
                <div key={project._id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-white">{project.name}</p>
                      <p className="text-sm text-slate-400">{project.description || "No description added yet."}</p>
                    </div>
                    {project.vendorDeadline ? (
                      <StatusPill label={`Vendor due ${new Date(project.vendorDeadline).toLocaleDateString()}`} className="border-amber-500/50 bg-amber-500/10 text-amber-200" />
                    ) : null}
                  </div>
                  <div className="mt-3 flex gap-3">
                    <Link href={`/workspaces/${companyId}/projects/${project._id}`} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
                      Open project
                    </Link>
                    <Link href={`/workspaces/${companyId}/projects/${project._id}/answer-requirements`} className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:border-sky-400">
                      Score requirements
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                No projects assigned yet.
              </div>
            )}
          </div>
        </div>
      </WorkspaceShell>
    );
  }

  const handleCreateVendor = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = vendorName.trim();
    if (!name) {
      setNotice({ kind: "error", message: "Enter a vendor organisation name before saving." });
      return;
    }

    setBusy(true);
    try {
      await createVendor({ companyId: companyId as any, name, contactEmail: vendorEmail || undefined });
      setVendorName("");
      setVendorEmail("");
      setNotice({ kind: "success", message: `Created ${name}.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to create the vendor organisation." });
    } finally {
      setBusy(false);
    }
  };

  const toggleVendor = async (vendor: { vendorId: string; status: string; name: string }, nextStatus: "active" | "deactivated") => {
    setBusy(true);
    try {
      if (nextStatus === "deactivated") {
        await deactivateVendor({ companyId: companyId as any, vendorId: vendor.vendorId as any });
        setNotice({ kind: "success", message: `${vendor.name} is deactivated.` });
      } else {
        await reactivateVendor({ companyId: companyId as any, vendorId: vendor.vendorId as any });
        setNotice({ kind: "success", message: `${vendor.name} is active again.` });
      }
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to update the vendor organization." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkspaceShell
      workspace={{
        id: companyId,
        slug: companyId,
        name: company.name,
        isTestData: false,
        projects: [],
        people: [],
        vendors: [],
        requirements: [],
        scores: [],
      }}
      activeTab="vendors"
      breadcrumbs={[
        { label: "All workspaces", href: "/workspaces" },
        { label: company.name, href: `/workspaces/${companyId}` },
        { label: "Vendors" },
      ]}
      role={access.isConsultant ? "consultant" : access.role === "company-admin" ? "company-admin" : "company-scorer"}
      userEmail={access.email ?? user?.email ?? "Unknown"}
      showConsultantLinks={Boolean(access.isConsultant)}
    >
      <div className="space-y-6">
        {notice ? (
          <div className={`rounded-2xl border p-4 text-sm ${notice.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-rose-500/40 bg-rose-500/10 text-rose-100"}`}>
            {notice.message}
          </div>
        ) : null}

        {canManage ? (
          <form onSubmit={handleCreateVendor} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <input value={vendorName} onChange={(event) => setVendorName(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" placeholder="Vendor organisation name" />
              <input value={vendorEmail} onChange={(event) => setVendorEmail(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" placeholder="Primary contact email" type="email" />
            </div>
            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={busy} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60">Add vendor organisation</button>
            </div>
          </form>
        ) : null}

        <div className="space-y-4">
          {vendors && vendors.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">No vendor organisations are configured yet for this workspace.</div>
          ) : null}

          {vendors && vendors.map((vendor) => (
            <div key={vendor.vendorId} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h2 className="truncate text-lg font-semibold text-white" title={vendor.name}>{vendor.name}</h2>
                    <StatusPill label={vendor.status === "deactivated" ? "Deactivated" : "Active"} className={vendor.status === "deactivated" ? "border-rose-500/40 bg-rose-500/10 text-rose-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"} />
                  </div>
                  {vendor.contactEmail ? <p className="mt-2 truncate text-sm text-slate-400" title={vendor.contactEmail}>Primary contact: {vendor.contactEmail}</p> : null}
                </div>

                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/workspaces/${companyId}/vendors/${vendor.vendorId}/contacts`} className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:border-sky-400">Manage contacts</Link>
                    <button type="button" onClick={() => void toggleVendor(vendor as any, vendor.status === "active" ? "deactivated" : "active")} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
                      {vendor.status === "active" ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </WorkspaceShell>
  );
}

export function ConsultantWorkspaceRequirementsPage({ companyId }: { companyId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; companyIds?: string[] }
    | undefined;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const summaries = useQuery((api as any).access.listWorkspaceRequirementsSummary, isProtectedLoading ? "skip" : { companyId: companyId as any }) as
    | Array<{ projectId: string; projectName: string; activeCount: number; withdrawnCount: number; outOfScopeCount: number }>
    | undefined;

  if (isProtectedLoading || access === undefined || companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  if (!company && !access.isConsultant) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  return (
    <WorkspaceShell
      workspace={{
        id: companyId,
        slug: companyId,
        name: company?.name ?? "Workspace",
        isTestData: false,
        projects: [],
        people: [],
        vendors: [],
        requirements: [],
        scores: [],
      }}
      activeTab="requirements"
      breadcrumbs={[
        { label: "All workspaces", href: "/workspaces" },
        { label: company?.name ?? "Workspace", href: `/workspaces/${companyId}` },
        { label: "Requirements" },
      ]}
      role={access.isConsultant ? "consultant" : access.role === "company-admin" ? "company-admin" : "company-scorer"}
      userEmail={access.email ?? user?.email ?? "Unknown"}
      showConsultantLinks={Boolean(access.isConsultant)}
    >
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Requirements by project</h2>
          <StatusPill label={`${summaries?.length ?? 0} projects`} className="border-slate-700 bg-slate-900 text-slate-200" />
        </div>

        {summaries === undefined ? (
          <p className="text-sm text-slate-400">Loading requirement summaries...</p>
        ) : summaries.length === 0 ? (
          <p className="text-sm text-slate-400">No visible projects yet for this workspace.</p>
        ) : (
          <div className="space-y-3">
            {summaries.map((summary) => (
              <div key={summary.projectId} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-white">{summary.projectName}</h3>
                  <Link
                    href={`/workspaces/${companyId}/projects/${summary.projectId}`}
                    className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200 hover:border-sky-400"
                  >
                    Open project
                  </Link>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <StatusPill label={`${summary.activeCount} active`} className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200" />
                  <StatusPill label={`${summary.withdrawnCount} withdrawn`} className="border-amber-500/40 bg-amber-500/10 text-amber-200" />
                  <StatusPill label={`${summary.outOfScopeCount} out of scope`} className="border-slate-700 bg-slate-900 text-slate-200" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}

export function ConsultantWorkspaceScoringPage({ companyId }: { companyId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; companyIds?: string[] }
    | undefined;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const summaries = useQuery((api as any).access.listWorkspaceScoringSummary, isProtectedLoading ? "skip" : { companyId: companyId as any }) as
    | Array<{
      projectId: string;
      projectName: string;
      submittedVendors: number;
      totalVendors: number;
      completedScorerVendorPairs: number;
      totalScorerVendorPairs: number;
    }>
    | undefined;

  if (isProtectedLoading || access === undefined || companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  if (!company && !access.isConsultant) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  return (
    <WorkspaceShell
      workspace={{
        id: companyId,
        slug: companyId,
        name: company?.name ?? "Workspace",
        isTestData: false,
        projects: [],
        people: [],
        vendors: [],
        requirements: [],
        scores: [],
      }}
      activeTab="scoring"
      breadcrumbs={[
        { label: "All workspaces", href: "/workspaces" },
        { label: company?.name ?? "Workspace", href: `/workspaces/${companyId}` },
        { label: "Scoring" },
      ]}
      role={access.isConsultant ? "consultant" : access.role === "company-admin" ? "company-admin" : "company-scorer"}
      userEmail={access.email ?? user?.email ?? "Unknown"}
      showConsultantLinks={Boolean(access.isConsultant)}
    >
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Scoring progress by project</h2>
          <StatusPill label={`${summaries?.length ?? 0} projects`} className="border-slate-700 bg-slate-900 text-slate-200" />
        </div>

        {summaries === undefined ? (
          <p className="text-sm text-slate-400">Loading scoring summaries...</p>
        ) : summaries.length === 0 ? (
          <p className="text-sm text-slate-400">No visible projects yet for this workspace.</p>
        ) : (
          <div className="space-y-3">
            {summaries.map((summary) => (
              <div key={summary.projectId} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-white">{summary.projectName}</h3>
                  <Link
                    href={`/workspaces/${companyId}/projects/${summary.projectId}`}
                    className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200 hover:border-sky-400"
                  >
                    Open project
                  </Link>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <StatusPill label={`${summary.submittedVendors} / ${summary.totalVendors} vendors submitted`} className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200" />
                  <StatusPill label={`${summary.completedScorerVendorPairs} / ${summary.totalScorerVendorPairs} scorer completions`} className="border-sky-500/40 bg-sky-500/10 text-sky-200" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}
