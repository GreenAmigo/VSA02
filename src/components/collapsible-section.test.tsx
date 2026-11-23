import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn(() => vi.fn()), useConvexAuth: vi.fn() }));
vi.mock("@workos-inc/authkit-nextjs/components", () => ({ useAuth: vi.fn() }));
vi.mock("./sign-out-button", () => ({ SignOutButton: () => <button type="button">Sign out</button> }));

import { CollapsibleSection } from "./consultant-workspace-pages";

describe("CollapsibleSection", () => {
  test("is closed by default and shows only its title and subtitle in the summary", () => {
    const html = renderToStaticMarkup(
      <CollapsibleSection title="Vendor comparison" subtitle="Every requirement against every vendor"><p>Grid</p></CollapsibleSection>,
    );
    expect(html).toMatch(/^<details class="group/);
    expect(html).not.toContain("open=");
    expect(html).toContain("Vendor comparison");
    expect(html).toContain("Every requirement against every vendor");
  });

  test("can be opened by default", () => {
    const html = renderToStaticMarkup(<CollapsibleSection title="Requirements" defaultOpen><p>List</p></CollapsibleSection>);
    expect(html).toContain("open=\"\"");
  });
});
