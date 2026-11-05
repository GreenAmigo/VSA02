import { AuthConfig } from "convex/server";

const workosClientId = process.env.WORKOS_CLIENT_ID;
const workosUserManagementIssuer = workosClientId
  ? `https://api.workos.com/user_management/${workosClientId}`
  : undefined;

export default {
  providers:
    workosClientId && workosUserManagementIssuer
      ? [
          {
            type: "customJwt" as const,
            applicationID: workosClientId,
            issuer: "https://api.workos.com/",
            jwks: `https://api.workos.com/sso/jwks/${workosClientId}`,
            algorithm: "RS256" as const,
          },
          {
            type: "customJwt" as const,
            issuer: workosUserManagementIssuer,
            jwks: `https://api.workos.com/sso/jwks/${workosClientId}`,
            algorithm: "RS256" as const,
          },
        ]
      : [],
} satisfies AuthConfig;
