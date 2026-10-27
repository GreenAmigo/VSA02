"use client";

import { useMemo, useState } from "react";
import {
  assertCompanyAccess,
  canAccessCompany,
  demoCompanies,
  type SessionUser,
} from "@/lib/companyAccess";

const temporaryUsers: SessionUser[] = [
  {
    userId: "u-company-admin",
    companyId: "cmp-acme",
    role: "company-admin",
    displayName: "Priya Singh",
  },
  {
    userId: "u-scorer",
    companyId: "cmp-acme",
    role: "company-scorer",
    displayName: "Sam Lee",
  },
  {
    userId: "u-vendor",
    companyId: "cmp-beta",
    role: "vendor",
    displayName: "Northwind Labs",
  },
];

export default function Home() {
  const [selectedCompanyId, setSelectedCompanyId] = useState("cmp-acme");
  const [session, setSession] = useState<SessionUser | null>(temporaryUsers[0]);

  const selectedCompany = useMemo(
    () => demoCompanies.find((company) => company.id === selectedCompanyId) ?? demoCompanies[0],
    [selectedCompanyId],
  );

  const accessAllowed = canAccessCompany(session, selectedCompanyId);

  const handleDemoLogin = (user: SessionUser) => {
    setSession(user);
    setSelectedCompanyId(user.companyId);
  };

  const companyCheck = (() => {
    try {
      assertCompanyAccess(session, selectedCompanyId);
      return "Access granted";
    } catch (error) {
      return error instanceof Error ? error.message : "Access denied";
    }
  })();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
            Phase 1 • Company and access foundation
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Vendor Selection App foundation
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
            This phase creates the core separation model for multiple companies, company admins,
            temporary login roles, and server-side access rules that prevent cross-company data
            leakage.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Temporary login</h2>
            <div className="space-y-3">
              {temporaryUsers.map((user) => (
                <button
                  key={user.userId}
                  type="button"
                  onClick={() => handleDemoLogin(user)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    session?.userId === user.userId
                      ? "border-sky-400 bg-sky-500/10 text-sky-100"
                      : "border-slate-700 bg-slate-950/50 text-slate-200 hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{user.displayName}</div>
                      <div className="text-xs uppercase tracking-[0.15em] text-slate-400">
                        {user.role}
                      </div>
                    </div>
                    <span className="rounded-full border border-slate-600 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                      {demoCompanies.find((company) => company.id === user.companyId)?.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Company selection</h2>
            <div className="space-y-3">
              {demoCompanies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => setSelectedCompanyId(company.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedCompany.id === company.id
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-700 bg-slate-950/50 text-slate-200 hover:border-slate-500"
                  }`}
                >
                  <div className="font-medium">{company.name}</div>
                  <div className="text-xs uppercase tracking-[0.15em] text-slate-400">
                    {company.id}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Current user</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">{session?.displayName ?? "Not signed in"}</h3>
            <p className="mt-2 text-sm text-slate-300">Role: {session?.role ?? "none"}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Selected company</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">{selectedCompany.name}</h3>
            <p className="mt-2 text-sm text-slate-300">ID: {selectedCompany.id}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Server check</p>
            <h3 className={`mt-3 text-2xl font-semibold ${accessAllowed ? "text-emerald-300" : "text-rose-300"}`}>
              {accessAllowed ? "Allowed" : "Blocked"}
            </h3>
            <p className="mt-2 text-sm text-slate-300">{companyCheck}</p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Phase 1 architecture</h2>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {[
              { title: "Companies", text: "Each company has its own admin, settings, projects, and users." },
              { title: "Members", text: "Every user belongs to a company and one role: admin, scorer, or vendor." },
              { title: "Projects", text: "Projects are scoped to a single company and cannot be shared across organisations." },
              { title: "Requirements", text: "Requirement records are company-scoped and protected by server-side guards." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-sky-300">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Server-side rules for this phase</h2>
          <ul className="space-y-3 text-sm leading-6 text-slate-300">
            <li>• A user must be a member of the selected company before they can access that company’s data.</li>
            <li>• The server must reject attempts to read or write records outside the user’s company.</li>
            <li>• Company admins can manage users and settings; vendors only access their own project and scores.</li>
            <li>• Temporary login is intentionally simple so SSO can be switched in later without reworking the model.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
