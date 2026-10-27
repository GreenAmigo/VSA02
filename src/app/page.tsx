"use client";

import { useMemo, useState } from "react";
import {
  assertCompanyAccess,
  assertCompanyAdmin,
  buildCompanyMembership,
  canAccessCompany,
  demoCompanies,
  demoMembers,
  type Company,
  type CompanyMembership,
  type CompanyRole,
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
  const [companies, setCompanies] = useState<Company[]>(demoCompanies);
  const [members, setMembers] = useState<CompanyMembership[]>(demoMembers);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<CompanyRole>("company-scorer");

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? companies[0],
    [companies, selectedCompanyId],
  );

  const companyMembers = useMemo(
    () => members.filter((member) => member.companyId === selectedCompanyId),
    [members, selectedCompanyId],
  );

  const accessAllowed = canAccessCompany(session, selectedCompanyId);

  const handleDemoLogin = (user: SessionUser) => {
    setSession(user);
    setSelectedCompanyId(user.companyId);
  };

  const handleCreateCompany = () => {
    if (!newCompanyName.trim()) return;

    const companyId = `cmp-${newCompanyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const nextCompany: Company = {
      id: companyId,
      name: newCompanyName.trim(),
      adminUserId: `u-${companyId}-admin`,
      ssoProvider: "temporary-login",
      createdAt: new Date().toISOString().slice(0, 10),
    };

    setCompanies((current) => [...current, nextCompany]);
    setSelectedCompanyId(companyId);
    setNewCompanyName("");
  };

  const handleAddMember = () => {
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;

    const nextMembership = buildCompanyMembership(
      selectedCompanyId,
      newMemberName.trim(),
      newMemberEmail.trim(),
      newMemberRole,
    );

    setMembers((current) => [...current, nextMembership]);
    setNewMemberName("");
    setNewMemberEmail("");
    setNewMemberRole("company-scorer");
  };

  const companyCheck = (() => {
    try {
      assertCompanyAccess(session, selectedCompanyId);
      return "Access granted";
    } catch (error) {
      return error instanceof Error ? error.message : "Access denied";
    }
  })();

  const adminCheck = (() => {
    try {
      assertCompanyAdmin(session);
      return "Admin rights confirmed";
    } catch (error) {
      return error instanceof Error ? error.message : "Admin rights denied";
    }
  })();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
            Phase 2 • Company setup and user management
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Company setup and membership management
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
            This phase adds the organisation-level setup and the user membership model. Each
            company has its own administrator, members, and settings, and the server checks keep
            those records isolated.
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
                      {companies.find((company) => company.id === user.companyId)?.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Company selection</h2>
            <div className="space-y-3">
              {companies.map((company) => (
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
                    {company.id} • {company.ssoProvider ?? "pending SSO"}
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

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Create company</h2>
            <div className="space-y-3">
              <input
                value={newCompanyName}
                onChange={(event) => setNewCompanyName(event.target.value)}
                placeholder="Enter company name"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
              />
              <button
                type="button"
                onClick={handleCreateCompany}
                className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400"
              >
                Create company
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Add member</h2>
            <div className="space-y-3">
              <input
                value={newMemberName}
                onChange={(event) => setNewMemberName(event.target.value)}
                placeholder="Member name"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
              />
              <input
                value={newMemberEmail}
                onChange={(event) => setNewMemberEmail(event.target.value)}
                placeholder="member@company.example"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
              />
              <select
                value={newMemberRole}
                onChange={(event) => setNewMemberRole(event.target.value as CompanyRole)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
              >
                <option value="company-admin">Company admin</option>
                <option value="company-scorer">Company scorer</option>
                <option value="vendor">Vendor</option>
              </select>
              <button
                type="button"
                onClick={handleAddMember}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
              >
                Add member
              </button>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Company membership</h2>
          <div className="space-y-3">
            {companyMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                <div>
                  <div className="font-medium text-white">{member.displayName}</div>
                  <div className="text-sm text-slate-400">{member.email}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-slate-600 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-slate-300">
                    {member.role}
                  </span>
                  <span className="rounded-full border border-slate-600 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-slate-300">
                    {member.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Admin permissions</h2>
            <p className="text-sm text-slate-300">{adminCheck}</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Phase 2 rules</h2>
            <ul className="space-y-3 text-sm leading-6 text-slate-300">
              <li>• Company data remains isolated by company ID and server-side checks.</li>
              <li>• Each company has an administrator who manages users and settings.</li>
              <li>• SSO can be configured per company without changing the base data model.</li>
              <li>• Temporary login stays simple until the per-company SSO provider is ready.</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
