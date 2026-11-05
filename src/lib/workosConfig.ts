export type WorkOSConfig = {
  redirectUri: string;
  authKitDomain: string;
};

export function getWorkOSConfig(
  values: Partial<{
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: string | undefined;
    WORKOS_AUTHKIT_DOMAIN: string | undefined;
  }> = {},
): WorkOSConfig {
  const redirectUri =
    values.NEXT_PUBLIC_WORKOS_REDIRECT_URI ??
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ??
    "http://localhost:3000/auth/callback";

  const authKitDomain =
    values.WORKOS_AUTHKIT_DOMAIN ??
    process.env.WORKOS_AUTHKIT_DOMAIN ??
    "https://prudent-picture-21-staging.authkit.app";

  return {
    redirectUri,
    authKitDomain,
  };
}
