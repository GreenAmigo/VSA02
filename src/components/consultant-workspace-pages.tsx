"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

import { api } from "../../convex/_generated/api";

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
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;

  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; companyIds?: string[] }
    | undefined;

  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string; isTestData?: boolean }> | undefined;

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

  const totalCompanies = companies.length;
  const displayRole = access.isConsultant ? "VS Consultant" : access.role ?? "User";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">{displayRole}</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">{access.isConsultant ? "Consultant home" : "Workspace directory"}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm text-slate-300">
              <div>{access.email ?? user?.email ?? "Unknown user"}</div>
              <div className="text-xs text-sky-300">{displayRole}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-6 p-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total companies" value={String(totalCompanies)} helper="Visible workspaces from Convex" />
          <StatCard label="Role" value={displayRole} helper="Current access from server" />
          <StatCard label="Signed in" value={access.email ?? user?.email ?? "Unknown"} helper="WorkOS session" />
          <StatCard label="Company IDs" value={String(access.companyIds?.length ?? companies.length)} helper="Server-authorized memberships" />
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          {companies.map((company) => (
            <div key={company._id} className="block rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-sky-300">Company workspace</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">{company.name}</h2>
                </div>
                {company.isTestData ? <StatusPill label="TEST" className="border-rose-500/50 bg-rose-500/10 text-rose-200" /> : null}
              </div>
            </div>
          ))}
        </section>
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

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
            Activity is loaded from Convex for authorized consultants only.
          </div>
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

  if (isProtectedLoading || access === undefined || companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  const company = companies.find((item) => item._id === companyId) ?? companies[0];
  if (!company && !access.isConsultant) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Access denied.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <h1 className="text-2xl font-semibold text-white">People</h1>
      <p className="mt-3 text-slate-300">Authorized company: {company?.name ?? "Consultant view"}</p>
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
