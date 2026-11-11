"use client";

import Link from "next/link";
import { useState } from "react";
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

type CompanyId = Id<"companies">;

function StatusPill({ label, className = "border-slate-700 bg-slate-800 text-slate-200" }: { label: string; className?: string }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${className}`}>
      {label}
    </span>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm shadow-slate-950/20">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{helper}</p>
    </div>
  );
}

function WorkspaceShell({
  workspace,
  activeTab,
  children,
}: {
  workspace: WorkspaceShellWorkspace;
  activeTab: "overview" | "projects" | "people" | "vendors" | "requirements" | "scoring";
  children: React.ReactNode;
}) {
  const tabs = [
    { key: "overview", label: "Overview", href: `/workspaces/${workspace.slug}` },
    { key: "projects", label: "Projects", href: `/workspaces/${workspace.slug}/projects` },
    { key: "people", label: "People", href: `/workspaces/${workspace.slug}/people` },
    { key: "vendors", label: "Vendors", href: `/workspaces/${workspace.slug}/vendors` },
    { key: "requirements", label: "Requirements", href: `/workspaces/${workspace.slug}/requirements` },
    { key: "scoring", label: "Scoring", href: `/workspaces/${workspace.slug}/scoring` },
  ] as const;

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="w-80 shrink-0 border-r border-slate-800 bg-slate-950/90 p-5">
        <div className="mb-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Authorized</p>
          <h2 className="mt-3 text-xl font-semibold text-white">Workspace directory</h2>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Company</p>
          <div className="mt-3 space-y-2">
            <div className="rounded-xl border border-sky-500 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">{workspace.name}</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Workspace actions</p>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <Link href="/workspaces" className="block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 hover:border-slate-500">
              Consultant home
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
      </aside>

      <main className="flex-1">
        <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Workspace landing</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">{workspace.name}</h1>
            </div>
            <div className="flex items-center gap-3">
              {workspace.isTestData ? <StatusPill label="TEST" className="border-rose-500/50 bg-rose-500/10 text-rose-200" /> : null}
            </div>
          </div>
        </header>

        <div className="space-y-6 p-6">
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

  const consultantWorkspaces = useQuery(
    api.admin.listWorkspacesForConsultant,
    isProtectedLoading || !access?.isConsultant ? "skip" : {},
  ) as Array<{ _id: CompanyId; name: string; isTestData?: boolean; isActive?: boolean }> | undefined;

  if (isProtectedLoading || access === undefined || companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
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
            <div key={company._id} className="block rounded-2xl border border-slate-800 bg-slate-900 p-5">
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

              {access.isConsultant ? (
                <div className="relative mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOpenActionsWorkspaceId((current) => (current === company._id ? null : company._id))}
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
        workspaceName?: string | null;
        companyId?: string | null;
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
                      <span className="text-sm font-medium text-white">{log.workspaceName ?? "Deleted workspace"}</span>
                    </div>
                    <span className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{log.details}</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                    {log.companyId ? <span>Company: {log.companyId}</span> : null}
                    {log.actorEmail ? <span>Actor: {log.actorEmail}</span> : null}
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

  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; companyIds?: string[] }
    | undefined;

  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;

  if (isProtectedLoading || access === undefined || companies === undefined) {
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
    projects: [],
    people: [],
    vendors: [],
    requirements: [],
    scores: [],
  };

  return (
    <WorkspaceShell
      workspace={workspace}
      activeTab="overview"
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Company" value={workspace.name} helper="Visible via Convex access" />
        <StatCard label="Role" value={access.isConsultant ? "VS Consultant" : access.role ?? "User"} helper="Server role" />
        <StatCard label="Email" value={access.email ?? user?.email ?? "Unknown"} helper="Signed-in user" />
        <StatCard label="Company ID" value={workspace.id} helper="Authorized workspace" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Project dashboard</h2>
            <Link href={`/workspaces/${workspace.slug}/projects`} className="text-sm text-sky-300 hover:text-sky-200">
              View all projects
            </Link>
          </div>

          <div className="space-y-3">
            {workspace.projects.map((project) => (
              <div key={project.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-medium text-white">{project.name}</p>
                    <p className="mt-1 text-sm text-slate-400">{project.vendorCount} vendors • {project.scorerCount} scorers</p>
                  </div>
                  <StatusPill label={project.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-white">Workspace actions</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <Link href={`/workspaces/${workspace.slug}/projects`} className="block rounded-xl border border-slate-800 bg-slate-950/50 p-3 hover:border-slate-700">
              Add project
            </Link>
            <Link href={`/workspaces/${workspace.slug}/people`} className="block rounded-xl border border-slate-800 bg-slate-950/50 p-3 hover:border-slate-700">
              Manage people and teams
            </Link>
            <Link href={`/workspaces/${workspace.slug}/vendors`} className="block rounded-xl border border-slate-800 bg-slate-950/50 p-3 hover:border-slate-700">
              Manage vendors
            </Link>
            <Link href={`/workspaces/${workspace.slug}/requirements`} className="block rounded-xl border border-slate-800 bg-slate-950/50 p-3 hover:border-slate-700">
              Upload requirements
            </Link>
          </div>
        </div>
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

  if (isProtectedLoading || access === undefined || companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  if (!company && !access.isConsultant) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <h1 className="text-2xl font-semibold text-white">Projects</h1>
      <p className="mt-3 text-slate-300">Authorized company: {company?.name ?? "Consultant view"}</p>
      <p className="mt-2 text-sm text-slate-400">This page is filtered by the server’s access checks and does not use hardcoded company data.</p>
    </div>
  );
}

export function ConsultantWorkspaceProjectDetailPage({ companyId, projectId }: { companyId: string; projectId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; companyIds?: string[] }
    | undefined;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;

  if (isProtectedLoading || access === undefined || companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  if (!company && !access.isConsultant) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <h1 className="text-2xl font-semibold text-white">Project detail</h1>
      <p className="mt-3 text-slate-300">Company: {company?.name ?? "Consultant view"}</p>
      <p className="mt-2 text-sm text-slate-400">Project ID: {projectId}</p>
    </div>
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
    | Array<{ id: string; userId?: string | null; name: string; email: string; role: string; status: string; source: string }>
    | undefined;

  const invitePerson = useMutation((api as any).admin.inviteWorkspacePerson);
  const deactivatePerson = useMutation((api as any).admin.deactivateWorkspacePerson);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "company-scorer" as "company-admin" | "company-scorer" | "vendor" });
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (isProtectedLoading || access === undefined || companies === undefined || people === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  const canManagePeople = access.isConsultant || access.role === "company-admin";
  if (!company || !canManagePeople) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = inviteForm.email.trim();
    if (!inviteForm.name.trim() || !trimmedEmail) {
      setNotice({ kind: "error", message: "Enter a name and email before inviting a person." });
      return;
    }

    setBusy(true);
    try {
      await invitePerson({
        companyId: companyId as any,
        name: inviteForm.name.trim(),
        email: trimmedEmail,
        role: inviteForm.role,
      });
      setInviteForm({ name: "", email: "", role: "company-scorer" });
      setNotice({ kind: "success", message: "Invite created. The person will be linked automatically on their next verified sign-in." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to invite this person." });
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async (person: { email: string; userId?: string | null }) => {
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

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-sky-300">Workspace people</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">{company.name}</h1>
          </div>
          <Link href={`/workspaces/${companyId}`} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-slate-500">
            Back to workspace
          </Link>
        </div>

        {notice ? (
          <div className={`rounded-2xl border p-4 text-sm ${notice.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-rose-500/40 bg-rose-500/10 text-rose-100"}`}>
            {notice.message}
          </div>
        ) : null}

        {canManagePeople ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Invite a person</h2>
            <form onSubmit={handleInvite} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]">
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
                onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value as "company-admin" | "company-scorer" | "vendor" }))}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
              >
                <option value="company-admin">Company admin</option>
                <option value="company-scorer">Company scorer</option>
                <option value="vendor">Vendor</option>
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
            <h2 className="text-lg font-semibold text-white">People and invite status</h2>
            <StatusPill label={`${people.length} records`} className="border-sky-500/40 bg-sky-500/10 text-sky-200" />
          </div>

          {people.length === 0 ? (
            <p className="text-sm text-slate-400">No people or invitations yet.</p>
          ) : (
            <div className="space-y-3">
              {people.map((person) => (
                <div key={person.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-medium text-white">{person.name}</p>
                      <p className="text-sm text-slate-400">{person.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill
                        label={person.status}
                        className={
                          person.status === "active"
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                            : person.status === "deactivated"
                              ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                              : "border-sky-500/40 bg-sky-500/10 text-sky-200"
                        }
                      />
                      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                        {person.role}
                      </span>
                    </div>
                  </div>

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
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function ConsultantWorkspaceVendorsPage({ companyId }: { companyId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; companyIds?: string[] }
    | undefined;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;

  if (isProtectedLoading || access === undefined || companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  if (!company && !access.isConsultant) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <h1 className="text-2xl font-semibold text-white">Vendors</h1>
      <p className="mt-3 text-slate-300">Authorized company: {company?.name ?? "Consultant view"}</p>
    </div>
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

  if (isProtectedLoading || access === undefined || companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  if (!company && !access.isConsultant) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <h1 className="text-2xl font-semibold text-white">Requirements</h1>
      <p className="mt-3 text-slate-300">Authorized company: {company?.name ?? "Consultant view"}</p>
    </div>
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

  if (isProtectedLoading || access === undefined || companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  if (!company && !access.isConsultant) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <h1 className="text-2xl font-semibold text-white">Scoring</h1>
      <p className="mt-3 text-slate-300">Authorized company: {company?.name ?? "Consultant view"}</p>
    </div>
  );
}
