import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ConsultantHomeHeader } from "./consultant-home-header";
import { ConsultantWorkspaceOverviewPage, ConsultantWorkspaceProjectDetailPage, ConsultantWorkspaceProjectsPage } from "./consultant-workspace-pages";

const { useQueryMock, useMutationMock, useAuthMock, useConvexAuthMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useMutationMock: vi.fn(() => vi.fn()),
  useAuthMock: vi.fn(),
  useConvexAuthMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
  useMutation: useMutationMock,
  useConvexAuth: useConvexAuthMock,
}));

vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: useAuthMock,
}));

describe("ConsultantHomeHeader", () => {
  test("shows New workspace button for a consultant", () => {
    const html = renderToStaticMarkup(
      <ConsultantHomeHeader
        isConsultant={true}
        displayRole="VS Consultant"
        email="consultant@example.com"
        onToggleCreate={() => {}}
      />,
    );

    expect(html).toContain("Consultant home");
    expect(html).toContain("New workspace");
  });

  test("does not show New workspace button for a company admin", () => {
    const html = renderToStaticMarkup(
      <ConsultantHomeHeader
        isConsultant={false}
        displayRole="company-admin"
        email="admin@example.com"
        onToggleCreate={() => {}}
      />,
    );

    expect(html).toContain("Workspace directory");
    expect(html).not.toContain("New workspace");
  });
});

describe("ConsultantWorkspaceProjectsPage", () => {
  const queueProjectDetailQueries = (access: any) => {
    useQueryMock.mockImplementationOnce(() => access);
    useQueryMock.mockImplementationOnce(() => [{ _id: "company-1", name: "Beta Logistics" }]);
    useQueryMock.mockImplementationOnce(() => ({
      _id: "project-1",
      companyId: "company-1",
      name: "Supply Chain",
      description: "Project detail",
      status: "active",
      vendorDeadline: Date.now() + 3600_000,
      scorerDeadline: Date.now() + 7200_000,
    }));
    useQueryMock.mockImplementationOnce(() => [{ _id: "member-1", projectId: "project-1", userId: "beta-admin", role: "company-admin", displayName: "Beta Admin", isActive: true }]);
    useQueryMock.mockImplementationOnce(() => [{ _id: "req-1", requirementId: "REQ-1", text: "Requirement", status: "active" }]);

    if (access?.isVendor || access?.role === "vendor") {
      useQueryMock.mockImplementationOnce(() => ({
        vendorOrganizationName: "Northwind Labs",
        projectName: "Supply Chain",
        projectDescription: "Vendor scoring project",
        deadlineAt: Date.now() + 3600_000,
        deadlineLocked: false,
        status: "in-progress",
        answeredCount: 3,
        totalRequirements: 16,
      }));
    } else {
      useQueryMock.mockImplementationOnce(() => undefined);
    }

    useQueryMock.mockImplementationOnce(() => [{ id: "person-1", userId: "beta-admin", name: "Beta Admin", email: "admin@beta.example", role: "company-admin", status: "active", source: "member" }]);
    useQueryMock.mockImplementationOnce(() => [{ departmentId: "dep-1", name: "Operations", members: [] }]);
    useQueryMock.mockImplementationOnce(() => [{ vendorId: "ven-1", name: "Northwind Labs", status: "active", contactEmail: "vendor@northwind.example", contactCount: 1 }]);
  };

  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { email: "frazer@maxwellknight.co.uk" },
      loading: false,
    });
    useConvexAuthMock.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    });
    useMutationMock.mockReturnValue(vi.fn());
    useQueryMock.mockImplementation(() => ({
      email: "frazer@maxwellknight.co.uk",
      isConsultant: true,
      role: "consultant",
    }));

    useQueryMock.mockImplementationOnce(() => ({
      email: "frazer@maxwellknight.co.uk",
      isConsultant: true,
      role: "consultant",
    }));

    useQueryMock.mockImplementationOnce(() => [{
      _id: "company-1",
      name: "Harbor Logistics Test",
    }]);

    useQueryMock.mockImplementationOnce(() => [{
      _id: "project-1",
      name: "ERP RFP",
      description: "Select the ERP partner for the new rollout.",
      status: "active",
      companyId: "company-1",
      createdAt: Date.now(),
    }]);
  });

  test("renders the consultant project list and the New project action", () => {
    const html = renderToStaticMarkup(
      <ConsultantWorkspaceProjectsPage companyId="company-1" />,
    );

    expect(html).toContain("New project");
    expect(html).toContain("ERP RFP");
  });

  test("renders vendor home in the new frame without developer cards or consultant breadcrumb", () => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementationOnce(() => ({
      email: "vendor@northwind.example",
      displayName: "Northwind Labs",
      tokenIdentifier: "northwind-vendor",
      role: "vendor",
      isVendor: true,
      isConsultant: false,
    }));
    useQueryMock.mockImplementationOnce(() => [{ _id: "company-1", name: "Beta Logistics" }]);
    useQueryMock.mockImplementationOnce(() => [{
      _id: "project-1",
      name: "Supply Chain",
      description: "Vendor scoring project",
      status: "active",
      vendorDeadline: Date.now() + 3600_000,
      companyId: "company-1",
      createdAt: Date.now(),
    }]);
    useQueryMock.mockImplementationOnce(() => undefined);

    const html = renderToStaticMarkup(
      <ConsultantWorkspaceOverviewPage companyId="company-1" />,
    );

    expect(html).toContain("Vendor home");
    expect(html).toContain("Answer requirements");
    expect(html).not.toContain("All workspaces");
    expect(html).not.toContain("Company ID");
    expect(html).not.toContain("Workspace directory");
  });

  test("vendor project detail shows progress and answer CTA without import cards or assigned members", () => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementationOnce(() => ({
      email: "vendor@northwind.example",
      displayName: "Northwind Labs",
      tokenIdentifier: "northwind-vendor",
      role: "vendor",
      isVendor: true,
      isConsultant: false,
    }));
    useQueryMock.mockImplementationOnce(() => [{ _id: "company-1", name: "Beta Logistics" }]);
    useQueryMock.mockImplementationOnce(() => ({
      _id: "project-1",
      companyId: "company-1",
      name: "Supply Chain",
      description: "Vendor scoring project",
      status: "active",
      vendorDeadline: Date.now() + 3600_000,
    }));
    useQueryMock.mockImplementationOnce(() => [{ _id: "vendor-row", projectId: "project-1", userId: "northwind-vendor", role: "vendor", displayName: "Northwind Labs", isActive: true }]);
    useQueryMock.mockImplementationOnce(() => [{ _id: "req-1", requirementId: "REQ-1", text: "Requirement", status: "active" }]);
    useQueryMock.mockImplementationOnce(() => ({
      vendorOrganizationName: "Northwind Labs",
      projectName: "Supply Chain",
      projectDescription: "Vendor scoring project",
      deadlineAt: Date.now() + 3600_000,
      deadlineLocked: false,
      status: "in-progress",
      answeredCount: 3,
      totalRequirements: 16,
    }));
    useQueryMock.mockImplementationOnce(() => []);
    useQueryMock.mockImplementationOnce(() => []);
    useQueryMock.mockImplementationOnce(() => []);

    const html = renderToStaticMarkup(
      <ConsultantWorkspaceProjectDetailPage companyId="company-1" projectId="project-1" />,
    );

    expect(html).toContain("3 of 16 answered");
    expect(html).toContain("Answer requirements");
    expect(html).not.toContain("Edit project");
    expect(html).not.toContain("Open import / requirements");
    expect(html).not.toContain("Assigned members");
  });

  test("consultant project detail shows Edit project controls", () => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementationOnce(() => ({
      email: "frazer@maxwellknight.co.uk",
      tokenIdentifier: "consultant-1",
      role: "consultant",
      isConsultant: true,
    }));
    useQueryMock.mockImplementationOnce(() => [{ _id: "company-1", name: "Beta Logistics" }]);
    useQueryMock.mockImplementationOnce(() => ({
      _id: "project-1",
      companyId: "company-1",
      name: "Supply Chain",
      description: "Admin editable project",
      status: "active",
      vendorDeadline: Date.now() + 3600_000,
      scorerDeadline: Date.now() + 7200_000,
    }));
    useQueryMock.mockImplementationOnce(() => [{ _id: "member-1", projectId: "project-1", userId: "beta-admin", role: "company-admin", displayName: "Beta Admin", isActive: true }]);
    useQueryMock.mockImplementationOnce(() => [{ _id: "req-1", requirementId: "REQ-1", text: "Requirement", status: "active" }]);
    useQueryMock.mockImplementationOnce(() => [{ id: "person-1", userId: "beta-admin", name: "Beta Admin", email: "admin@beta.example", role: "company-admin", status: "active", source: "member" }]);
    useQueryMock.mockImplementationOnce(() => [{ departmentId: "dep-1", name: "Operations", members: [] }]);
    useQueryMock.mockImplementationOnce(() => [{ vendorId: "ven-1", name: "Northwind Labs", status: "active", contactEmail: "vendor@northwind.example", contactCount: 1 }]);
    useQueryMock.mockImplementationOnce(() => [{
      vendorId: "ven-1",
      vendorName: "Northwind Labs",
      vendorUserId: "northwind-vendor",
      vendorContactName: "Northwind Contact",
      status: "submitted",
      answeredCount: 12,
      totalRequirements: 16,
      submittedAt: Date.now(),
      deadlineAt: Date.now() - 1,
    }]);
    useQueryMock.mockImplementationOnce(() => undefined);

    const html = renderToStaticMarkup(
      <ConsultantWorkspaceProjectDetailPage companyId="company-1" projectId="project-1" />,
    );

    expect(html).toContain("Edit project");
    expect(html).toContain("Vendor responses");
    expect(html).toContain("Assign scorers");
  });

  test("company admin project detail also shows Vendor responses section", () => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementationOnce(() => ({
      email: "admin@beta.example",
      tokenIdentifier: "beta-admin",
      role: "company-admin",
      isConsultant: false,
    }));
    useQueryMock.mockImplementationOnce(() => [{ _id: "company-1", name: "Beta Logistics" }]);
    useQueryMock.mockImplementationOnce(() => ({
      _id: "project-1",
      companyId: "company-1",
      name: "Supply Chain",
      description: "Admin view",
      status: "active",
      vendorDeadline: Date.now() + 3600_000,
      scorerDeadline: Date.now() + 7200_000,
    }));
    useQueryMock.mockImplementationOnce(() => [{ _id: "member-1", projectId: "project-1", userId: "beta-admin", role: "company-admin", displayName: "Beta Admin", isActive: true }]);
    useQueryMock.mockImplementationOnce(() => [{ _id: "req-1", requirementId: "REQ-1", text: "Requirement", status: "active" }]);
    useQueryMock.mockImplementationOnce(() => [{ id: "person-1", userId: "beta-admin", name: "Beta Admin", email: "admin@beta.example", role: "company-admin", status: "active", source: "member" }]);
    useQueryMock.mockImplementationOnce(() => [{ departmentId: "dep-1", name: "Operations", members: [] }]);
    useQueryMock.mockImplementationOnce(() => [{ vendorId: "ven-1", name: "Northwind Labs", status: "active", contactEmail: "vendor@northwind.example", contactCount: 1 }]);
    useQueryMock.mockImplementationOnce(() => [{
      vendorId: "ven-1",
      vendorName: "Northwind Labs",
      vendorUserId: "northwind-vendor",
      vendorContactName: "Northwind Contact",
      status: "in-progress",
      answeredCount: 2,
      totalRequirements: 16,
      submittedAt: null,
      deadlineAt: Date.now() + 3600_000,
    }]);
    useQueryMock.mockImplementationOnce(() => undefined);

    const html = renderToStaticMarkup(
      <ConsultantWorkspaceProjectDetailPage companyId="company-1" projectId="project-1" />,
    );

    expect(html).toContain("Vendor responses");
  });

  test("company scorer project detail shows scorer scoring panel", () => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementationOnce(() => ({
      email: "scorer@beta.example",
      tokenIdentifier: "beta-scorer",
      role: "company-scorer",
      isConsultant: false,
    }));
    useQueryMock.mockImplementationOnce(() => [{ _id: "company-1", name: "Beta Logistics" }]);
    useQueryMock.mockImplementationOnce(() => ({
      _id: "project-1",
      companyId: "company-1",
      name: "Supply Chain",
      description: "Scorer view",
      status: "active",
      vendorDeadline: Date.now() + 3600_000,
      scorerDeadline: Date.now() + 7200_000,
    }));
    useQueryMock.mockImplementationOnce(() => [{ _id: "member-1", projectId: "project-1", userId: "beta-scorer", role: "company-scorer", displayName: "Beta Scorer", isActive: true }]);
    useQueryMock.mockImplementationOnce(() => [{ _id: "req-1", requirementId: "REQ-1", text: "Requirement", status: "active" }]);
    useQueryMock.mockImplementationOnce(() => undefined);
    useQueryMock.mockImplementationOnce(() => []);
    useQueryMock.mockImplementationOnce(() => []);
    useQueryMock.mockImplementationOnce(() => []);
    useQueryMock.mockImplementationOnce(() => ({
      projectId: "project-1",
      scorerCanSeePeerScores: false,
      scorerScopes: [{ scopeKey: "individual:beta-scorer", scopeType: "individual", label: "Beta Scorer" }],
      activeScopeKey: "individual:beta-scorer",
      vendors: [{
        vendorId: "ven-1",
        vendorName: "Northwind Labs",
        vendorUserId: "northwind-vendor",
        vendorContactName: "Northwind Contact",
        answeredCount: 1,
        totalRequirements: 10,
        status: "in-progress",
        completedAt: null,
        lastScoredAt: Date.now(),
      }],
    }));
    useQueryMock.mockImplementationOnce(() => undefined);

    const html = renderToStaticMarkup(
      <ConsultantWorkspaceProjectDetailPage companyId="company-1" projectId="project-1" />,
    );

    expect(html).toContain("Scorer scoring");
    expect(html).not.toContain("Vendor responses");
    expect(html).not.toContain("Edit project");
  });

  test("project detail renders for loading, consultant, company admin, scorer, and vendor without errors", () => {
    useQueryMock.mockReset();
    useAuthMock.mockReturnValue({ user: null, loading: true });
    useConvexAuthMock.mockReturnValue({ isLoading: true, isAuthenticated: false });
    useQueryMock.mockImplementation(() => undefined);

    const loadingHtml = renderToStaticMarkup(
      <ConsultantWorkspaceProjectDetailPage companyId="company-1" projectId="project-1" />,
    );
    expect(loadingHtml).toContain("Checking access");

    useAuthMock.mockReturnValue({ user: { email: "consultant@vs.example" }, loading: false });
    useConvexAuthMock.mockReturnValue({ isLoading: false, isAuthenticated: true });

    useQueryMock.mockReset();
    queueProjectDetailQueries({ email: "consultant@vs.example", tokenIdentifier: "consultant-1", role: "consultant", isConsultant: true });
    expect(() => renderToStaticMarkup(<ConsultantWorkspaceProjectDetailPage companyId="company-1" projectId="project-1" />)).not.toThrow();

    useQueryMock.mockReset();
    queueProjectDetailQueries({ email: "admin@beta.example", tokenIdentifier: "admin-1", role: "company-admin", isConsultant: false });
    expect(() => renderToStaticMarkup(<ConsultantWorkspaceProjectDetailPage companyId="company-1" projectId="project-1" />)).not.toThrow();

    useQueryMock.mockReset();
    queueProjectDetailQueries({ email: "scorer@beta.example", tokenIdentifier: "scorer-1", role: "company-scorer", isConsultant: false });
    expect(() => renderToStaticMarkup(<ConsultantWorkspaceProjectDetailPage companyId="company-1" projectId="project-1" />)).not.toThrow();

    useQueryMock.mockReset();
    queueProjectDetailQueries({ email: "vendor@northwind.example", tokenIdentifier: "vendor-1", role: "vendor", isVendor: true, isConsultant: false });
    expect(() => renderToStaticMarkup(<ConsultantWorkspaceProjectDetailPage companyId="company-1" projectId="project-1" />)).not.toThrow();
  });
});
