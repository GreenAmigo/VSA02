"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

import { api } from "../../convex/_generated/api";
import { getProjectDraftError, normalizeProjectName } from "@/lib/projectDraft";
import { getPersonInviteDraftError } from "@/lib/projectPeople";
import {
  buildRequirementTemplateWorkbook,
  getRequirementImportValidationError,
  parseRequirementFile,
  parseRequirementFileWithIssues,
  type RequirementImportIssue,
  type RequirementRecord,
} from "@/lib/projectRequirements";
import { getScoringDraftError, getScoringModeMeta } from "@/lib/projectScoring";

type CompanyRecord = {
  _id: string;
  name: string;
  slug?: string;
  companyId?: string;
  createdAt?: number;
  status?: "draft" | "active";
};

type ProjectRecord = {
  _id: string;
  name: string;
  companyId: string;
  status: "draft" | "active";
  createdAt?: number;
};

type ProjectMemberRecord = {
  _id: string;
  userId: string;
  companyId: string;
  projectId: string;
  role: "company-admin" | "company-scorer" | "vendor";
  displayName: string;
};

type RequirementItem = {
  _id: string;
  requirementId: string;
  text: string;
  type?: "user-story" | "nfr";
  priority?: 9 | 3 | 1 | 0;
  status: "active" | "withdrawn";
};

type ScoreHistoryRow = {
  _id: string;
  projectId: string;
  vendorUserId: string;
  requirementId: string;
  score: 0 | 1;
  comment?: string;
  enteredBy?: string;
  enteredAt?: number;
};

type DashboardRow = {
  vendorUserId: string;
  total: number;
};

type ProjectDashboard = {
  rows: DashboardRow[];
  leadingVendorUserId?: string | null;
};

function StatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm shadow-slate-950/20">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{helper}</p>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-200">
      {label}
    </span>
  );
}

function formatDate(timestamp?: number) {
  if (!timestamp) {
    return "Not set";
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toImportRow(record: RequirementRecord) {
  return {
    id: record.id,
    text: record.text,
    type: record.type,
    priority: record.priority as 9 | 3 | 1 | 0,
    status: record.status,
  };
}

function AppSidebar({ projectId, projectName }: { projectId?: string; projectName?: string }) {
  const items = [
    { href: "/", label: "Workspace" },
    { href: "/projects", label: "Projects" },
    { href: projectId ? `/projects/${projectId}` : "/projects", label: "Overview" },
    { href: projectId ? `/projects/${projectId}/requirements` : "/projects", label: "Requirements" },
    { href: projectId ? `/projects/${projectId}/people` : "/projects", label: "People" },
    { href: projectId ? `/projects/${projectId}/scoring` : "/projects", label: "Scoring" },
    { href: projectId ? `/projects/${projectId}/decision` : "/projects", label: "Decision" },
  ];

  return (
    <aside className="w-72 shrink-0 border-r border-slate-800 bg-slate-950/80 p-5">
      <div className="mb-8">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">VendorSelect</p>
        <h2 className="mt-3 text-xl font-semibold text-white">Workspace</h2>
      </div>

      <nav className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-xl border border-transparent px-3 py-2 text-sm text-slate-300 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">Current project</p>
        <p className="mt-2 text-base font-medium text-white">{projectName ?? "Workspace"}</p>
        <p className="mt-2 text-sm text-slate-400">Project activity is loaded from Convex.</p>
      </div>
    </aside>
  );
}

function shouldShowPreviewDebugPanel() {
  if (typeof window === "undefined") {
    return false;
  }

  const environment = process.env.NEXT_PUBLIC_APP_ENVIRONMENT?.trim().toLowerCase() ?? "";
  const hostname = window.location.hostname.toLowerCase();

  return environment === "preview" || hostname.includes("preview") || hostname.includes("vspreview");
}

function PreviewDebugPanel({ access }: { access?: { email?: string | null; role?: string | null; isConsultant?: boolean; tokenIdentifier?: string | null; subject?: string | null } }) {
  if (!shouldShowPreviewDebugPanel()) {
    return null;
  }

  const lookupId = access?.subject ?? access?.tokenIdentifier ?? "unknown";
  const serverRole = access?.isConsultant ? "VS Consultant" : access?.role ? access.role.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "User";

  return (
    <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-[10px] text-amber-100 shadow-sm shadow-amber-950/20">
      <p className="font-medium uppercase tracking-[0.16em] text-amber-300">Preview access debug</p>
      <p className="mt-1">Email: {access?.email ?? "unknown"}</p>
      <p>Server role: {serverRole}</p>
      <p>Lookup ID: {lookupId}</p>
    </div>
  );
}

function TopBar({ title }: { title: string }) {
  const { user } = useAuth();
  const access = useQuery(api.access.getCurrentUserAccess, user ? {} : "skip") as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; tokenIdentifier?: string | null; subject?: string | null }
    | undefined;

  const displayRole = access?.isConsultant ? "VS Consultant" : access?.role ? access.role.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "User";
  const serverIdentity = access?.subject ?? access?.tokenIdentifier ?? "unknown";
  const serverTokenIdentifier = access?.tokenIdentifier ?? "unknown";

  return (
    <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">PM / BA workspace</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="mr-2 text-right">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Signed in</p>
            <p className="text-sm font-medium text-white">{access?.email ?? user?.email ?? "Unknown user"}</p>
            <p className="text-xs text-sky-300">{displayRole}</p>
            <p className="mt-1 text-[10px] text-slate-400">Server subject: {serverIdentity}</p>
            <p className="text-[10px] text-slate-500">Token identifier: {serverTokenIdentifier}</p>
            <PreviewDebugPanel access={access} />
          </div>
          <Link
            href="/projects/new"
            className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400"
          >
            New project
          </Link>
        </div>
      </div>
    </header>
  );
}

function CompanySetup({ onCreated }: { onCreated?: () => void }) {
  const [name, setName] = useState("");
  const createCompany = useMutation(api.admin.createCompany);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    await createCompany({ name: name.trim() });
    onCreated?.();
    setName("");
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold text-white">Create your first company</h2>
      <p className="mt-2 text-sm text-slate-400">Projects are scoped to a company and all access checks are enforced server-side.</p>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
          placeholder="Company name"
        />
        <button type="submit" className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
          Create company
        </button>
      </form>
    </div>
  );
}

function WorkspaceOverview() {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;

  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; companyIds?: string[]; tokenIdentifier?: string | null; subject?: string | null }
    | undefined;

  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as CompanyRecord[] | undefined;

  if (isProtectedLoading || access === undefined || companies === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">
        Checking access…
      </div>
    );
  }

  if (!access.isConsultant && !access.role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">
        <div className="max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Access required</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">No workspace access</h1>
          <p className="mt-3 text-slate-300">Signed in as {access.email ?? user?.email ?? "unknown user"}</p>
          <p className="mt-2 text-sm text-slate-400">Server role: {access.role ?? "none"}</p>
          <p className="mt-2 text-sm text-slate-400">Server subject: {access.subject ?? "none"}</p>
          <p className="mt-1 text-sm text-slate-400">Token identifier: {access.tokenIdentifier ?? "none"}</p>
          <PreviewDebugPanel access={access} />
          <p className="mt-4 text-sm text-slate-400">No membership was found for this account, so there is nothing to show.</p>
        </div>
      </div>
    );
  }

  if (access.isConsultant) {
    const consultantCompanies = companies.length ? companies : [];
    return (
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        <aside className="w-80 shrink-0 border-r border-slate-800 bg-slate-950/90 p-5">
          <div className="mb-8">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">VS Consultant</p>
            <h2 className="mt-3 text-xl font-semibold text-white">Workspace directory</h2>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Companies</p>
            <div className="mt-3 space-y-2">
              {consultantCompanies.length ? consultantCompanies.map((company) => (
                <div key={company._id} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                  {company.name}
                </div>
              )) : (
                <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-400">No companies available</div>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Signed in</p>
            <p className="mt-2 text-sm font-medium text-white">{access.email ?? user?.email ?? "Unknown user"}</p>
            <p className="mt-1 text-xs text-sky-300">{access.isConsultant ? "VS Consultant" : access.role ?? "No role"}</p>
          </div>
        </aside>

        <main className="flex-1">
          <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Workspace landing</p>
                <h1 className="mt-2 text-2xl font-semibold text-white">Consultant home</h1>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Signed in</p>
                <p className="text-sm font-medium text-white">{access.email ?? user?.email ?? "Unknown user"}</p>
                <p className="text-xs text-sky-300">VS Consultant</p>
              </div>
            </div>
          </header>

          <div className="space-y-6 p-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold text-white">Workspace directory</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {consultantCompanies.map((company) => (
                  <div key={company._id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-sky-300">Company</p>
                    <p className="mt-2 text-xl font-semibold text-white">{company.name}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const company = companies[0];
  const displayRole = access.role ? access.role.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "User";

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="w-80 shrink-0 border-r border-slate-800 bg-slate-950/90 p-5">
        <div className="mb-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Workspace</p>
          <h2 className="mt-3 text-xl font-semibold text-white">{company?.name ?? "Your company"}</h2>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Signed in</p>
          <p className="mt-2 text-sm font-medium text-white">{access.email ?? user?.email ?? "Unknown user"}</p>
          <p className="mt-1 text-xs text-sky-300">{displayRole}</p>
        </div>
      </aside>

      <main className="flex-1">
        <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Workspace landing</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">{company?.name ?? "Your workspace"}</h1>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Signed in</p>
              <p className="text-sm font-medium text-white">{access.email ?? user?.email ?? "Unknown user"}</p>
              <p className="text-xs text-sky-300">{displayRole}</p>
            </div>
          </div>
        </header>

        <div className="space-y-6 p-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Company workspace</h2>
            <p className="mt-3 text-slate-300">This account is mapped to {company?.name ?? "your company"} by the server.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

function ProjectListPage() {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as CompanyRecord[] | undefined;
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!companies) {
      return;
    }

    if (!selectedCompanyId || !companies.some((company) => company._id === selectedCompanyId)) {
      setSelectedCompanyId(companies[0]?._id ?? null);
    }
  }, [companies, selectedCompanyId]);

  if (isProtectedLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">Checking sign-in…</div>;
  }

  const projects = useQuery(
    api.access.listProjectsForCompany,
    selectedCompanyId ? { companyId: selectedCompanyId as any } : "skip",
  ) as ProjectRecord[] | undefined;

  if (companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Loading projects…</div>;
  }

  if (!companies.length) {
    return (
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        <AppSidebar />
        <main className="flex-1 p-6">
          <TopBar title="Projects" />
          <div className="mt-6 max-w-2xl"><CompanySetup /></div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <AppSidebar projectName={companies.find((company) => company._id === selectedCompanyId)?.name ?? companies[0].name} />

      <main className="flex-1">
        <TopBar title="Projects" />

        <div className="space-y-6 p-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Project portfolio</h2>
              <Link href="/projects/new" className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
                Create project
              </Link>
            </div>

            <div className="mb-4 flex flex-wrap gap-3">
              {companies.map((company) => (
                <button
                  key={company._id}
                  type="button"
                  onClick={() => setSelectedCompanyId(company._id)}
                  className={`rounded-xl border px-3 py-2 text-sm ${selectedCompanyId === company._id ? "border-sky-500 bg-sky-500/10 text-sky-200" : "border-slate-700 bg-slate-950 text-slate-200"}`}
                >
                  {company.name}
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-left">
                <thead className="bg-slate-950/60 text-slate-300">
                  <tr>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-[0.14em]">Project</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-[0.14em]">Status</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-[0.14em]">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900">
                  {(projects ?? []).map((project) => (
                    <tr key={project._id} className="hover:bg-slate-800/60">
                      <td className="px-4 py-4">
                        <Link href={`/projects/${project._id}`} className="font-medium text-white hover:text-sky-300">
                          {project.name}
                        </Link>
                      </td>
                      <td className="px-4 py-4"><StatusPill label={project.status === "active" ? "Active" : "Draft"} /></td>
                      <td className="px-4 py-4 text-slate-300">{formatDate(project.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function CreateProjectPage() {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as CompanyRecord[] | undefined;
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [name, setName] = useState("Payroll Platform Evaluation");
  const router = useRouter();
  const createProject = useMutation(api.admin.createProject);
  const draftName = normalizeProjectName(name);
  const validationError = getProjectDraftError(selectedCompanyId, name);

  useEffect(() => {
    if (!companies) {
      return;
    }

    if (!selectedCompanyId && companies[0]) {
      setSelectedCompanyId(companies[0]._id);
    }
  }, [companies, selectedCompanyId]);

  if (isProtectedLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">Checking sign-in…</div>;
  }

  if (companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Loading company list…</div>;
  }

  if (!companies.length) {
    return (
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        <AppSidebar />
        <main className="flex-1 p-6">
          <TopBar title="Create project" />
          <div className="mt-6 max-w-2xl"><CompanySetup /></div>
        </main>
      </div>
    );
  }

  const handleCreateProject = async () => {
    const error = getProjectDraftError(selectedCompanyId, name);
    if (error) {
      return;
    }

    const result = await createProject({ companyId: selectedCompanyId as any, name: draftName });
    router.push(`/projects/${result.projectId}`);
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <AppSidebar projectName={companies.find((company) => company._id === selectedCompanyId)?.name ?? companies[0].name} />

      <main className="flex-1">
        <TopBar title="Create project" />

        <div className="p-6">
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-6">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">New sourcing project</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Project details</h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="text-sm text-slate-300 md:col-span-2">
                <span className="mb-2 block">Company</span>
                <select
                  value={selectedCompanyId ?? companies[0]._id}
                  onChange={(event) => setSelectedCompanyId(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                >
                  {companies.map((company) => (
                    <option key={company._id} value={company._id}>{company.name}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-300 md:col-span-2">
                <span className="mb-2 block">Project name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                />
                {validationError ? (
                  <span className="mt-2 block text-sm text-amber-300">{validationError}</span>
                ) : null}
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Link href="/projects" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500">
                Cancel
              </Link>
              <button
                onClick={handleCreateProject}
                disabled={Boolean(validationError)}
                className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                Save project
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ProjectOverviewPage({ projectId }: { projectId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const project = useQuery(api.access.getProject, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ProjectRecord | undefined;
  const requirements = useQuery(api.access.listProjectRequirements, isProtectedLoading ? "skip" : { projectId: projectId as any }) as RequirementItem[] | undefined;
  const dashboard = useQuery(api.dashboard.getProjectDashboard, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ProjectDashboard | undefined;
  const members = useQuery(api.admin.listProjectMembers, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ProjectMemberRecord[] | undefined;

  if (isProtectedLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">Checking sign-in…</div>;
  }

  if (!projectId) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Project not found.</div>;
  }

  if (!project || !dashboard || !members || !requirements) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Loading project…</div>;
  }

  const vendorMembers = members.filter((member) => member.role === "vendor");
  const scorerMembers = members.filter((member) => member.role === "company-scorer");
  const leadingVendor = vendorMembers.find((member) => member.userId === dashboard.leadingVendorUserId)?.displayName ?? "No leader yet";

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <AppSidebar projectId={projectId} projectName={project.name} />

      <main className="flex-1">
        <TopBar title={project.name} />

        <div className="space-y-6 p-6">
          <div className="flex flex-wrap gap-3">
            <StatusPill label={project.status === "active" ? "Active" : "Draft"} />
            <StatusPill label={`${vendorMembers.length} vendors`} />
            <StatusPill label={`${scorerMembers.length} scorers`} />
          </div>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Requirements" value={String(requirements.filter((item) => item.status !== "withdrawn").length)} helper="Active rows in project" />
            <StatCard label="Vendor completion" value={`${Math.min(100, Math.round(((dashboard.rows.length || 1) / Math.max(1, vendorMembers.length || 1)) * 100))}%`} helper="Derived from dashboard rows" />
            <StatCard label="Scorer response" value="Live" helper="Available from project members" />
            <StatCard label="Leading vendor" value={leadingVendor} helper={dashboard.rows.length ? `Top score ${Math.max(...dashboard.rows.map((row) => row.total), 0)}` : "Waiting on scores"} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Project requirements</h2>
                <Link href={`/projects/${projectId}/requirements`} className="text-sm text-sky-300 hover:text-sky-200">
                  Manage requirements
                </Link>
              </div>

              <div className="space-y-3">
                {requirements.filter((row) => row.status !== "withdrawn").slice(0, 4).map((row) => (
                  <div key={row._id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{row.requirementId}</p>
                        <p className="mt-1 text-sm font-medium text-white">{row.text}</p>
                      </div>
                      <StatusPill label={row.type === "user-story" ? "User story" : "NFR"} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold text-white">Project members</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                {members.slice(0, 6).map((member) => (
                  <div key={member._id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span>{member.displayName}</span>
                      <StatusPill label={member.role.replace("company-", "").replace("-", " ")} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function RequirementsPage({ projectId }: { projectId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean; companyIds?: string[] }
    | undefined;
  const project = useQuery(api.access.getProject, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ProjectRecord | undefined;
  const requirements = useQuery(api.access.listProjectRequirements, isProtectedLoading ? "skip" : { projectId: projectId as any }) as RequirementItem[] | undefined;
  const previewImport = useMutation(api.requirements.previewRequirementImport);
  const applyImport = useMutation(api.requirements.applyRequirementImport);
  const [preview, setPreview] = useState<any>(null);
  const [rows, setRows] = useState<RequirementRecord[]>([]);
  const [importIssues, setImportIssues] = useState<RequirementImportIssue[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (isProtectedLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">Checking sign-in…</div>;
  }

  const importValidationError = getRequirementImportValidationError(rows);
  const canImportRequirements = Boolean(access && (access.isConsultant || access.role === "company-admin"));

  if (!project || !requirements) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Loading project requirements…</div>;
  }

  const canSeePriority = Boolean(access && (access.isConsultant || access.role === "company-admin"));
  const canSeeType = Boolean(access && (access.isConsultant || access.role === "company-admin" || access.role === "company-scorer"));

  const buildDownloadTemplate = () => {
    const workbook = buildRequirementTemplateWorkbook();
    XLSX.writeFile(workbook, "vendor-selection-requirements-template.xlsx");
  };

  const handleFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const file = fileList[0];

    try {
      const parsed = await parseRequirementFileWithIssues(file);
      const validationError = getRequirementImportValidationError(parsed.rows);
      const rejectedRows = parsed.issues.map((issue) => ({
        requirementId: issue.requirementId ?? `row-${issue.rowIndex}`,
        reason: issue.reason,
      }));

      setImportError(validationError);
      setRows(parsed.rows);
      setImportIssues(parsed.issues);
      setPreview(null);
      setIsDragging(false);

      if (validationError) {
        return;
      }

      const previewResult = await previewImport({
        projectId: projectId as any,
        rows: parsed.rows.map(toImportRow),
      });

      setPreview({
        ...previewResult,
        rejected: [...(previewResult.rejected ?? []), ...rejectedRows],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't read that spreadsheet. Please upload a CSV or Excel file with a Requirements or NFRs sheet.";
      setImportError(message);
      setRows([]);
      setImportIssues([]);
      setPreview(null);
      setIsDragging(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await handleFiles(event.target.files);
    event.target.value = "";
  };

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    await handleFiles(event.dataTransfer.files);
  };

  const handleApply = async () => {
    const validationError = getRequirementImportValidationError(rows);
    if (validationError) {
      setImportError(validationError);
      return;
    }

    try {
      const result = await applyImport({
        projectId: projectId as any,
        rows: rows.map(toImportRow),
        confirm: true,
      });

      const importedCount = rows.length;
      const rejectedCount = Array.isArray(result.rejected) ? result.rejected.length : 0;
      setPreview({
        ...result,
        summary: result.summary,
        confirmation: `${importedCount} imported, ${rejectedCount} rejected`,
      });
      setRows([]);
      setImportError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The import could not be confirmed. Please try again.";
      setImportError(message);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <AppSidebar projectId={projectId} projectName={project.name} />

      <main className="flex-1">
        <TopBar title="Requirements import" />

        <div className="space-y-6 p-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Import requirements</h2>
              <div className="flex gap-2">
                {canImportRequirements ? (
                  <>
                    <button type="button" onClick={buildDownloadTemplate} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:border-slate-500">
                      Download template
                    </button>
                    <label
                      className={`cursor-pointer rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 ${isDragging ? "ring-2 ring-sky-400" : ""}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        void handleDrop(event);
                      }}
                    >
                      Upload CSV or Excel
                      <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} />
                    </label>
                  </>
                ) : null}
              </div>
            </div>

            {canImportRequirements ? (
              <div
                className={`rounded-xl border border-dashed p-6 text-center transition ${isDragging ? "border-sky-400 bg-sky-500/10" : "border-slate-700 bg-slate-950/40"}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleDrop(event);
                }}
              >
                <p className="text-base font-medium text-slate-200">Drop a spreadsheet here or click to upload</p>
                <p className="mt-2 text-sm text-slate-400">Supports CSV and Excel files; rows are matched by requirement ID.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-sm text-slate-400">
                Import is limited to consultants and company admins.
              </div>
            )}

            {importIssues.length > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                <p className="font-medium text-amber-200">Row-level issues</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {importIssues.map((issue, index) => (
                    <li key={`${issue.sheetName}-${issue.rowIndex}-${index}`}>
                      {issue.sheetName} row {issue.rowIndex}: {issue.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {importError ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                {importError}
              </div>
            ) : null}

            {preview ? (
              <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-emerald-100">Import preview</p>
                    <p className="mt-1 text-sm text-emerald-200">
                      {preview.confirmation ?? `${rows.length} imported, ${(preview.rejected ?? []).length} rejected`}
                    </p>
                    <p className="mt-1 text-xs text-emerald-200/80">
                      {(preview.summary?.added ?? 0)} added • {(preview.summary?.updated ?? 0)} updated • {(preview.summary?.withdrawn ?? 0)} withdrawn • {(preview.rejected ?? []).length} rejected
                    </p>
                  </div>
                  <button
                    onClick={handleApply}
                    disabled={Boolean(importValidationError) || !canImportRequirements}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    Confirm import
                  </button>
                </div>

                {(preview.rejected ?? []).length > 0 ? (
                  <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                    <p className="font-medium">Rejected rows</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {(preview.rejected ?? []).map((row: any, index: number) => (
                        <li key={`${row.requirementId ?? "row"}-${index}`}>
                          {row.reason || `${row.requirementId || "Unnamed row"}: rejected`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 text-lg font-semibold text-white">Requirement queue</h2>
            <div className="space-y-3">
              {requirements.map((row) => (
                <div key={row._id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-[0.14em] text-slate-400">{row.requirementId}</span>
                      {canSeeType ? (
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                          {row.type}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-base font-medium text-white">{row.text}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {canSeePriority ? (
                      <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-sky-200">
                        {row.priority}
                      </span>
                    ) : null}
                    <StatusPill label={row.status === "active" ? "Active" : "Withdrawn"} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PeoplePage({ projectId }: { projectId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const project = useQuery(api.access.getProject, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ProjectRecord | undefined;
  const members = useQuery(api.admin.listProjectMembers, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ProjectMemberRecord[] | undefined;
  const addVendor = useMutation(api.admin.addProjectVendor);
  const addScorer = useMutation(api.admin.addProjectScorer);
  const [displayName, setDisplayName] = useState("Alex Turner");
  const [email, setEmail] = useState("alex@northwind.example");
  const [personType, setPersonType] = useState<"vendor" | "scorer">("vendor");
  const [scorerRole, setScorerRole] = useState<"individual" | "department">("individual");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const inviteValidationError = getPersonInviteDraftError(displayName, email);

  if (isProtectedLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">Checking sign-in…</div>;
  }

  if (!project || !members) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Loading people…</div>;
  }

  const handleInvite = async () => {
    const validationError = getPersonInviteDraftError(displayName, email);
    if (validationError) {
      setInviteError(validationError);
      return;
    }

    if (!project) {
      return;
    }

    setInviteError(null);

    if (personType === "vendor") {
      await addVendor({
        companyId: project.companyId as any,
        projectId: projectId as any,
        displayName: displayName.trim(),
        email: email.trim(),
      });
    } else {
      await addScorer({
        companyId: project.companyId as any,
        projectId: projectId as any,
        displayName: displayName.trim(),
        email: email.trim(),
        role: scorerRole,
        departmentName: scorerRole === "department" ? "Operations" : undefined,
      });
    }

    setDisplayName("");
    setEmail("");
  };

  const vendors = members.filter((member) => member.role === "vendor");
  const scorers = members.filter((member) => member.role === "company-scorer");

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <AppSidebar projectId={projectId} projectName={project.name} />

      <main className="flex-1">
        <TopBar title="People and invites" />

        <div className="space-y-6 p-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold text-white">Vendors</h2>
              <div className="mt-4 space-y-3">
                {vendors.map((vendor) => (
                  <div key={vendor._id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{vendor.displayName}</p>
                        <p className="text-sm text-slate-400">{vendor.role}</p>
                      </div>
                      <StatusPill label="Active" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold text-white">Scorers</h2>
              <div className="mt-4 space-y-3">
                {scorers.map((scorer) => (
                  <div key={scorer._id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{scorer.displayName}</p>
                        <p className="text-sm text-slate-400">{scorer.role}</p>
                      </div>
                      <StatusPill label="Ready" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-sm font-medium text-white">Invite new person</p>
                <div className="mt-3 space-y-3">
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Full name"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                  />
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="person@example.com"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                  />
                  <select
                    value={personType}
                    onChange={(event) => setPersonType(event.target.value as "vendor" | "scorer")}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                  >
                    <option value="vendor">Vendor</option>
                    <option value="scorer">Scorer</option>
                  </select>
                  {personType === "scorer" ? (
                    <select
                      value={scorerRole}
                      onChange={(event) => setScorerRole(event.target.value as "individual" | "department")}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                    >
                      <option value="individual">Individual</option>
                      <option value="department">Department</option>
                    </select>
                  ) : null}
                  {inviteError ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                      {inviteError}
                    </div>
                  ) : null}
                  <button
                    onClick={handleInvite}
                    disabled={Boolean(inviteValidationError)}
                    className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    Send invite
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ScoringPage({ projectId }: { projectId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const project = useQuery(api.access.getProject, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ProjectRecord | undefined;
  const requirements = useQuery(api.access.listProjectRequirements, isProtectedLoading ? "skip" : { projectId: projectId as any }) as RequirementItem[] | undefined;
  const members = useQuery(api.admin.listProjectMembers, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ProjectMemberRecord[] | undefined;
  const scoreHistory = useQuery(api.scores.listScoreHistory, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ScoreHistoryRow[] | undefined;
  const submitScore = useMutation(api.scores.submitScore);
  const currentMember = members?.find((member) => member.userId === user?.id || member.userId === user?.email || member.displayName === user?.name) ?? null;
  const scoringRole = currentMember?.role ?? "vendor";
  const scoringMode = getScoringModeMeta(scoringRole as "vendor" | "company-scorer" | "company-admin");
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [scoreValue, setScoreValue] = useState<0 | 1>(1);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isProtectedLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">Checking sign-in…</div>;
  }

  useEffect(() => {
    if (!requirements || requirements.length === 0) {
      return;
    }

    const activeRequirements = requirements.filter((row) => row.status !== "withdrawn");
    if (!selectedRequirementId && activeRequirements[0]) {
      setSelectedRequirementId(activeRequirements[0].requirementId);
    }
  }, [requirements, selectedRequirementId]);

  useEffect(() => {
    if (!members) {
      return;
    }

    const vendors = members.filter((member) => member.role === "vendor");
    const preferredVendor = currentMember?.role === "vendor" ? currentMember.userId : vendors[0]?.userId ?? null;
    if (!selectedVendorId && preferredVendor) {
      setSelectedVendorId(preferredVendor);
    }
  }, [members, selectedVendorId, currentMember]);

  if (!project || !requirements || !members || !scoreHistory) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Loading scoring view…</div>;
  }

  const activeRequirements = requirements.filter((row) => row.status !== "withdrawn");
  const vendorMembers = members.filter((member) => member.role === "vendor");
  const selected = activeRequirements.find((row) => row.requirementId === selectedRequirementId) ?? activeRequirements[0];
  const isScorerMode = scoringRole === "company-scorer" || scoringRole === "company-admin";
  const scoreDraftError = getScoringDraftError(selectedVendorId, selected?.requirementId ?? null, comment, scoreValue);
  const selectedScore = (scoreHistory ?? []).find(
    (row) => row.requirementId === selected?.requirementId && row.vendorUserId === selectedVendorId,
  );

  const handleSubmit = async () => {
    const validationError = getScoringDraftError(selectedVendorId, selected?.requirementId ?? null, comment, scoreValue);
    if (validationError) {
      return;
    }

    if (!selected || !selectedVendorId) {
      return;
    }

    setIsSubmitting(true);
    try {
      await submitScore({
        projectId: projectId as any,
        vendorUserId: selectedVendorId,
        requirementId: selected.requirementId,
        score: scoreValue,
        comment: comment.trim() || undefined,
      });
      setComment("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <AppSidebar projectId={projectId} projectName={project.name} />

      <main className="flex-1">
        <TopBar title={isScorerMode ? "Scorer scorecard" : "Vendor scoring"} />

        <div className="grid gap-6 p-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Scoring mode</p>
              <h2 className="mt-2 text-lg font-semibold text-white">{scoringMode.heading}</h2>
              <p className="mt-1 text-sm text-slate-300">{scoringMode.detail}</p>
              {currentMember ? (
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-sky-300">Logged in as {currentMember.displayName}</p>
              ) : null}
            </div>
            <h2 className="text-lg font-semibold text-white">Requirement list</h2>
            <div className="mt-4 space-y-3">
              {activeRequirements.map((row) => (
                <button
                  key={row._id}
                  onClick={() => setSelectedRequirementId(row.requirementId)}
                  className={`w-full rounded-xl border p-3 text-left transition ${selectedRequirementId === row.requirementId ? "border-sky-500 bg-sky-500/10" : "border-slate-800 bg-slate-950/60 hover:border-sky-500"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.14em] text-slate-400">{row.requirementId}</span>
                    <StatusPill label={row.type === "user-story" ? "User story" : "NFR"} />
                  </div>
                  <p className="mt-2 text-sm font-medium text-white">{row.text}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Current requirement</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{selected?.requirementId} • {selected?.type}</h2>
              </div>
              <StatusPill label={String(selected?.priority ?? "-")} />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-slate-300">{selected?.text}</p>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-300">
                <span className="mb-2 block">{isScorerMode ? "Vendor being scored" : "Vendor"}</span>
                <select
                  value={selectedVendorId ?? ""}
                  onChange={(event) => setSelectedVendorId(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                >
                  {vendorMembers.map((vendor) => (
                    <option key={vendor._id} value={vendor.userId}>{vendor.displayName}</option>
                  ))}
                </select>
              </label>

              <div className="text-sm text-slate-300">
                <span className="mb-2 block">Latest score</span>
                <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                  {selectedScore ? `${selectedScore.score} / ${selectedScore.comment ?? "No comment"}` : "No score yet"}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setScoreValue(1)}
                className={`rounded-xl border px-4 py-3 text-sm font-medium ${scoreValue === 1 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-slate-700 bg-slate-950 text-slate-200"}`}
              >
                1 – Meets requirement
              </button>
              <button
                type="button"
                onClick={() => setScoreValue(0)}
                className={`rounded-xl border px-4 py-3 text-sm font-medium ${scoreValue === 0 ? "border-sky-500/30 bg-sky-500/10 text-sky-100" : "border-slate-700 bg-slate-950 text-slate-200"}`}
              >
                0 – Not met
              </button>
            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm text-slate-300">Comments</label>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={scoreValue === 0 ? "Add a reason for the 0 score" : "Optional score comment"}
                className="min-h-28 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
              />
              {scoreDraftError ? (
                <p className="mt-2 text-sm text-amber-300">{scoreDraftError}</p>
              ) : null}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || Boolean(scoreDraftError)}
                className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-violet-400"
              >
                {isSubmitting ? "Submitting…" : "Submit score"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function DecisionPage({ projectId }: { projectId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !convexAuthenticated;
  const project = useQuery(api.access.getProject, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ProjectRecord | undefined;
  const dashboard = useQuery(api.dashboard.getProjectDashboard, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ProjectDashboard | undefined;
  const members = useQuery(api.admin.listProjectMembers, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ProjectMemberRecord[] | undefined;

  if (isProtectedLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">Checking sign-in…</div>;
  }

  if (!project || !dashboard || !members) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Loading decision summary…</div>;
  }

  const vendorMap = new Map(members.filter((member) => member.role === "vendor").map((member) => [member.userId, member.displayName]));
  const rankedRows = [...dashboard.rows].sort((left, right) => right.total - left.total);
  const topVendor = vendorMap.get(rankedRows[0]?.vendorUserId ?? "") ?? "No vendor yet";

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <AppSidebar projectId={projectId} projectName={project.name} />

      <main className="flex-1">
        <TopBar title="Decision summary" />

        <div className="space-y-6 p-6">
          <section className="grid gap-4 md:grid-cols-3">
            <StatCard label="Best fit" value={topVendor} helper={rankedRows[0] ? `Weighted score ${rankedRows[0].total}` : "Waiting on scores"} />
            <StatCard label="Runner-up" value={rankedRows[1] ? vendorMap.get(rankedRows[1].vendorUserId) ?? "Unknown" : "None yet"} helper={rankedRows[1] ? `Weighted score ${rankedRows[1].total}` : "Waiting on scores"} />
            <StatCard label="Risk level" value="Live" helper="Based on current score data" />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold text-white">Vendor comparison</h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
                <table className="min-w-full divide-y divide-slate-800 text-left">
                  <thead className="bg-slate-950/60 text-slate-300">
                    <tr>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-[0.14em]">Vendor</th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-[0.14em]">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900">
                    {rankedRows.map((row) => (
                      <tr key={row.vendorUserId}>
                        <td className="px-4 py-4 font-medium text-white">{vendorMap.get(row.vendorUserId) ?? row.vendorUserId}</td>
                        <td className="px-4 py-4 text-slate-300">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold text-white">Recommendation</h2>
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-emerald-100">
                  {topVendor} is the recommended candidate based on the latest weighted scores in Convex.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export {
  WorkspaceOverview,
  ProjectListPage,
  CreateProjectPage,
  ProjectOverviewPage,
  RequirementsPage,
  PeoplePage,
  ScoringPage,
  DecisionPage,
};
