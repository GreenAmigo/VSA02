import { handleAuth } from "@workos-inc/authkit-nextjs";

import { getWorkOSConfig } from "@/lib/workosConfig";

const { redirectUri } = getWorkOSConfig();
const baseURL = new URL(redirectUri).origin;

export const GET = handleAuth({
  returnPathname: "/",
  baseURL,
});
