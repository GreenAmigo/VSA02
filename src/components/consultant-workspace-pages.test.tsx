import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ConsultantHomeHeader } from "./consultant-home-header";

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
