"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { AuthKitProvider, useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import { ConvexProviderWithAuth, ConvexReactClient, useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";

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

function PreviewUserSync() {
  const { user, loading } = useAuth();
  const ensurePreviewAdminMembership = useMutation(api.admin.ensurePreviewAdminMembership);
  const syncKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
      return;
    }

    if (loading || !user?.email) {
      return;
    }

    const email = user.email.toLowerCase();
    if (email !== "frazerknight@hotmail.com") {
      return;
    }

    const syncKey = `${email}:${user.name ?? "Frazer Knight"}`;
    if (syncKeyRef.current === syncKey) {
      return;
    }

    syncKeyRef.current = syncKey;
    void ensurePreviewAdminMembership({
      companySlug: "maxwell-knight-ltd",
      email: "frazerknight@hotmail.com",
      displayName: user.name ?? "Frazer Knight",
    });
  }, [loading, user?.email, user?.name, ensurePreviewAdminMembership]);

  return null;
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthKitProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useConvexAuth}>
        <PreviewUserSync />
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}
