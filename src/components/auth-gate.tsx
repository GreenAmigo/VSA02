"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useAction, useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";

import { api } from "../../convex/_generated/api";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const [inviteError, setInviteError] = useState(false);
  const acceptPendingInvites = useAction(api.access.acceptPendingInvites);
  const acceptedRef = useRef(false);

  useEffect(() => {
    if (!loading && !user) {
      setRedirecting(true);
      const timer = window.setTimeout(() => {
        router.replace("/login");
      }, 400);
      return () => window.clearTimeout(timer);
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && !convexLoading && convexAuthenticated && !acceptedRef.current) {
      acceptedRef.current = true;
      void acceptPendingInvites({}).catch(() => setInviteError(true));
    }
  }, [acceptPendingInvites, loading, user, convexLoading, convexAuthenticated]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">
        {redirecting ? "Signing you in…" : "Checking sign-in…"}
      </div>
    );
  }

  return (
    <>
      {inviteError ? (
        <div role="alert" className="bg-red-950 px-6 py-3 text-red-100">
          We could not connect your invitation. Ask a workspace administrator to check your invitation and vendor organisation.
        </div>
      ) : null}
      {children}
    </>
  );
}
