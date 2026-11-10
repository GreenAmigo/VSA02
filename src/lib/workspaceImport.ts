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

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const normalized = Number.parseFloat(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(normalized) ? normalized : 0;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function normalizeProjectStatus(value: string | undefined): "Active" | "Draft" {
  const normalized = (value ?? "").toLowerCase();
  return normalized === "draft" ? "Draft" : "Active";
}

function normalizeRequirementType(value: string | undefined): "Functional" | "Non-Functional" {
  const normalized = (value ?? "").toLowerCase();
  return normalized.includes("non") ? "Non-Functional" : "Functional";
}

function normalizeRequirementPriority(value: string | undefined): "High" | "Medium" | "Low" {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return "High";
}

function normalizeRequirementStatus(value: string | undefined): "Active" | "Draft" {
  const normalized = (value ?? "").toLowerCase();
  return normalized === "draft" ? "Draft" : "Active";
}

function normalizeVendorStatus(value: string | undefined): "Active" | "Invited" | "Submitted" {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "invited") return "Invited";
  if (normalized === "submitted") return "Submitted";
  return "Active";
}

export function parseWorkspaceCsv(csvText: string): ConsultantWorkspace[] {
  const normalizedText = csvText.replace(/\r/g, "").trim();
  if (!normalizedText) {
    return [];
  }

  const lines = normalizedText
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record: Record<string, string> = {};

    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });

    return record;
  });

  const workspaceMap = new Map<string, ConsultantWorkspace>();

  const upsertProject = (workspace: ConsultantWorkspace, projectName: string, projectId: string, status: "Active" | "Draft") => {
    const key = projectId || projectName;
    const existing = workspace.projects.find((project) => project.id === key || project.name === projectName);

    if (existing) {
      existing.status = status;
      return existing;
    }

    const nextProject: WorkspaceProject = {
      id: key,
      name: projectName,
      status,
      vendorCount: 0,
      scorerCount: 0,
      requirementCount: 0,
      leadingVendor: "Pending",
    };

    workspace.projects.push(nextProject);
    return nextProject;
  };

  const upsertPerson = (workspace: ConsultantWorkspace, person: WorkspacePerson) => {
    const key = person.id || person.name;
    const existing = workspace.people.find((entry) => entry.id === key || entry.name === person.name);
    if (existing) {
      Object.assign(existing, person);
      return;
    }
    workspace.people.push(person);
  };

  const upsertVendor = (workspace: ConsultantWorkspace, vendor: WorkspaceVendor) => {
    const key = vendor.id || vendor.name;
    const existing = workspace.vendors.find((entry) => entry.id === key || entry.name === vendor.name);
    if (existing) {
      Object.assign(existing, vendor);
      return;
    }
    workspace.vendors.push(vendor);
  };

  const upsertRequirement = (workspace: ConsultantWorkspace, requirement: WorkspaceRequirement) => {
    const key = requirement.id || requirement.title;
    const existing = workspace.requirements.find((entry) => entry.id === key || entry.title === requirement.title);
    if (existing) {
      Object.assign(existing, requirement);
      return;
    }
    workspace.requirements.push(requirement);
  };

  const upsertScore = (workspace: ConsultantWorkspace, score: WorkspaceScore) => {
    const key = `${score.scorer}:${score.vendor}`;
    const existing = workspace.scores.find((entry) => `${entry.scorer}:${entry.vendor}` === key);
    if (existing) {
      Object.assign(existing, score);
      return;
    }
    workspace.scores.push(score);
  };

  for (const row of rows) {
    const workspaceName = row.workspace_name || row.name || row.company_name || "Workspace";
    const workspaceSlug = (row.workspace_slug || row.slug || slugify(workspaceName)).trim();
    const workspaceId = row.workspace_id || workspaceSlug;

    let workspace = workspaceMap.get(workspaceSlug);
    if (!workspace) {
      const nextWorkspace: ConsultantWorkspace = {
        id: workspaceId,
        slug: workspaceSlug,
        name: workspaceName,
        isTestData: false,
        projects: [],
        people: [],
        vendors: [],
        requirements: [],
        scores: [],
      };
      workspaceMap.set(workspaceSlug, nextWorkspace);
      workspace = nextWorkspace;
    }

    const projectName = (row.project_name || row.project || "").trim();
    if (projectName) {
      const projectId = row.project_id || `${workspace.slug}-${slugify(projectName)}`;
      const projectStatus = normalizeProjectStatus(row.project_status);
      const project = upsertProject(workspace, projectName, projectId, projectStatus);
      const vendorCount = parseNumber(row.vendor_count);
      const scorerCount = parseNumber(row.scorer_count);
      const requirementCount = parseNumber(row.requirement_count);

      if (vendorCount > 0) project.vendorCount = vendorCount;
      if (scorerCount > 0) project.scorerCount = scorerCount;
      if (requirementCount > 0) project.requirementCount = requirementCount;

      const leadingVendor = (row.leading_vendor || row.leading_vendor_name || "").trim();
      if (leadingVendor) project.leadingVendor = leadingVendor;
    }

    const personName = (row.person_name || row.name || "").trim();
    if (personName) {
      upsertPerson(workspace, {
        id: row.person_id || `${workspace.slug}-${slugify(personName)}`,
        name: personName,
        role: row.person_role || row.role || "Member",
        team: row.person_team || row.team || "General",
        project: row.person_project || row.project || projectName || workspace.name,
      });
    }

    const vendorName = (row.vendor_name || row.vendor || "").trim();
    if (vendorName) {
      upsertVendor(workspace, {
        id: row.vendor_id || `${workspace.slug}-${slugify(vendorName)}`,
        name: vendorName,
        status: normalizeVendorStatus(row.vendor_status),
        project: row.vendor_project || projectName || workspace.name,
        score: parseNumber(row.vendor_score || row.score_value),
      });
    }

    const requirementTitle = (row.requirement_title || row.requirement_text || row.title || "").trim();
    if (requirementTitle) {
      upsertRequirement(workspace, {
        id: row.requirement_id || `${workspace.slug}-${slugify(requirementTitle)}`,
        title: requirementTitle,
        type: normalizeRequirementType(row.requirement_type || row.type),
        priority: normalizeRequirementPriority(row.requirement_priority || row.priority),
        status: normalizeRequirementStatus(row.requirement_status || row.status),
      });
    }

    const scoreScorer = (row.score_scorer || row.scorer || "").trim();
    const scoreVendor = (row.score_vendor || row.vendor || vendorName || "").trim();
    const scoreValue = parseNumber(row.score_value || row.score || row.vendor_score);

    if (scoreScorer && scoreVendor) {
      upsertScore(workspace, {
        scorer: scoreScorer,
        vendor: scoreVendor,
        score: scoreValue || 0,
        status: (row.score_status || row.status || "Submitted").trim() === "Pending" ? "Pending" : "Submitted",
      });
    }
  }

  return Array.from(workspaceMap.values());
}
