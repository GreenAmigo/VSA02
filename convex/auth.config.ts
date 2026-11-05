import { AuthConfig } from "convex/server";

const workosClientId = process.env.WORKOS_CLIENT_ID;
const workosIssuer =
  process.env.WORKOS_ISSUER ??
  (workosClientId
    ? `https://api.workos.com/user_management/${workosClientId}`
    : undefined);

export default {
  providers: workosClientId && workosIssuer
    ? [
        {
          type: "customJwt" as const,
          applicationID: workosClientId,
          issuer: workosIssuer,
          jwks: `${workosIssuer}/.well-known/jwks.json`,
          algorithm: "RS256" as const,
        },
      ]
    : [],
} satisfies AuthConfig;
