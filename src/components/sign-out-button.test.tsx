import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SignOutButton } from "./sign-out-button";

vi.mock("../app/actions/sign-out", () => ({
  signOutAction: vi.fn(async () => {}),
}));

describe("SignOutButton", () => {
  test("renders a submit form button and never links to deprecated api logout URL", () => {
    const html = renderToStaticMarkup(<SignOutButton />);

    expect(html).toContain("Sign out");
    expect(html).toContain("<form");
    expect(html).not.toContain("/api/auth/logout");
  });
});
