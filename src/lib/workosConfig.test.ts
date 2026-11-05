import { describe, expect, test } from "vitest";

import { getWorkOSConfig } from "./workosConfig";

describe("getWorkOSConfig", () => {
  test("uses the default staging auth domain and callback when env values are not set", () => {
    const config = getWorkOSConfig({
      NEXT_PUBLIC_WORKOS_REDIRECT_URI: undefined,
      WORKOS_AUTHKIT_DOMAIN: undefined,
    });

    expect(config.redirectUri).toBe("http://localhost:3000/auth/callback");
    expect(config.authKitDomain).toBe("https://prudent-picture-21-staging.authkit.app");
    expect(config).not.toHaveProperty("applicationId");
  });

  test("prefers the explicit env values when they are supplied", () => {
    const config = getWorkOSConfig({
      NEXT_PUBLIC_WORKOS_REDIRECT_URI: "https://staging.example.com/auth/callback",
      WORKOS_AUTHKIT_DOMAIN: "https://custom.authkit.app",
    });

    expect(config.redirectUri).toBe("https://staging.example.com/auth/callback");
    expect(config.authKitDomain).toBe("https://custom.authkit.app");
    expect(config).not.toHaveProperty("applicationId");
  });
});
