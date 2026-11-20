import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { api } from "../../convex/_generated/api";

import { ConsultantHomeHeader } from "./consultant-home-header";
import { ConsultantWorkspaceOverviewPage, ConsultantWorkspacePeoplePage, ConsultantWorkspaceProjectDetailPage, ConsultantWorkspaceProjectsPage, ConsultantWorkspaceVendorContactsPage, ConsultantWorkspaceVendorsPage, VendorProjectAnswerRequirementsPage } from "./consultant-workspace-pages";

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

vi.mock("./sign-out-button", () => ({
  SignOutButton: ({ className = "" }: { className?: string }) => <button type="button" className={className}>Sign out</button>,
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

  describe("workspace name editors", () => {
    beforeEach(() => {
      useQueryMock.mockReset();
      useMutationMock.mockClear();
      useAuthMock.mockReturnValue({ user: { email: "admin@example.com" }, loading: false });
      useConvexAuthMock.mockReturnValue({ isLoading: false, isAuthenticated: true });
      useQueryMock.mockImplementationOnce(() => ({ email: "admin@example.com", role: "company-admin" }));
      useQueryMock.mockImplementationOnce(() => [{ _id: "company-1", name: "Workspace" }]);
    });

    test("People offers name editing for members and pending invites", () => {
      useQueryMock.mockImplementationOnce(() => [
        { id: "member-1", name: "Real Name", email: "person@example.com", role: "company-scorer", status: "active", source: "member" },
        { id: "invite-1", name: "Invited Name", email: "invite@example.com", role: "company-scorer", status: "invited", source: "invite" },
      ]);
      useQueryMock.mockImplementationOnce(() => []);
      const html = renderToStaticMarkup(<ConsultantWorkspacePeoplePage companyId="company-1" />);
      expect(html.match(/Edit name/g)).toHaveLength(2);
      expect(useMutationMock).toHaveBeenCalledWith(api.admin.updateWorkspacePersonName);
    });

    test("vendor contacts offers the same name editor", () => {
      useQueryMock.mockImplementationOnce(() => [{ vendorId: "vendor-1", name: "Vendor" }]);
      useQueryMock.mockImplementationOnce(() => [
        { id: "member-1", name: "Contact Name", email: "contact@example.com", role: "vendor", status: "active", source: "member" },
        { id: "invite-1", name: "Invited Contact", email: "invite@example.com", role: "vendor", status: "invited", source: "invite" },
      ]);
      const html = renderToStaticMarkup(<ConsultantWorkspaceVendorContactsPage companyId="company-1" vendorId="vendor-1" />);
      expect(html.match(/Edit name/g)).toHaveLength(2);
      expect(useMutationMock).toHaveBeenCalledWith(api.admin.updateWorkspacePersonName);
    });

    test("adding a vendor directs admins to Manage contacts instead of asking for an email", () => {
      useQueryMock.mockImplementationOnce(() => null);
      useQueryMock.mockImplementationOnce(() => [{ vendorId: "vendor-1", name: "Vendor", contactEmail: "reference@example.com", status: "active", contactCount: 0 }]);
      useQueryMock.mockImplementationOnce(() => undefined);
      const html = renderToStaticMarkup(<ConsultantWorkspaceVendorsPage companyId="company-1" />);
      expect(html).toContain("Invite contacts from Manage contacts");
      expect(html).not.toContain("Primary contact email");
      expect(html).toContain("Reference email: reference@example.com");
    });
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

describe("vendor answer migration warning", () => {
  test("explains why legacy answers are hidden and editing is unavailable", () => {
    useQueryMock.mockReset();
    useAuthMock.mockReturnValue({ user: { email: "vendor@example.com" }, loading: false });
    useConvexAuthMock.mockReturnValue({ isLoading: false, isAuthenticated: true });
    useQueryMock.mockImplementationOnce(() => ({ isVendor: true, role: "vendor" }));
    useQueryMock.mockImplementationOnce(() => [{ _id: "company-1", name: "Workspace" }]);
    useQueryMock.mockImplementationOnce(() => ({
      companyName: "Workspace", projectName: "Project", vendorOrganizationName: "Vendor",
      deadlineLocked: false, status: "in-progress", answeredCount: 0, totalRequirements: 1,
      migrationRequired: true, conflictingRequirementIds: [],
      rows: [{ requirementId: "REQ", text: "Requirement", score: null, comment: "" }],
    }));
    const html = renderToStaticMarkup(<VendorProjectAnswerRequirementsPage companyId="company-1" projectId="project-1" />);
    expect(html).toContain("Some older vendor answers need migration");
    expect(html).toMatch(/type="radio"[^>]*disabled/);
    expect(html).toContain("They are not included in the answers or totals shown");
  });
});

describe("ConsultantWorkspaceProjectsPage", () => {
  const queueProjectDetailQueries = (access: any) => {
    useQueryMock.mockImplementationOnce(() => access);
    useQueryMock.mockImplementationOnce(() => access?.isVendor ? { vendorId: "ven-1", vendorName: "Northwind Labs" } : null);
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
    expect(html).not.toContain("/api/auth/logout");
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
    useQueryMock.mockImplementationOnce(() => ({ vendorId: "vendor-1", vendorName: "Workspace Vendor Organisation" }));

    const html = renderToStaticMarkup(
      <ConsultantWorkspaceOverviewPage companyId="company-1" />,
    );

    expect(html).toContain("Vendor home");
    expect(html).toContain("Workspace Vendor Organisation");
    expect(html).toContain("Score requirements");
    expect(html).not.toContain("All workspaces");
    expect(html).not.toContain("Company ID");
    expect(html).not.toContain("Workspace directory");
    expect(html).not.toContain("Workspace actions");
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
    useQueryMock.mockImplementationOnce(() => ({ vendorId: "ven-1", vendorName: "Northwind Labs" }));
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

    const calledRosterQuery = useQueryMock.mock.calls.some(
      ([queryRef]) => queryRef === api.admin.listProjectMembers,
    );

    expect(html).toContain("3 of 16 answered");
    expect(html).toContain("Score requirements");
    expect(html).not.toContain("Edit project");
    expect(html).not.toContain("Open import / requirements");
    expect(html).not.toContain("Assigned members");
    expect(calledRosterQuery).toBe(false);
  });

  test("consultant project detail shows Edit project controls", () => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementationOnce(() => ({
      email: "frazer@maxwellknight.co.uk",
      tokenIdentifier: "consultant-1",
      role: "consultant",
      isConsultant: true,
    }));
    useQueryMock.mockImplementationOnce(() => null);
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
      isVendor: true,
      isConsultant: false,
    }));
    useQueryMock.mockImplementationOnce(() => null);
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

    expect(html).toContain("Projects");
    expect(html.indexOf("Scoring settings")).toBeLessThan(html.indexOf("Assign scorers"));
    expect(html.indexOf("Assign scorers")).toBeLessThan(html.indexOf("Assign vendors"));
    expect(html.indexOf("Assign vendors")).toBeLessThan(html.indexOf("Requirements"));
    expect(html.indexOf("Assign scorers")).toBeLessThan(html.indexOf("Vendor responses"));
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
    useQueryMock.mockImplementationOnce(() => null);
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
    useQueryMock.mockImplementationOnce(() => undefined);
    useQueryMock.mockImplementationOnce(() => undefined);
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
        status: "completed",
        completedAt: Date.now(),
        lastScoredAt: Date.now(),
      }],
    }));
    useQueryMock.mockImplementationOnce(() => ({
      projectId: "project-1",
      vendorUserId: "northwind-vendor",
      vendorName: "Northwind Labs",
      vendorContactName: "Northwind Contact",
      scorerScope: { scopeKey: "individual:beta-scorer", scopeType: "individual", label: "Beta Scorer" },
      canSeePeerScores: false,
      isCompleted: true,
      completedAt: Date.now(),
      rows: [{
        requirementId: "REQ-1",
        text: "Requirement",
        type: "user-story",
        ownScore: 1,
        ownComment: "Done",
        ownEnteredByDisplayName: "Beta Scorer",
        ownEnteredAt: Date.now(),
        vendorScore: 1,
        vendorComment: "Vendor note",
        peerScores: [],
      }],
    }));

    const html = renderToStaticMarkup(
      <ConsultantWorkspaceProjectDetailPage companyId="company-1" projectId="project-1" />,
    );

    expect(html).toContain("Scorer scoring");
    expect(html).not.toContain("Vendor responses");
    expect(html).not.toContain("Edit project");
    expect(html).not.toContain("Scorer column");
    expect(html).toContain("Completed on");
    expect(html).toContain("Reopen");
    expect(html).not.toContain("Mark complete");
    expect(html).not.toContain("All workspaces");
    expect(html).not.toContain("Workspace directory");
    expect(html).not.toContain("Workspace actions");
  });

  test("peer scores show display name and never render ID-like values", () => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementationOnce(() => ({
      email: "scorer@beta.example",
      tokenIdentifier: "beta-scorer",
      role: "company-scorer",
      isConsultant: false,
    }));
    useQueryMock.mockImplementationOnce(() => null);
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
    useQueryMock.mockImplementationOnce(() => undefined);
    useQueryMock.mockImplementationOnce(() => undefined);
    useQueryMock.mockImplementationOnce(() => ({
      projectId: "project-1",
      scorerCanSeePeerScores: true,
      scorerScopes: [{ scopeKey: "individual:beta-scorer", scopeType: "individual", label: "Beta Scorer" }],
      activeScopeKey: "individual:beta-scorer",
      vendors: [{
        vendorId: "ven-1",
        vendorName: "Northwind Labs",
        vendorUserId: "northwind-vendor",
        vendorContactName: "Northwind Contact",
        answeredCount: 1,
        totalRequirements: 10,
        status: "completed",
        completedAt: Date.now(),
        lastScoredAt: Date.now(),
      }],
    }));
    useQueryMock.mockImplementationOnce(() => ({
      projectId: "project-1",
      vendorUserId: "northwind-vendor",
      vendorName: "Northwind Labs",
      vendorContactName: "Northwind Contact",
      scorerScope: { scopeKey: "individual:beta-scorer", scopeType: "individual", label: "Beta Scorer" },
      canSeePeerScores: true,
      isCompleted: true,
      completedAt: Date.now(),
      rows: [{
        requirementId: "REQ-1",
        text: "Requirement",
        type: "user-story",
        ownScore: 1,
        ownComment: "Done",
        ownEnteredByDisplayName: "Beta Scorer",
        ownEnteredAt: Date.now(),
        vendorScore: 1,
        vendorComment: "Vendor note",
        peerScores: [{
          scopeKey: "individual:workos_user_abc123",
          scopeLabel: "workos_user_abc123",
          score: 1,
          comment: "Strong response",
          enteredByDisplayName: "Green Test1",
          enteredAt: Date.now(),
        }],
      }],
    }));

    const html = renderToStaticMarkup(
      <ConsultantWorkspaceProjectDetailPage companyId="company-1" projectId="project-1" />,
    );

    expect(html).toContain("Green Test1 score: 1");
    expect(html).toContain("Own scorer column: Beta Scorer");
    expect(html).toContain("Comment: Strong response");
    expect(html).not.toContain("workos_user_abc123");
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
