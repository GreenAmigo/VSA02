"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

function WorkspaceShell({
  workspace,
  activeTab,
  breadcrumbs,
  role = "consultant",
  userEmail,
  showConsultantLinks = true,
  children,
}: {
  workspace: WorkspaceShellWorkspace;
  activeTab: "overview" | "projects" | "people" | "departments" | "vendors" | "requirements" | "scoring";
  breadcrumbs?: WorkspaceBreadcrumb[];
  role?: WorkspaceRole;
  userEmail?: string | null;
  showConsultantLinks?: boolean;
  children: React.ReactNode;
}) {
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
    vendor: [],
  };

  const tabs = tabsByRole[role ?? "consultant"] ?? tabsByRole.consultant;
  const roleLabel =
    role === "consultant" ? "VS Consultant" : role === "company-admin" ? "Company admin" : role === "company-scorer" ? "Company scorer" : "Vendor";

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

        {role === "consultant" || showConsultantLinks ? (
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
      </aside>

      <main className="flex-1">
        <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              {breadcrumbs && breadcrumbs.length > 0 ? <WorkspaceBreadcrumbs items={breadcrumbs} /> : null}
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

  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as any;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const projects = useQuery(api.access.listProjectsForCompany, isProtectedLoading || !companyId ? "skip" : { companyId: companyId as any }) as
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
      breadcrumbs={[
        { label: "All workspaces", href: "/workspaces" },
        { label: workspace.name },
      ]}
      role={access.isConsultant ? "consultant" : access.isVendor ? "vendor" : access.role === "company-admin" ? "company-admin" : access.role === "company-scorer" ? "company-scorer" : "company-admin"}
      userEmail={access.email ?? user?.email ?? "Unknown"}
      showConsultantLinks={Boolean(access.isConsultant)}
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
    </WorkspaceShell>
  );
}

export function ConsultantWorkspaceDepartmentsPage({ companyId }: { companyId: string }) {
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
  const departments = useQuery((api as any).admin.listWorkspaceDepartments, isProtectedLoading || !companyId ? "skip" : { companyId }) as
    | Array<{ departmentId: string; name: string; members: Array<{ userId: string; displayName: string; email?: string | null; role?: string }> }>
    | undefined;

  const createDepartment = useMutation((api as any).admin.createWorkspaceDepartment);
  const addDepartmentMember = useMutation((api as any).admin.addWorkspaceDepartmentMember);
  const removeDepartmentMember = useMutation((api as any).admin.removeWorkspaceDepartmentMember);
  const [departmentName, setDepartmentName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Record<string, string>>({});
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

  const workspace = {
    id: companyId,
    slug: companyId,
    name: company.name,
    isTestData: false,
    projects: [],
    people: people.map((person) => ({ id: person.id, name: person.name })),
    vendors: [],
    requirements: [],
    scores: [],
  };

  const activeWorkspaceMembers = people.filter((person) => person.status === "active" && person.userId);

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

  const handleAddMember = async (departmentId: string) => {
    const userId = selectedMembers[departmentId];
    if (!userId) {
      setNotice({ kind: "error", message: "Choose a person to add to the department." });
      return;
    }

    setBusy(true);
    try {
      await addDepartmentMember({ companyId: companyId as any, departmentId: departmentId as any, userId });
      setSelectedMembers((current) => ({ ...current, [departmentId]: "" }));
      setNotice({ kind: "success", message: "Member added to the department." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to add the member." });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (departmentId: string, userId: string) => {
    const confirmed = window.confirm("Remove this person from the department?");
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await removeDepartmentMember({ companyId: companyId as any, departmentId: departmentId as any, userId });
      setNotice({ kind: "success", message: "Member removed from the department." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to remove the member." });
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
          <StatusPill label={`${departments.length} groups`} className="border-sky-500/40 bg-sky-500/10 text-sky-200" />
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

        {departments.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
            No department groups are configured yet for this workspace.
          </div>
        ) : (
          <div className="space-y-4">
            {departments.map((department) => {
              const availableMembers = activeWorkspaceMembers.filter(
                (person) => !department.members.some((member) => member.userId === person.userId),
              );

              return (
                <div key={department.departmentId} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-white">{department.name}</h3>
                    <StatusPill label={`${department.members.length} members`} className="border-slate-700 bg-slate-900 text-slate-200" />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {department.members.length === 0 ? (
                      <span className="text-sm text-slate-400">No members assigned yet.</span>
                    ) : (
                      department.members.map((member) => (
                        <div key={`${department.departmentId}-${member.userId}`} className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200">
                          <span>{member.displayName}</span>
                          {canManagePeople ? (
                            <button
                              type="button"
                              onClick={() => void handleRemoveMember(department.departmentId, member.userId)}
                              className="text-rose-300 hover:text-rose-200"
                              aria-label={`Remove ${member.displayName} from ${department.name}`}
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>

                  {canManagePeople && availableMembers.length > 0 ? (
                    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 md:flex-row md:items-center">
                      <select
                        value={selectedMembers[department.departmentId] ?? ""}
                        onChange={(event) => setSelectedMembers((current) => ({ ...current, [department.departmentId]: event.target.value }))}
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-sky-400"
                      >
                        <option value="">Choose a person</option>
                        {availableMembers.map((person) => (
                          <option key={person.id} value={person.userId ?? ""}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleAddMember(department.departmentId)}
                        disabled={busy || !selectedMembers[department.departmentId]}
                        className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:border-sky-400 disabled:opacity-60"
                      >
                        Add member
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
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
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; companyIds?: string[] }
    | undefined;
  const canManageWorkspace = Boolean(access && (access.isConsultant || access.role === "company-admin"));
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const project = useQuery(api.access.getProject, isProtectedLoading || !projectId ? "skip" : { projectId: projectId as any }) as
    | { _id: string; companyId: string; name: string; description?: string | null; vendorDeadline?: number | null; scorerDeadline?: number | null; status: "draft" | "active"; createdAt?: number }
    | undefined;
  const projectMembers = useQuery(api.admin.listProjectMembers, isProtectedLoading || !projectId ? "skip" : { projectId: projectId as any }) as
    | Array<{ _id: string; projectId: string; userId: string; role: string; displayName: string; isActive: boolean; createdAt?: number }>
    | undefined;
  const requirements = useQuery(api.access.listProjectRequirements, isProtectedLoading || !projectId ? "skip" : { projectId: projectId as any }) as
    | Array<{ _id: string; requirementId: string; text: string; type?: string; priority?: number; status: "active" | "withdrawn" }>
    | undefined;
  const workspacePeople = useQuery((api as any).admin.listWorkspacePeople, isProtectedLoading || !companyId || !canManageWorkspace ? "skip" : { companyId }) as
    | Array<{ id: string; userId?: string | null; name: string; email: string; role: string; status: string; source: string }>
    | undefined;
  const departments = useQuery((api as any).admin.listWorkspaceDepartments, isProtectedLoading || !companyId || !canManageWorkspace ? "skip" : { companyId }) as
    | Array<{ departmentId: string; name: string; members: Array<{ userId: string; displayName: string; email?: string | null; role?: string }> }>
    | undefined;
  const workspaceVendors = useQuery((api as any).admin.listWorkspaceVendors, isProtectedLoading || !companyId || !canManageWorkspace ? "skip" : { companyId }) as
    | Array<{ vendorId: string; name: string; contactEmail?: string | null; status: string; contactCount?: number }>
    | undefined;
  const addProjectScorer = useMutation(api.admin.addProjectScorer);
  const addProjectVendor = useMutation(api.admin.addProjectVendor);
  const [scorerDraft, setScorerDraft] = useState({ selectedUserId: "", role: "individual" as "individual" | "department", departmentName: "" });
  const [vendorDraft, setVendorDraft] = useState({ selectedVendorId: "" });
  const [notice, setNotice] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (isProtectedLoading || access === undefined || companies === undefined || project === undefined || projectMembers === undefined || requirements === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  const canManageProjects = Boolean(access.isConsultant || access.role === "company-admin");
  const workspacePeopleList = canManageWorkspace ? (workspacePeople ?? []) : [];
  const departmentsList = canManageWorkspace ? (departments ?? []) : [];
  const workspaceVendorsList = canManageWorkspace ? (workspaceVendors ?? []) : [];
  const assignableScorers = workspacePeopleList.filter((person) => person.status === "active" && person.source === "member" && (person.role === "company-scorer" || person.role === "company-admin"));
  const assignableVendors = workspaceVendorsList.filter((vendor) => vendor.status === "active");
  const selectedScorer = assignableScorers.find((person) => person.id === scorerDraft.selectedUserId) ?? null;
  const selectedVendor = assignableVendors.find((vendor) => vendor.vendorId === vendorDraft.selectedVendorId) ?? null;
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
        displayName: selectedScorer.name.trim(),
        email: selectedScorer.email.trim(),
        role: scorerDraft.role,
        departmentName: scorerDraft.role === "department" ? scorerDraft.departmentName.trim() || undefined : undefined,
      });
      setScorerDraft({ selectedUserId: "", role: "individual", departmentName: "" });
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
        displayName: selectedVendor.name.trim(),
        email: selectedVendor.contactEmail?.trim() || `${selectedVendor.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}@workspace.local`,
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
      breadcrumbs={[
        { label: "All workspaces", href: "/workspaces" },
        { label: company.name, href: `/workspaces/${companyId}` },
        { label: "Projects", href: `/workspaces/${companyId}/projects` },
        { label: project.name },
      ]}
      role={access.isConsultant ? "consultant" : access.role === "company-admin" ? "company-admin" : access.role === "company-scorer" ? "company-scorer" : "vendor"}
      userEmail={access.email ?? user?.email ?? "Unknown"}
      showConsultantLinks={Boolean(access.isConsultant)}
    >
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Project</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{project.name}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label={project.status === "active" ? "Active" : "Draft"} />
            {project.vendorDeadline ? <StatusPill label={`Vendor due ${new Date(project.vendorDeadline).toLocaleDateString()}`} className="border-amber-500/50 bg-amber-500/10 text-amber-200" /> : null}
            {project.scorerDeadline ? <StatusPill label={`Scorer due ${new Date(project.scorerDeadline).toLocaleDateString()}`} className="border-violet-500/50 bg-violet-500/10 text-violet-200" /> : null}
          </div>
        </div>

        <p className="text-sm text-slate-300">{project.description || "No description for this project yet."}</p>
      </section>

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
                    <option key={person.id} value={person.id}>{person.name} — {person.email}</option>
                  ))}
                </select>
                <div className="flex gap-3">
                  <select
                    value={scorerDraft.role}
                    onChange={(event) => setScorerDraft((current) => ({ ...current, role: event.target.value as "individual" | "department" }))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                  >
                    <option value="individual">Individual</option>
                    <option value="department">Department</option>
                  </select>
                  {scorerDraft.role === "department" ? (
                    <select
                      value={scorerDraft.departmentName}
                      onChange={(event) => setScorerDraft((current) => ({ ...current, departmentName: event.target.value }))}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                    >
                      <option value="">Select a department</option>
                      {departmentsList.map((department) => (
                        <option key={department.departmentId} value={department.name}>{department.name}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
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

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Requirements</h3>
          <Link href={`/projects/${projectId}/requirements`} className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:border-sky-400">
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
    | Array<{ id: string; userId?: string | null; name: string; email: string; role: string; status: string; source: string }>
    | undefined;

  const invitePerson = useMutation((api as any).admin.inviteWorkspacePerson);
  const cancelInvite = useMutation((api as any).admin.cancelWorkspaceInvite);
  const deactivatePerson = useMutation((api as any).admin.deactivateWorkspacePerson);
  const reactivatePerson = useMutation((api as any).admin.reactivateWorkspacePerson);
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

  const members = people.filter((person) => person.source === "member");
  const invitations = people.filter((person) => person.source === "invite");

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
      <div className="mx-auto max-w-6xl space-y-6">
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
      <div className="mx-auto max-w-5xl space-y-6">
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

  const createVendor = useMutation((api as any).admin.addWorkspaceVendor);
  const updateVendor = useMutation((api as any).admin.updateWorkspaceVendor);
  const deactivateVendor = useMutation((api as any).admin.deactivateWorkspaceVendor);
  const reactivateVendor = useMutation((api as any).admin.reactivateWorkspaceVendor);
  const [vendorName, setVendorName] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (isProtectedLoading || access === undefined || companies === undefined) {
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
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Vendor home</p>
          <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl" title={vendorNameText}>{vendorNameText}</h1>
          <p className="mt-4 text-base text-slate-300">Workspace: {companyName}</p>
          <p className="mt-2 text-lg text-slate-200">No projects assigned yet.</p>
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
      <div className="mx-auto max-w-5xl space-y-6">
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
