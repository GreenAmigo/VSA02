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
    expect(html).not.toContain("Open import / requirements");
    expect(html).not.toContain("Assigned members");
  });
});
