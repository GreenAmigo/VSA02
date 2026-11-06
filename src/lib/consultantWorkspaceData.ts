export type WorkspaceProject = {
  id: string;
  name: string;
  status: "Active" | "Draft";
  vendorCount: number;
  scorerCount: number;
  requirementCount: number;
  leadingVendor: string;
};

export type WorkspacePerson = {
  id: string;
  name: string;
  role: string;
  team: string;
  project: string;
};

export type WorkspaceVendor = {
  id: string;
  name: string;
  status: "Active" | "Invited" | "Submitted";
  project: string;
  score: number;
};

export type WorkspaceRequirement = {
  id: string;
  title: string;
  type: "Functional" | "Non-Functional";
  priority: "High" | "Medium" | "Low";
  status: "Active" | "Draft";
};

export type WorkspaceScore = {
  scorer: string;
  vendor: string;
  score: number;
  status: "Submitted" | "Pending";
};

export type ConsultantWorkspace = {
  id: string;
  slug: string;
  name: string;
  isTestData: boolean;
  projects: WorkspaceProject[];
  people: WorkspacePerson[];
  vendors: WorkspaceVendor[];
  requirements: WorkspaceRequirement[];
  scores: WorkspaceScore[];
};

export type ConsultantActivityLogEntry = {
  id: string;
  actor: string;
  action: string;
  when: string;
  workspace: string;
  details: string;
};

export const consultantActivityLog: ConsultantActivityLogEntry[] = [
  {
    id: "log-1",
    actor: "Frazer Knight",
    action: "Granted VS Consultant access",
    when: "2026-11-06 09:12",
    workspace: "Acme Health",
    details: "Granted VS Consultant role to frazerknight@hotmail.com across 2 workspaces.",
  },
  {
    id: "log-2",
    actor: "System seed",
    action: "Seeded preview workspace",
    when: "2026-11-06 08:30",
    workspace: "Beta Logistics",
    details: "Created preview-only company seed data and tagged it as test data.",
  },
  {
    id: "log-3",
    actor: "Priya Singh",
    action: "Imported requirements",
    when: "2026-11-06 07:45",
    workspace: "Acme Health",
    details: "Imported 18 requirements into the HR Platform Review project.",
  },
];

export const consultantWorkspaces: ConsultantWorkspace[] = [
  {
    id: "ws-acme-health",
    slug: "acme-health",
    name: "Acme Health",
    isTestData: true,
    projects: [
      {
        id: "project-hr-platform",
        name: "HR Platform Review",
        status: "Active",
        vendorCount: 3,
        scorerCount: 5,
        requirementCount: 18,
        leadingVendor: "Northwind Labs",
      },
      {
        id: "project-payroll",
        name: "Payroll Platform",
        status: "Draft",
        vendorCount: 2,
        scorerCount: 3,
        requirementCount: 9,
        leadingVendor: "Pending",
      },
    ],
    people: [
      { id: "person-priya", name: "Priya Singh", role: "VS Consultant", team: "Delivery", project: "Workspace" },
      { id: "person-marcus", name: "Marcus Reed", role: "Project owner", team: "Operations", project: "HR Platform Review" },
      { id: "person-leah", name: "Leah Stone", role: "Scorer", team: "Procurement", project: "Payroll Platform" },
    ],
    vendors: [
      { id: "vendor-northwind", name: "Northwind Labs", status: "Active", project: "HR Platform Review", score: 89 },
      { id: "vendor-summit", name: "Summit Systems", status: "Submitted", project: "HR Platform Review", score: 84 },
    ],
    requirements: [
      { id: "REQ-101", title: "Recruitment workflow reporting", type: "Functional", priority: "High", status: "Active" },
      { id: "REQ-102", title: "Audit and logging controls", type: "Non-Functional", priority: "High", status: "Active" },
    ],
    scores: [
      { scorer: "Priya Singh", vendor: "Northwind Labs", score: 89, status: "Submitted" },
      { scorer: "Operations Team", vendor: "Summit Systems", score: 84, status: "Submitted" },
    ],
  },
  {
    id: "ws-beta-logistics",
    slug: "beta-logistics",
    name: "Beta Logistics",
    isTestData: true,
    projects: [
      {
        id: "project-fleet",
        name: "Fleet Sourcing",
        status: "Active",
        vendorCount: 4,
        scorerCount: 4,
        requirementCount: 21,
        leadingVendor: "Apex Supply",
      },
    ],
    people: [
      { id: "person-nina", name: "Nina Foster", role: "VS Consultant", team: "Delivery", project: "Workspace" },
      { id: "person-jon", name: "Jon Patel", role: "Procurement lead", team: "Logistics", project: "Fleet Sourcing" },
    ],
    vendors: [{ id: "vendor-apex", name: "Apex Supply", status: "Active", project: "Fleet Sourcing", score: 92 }],
    requirements: [{ id: "REQ-201", title: "Route optimisation planning", type: "Functional", priority: "High", status: "Active" }],
    scores: [{ scorer: "Nina Foster", vendor: "Apex Supply", score: 92, status: "Submitted" }],
  },
];

export function getConsultantWorkspaceBySlug(slug: string) {
  return consultantWorkspaces.find((workspace) => workspace.slug === slug) ?? consultantWorkspaces[0];
}
