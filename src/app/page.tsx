"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  assertCompanyAccess,
  assertCompanyAdmin,
  assertProjectAccess,
  buildCompanyMembership,
  buildScorerAssignment,
  buildVendorAssignment,
  canAccessCompany,
  demoCompanies,
  demoMembers,
  getSsoProviderLabel,
  ssoProviderOptions,
  type Company,
  type CompanyMembership,
  type CompanyRole,
  type ScorerAssignment,
  type SessionUser,
  type SsoProvider,
  type VendorProjectAssignment,
} from "@/lib/companyAccess";
import {
  buildProjectId,
  buildRequirementImportPlan,
  parseRequirementFile,
  type Project,
  type RequirementImportSummary,
  type RequirementRecord,
} from "@/lib/projectRequirements";
import { calculateVendorTotals, type VendorScoreRecord } from "@/lib/scoring";
import { buildDeadlineStatus, getReminderMessage, type DeadlineStatus } from "@/lib/deadlines";

const temporaryUsers: SessionUser[] = [
  {
    userId: "u-company-admin",
    companyId: "cmp-acme",
    role: "company-admin",
    displayName: "Priya Singh",
  },
  {
    userId: "u-scorer",
    companyId: "cmp-acme",
    role: "company-scorer",
    displayName: "Sam Lee",
  },
  {
    userId: "u-vendor",
    companyId: "cmp-beta",
    role: "vendor",
    displayName: "Northwind Labs",
  },
];

const demoProjects: Project[] = [
  {
    id: "cmp-acme-proj-hr-platform",
    companyId: "cmp-acme",
    name: "HR Platform Vendor Selection",
    createdAt: "2026-10-12",
  },
  {
    id: "cmp-beta-proj-supply",
    companyId: "cmp-beta",
    name: "Supply Chain RFP",
    createdAt: "2026-10-18",
  },
];

const demoProjectVendors: VendorProjectAssignment[] = [
  {
    id: "vendor-acme-1",
    companyId: "cmp-acme",
    projectId: "cmp-acme-proj-hr-platform",
    userId: "vendor-northwind",
    displayName: "Northwind Labs",
    email: "vendor@northwind.example",
    status: "invited",
  },
  {
    id: "vendor-acme-2",
    companyId: "cmp-acme",
    projectId: "cmp-acme-proj-hr-platform",
    userId: "vendor-summit",
    displayName: "Summit Systems",
    email: "vendor@summit.example",
    status: "active",
  },
];

const demoProjectScorers: ScorerAssignment[] = [
  {
    id: "scorer-acme-1",
    companyId: "cmp-acme",
    projectId: "cmp-acme-proj-hr-platform",
    userId: "scorer-priya",
    displayName: "Priya Singh",
    email: "priya@acme.example",
    role: "individual",
    status: "in-progress",
  },
  {
    id: "scorer-acme-2",
    companyId: "cmp-acme",
    projectId: "cmp-acme-proj-hr-platform",
    userId: "scorer-ops",
    displayName: "Operations Team",
    email: "ops@acme.example",
    role: "department",
    departmentName: "Operations",
    status: "not-started",
  },
];

const demoProjectRequirements: Record<string, RequirementRecord[]> = {
  "cmp-acme-proj-hr-platform": [
    {
      id: "REQ-101",
      text: "The solution must support role-based access for HR administrators and managers.",
      type: "user-story",
      priority: 9,
      status: "active",
      updatedAt: "2026-10-12T09:00:00.000Z",
    },
    {
      id: "REQ-102",
      text: "The product must provide audit logs for candidate and employee data changes.",
      type: "nfr",
      priority: 3,
      status: "active",
      updatedAt: "2026-10-12T09:05:00.000Z",
    },
    {
      id: "REQ-103",
      text: "The vendor should support employee self-service onboarding workflows.",
      type: "user-story",
      priority: 1,
      status: "active",
      updatedAt: "2026-10-12T09:08:00.000Z",
    },
  ],
  "cmp-beta-proj-supply": [
    {
      id: "REQ-201",
      text: "The system should provide live inventory tracking across supplier locations.",
      type: "user-story",
      priority: 9,
      status: "active",
      updatedAt: "2026-10-18T10:00:00.000Z",
    },
    {
      id: "REQ-202",
      text: "The platform must support automated supplier onboarding and validation workflows.",
      type: "user-story",
      priority: 3,
      status: "active",
      updatedAt: "2026-10-18T10:05:00.000Z",
    },
  ],
};

const demoVendorScores: Record<string, VendorScoreRecord[]> = {
  "vendor-northwind": [
    { vendorId: "vendor-northwind", requirementId: "REQ-101", score: 1, enteredBy: "vendor", enteredAt: "2026-10-15T08:00:00.000Z" },
    { vendorId: "vendor-northwind", requirementId: "REQ-102", score: 0, enteredBy: "vendor", enteredAt: "2026-10-15T08:10:00.000Z" },
    { vendorId: "vendor-northwind", requirementId: "REQ-103", score: 1, enteredBy: "vendor", enteredAt: "2026-10-15T08:20:00.000Z" },
  ],
  "vendor-summit": [
    { vendorId: "vendor-summit", requirementId: "REQ-101", score: 1, enteredBy: "vendor", enteredAt: "2026-10-16T08:00:00.000Z" },
    { vendorId: "vendor-summit", requirementId: "REQ-102", score: 1, enteredBy: "vendor", enteredAt: "2026-10-16T08:10:00.000Z" },
    { vendorId: "vendor-summit", requirementId: "REQ-103", score: 0, enteredBy: "vendor", enteredAt: "2026-10-16T08:20:00.000Z" },
  ],
};

const demoProjectDeadlines: DeadlineStatus[] = [
  buildDeadlineStatus(
    "cmp-acme-proj-hr-platform",
    "cmp-acme",
    "vendor",
    "Northwind Labs",
    "2026-10-30T17:00:00.000Z",
    true,
    false,
  ),
  buildDeadlineStatus(
    "cmp-acme-proj-hr-platform",
    "cmp-acme",
    "scorer",
    "Priya Singh",
    "2026-10-28T12:00:00.000Z",
    true,
    true,
  ),
  buildDeadlineStatus(
    "cmp-acme-proj-hr-platform",
    "cmp-acme",
    "scorer",
    "Operations Team",
    "2026-10-27T12:00:00.000Z",
    false,
    false,
  ),
];

export default function Home() {
  const [selectedCompanyId, setSelectedCompanyId] = useState("cmp-acme");
  const [session, setSession] = useState<SessionUser | null>(temporaryUsers[0]);
  const [companies, setCompanies] = useState<Company[]>(demoCompanies);
  const [selectedSsoProvider, setSelectedSsoProvider] = useState<SsoProvider>("microsoft-entra");
  const [members, setMembers] = useState<CompanyMembership[]>(demoMembers);
  const [projects, setProjects] = useState<Project[]>(demoProjects);
  const [vendors, setVendors] = useState<VendorProjectAssignment[]>(demoProjectVendors);
  const [scorers, setScorers] = useState<ScorerAssignment[]>(demoProjectScorers);
  const [projectRequirements, setProjectRequirements] = useState<Record<string, RequirementRecord[]>>(
    demoProjectRequirements,
  );
  const [selectedProjectId, setSelectedProjectId] = useState("cmp-acme-proj-hr-platform");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<CompanyRole>("company-scorer");
  const [newProjectName, setNewProjectName] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorEmail, setNewVendorEmail] = useState("");
  const [newScorerName, setNewScorerName] = useState("");
  const [newScorerEmail, setNewScorerEmail] = useState("");
  const [newScorerType, setNewScorerType] = useState<"individual" | "department">("individual");
  const [newScorerDepartment, setNewScorerDepartment] = useState("");
  const [importPreview, setImportPreview] = useState<RequirementRecord[]>([]);
  const [importSummary, setImportSummary] = useState<RequirementImportSummary | null>(null);
  const [projectDeadlines, setProjectDeadlines] = useState<DeadlineStatus[]>(demoProjectDeadlines);
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? companies[0],
    [companies, selectedCompanyId],
  );

  useEffect(() => {
    setCurrentTime(Date.now());
  }, []);

  useEffect(() => {
    if (selectedCompany) {
      setSelectedSsoProvider(selectedCompany.ssoProvider ?? "temporary-login");
    }
  }, [selectedCompany]);

  const companyMembers = useMemo(
    () => members.filter((member) => member.companyId === selectedCompanyId),
    [members, selectedCompanyId],
  );

  const companyProjects = useMemo(
    () => projects.filter((project) => project.companyId === selectedCompanyId),
    [projects, selectedCompanyId],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? companyProjects[0],
    [companyProjects, projects, selectedProjectId],
  );

  const selectedProjectRequirements = useMemo(
    () => projectRequirements[selectedProjectId] ?? [],
    [projectRequirements, selectedProjectId],
  );

  const projectVendors = useMemo(
    () => vendors.filter((vendor) => vendor.companyId === selectedCompanyId && vendor.projectId === selectedProjectId),
    [selectedCompanyId, selectedProjectId, vendors],
  );

  const projectScorers = useMemo(
    () => scorers.filter((scorer) => scorer.companyId === selectedCompanyId && scorer.projectId === selectedProjectId),
    [scorers, selectedCompanyId, selectedProjectId],
  );

  const vendorDashboardRows = useMemo(
    () =>
      projectVendors.map((vendor) => {
        const totals = calculateVendorTotals(
          selectedProjectRequirements,
          demoVendorScores[vendor.userId] ?? [],
          vendor.userId,
        );

        return {
          ...totals,
          vendorName: vendor.displayName,
        };
      }),
    [projectVendors, selectedProjectRequirements],
  );

  const topVendor = useMemo(
    () =>
      vendorDashboardRows.reduce<typeof vendorDashboardRows[number] | null>((best, current) => {
        if (!best || current.total > best.total) {
          return current;
        }

        return best;
      }, null),
    [vendorDashboardRows],
  );

  const selectedProjectDeadlines = useMemo(
    () =>
      projectDeadlines.filter(
        (deadline) => deadline.projectId === selectedProjectId && deadline.companyId === selectedCompanyId,
      ),
    [projectDeadlines, selectedCompanyId, selectedProjectId],
  );

  const accessAllowed = canAccessCompany(session, selectedCompanyId);

  const handleDemoLogin = (user: SessionUser) => {
    setSession(user);
    setSelectedCompanyId(user.companyId);
  };

  const handleCreateCompany = () => {
    if (!newCompanyName.trim()) return;

    const companyId = `cmp-${newCompanyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const nextCompany: Company = {
      id: companyId,
      name: newCompanyName.trim(),
      adminUserId: `u-${companyId}-admin`,
      ssoProvider: selectedSsoProvider,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    setCompanies((current) => [...current, nextCompany]);
    setSelectedCompanyId(companyId);
    setNewCompanyName("");
    setSelectedSsoProvider(selectedSsoProvider);
  };

  const handleSetCompanySsoProvider = (provider: SsoProvider) => {
    setSelectedSsoProvider(provider);
    setCompanies((current) =>
      current.map((company) =>
        company.id === selectedCompanyId ? { ...company, ssoProvider: provider } : company,
      ),
    );
  };

  const handleAddMember = () => {
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;

    const nextMembership = buildCompanyMembership(
      selectedCompanyId,
      newMemberName.trim(),
      newMemberEmail.trim(),
      newMemberRole,
    );

    setMembers((current) => [...current, nextMembership]);
    setNewMemberName("");
    setNewMemberEmail("");
    setNewMemberRole("company-scorer");
  };

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;

    const projectId = buildProjectId(selectedCompanyId, newProjectName.trim());
    const nextProject: Project = {
      id: projectId,
      name: newProjectName.trim(),
      companyId: selectedCompanyId,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    setProjects((current) => [...current, nextProject]);
    setProjectRequirements((current) => ({
      ...current,
      [projectId]: [],
    }));
    setSelectedProjectId(projectId);
    setNewProjectName("");
  };

  const handleAddVendor = () => {
    if (!newVendorName.trim() || !newVendorEmail.trim() || !selectedProjectId) return;

    const nextVendor = buildVendorAssignment(
      selectedCompanyId,
      selectedProjectId,
      newVendorName.trim(),
      newVendorEmail.trim(),
    );

    setVendors((current) => [...current, nextVendor]);
    setNewVendorName("");
    setNewVendorEmail("");
  };

  const handleAddScorer = () => {
    if (!newScorerName.trim() || !newScorerEmail.trim() || !selectedProjectId) return;

    const nextScorer = buildScorerAssignment(
      selectedCompanyId,
      selectedProjectId,
      newScorerName.trim(),
      newScorerEmail.trim(),
      newScorerType,
      newScorerType === "department" ? (newScorerDepartment.trim() || "Operations") : undefined,
    );

    setScorers((current) => [...current, nextScorer]);
    setNewScorerName("");
    setNewScorerEmail("");
    setNewScorerDepartment("");
    setNewScorerType("individual");
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const imported = await parseRequirementFile(file);
    if (!imported.length) {
      setImportPreview([]);
      setImportSummary(null);
      return;
    }

    const plan = buildRequirementImportPlan(selectedProjectRequirements, imported);
    setImportPreview(imported);
    setImportSummary(plan.summary);
  };

  const handleApplyImport = () => {
    if (!selectedProjectId || !importPreview.length) return;

    const plan = buildRequirementImportPlan(selectedProjectRequirements, importPreview);
    setProjectRequirements((current) => ({
      ...current,
      [selectedProjectId]: plan.next,
    }));
    setImportPreview([]);
    setImportSummary(null);
  };

  const companyCheck = (() => {
    try {
      assertCompanyAccess(session, selectedCompanyId);
      return "Access granted";
    } catch (error) {
      return error instanceof Error ? error.message : "Access denied";
    }
  })();

  const projectCheck = (() => {
    try {
      const allowedUserIds = projectVendors
        .filter((vendor) => vendor.companyId === selectedCompanyId && vendor.projectId === selectedProjectId)
        .map((vendor) => vendor.userId);

      assertProjectAccess(session, selectedCompanyId, selectedProjectId, allowedUserIds);
      return "Project access granted";
    } catch (error) {
      return error instanceof Error ? error.message : "Project access denied";
    }
  })();

  const adminCheck = (() => {
    try {
      assertCompanyAdmin(session);
      return "Admin rights confirmed";
    } catch (error) {
      return error instanceof Error ? error.message : "Admin rights denied";
    }
  })();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
            Phase 7 • Final dashboard and totals
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Final dashboard and hand-worked totals sample
          </h1>
          <p className="mt-4 max-w-4xl text-sm leading-6 text-slate-300">
            This phase brings the business-facing summary together: weighted totals, vendor comparisons,
            missing scores, and a hand-worked sample showing how the final recommendation is formed.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Temporary login</h2>
            <div className="space-y-3">
              {temporaryUsers.map((user) => (
                <button
                  key={user.userId}
                  type="button"
                  onClick={() => handleDemoLogin(user)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    session?.userId === user.userId
                      ? "border-sky-400 bg-sky-500/10 text-sky-100"
                      : "border-slate-700 bg-slate-950/50 text-slate-200 hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{user.displayName}</div>
                      <div className="text-xs uppercase tracking-[0.15em] text-slate-400">
                        {user.role}
                      </div>
                    </div>
                    <span className="rounded-full border border-slate-600 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                      {companies.find((company) => company.id === user.companyId)?.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Company selection</h2>
            <div className="space-y-3">
              {companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => setSelectedCompanyId(company.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedCompany.id === company.id
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-700 bg-slate-950/50 text-slate-200 hover:border-slate-500"
                  }`}
                >
                  <div className="font-medium">{company.name}</div>
                  <div className="text-xs uppercase tracking-[0.15em] text-slate-400">
                    {company.id} • {company.ssoProvider ?? "pending SSO"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Current user</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">{session?.displayName ?? "Not signed in"}</h3>
            <p className="mt-2 text-sm text-slate-300">Role: {session?.role ?? "none"}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Selected company</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">{selectedCompany.name}</h3>
            <p className="mt-2 text-sm text-slate-300">ID: {selectedCompany.id}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Server check</p>
            <h3 className={`mt-3 text-2xl font-semibold ${accessAllowed ? "text-emerald-300" : "text-rose-300"}`}>
              {accessAllowed ? "Allowed" : "Blocked"}
            </h3>
            <p className="mt-2 text-sm text-slate-300">{companyCheck}</p>
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Create company</h2>
            <div className="space-y-3">
              <input
                value={newCompanyName}
                onChange={(event) => setNewCompanyName(event.target.value)}
                placeholder="Enter company name"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
              />
              <select
                value={selectedSsoProvider}
                onChange={(event) => setSelectedSsoProvider(event.target.value as SsoProvider)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
              >
                {ssoProviderOptions.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleCreateCompany}
                className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400"
              >
                Create company
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">SSO for this company</h2>
            <div className="space-y-3">
              <p className="text-sm text-slate-300">
                Current provider: <span className="font-semibold text-sky-200">{getSsoProviderLabel(selectedCompany?.ssoProvider ?? null)}</span>
              </p>
              <select
                value={selectedCompany?.ssoProvider ?? "temporary-login"}
                onChange={(event) => handleSetCompanySsoProvider(event.target.value as SsoProvider)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
              >
                {ssoProviderOptions.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
                {ssoProviderOptions.find((option) => option.value === (selectedCompany?.ssoProvider ?? "temporary-login"))?.description}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Add member</h2>
            <div className="space-y-3">
              <input
                value={newMemberName}
                onChange={(event) => setNewMemberName(event.target.value)}
                placeholder="Member name"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
              />
              <input
                value={newMemberEmail}
                onChange={(event) => setNewMemberEmail(event.target.value)}
                placeholder="member@company.example"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
              />
              <select
                value={newMemberRole}
                onChange={(event) => setNewMemberRole(event.target.value as CompanyRole)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
              >
                <option value="company-admin">Company admin</option>
                <option value="company-scorer">Company scorer</option>
                <option value="vendor">Vendor</option>
              </select>
              <button
                type="button"
                onClick={handleAddMember}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
              >
                Add member
              </button>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Projects</h2>
            <div className="space-y-3">
              {companyProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedProject?.id === project.id
                      ? "border-violet-400 bg-violet-500/10 text-violet-100"
                      : "border-slate-700 bg-slate-950/50 text-slate-200 hover:border-slate-500"
                  }`}
                >
                  <div className="font-medium">{project.name}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.15em] text-slate-400">
                    {project.id} • {project.createdAt}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <h3 className="mb-3 text-lg font-semibold text-white">Create project</h3>
              <input
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="New project name"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400"
              />
              <button
                type="button"
                onClick={handleCreateProject}
                className="mt-3 rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400"
              >
                Add project
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">Requirements</h2>
              <span className="rounded-full border border-slate-600 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-slate-300">
                {selectedProject?.name ?? "Project"}
              </span>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-200">Import requirements</label>
              <input
                type="file"
                accept=".csv,.xls,.xlsx"
                onChange={handleImportFile}
                className="block w-full rounded-xl border border-dashed border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-sky-500 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-950"
              />

              {importSummary && (
                <div className="mt-4 rounded-xl border border-emerald-600/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  <p className="font-medium">Import preview</p>
                  <div className="mt-2 flex gap-3 text-xs uppercase tracking-[0.12em] text-emerald-200">
                    <span>Added: {importSummary.added}</span>
                    <span>Updated: {importSummary.updated}</span>
                    <span>Withdrawn: {importSummary.withdrawn}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyImport}
                    className="mt-3 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
                  >
                    Apply import
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-3">
              {selectedProjectRequirements.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400">
                  No requirements have been loaded for this project yet.
                </div>
              ) : (
                selectedProjectRequirements.map((requirement) => (
                  <div
                    key={requirement.id}
                    className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{requirement.id}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-slate-400">
                          {requirement.type} • priority {requirement.priority}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${
                          requirement.status === "withdrawn"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                            : "border-slate-600 bg-slate-900 text-slate-300"
                        }`}
                      >
                        {requirement.status}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-slate-300">{requirement.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Project access</h2>
            <p className="text-sm text-slate-300">{projectCheck}</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Recommended auth provider</h2>
            <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-4 text-sm text-sky-100">
              <p className="font-semibold">WorkOS</p>
              <p className="mt-2 text-sky-50/90">
                WorkOS is the best fit here because it supports per-company SSO, Microsoft Entra, Google Workspace,
                SAML, and OIDC, and it works cleanly with a Next.js app plus a Convex backend. It keeps the app
                easy to switch from temporary login to real production auth without rewriting the whole product.
              </p>
              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-sky-200">
                Cost: usually a small monthly platform fee plus per-user or per-organization pricing, depending on scale.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Vendor and scorer rules</h2>
            <ul className="space-y-3 text-sm leading-6 text-slate-300">
              <li>• Vendors see only their assigned project and their own scores, not other vendors or internal scorer views.</li>
              <li>• Scorers are assigned to a project and can be individual or department-based.</li>
              <li>• Company permissions are validated on the server side, not only through hidden UI rules.</li>
              <li>• Project-level access is enforced before any vendor or scorer can view scoring data.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">SSO rollout plan</h2>
            <ol className="space-y-3 text-sm leading-6 text-slate-300">
              <li>1. Keep temporary login for demo and internal testing.</li>
              <li>2. Configure a company-specific provider such as Microsoft Entra or Google Workspace.</li>
              <li>3. Map each staff member to the correct company and role via the SSO identity claim.</li>
              <li>4. Keep vendors separate with emailed sign-in links and project-scoped access only.</li>
            </ol>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Final dashboard</h2>
            {topVendor && (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                Leading vendor: {topVendor.vendorName}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {vendorDashboardRows.map((vendor) => (
              <div
                key={vendor.vendorId}
                className={`rounded-xl border p-4 ${
                  topVendor?.vendorId === vendor.vendorId
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-950/60"
                }`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium text-white">{vendor.vendorName}</div>
                    <div className="text-xs uppercase tracking-[0.15em] text-slate-400">
                      {vendor.scoredCount} scored • {vendor.missingCount} missing • {vendor.unmetCount} unmet
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm text-slate-200">
                    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">User stories</div>
                      <div className="mt-1 font-semibold text-white">{vendor.userStoryTotal}</div>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">NFRs</div>
                      <div className="mt-1 font-semibold text-white">{vendor.nfrTotal}</div>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Total</div>
                      <div className="mt-1 font-semibold text-white">{vendor.total}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Hand-worked totals sample</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-sm font-semibold text-white">Northwind Labs example</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>• REQ-101: priority 9 × score 1 = 9</li>
                <li>• REQ-102: priority 3 × score 0 = 0, then subtract 1 unmet penalty</li>
                <li>• REQ-103: priority 1 × score 1 = 1</li>
                <li>• Total weighted score = 9 + 1 - 1 = 9</li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-sm font-semibold text-white">Recommendation logic</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>• Official total uses company scorer averages, not vendor self-score.</li>
                <li>• The vendor with the highest combined total is highlighted for review.</li>
                <li>• Unscored items remain visible so missing work is obvious.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Phase 6 deadlines and reminders</h2>
          <div className="space-y-3">
            {selectedProjectDeadlines.map((deadline) => (
              <div key={deadline.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium text-white">{deadline.targetName}</div>
                    <div className="text-xs uppercase tracking-[0.15em] text-slate-400">
                      {deadline.targetType} • {deadline.status}
                    </div>
                  </div>
                  <div className="text-sm text-slate-300">
                    due {new Date(deadline.dueAt).toLocaleString()}
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">
                  {currentTime === null
                    ? `${deadline.targetName} still needs action before the deadline.`
                    : getReminderMessage(deadline, currentTime)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Project vendors</h2>
            <div className="space-y-3">
              {projectVendors.map((vendor) => (
                <div key={vendor.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{vendor.displayName}</div>
                      <div className="text-sm text-slate-400">{vendor.email}</div>
                    </div>
                    <span className="rounded-full border border-slate-600 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-slate-300">
                      {vendor.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <h3 className="mb-3 text-lg font-semibold text-white">Add vendor</h3>
              <input
                value={newVendorName}
                onChange={(event) => setNewVendorName(event.target.value)}
                placeholder="Vendor name"
                className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
              />
              <input
                value={newVendorEmail}
                onChange={(event) => setNewVendorEmail(event.target.value)}
                placeholder="vendor@example.com"
                className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
              />
              <button
                type="button"
                onClick={handleAddVendor}
                className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400"
              >
                Add vendor
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Project scorers</h2>
            <div className="space-y-3">
              {projectScorers.map((scorer) => (
                <div key={scorer.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{scorer.displayName}</div>
                      <div className="text-sm text-slate-400">{scorer.email}</div>
                    </div>
                    <span className="rounded-full border border-slate-600 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-slate-300">
                      {scorer.role}
                    </span>
                  </div>
                  {scorer.departmentName && (
                    <div className="mt-2 text-xs uppercase tracking-[0.15em] text-slate-400">
                      {scorer.departmentName}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <h3 className="mb-3 text-lg font-semibold text-white">Add scorer</h3>
              <input
                value={newScorerName}
                onChange={(event) => setNewScorerName(event.target.value)}
                placeholder="Scorer name"
                className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400"
              />
              <input
                value={newScorerEmail}
                onChange={(event) => setNewScorerEmail(event.target.value)}
                placeholder="scorer@example.com"
                className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400"
              />
              <select
                value={newScorerType}
                onChange={(event) => setNewScorerType(event.target.value as "individual" | "department")}
                className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              >
                <option value="individual">Individual scorer</option>
                <option value="department">Department scorer</option>
              </select>
              {newScorerType === "department" && (
                <input
                  value={newScorerDepartment}
                  onChange={(event) => setNewScorerDepartment(event.target.value)}
                  placeholder="Department name"
                  className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400"
                />
              )}
              <button
                type="button"
                onClick={handleAddScorer}
                className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400"
              >
                Add scorer
              </button>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Company membership</h2>
          <div className="space-y-3">
            {companyMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                <div>
                  <div className="font-medium text-white">{member.displayName}</div>
                  <div className="text-sm text-slate-400">{member.email}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-slate-600 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-slate-300">
                    {member.role}
                  </span>
                  <span className="rounded-full border border-slate-600 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-slate-300">
                    {member.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
