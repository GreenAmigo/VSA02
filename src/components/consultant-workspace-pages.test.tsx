import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ConsultantHomeHeader } from "./consultant-home-header";
import { ConsultantWorkspaceProjectsPage } from "./consultant-workspace-pages";

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
});
