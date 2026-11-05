import { authkitProxy } from "@workos-inc/authkit-nextjs";

import { getWorkOSConfig } from "./src/lib/workosConfig";

const { redirectUri } = getWorkOSConfig();

export default authkitProxy({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/login", "/auth/callback", "/vendor/login"],
  },
  redirectUri,
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
