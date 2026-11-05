"use client";

import { useEffect, useRef } from "react";
import { AuthKitProvider, useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import { ConvexProviderWithAuth, ConvexReactClient, useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://dependable-jaguar-503.eu-west-1.convex.cloud", {
  verbose: true,
});

function decodeAccessTokenClaims(token: string) {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.length % 4 === 0 ? normalized : normalized + "=".repeat(4 - (normalized.length % 4));
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded) as { iss?: string; aud?: string | string[]; exp?: number };
    return {
      iss: parsed.iss,
      aud: parsed.aud,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

function useConvexAuth() {
  const auth = useAuth();
  const { user, loading, sessionId } = auth;
  const { getAccessToken } = useAccessToken();

  console.info("[AuthKit useAuth state]", {
    isLoading: loading,
    isAuthenticated: !loading && !!user,
    userExists: !!user,
    email: user?.email ?? null,
    sessionId: sessionId ?? null,
    userId: user?.id ?? null,
  });

  return {
    isLoading: loading,
    isAuthenticated: !loading && !!user,
    fetchAccessToken: async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!user) {
        console.info("[Convex auth bridge] fetchAccessToken called: no user, returning null");
        return null;
      }

      const token = await getAccessToken();
      const claims = token ? decodeAccessTokenClaims(token) : null;

      console.info("[Convex auth bridge] fetchAccessToken call", {
        tokenReturned: !!token,
        iss: claims?.iss,
        aud: claims?.aud,
        exp: claims?.exp,
      });

      return token ?? null;
    },
  };
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
