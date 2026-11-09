"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

import { api } from "../../convex/_generated/api";
import { getProjectDraftError, normalizeProjectName } from "@/lib/projectDraft";
import { getPersonInviteDraftError } from "@/lib/projectPeople";
import {
  getRequirementImportValidationError,
  parseRequirementFile,
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
  type: "user-story" | "nfr";
  priority: 9 | 3 | 1 | 0;
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

function TopBar({ title }: { title: string }) {
  const { user } = useAuth();
  const access = useQuery(api.access.getCurrentUserAccess, user ? {} : "skip") as
    | { email?: string | null; role?: string | null; isConsultant?: boolean }
    | undefined;

  const displayRole = access?.isConsultant ? "VS Consultant" : access?.role ? access.role.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "User";

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
  const [name, setName] = useState("Acme Health");
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
  type WorkspaceSection = "overview" | "projects" | "people" | "vendors" | "requirements" | "scoring";
  type WorkspaceProject = {
    id: string;
    name: string;
    status: "Active" | "Draft";
    vendors: number;
    scorers: number;
    requirements: number;
    leader: string;
  };
  type WorkspacePerson = {
    id: string;
    name: string;
    role: string;
    team: string;
    project: string;
  };
  type WorkspaceVendor = {
    id: string;
    name: string;
    status: "Active" | "Invited" | "Submitted";
    project: string;
    score: number;
  };
  type WorkspaceRequirement = {
    id: string;
    title: string;
    type: "Functional" | "Non-Functional";
    priority: "High" | "Medium" | "Low";
    status: "Active" | "Draft";
  };
  type WorkspaceScore = {
    scorer: string;
    vendor: string;
    score: number;
    status: "Submitted" | "Pending";
  };

  const initialWorkspaces = [
    {
      id: "acme-health",
      name: "Acme Health",
      projects: [
        { id: "project-1", name: "HR Platform Review", status: "Active", vendors: 3, scorers: 5, requirements: 18, leader: "Northwind Labs" },
        { id: "project-2", name: "Payroll Platform", status: "Draft", vendors: 2, scorers: 3, requirements: 9, leader: "Pending" },
      ] as WorkspaceProject[],
      people: [
        { id: "person-1", name: "Priya Singh", role: "VS Consultant", team: "Delivery", project: "Workspace" },
        { id: "person-2", name: "Marcus Reed", role: "Project owner", team: "Operations", project: "HR Platform Review" },
        { id: "person-3", name: "Leah Stone", role: "Scorer", team: "Procurement", project: "Payroll Platform" },
      ] as WorkspacePerson[],
      vendors: [
        { id: "vendor-1", name: "Northwind Labs", status: "Active", project: "HR Platform Review", score: 89 },
        { id: "vendor-2", name: "Summit Systems", status: "Submitted", project: "HR Platform Review", score: 84 },
      ] as WorkspaceVendor[],
      requirements: [
        { id: "REQ-101", title: "Recruitment workflow reporting", type: "Functional", priority: "High", status: "Active" },
        { id: "REQ-102", title: "Audit and logging controls", type: "Non-Functional", priority: "High", status: "Active" },
      ] as WorkspaceRequirement[],
      scores: [
        { scorer: "Priya Singh", vendor: "Northwind Labs", score: 89, status: "Submitted" },
        { scorer: "Operations Team", vendor: "Summit Systems", score: 84, status: "Submitted" },
      ] as WorkspaceScore[],
    },
    {
      id: "beta-logistics",
      name: "Beta Logistics",
      projects: [
        { id: "project-3", name: "Fleet Sourcing", status: "Active", vendors: 4, scorers: 4, requirements: 21, leader: "Apex Supply" },
      ] as WorkspaceProject[],
      people: [
        { id: "person-4", name: "Nina Foster", role: "VS Consultant", team: "Delivery", project: "Workspace" },
        { id: "person-5", name: "Jon Patel", role: "Procurement lead", team: "Logistics", project: "Fleet Sourcing" },
      ] as WorkspacePerson[],
      vendors: [
        { id: "vendor-3", name: "Apex Supply", status: "Active", project: "Fleet Sourcing", score: 92 },
      ] as WorkspaceVendor[],
      requirements: [
        { id: "REQ-201", title: "Route optimisation planning", type: "Functional", priority: "High", status: "Active" },
      ] as WorkspaceRequirement[],
      scores: [
        { scorer: "Nina Foster", vendor: "Apex Supply", score: 92, status: "Submitted" },
      ] as WorkspaceScore[],
    },
  ];

  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaces[0].id);
  const [section, setSection] = useState<WorkspaceSection>("overview");
  const [selectedProjectId, setSelectedProjectId] = useState(initialWorkspaces[0].projects[0].id);
  const [selectedPeopleView, setSelectedPeopleView] = useState<"teams" | "manage">("teams");
  const [selectedVendorView, setSelectedVendorView] = useState<"manage" | "list">("list");
  const [selectedRequirementsView, setSelectedRequirementsView] = useState<"functional" | "non-functional">("functional");
  const [selectedScoringView, setSelectedScoringView] = useState<"company" | "vendor">("company");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0];
  const selectedProject = selectedWorkspace.projects.find((project) => project.id === selectedProjectId) ?? selectedWorkspace.projects[0];
  const workspaceMetrics = [
    { label: "Total companies", value: String(workspaces.length), helper: "Workspace count" },
    { label: "Projects", value: String(workspaces.reduce((total, workspace) => total + workspace.projects.length, 0)), helper: "Across all workspaces" },
    { label: "People", value: String(workspaces.reduce((total, workspace) => total + workspace.people.length, 0)), helper: "Across all companies" },
    { label: "Vendors", value: String(workspaces.reduce((total, workspace) => total + workspace.vendors.length, 0)), helper: "In active sourcing" },
  ];

  const addWorkspace = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newWorkspaceName.trim()) {
      return;
    }

    const newId = newWorkspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const workspace = {
      id: `${newId}-${Date.now()}`,
      name: newWorkspaceName.trim(),
      projects: [],
      people: [],
      vendors: [],
      requirements: [],
      scores: [],
    };

    setWorkspaces((current) => [...current, workspace]);
    setSelectedWorkspaceId(workspace.id);
    setSection("overview");
    setNewWorkspaceName("");
  };

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
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => {
                  setSelectedWorkspaceId(workspace.id);
                  setSection("overview");
                }}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${selectedWorkspaceId === workspace.id ? "border-sky-500 bg-sky-500/10 text-sky-100" : "border-slate-700 bg-slate-950 text-slate-200"}`}
              >
                <span>{workspace.name}</span>
                <StatusPill label={`${workspace.projects.length}`} />
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={addWorkspace} className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Add workspace</p>
          <input
            value={newWorkspaceName}
            onChange={(event) => setNewWorkspaceName(event.target.value)}
            placeholder="Company name"
            className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
          />
          <button type="submit" className="mt-3 w-full rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
            Add company workspace
          </button>
        </form>
      </aside>

      <main className="flex-1">
        <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Workspace landing</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">{selectedWorkspace.name}</h1>
            </div>
          </div>
        </header>

        <div className="space-y-6 p-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {workspaceMetrics.map((metric) => (
              <StatCard key={metric.label} label={metric.label} value={metric.value} helper={metric.helper} />
            ))}
          </section>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap gap-2">
              {(["overview", "projects", "people", "vendors", "requirements", "scoring"] as WorkspaceSection[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSection(item)}
                  className={`rounded-xl border px-3 py-2 text-sm capitalize ${section === item ? "border-sky-500 bg-sky-500/10 text-sky-200" : "border-slate-700 bg-slate-950 text-slate-300"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {section === "overview" && (
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Workspace dashboard</h2>
                  <button type="button" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
                    Manage company
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Projects</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{selectedWorkspace.projects.length}</p>
                    <p className="mt-1 text-sm text-slate-400">Projects in this company workspace</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">People</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{selectedWorkspace.people.length}</p>
                    <p className="mt-1 text-sm text-slate-400">Project owners, scorers, and teams</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Vendors</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{selectedWorkspace.vendors.length}</p>
                    <p className="mt-1 text-sm text-slate-400">Current vendor roster</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Workspace status</p>
                    <p className="mt-3 text-3xl font-semibold text-white">Live</p>
                    <p className="mt-1 text-sm text-slate-400">Company workspace is active</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold text-white">Workspace actions</h2>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">Add project to this company</div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">Manage people and teams</div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">Add or remove vendors</div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">Upload functional or non-functional requirements</div>
                </div>
              </div>
            </div>
          )}

          {section === "projects" && (
            <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
              <nav className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Projects</h2>
                  <button type="button" className="rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
                    Add Project
                  </button>
                </div>
                <div className="space-y-2">
                  {selectedWorkspace.projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedProjectId === project.id ? "border-sky-500 bg-sky-500/10 text-sky-100" : "border-slate-700 bg-slate-950 text-slate-200"}`}
                    >
                      {project.name}
                    </button>
                  ))}
                </div>
              </nav>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Project dashboard</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">{selectedProject.name}</h2>
                  </div>
                  <StatusPill label={selectedProject.status} />
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <StatCard label="Vendors" value={String(selectedProject.vendors)} helper="Active vendor count" />
                  <StatCard label="Scorers" value={String(selectedProject.scorers)} helper="Assigned scorers" />
                  <StatCard label="Requirements" value={String(selectedProject.requirements)} helper="Current project requirements" />
                  <StatCard label="Leading vendor" value={selectedProject.leader} helper="Current leader" />
                </div>
              </div>
            </div>
          )}

          {section === "people" && (
            <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
              <nav className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="space-y-2">
                  {[
                    { key: "teams", label: "Teams" },
                    { key: "manage", label: "Manage People" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSelectedPeopleView(item.key as "teams" | "manage")}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedPeopleView === item.key ? "border-sky-500 bg-sky-500/10 text-sky-100" : "border-slate-700 bg-slate-950 text-slate-200"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </nav>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold text-white">{selectedPeopleView === "teams" ? "Teams" : "Manage People"}</h2>
                <div className="mt-4 space-y-3">
                  {selectedWorkspace.people.map((person) => (
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
          )}

          {section === "vendors" && (
            <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
              <nav className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="space-y-2">
                  {[
                    { key: "list", label: "Vendors" },
                    { key: "manage", label: "Manage Vendors" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSelectedVendorView(item.key as "manage" | "list")}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedVendorView === item.key ? "border-sky-500 bg-sky-500/10 text-sky-100" : "border-slate-700 bg-slate-950 text-slate-200"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </nav>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold text-white">{selectedVendorView === "list" ? "Vendor dashboard" : "Manage Vendors"}</h2>
                <div className="mt-4 space-y-3">
                  {selectedWorkspace.vendors.map((vendor) => (
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
          )}

          {section === "requirements" && (
            <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
              <nav className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="space-y-2">
                  {[
                    { key: "functional", label: "Functional / User Stories" },
                    { key: "non-functional", label: "Non-Functional" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSelectedRequirementsView(item.key as "functional" | "non-functional")}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedRequirementsView === item.key ? "border-sky-500 bg-sky-500/10 text-sky-100" : "border-slate-700 bg-slate-950 text-slate-200"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </nav>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold text-white">Requirements dashboard</h2>
                <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-5">
                  <p className="text-base font-medium text-slate-200">Upload requirement file</p>
                  <p className="mt-2 text-sm text-slate-400">Select whether this upload is Functional or Non-Functional.</p>
                  <div className="mt-4 flex gap-4 text-sm text-slate-200">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="requirement-type" defaultChecked />
                      Functional
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="requirement-type" />
                      Non-Functional
                    </label>
                  </div>
                  <button type="button" className="mt-4 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
                    Upload CSV / Excel
                  </button>
                </div>

                <div className="mt-6 space-y-3">
                  {selectedWorkspace.requirements.map((requirement) => (
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
          )}

          {section === "scoring" && (
            <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
              <nav className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="space-y-2">
                  {[
                    { key: "company", label: "<company name> Scores" },
                    { key: "vendor", label: "Vendor Scores" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSelectedScoringView(item.key as "company" | "vendor")}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedScoringView === item.key ? "border-sky-500 bg-sky-500/10 text-sky-100" : "border-slate-700 bg-slate-950 text-slate-200"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </nav>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold text-white">Scoring dashboard</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Vendor leaderboard</p>
                    <div className="mt-4 space-y-3 text-sm text-slate-200">
                      {selectedWorkspace.scores
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
                      {selectedWorkspace.scores.map((score) => (
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
          )}
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
  const project = useQuery(api.access.getProject, isProtectedLoading ? "skip" : { projectId: projectId as any }) as ProjectRecord | undefined;
  const requirements = useQuery(api.access.listProjectRequirements, isProtectedLoading ? "skip" : { projectId: projectId as any }) as RequirementItem[] | undefined;
  const previewImport = useMutation(api.requirements.previewRequirementImport);
  const applyImport = useMutation(api.requirements.applyRequirementImport);
  const [preview, setPreview] = useState<any>(null);
  const [rows, setRows] = useState<RequirementRecord[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  if (isProtectedLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">Checking sign-in…</div>;
  }

  const importValidationError = getRequirementImportValidationError(rows);

  if (!project || !requirements) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Loading project requirements…</div>;
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const parsedRows = await parseRequirementFile(file);
    const validationError = getRequirementImportValidationError(parsedRows);
    setImportError(validationError);
    setRows(parsedRows);
    setPreview(null);

    if (validationError) {
      return;
    }

    const previewResult = await previewImport({
      projectId: projectId as any,
      rows: parsedRows.map(toImportRow),
    });

    setPreview(previewResult);
  };

  const handleApply = async () => {
    const validationError = getRequirementImportValidationError(rows);
    if (validationError) {
      setImportError(validationError);
      return;
    }

    const result = await applyImport({
      projectId: projectId as any,
      rows: rows.map(toImportRow),
      confirm: true,
    });

    setPreview({ summary: result.summary, count: result.count });
    setRows([]);
    setImportError(null);
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
              <label className="cursor-pointer rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
                Upload CSV
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} />
              </label>
            </div>

            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center">
              <p className="text-base font-medium text-slate-200">Drop a spreadsheet here or click to upload</p>
              <p className="mt-2 text-sm text-slate-400">Supports CSV and Excel files; rows are matched by requirement ID.</p>
            </div>

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
                      {preview.summary?.added ?? 0} added • {preview.summary?.updated ?? 0} updated • {preview.summary?.withdrawn ?? 0} withdrawn
                    </p>
                  </div>
                  <button
                    onClick={handleApply}
                    disabled={Boolean(importValidationError)}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    Confirm import
                  </button>
                </div>
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
                      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                        {row.type}
                      </span>
                    </div>
                    <p className="mt-2 text-base font-medium text-white">{row.text}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-sky-200">
                      {row.priority}
                    </span>
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
