"use client";

import { useEffect, useRef } from "react";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-nextjs/components";
import { ConvexProvider, ConvexReactClient, useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://dependable-jaguar-503.eu-west-1.convex.cloud");

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
    <ConvexProvider client={convex}>
      <AuthKitProvider>
        <PreviewUserSync />
        {children}
      </AuthKitProvider>
    </ConvexProvider>
  );
}
