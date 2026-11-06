import Link from "next/link";

import {
  consultantActivityLog,
  consultantWorkspaces,
  getConsultantWorkspaceBySlug,
  type ConsultantWorkspace,
} from "@/lib/consultantWorkspaceData";

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
  workspace: ConsultantWorkspace;
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
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">VS Consultant</p>
          <h2 className="mt-3 text-xl font-semibold text-white">Workspace directory</h2>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Companies</p>
          <div className="mt-3 space-y-2">
            {consultantWorkspaces.map((company) => (
              <Link
                key={company.slug}
                href={`/workspaces/${company.slug}`}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm ${workspace.slug === company.slug ? "border-sky-500 bg-sky-500/10 text-sky-100" : "border-slate-700 bg-slate-950 text-slate-200"}`}
              >
                <span>{company.name}</span>
                <div className="flex items-center gap-2">
                  {company.isTestData ? <StatusPill label="TEST" className="border-rose-500/50 bg-rose-500/10 text-rose-200" /> : null}
                  <StatusPill label={`${company.projects.length}`} />
                </div>
              </Link>
            ))}
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
  const totalCompanies = consultantWorkspaces.length;
  const totalProjects = consultantWorkspaces.reduce((total, workspace) => total + workspace.projects.length, 0);
  const totalPeople = consultantWorkspaces.reduce((total, workspace) => total + workspace.people.length, 0);
  const totalVendors = consultantWorkspaces.reduce((total, workspace) => total + workspace.vendors.length, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">VS Consultant</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Consultant home</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/workspaces/activity" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500">
              Activity log
            </Link>
            <Link href="/workspaces/import" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500">
              Bulk data import
            </Link>
            <button type="button" className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
              Add company workspace
            </button>
          </div>
        </div>
      </header>

      <div className="space-y-6 p-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total companies" value={String(totalCompanies)} helper="All visible workspaces" />
          <StatCard label="Total projects" value={String(totalProjects)} helper="Across every workspace" />
          <StatCard label="Total people" value={String(totalPeople)} helper="Across every workspace" />
          <StatCard label="Total vendors" value={String(totalVendors)} helper="Across every workspace" />
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          {consultantWorkspaces.map((workspace) => (
            <Link key={workspace.slug} href={`/workspaces/${workspace.slug}`} className="block rounded-2xl border border-slate-800 bg-slate-900 p-5 hover:border-slate-700">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-sky-300">Company workspace</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">{workspace.name}</h2>
                </div>
                <div className="flex items-center gap-2">
                  {workspace.isTestData ? <StatusPill label="TEST" className="border-rose-500/50 bg-rose-500/10 text-rose-200" /> : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Projects</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{workspace.projects.length}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">People</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{workspace.people.length}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Vendors</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{workspace.vendors.length}</p>
                </div>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}

export function ConsultantActivityLogPage() {
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
            <StatusPill label={`${consultantActivityLog.length} events`} className="border-sky-500/40 bg-sky-500/10 text-sky-200" />
          </div>

          <div className="space-y-3">
            {consultantActivityLog.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{entry.actor}</p>
                    <p className="text-sm text-slate-300">{entry.action}</p>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p>{entry.when}</p>
                    <p>{entry.workspace}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-400">{entry.details}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConsultantWorkspaceOverviewPage({ companyId }: { companyId: string }) {
  const workspace = getConsultantWorkspaceBySlug(companyId);

  return (
    <WorkspaceShell workspace={workspace} activeTab="overview">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projects" value={String(workspace.projects.length)} helper="Project records in workspace" />
        <StatCard label="People" value={String(workspace.people.length)} helper="Members and teams" />
        <StatCard label="Vendors" value={String(workspace.vendors.length)} helper="Company vendor roster" />
        <StatCard label="Test data" value={workspace.isTestData ? "Yes" : "No"} helper={workspace.isTestData ? "Preview/test-only workspace" : "Production workspace"} />
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
  const workspace = getConsultantWorkspaceBySlug(companyId);

  return (
    <WorkspaceShell workspace={workspace} activeTab="projects">
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <nav className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Projects</h2>
            <button type="button" className="rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
              Add Project
            </button>
          </div>

          <div className="space-y-2">
            {workspace.projects.map((project) => (
              <Link
                key={project.id}
                href={`/workspaces/${workspace.slug}/projects/${project.id}`}
                className="block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-sky-500"
              >
                {project.name}
              </Link>
            ))}
          </div>
        </nav>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Project dashboard</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{workspace.projects[0].name}</h2>
            </div>
            <StatusPill label={workspace.projects[0].status} />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Vendors" value={String(workspace.projects[0].vendorCount)} helper="Assigned vendors" />
            <StatCard label="Scorers" value={String(workspace.projects[0].scorerCount)} helper="Scoring team" />
            <StatCard label="Requirements" value={String(workspace.projects[0].requirementCount)} helper="Current requirements" />
            <StatCard label="Leading vendor" value={workspace.projects[0].leadingVendor} helper="Current leader" />
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

export function ConsultantWorkspaceProjectDetailPage({ companyId, projectId }: { companyId: string; projectId: string }) {
  const workspace = getConsultantWorkspaceBySlug(companyId);
  const project = workspace.projects.find((item) => item.id === projectId) ?? workspace.projects[0];

  return (
    <WorkspaceShell workspace={workspace} activeTab="projects">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Project</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{project.name}</h2>
          </div>
          <StatusPill label={project.status} />
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="People" value={String(workspace.people.length)} helper="Members on project" />
          <StatCard label="Vendors" value={String(project.vendorCount)} helper="Assigned vendors" />
          <StatCard label="Scorers" value={String(project.scorerCount)} helper="Scoring roles" />
          <StatCard label="Requirements" value={String(project.requirementCount)} helper="Requirements in scope" />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Menu</p>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              <Link href={`/workspaces/${workspace.slug}/projects/${project.id}`} className="block rounded-xl border border-slate-700 bg-slate-900 px-3 py-2">People</Link>
              <Link href={`/workspaces/${workspace.slug}/projects/${project.id}`} className="block rounded-xl border border-slate-700 bg-slate-900 px-3 py-2">Vendors</Link>
              <Link href={`/workspaces/${workspace.slug}/projects/${project.id}`} className="block rounded-xl border border-slate-700 bg-slate-900 px-3 py-2">Requirements</Link>
              <Link href={`/workspaces/${workspace.slug}/projects/${project.id}`} className="block rounded-xl border border-slate-700 bg-slate-900 px-3 py-2">Scoring</Link>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Project summary</p>
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              <p>Leading vendor: {project.leadingVendor}</p>
              <p>Active requirement set: {project.requirementCount}</p>
              <p>Project status: {project.status}</p>
            </div>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

export function ConsultantWorkspacePeoplePage({ companyId }: { companyId: string }) {
  const workspace = getConsultantWorkspaceBySlug(companyId);

  return (
    <WorkspaceShell workspace={workspace} activeTab="people">
      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <nav className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="space-y-2">
            <Link href={`/workspaces/${workspace.slug}/people`} className="block rounded-xl border border-sky-500 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
              Teams
            </Link>
            <Link href={`/workspaces/${workspace.slug}/people`} className="block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              Manage People
            </Link>
          </div>
        </nav>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-white">People dashboard</h2>
          <div className="mt-4 space-y-3">
            {workspace.people.map((person) => (
              <div key={person.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div>
                  <p className="font-medium text-white">{person.name}</p>
                  <p className="text-sm text-slate-400">{person.role} • {person.team}</p>
                </div>
                <StatusPill label={person.project} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

export function ConsultantWorkspaceVendorsPage({ companyId }: { companyId: string }) {
  const workspace = getConsultantWorkspaceBySlug(companyId);

  return (
    <WorkspaceShell workspace={workspace} activeTab="vendors">
      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <nav className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="space-y-2">
            {workspace.vendors.map((vendor) => (
              <Link key={vendor.id} href={`/workspaces/${workspace.slug}/vendors`} className="block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-sky-500">
                {vendor.name}
              </Link>
            ))}
            <button type="button" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm text-slate-200">
              Manage Vendors
            </button>
          </div>
        </nav>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-white">Vendor dashboard</h2>
          <div className="mt-4 space-y-3">
            {workspace.vendors.map((vendor) => (
              <div key={vendor.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div>
                  <p className="font-medium text-white">{vendor.name}</p>
                  <p className="text-sm text-slate-400">{vendor.project}</p>
                </div>
                <div className="text-right">
                  <StatusPill label={vendor.status} />
                  <p className="mt-2 text-sm text-slate-300">Score {vendor.score}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

export function ConsultantWorkspaceRequirementsPage({ companyId }: { companyId: string }) {
  const workspace = getConsultantWorkspaceBySlug(companyId);

  return (
    <WorkspaceShell workspace={workspace} activeTab="requirements">
      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <nav className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="space-y-2">
            <button type="button" className="w-full rounded-xl border border-sky-500 bg-sky-500/10 px-3 py-2 text-left text-sm text-sky-100">
              Functional / User Stories
            </button>
            <button type="button" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm text-slate-200">
              Non-Functional
            </button>
          </div>
        </nav>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-white">Requirements dashboard</h2>
          <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-5">
            <p className="text-base font-medium text-slate-200">Upload requirement file</p>
            <p className="mt-2 text-sm text-slate-400">Specify whether this upload is Functional or Non-Functional.</p>
            <div className="mt-4 flex gap-4 text-sm text-slate-200">
              <label className="flex items-center gap-2"><input type="radio" name="upload-type" defaultChecked /> Functional</label>
              <label className="flex items-center gap-2"><input type="radio" name="upload-type" /> Non-Functional</label>
            </div>
            <button type="button" className="mt-4 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
              Upload CSV / Excel
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {workspace.requirements.map((requirement) => (
              <div key={requirement.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{requirement.id}</p>
                    <p className="mt-2 text-base font-medium text-white">{requirement.title}</p>
                  </div>
                  <StatusPill label={requirement.type} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

export function ConsultantWorkspaceScoringPage({ companyId }: { companyId: string }) {
  const workspace = getConsultantWorkspaceBySlug(companyId);

  return (
    <WorkspaceShell workspace={workspace} activeTab="scoring">
      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <nav className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="space-y-2">
            <button type="button" className="w-full rounded-xl border border-sky-500 bg-sky-500/10 px-3 py-2 text-left text-sm text-sky-100">
              {workspace.name} Scores
            </button>
            <button type="button" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm text-slate-200">
              Vendor Scores
            </button>
          </div>
        </nav>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-white">Scoring dashboard</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Vendor leaderboard</p>
              <div className="mt-4 space-y-3 text-sm text-slate-200">
                {workspace.scores
                  .slice()
                  .sort((left, right) => right.score - left.score)
                  .map((score, index) => (
                    <div key={`${score.vendor}-${index}`} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <span>{index + 1}. {score.vendor}</span>
                      <span>{score.score}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Scores by scorer</p>
              <div className="mt-4 space-y-3 text-sm text-slate-200">
                {workspace.scores.map((score) => (
                  <div key={`${score.scorer}-${score.vendor}`} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <p className="font-medium text-white">{score.scorer}</p>
                    <p className="mt-1 text-slate-300">{score.vendor}: {score.score}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
