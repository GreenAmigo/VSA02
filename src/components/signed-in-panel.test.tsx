import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SignedInPanel, signedInDetails } from "./signed-in-panel";

const scorerAccess = {
  email: "greenamigo+new@hotmail.co.uk",
  displayName: "greenamigo+new@hotmail.co.uk",
  role: "company-scorer",
  isConsultant: false,
  profiles: [
    { companyId: "harbor", role: "company-scorer", displayName: "Green Test1", departmentName: "Digital" },
    { companyId: "northway", role: "company-admin", displayName: "Green T.", departmentName: "Finance" },
  ],
};

describe("SignedInPanel", () => {
  test("shows display name, role, department and email for the current workspace", () => {
    const html = renderToStaticMarkup(<SignedInPanel access={scorerAccess} companyId="harbor" />);
    expect(html).toContain("Green Test1");
    expect(html).toContain("Company scorer");
    expect(html).toContain("Digital");
    expect(html).toContain("greenamigo+new@hotmail.co.uk");
  });

  test("uses the role and department from the workspace being viewed", () => {
    expect(signedInDetails(scorerAccess, "northway")).toEqual({
      name: "Green T.", roleLabel: "Company admin", departmentName: "Finance", email: "greenamigo+new@hotmail.co.uk",
    });
  });

  test("never shows an email address as the person's name", () => {
    const details = signedInDetails({ email: "a@b.com", displayName: "a@b.com", profiles: [] }, "x");
    expect(details.name).toBeNull();
  });

  test("consultants show their consultant name and no department", () => {
    const details = signedInDetails({
      email: "frazer@maxwellknight.co.uk", isConsultant: true, consultantDisplayName: "Frazer Maxwell", displayName: null, profiles: [],
    }, "harbor");
    expect(details).toEqual({ name: "Frazer Maxwell", roleLabel: "VS Consultant", departmentName: null, email: "frazer@maxwellknight.co.uk" });
  });
});
