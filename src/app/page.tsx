"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useRouter } from "next/navigation";

import { WorkspaceOverview } from "@/components/project-workflow-ui";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      setRedirecting(true);
      const timer = window.setTimeout(() => {
        router.replace("/login");
      }, 400);
      return () => window.clearTimeout(timer);
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">
        {redirecting ? "Signing you in…" : "Checking sign-in…"}
      </div>
    );
  }

  return <WorkspaceOverview />;
}
