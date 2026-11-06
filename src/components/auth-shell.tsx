"use client";

import { useCallback, useMemo } from "react";
import { AuthKitProvider, useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://dependable-jaguar-503.eu-west-1.convex.cloud");

function useConvexAuth() {
  const auth = useAuth();
  const { user, loading } = auth;
  const { getAccessToken, refresh } = useAccessToken();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!user) {
        return null;
      }

      const token = forceRefreshToken ? await refresh() : await getAccessToken();
      return token ?? null;
    },
    [user, getAccessToken, refresh],
  );

  return useMemo(
    () => ({
      isLoading: loading,
      isAuthenticated: !loading && !!user,
      fetchAccessToken,
    }),
    [loading, user, fetchAccessToken],
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthKitProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useConvexAuth}>
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}
