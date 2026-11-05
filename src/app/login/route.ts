import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

import { getWorkOSConfig } from "@/lib/workosConfig";

export async function GET() {
  const { redirectUri } = getWorkOSConfig();
  const signInUrl = await getSignInUrl({ redirectUri });
  return NextResponse.redirect(signInUrl);
}
