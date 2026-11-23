import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";

import { ProjectDashboardPage } from "./project-dashboard-page";

const { useQueryMock, useAuthMock, useConvexAuthMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useAuthMock: vi.fn(),
  useConvexAuthMock: vi.fn(),
}));

vi.mock("convex/react", () => ({ useQuery: useQueryMock, useMutation: vi.fn(() => vi.fn()), useConvexAuth: useConvexAuthMock }));
vi.mock("@workos-inc/authkit-nextjs/components", () => ({ useAuth: useAuthMock }));
vi.mock("./sign-out-button", () => ({ SignOutButton: () => <button type="button">Sign out</button> }));

const totals = (combined: number, requirements: number, nfr: number) => ({
  requirements, nfr, combined, must: combined, should: 0, could: 0,
});

function vendor(vendorId: string, vendorName: string, combined: number, overrides: Record<string, unknown> = {}) {
  return {
    vendorId,
    vendorName,
    totals: {
      scorers: totals(combined, combined - 9, 9),
      vendorSelf: totals(9, 9, 0),
      coverage: { scorableRequirements: 3, fullyScored: 2, partlyScored: 1, unscored: 0, vendorAnswered: 1 },
    },
    scorersCompleted: 0,
    scorerProgress: [{ userId: "s1", name: "Green Test1", departmentName: "IT", answered: 2, total: 3, completed: false, completedAt: null }],
    unscoredRequirements: [],
    submission: { status: "in-progress", submittedAt: null, deadlineAt: 4102444800000, hasConflict: false },
    hasScorerConflicts: false,
    hasAnswerConflicts: false,
    ...overrides,
  };
}

function setup(access: Record<string, unknown>, dashboard: unknown) {
  useQueryMock.mockImplementation((ref: any, args: unknown) => {
    const name = getFunctionName(ref);
    if (name === "access:getCurrentUserAccess") return access;
    if (name === "access:getWorkspaceVendorContact") return null;
    if (name === "access:listAccessibleCompanies") return [{ _id: "company-1", name: "Harbor Logistics Test" }];
    if (name === "dashboard:getProjectDashboard") return args === "skip" ? undefined : dashboard;
    return undefined;
  });
}

function dashboardWith(vendors: unknown[], leaderIds: string[], isTie = false) {
  return {
    projectId: "project-1", projectName: "Test Project 1", scorerDeadlineAt: null, assignedScorerCount: 1,
    migrationRequired: false, scorerHistoryMigrationRequired: false, hasDataConflicts: false,
    vendors,
    leader: {
      scorers: { vendorIds: leaderIds, isTie, isProvisional: true },
      vendorSelf: { vendorIds: [], isTie: false, isProvisional: true },
    },
  };
}

describe("ProjectDashboardPage", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useAuthMock.mockReturnValue({ user: { email: "frazer@example.com" }, loading: false });
    useConvexAuthMock.mockReturnValue({ isLoading: false, isAuthenticated: true });
  });

  test("a consultant sees totals, a provisional leader and what needs action", () => {
    setup({ isConsultant: true, email: "frazer@example.com" }, dashboardWith([vendor("v1", "Acme Software Test", 16.5)], ["v1"]));
    const html = renderToStaticMarkup(<ProjectDashboardPage companyId="company-1" projectId="project-1" />).replace(/<!-- -->/g, "");
    expect(html).toContain("Leading vendor");
    expect(html).toContain("Acme Software Test");
    expect(html).toContain("Provisional");
    expect(html).toContain("16.5");
    expect(html).toContain("Scorers&#x27; scores");
    expect(html).toContain("Green Test1 (IT) hasn&#x27;t completed Acme Software Test: 2 of 3 scored.");
    expect(html).toContain("All workspaces");
  });

  test("a tie names both vendors", () => {
    setup({ role: "company-admin", email: "frank@example.com" }, dashboardWith([
      vendor("v1", "Acme Software Test", 12), vendor("v2", "Useful Solutions Test", 12),
    ], ["v1", "v2"], true));
    const html = renderToStaticMarkup(<ProjectDashboardPage companyId="company-1" projectId="project-1" />).replace(/<!-- -->/g, "");
    expect(html).toContain("Acme Software Test and Useful Solutions Test");
    expect(html).toContain("Tie");
    expect(html).not.toContain("All workspaces");
  });

  test("a scorer is told they have no access and the dashboard is never requested", () => {
    setup({ role: "company-scorer", email: "scorer@example.com" }, dashboardWith([], []));
    const html = renderToStaticMarkup(<ProjectDashboardPage companyId="company-1" projectId="project-1" />).replace(/<!-- -->/g, "");
    expect(html).toContain("No access to this dashboard");
    const dashboardCalls = useQueryMock.mock.calls.filter(([ref]) => getFunctionName(ref) === "dashboard:getProjectDashboard");
    expect(dashboardCalls.every(([, args]) => args === "skip")).toBe(true);
  });
});
