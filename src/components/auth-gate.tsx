"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useAction } from "convex/react";
import { useRouter } from "next/navigation";

import { api } from "../../convex/_generated/api";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
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
    if (!loading && user && !acceptedRef.current) {
      acceptedRef.current = true;
      void acceptPendingInvites({});
    }
  }, [acceptPendingInvites, loading, user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">
        {redirecting ? "Signing you in…" : "Checking sign-in…"}
      </div>
    );
  }

  return <>{children}</>;
}
