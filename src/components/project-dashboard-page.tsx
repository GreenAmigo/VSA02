"use client";

import Link from "next/link";
import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  StatusPill,
  WorkspaceShell,
  getVendorLifecycleLabel,
  priorityLabel,
  priorityPillClassName,
  requirementTypeLabel,
  requirementTypePillClassName,
} from "./consultant-workspace-pages";

// Chart colours: validated for contrast and colour-blind separation on the dark surface.
const REQUIREMENTS_COLOUR = "#0284c7"; // sky-600
const NFR_COLOUR = "#059669"; // emerald-600

type Basis = "scorers" | "vendorSelf";

function formatTotal(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDate(timestamp: number | null | undefined) {
  return typeof timestamp === "number" ? new Date(timestamp).toLocaleDateString() : "Not set";
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ProjectDashboardPage({ companyId, projectId }: { companyId: string; projectId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !isAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as any;
  const vendorContact = useQuery(api.access.getWorkspaceVendorContact, isProtectedLoading ? "skip" : { companyId: companyId as Id<"companies"> });
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const company = companies?.find((item) => item._id === companyId);
  const canView = vendorContact === null && Boolean(company) && Boolean(access && (access.isConsultant || access.role === "company-admin"));
  const dashboard = useQuery(api.dashboard.getProjectDashboard, canView ? { projectId: projectId as Id<"projects"> } : "skip");
  const [basis, setBasis] = useState<Basis>("scorers");

  if (isProtectedLoading || access === undefined || vendorContact === undefined || companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }

  if (!canView || !company) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 text-slate-200">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <h1 className="text-xl font-semibold text-white">No access to this dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">Only consultants and company admins can view project dashboards.</p>
          <Link href="/workspaces" className="mt-4 inline-block text-sm text-sky-300 hover:text-sky-200">Go to my workspaces</Link>
        </div>
      </div>
    );
  }

  const projectHref = `/workspaces/${companyId}/projects/${projectId}`;
  const breadcrumbs = [
    ...(access.isConsultant ? [{ label: "All workspaces", href: "/workspaces" }] : []),
    { label: company.name, href: `/workspaces/${companyId}` },
    { label: "Projects", href: `/workspaces/${companyId}/projects` },
    { label: dashboard?.projectName ?? "Project", href: projectHref },
    { label: "Dashboard" },
  ];

  const shell = (children: React.ReactNode) => (
    <WorkspaceShell
      access={access}
      workspace={{ id: companyId, slug: companyId, name: company.name, isTestData: false, projects: [], people: [], vendors: [], requirements: [], scores: [] }}
      activeTab="projects"
      breadcrumbs={breadcrumbs}
      role={access.isConsultant ? "consultant" : "company-admin"}
      userEmail={access.email ?? user?.email ?? "Unknown"}
      serverRole={access.isConsultant ? "vs-consultant" : access.role ?? "none"}
      serverLookupId={access.subject ?? access.tokenIdentifier ?? "unknown"}
      showConsultantLinks={Boolean(access.isConsultant)}
    >
      {children}
    </WorkspaceShell>
  );

  if (dashboard === undefined) {
    return shell(<p className="text-sm text-slate-400">Loading dashboard…</p>);
  }

  const now = Date.now();
  const vendors = dashboard.vendors;
  const leader = dashboard.leader[basis];
  const leaderNames = leader.vendorIds.map((id) => vendors.find((row) => row.vendorId === id)?.vendorName ?? "Unknown vendor");
  const totalsFor = (row: (typeof vendors)[number]) => (basis === "scorers" ? row.totals.scorers : row.totals.vendorSelf);
  const range = dashboard.maximum;
  // Bars are drawn against the range, so a full-width bar means every requirement Met.
  const maxCombined = Math.max(1, range.combined, ...vendors.map((row) => totalsFor(row).combined));
  const incompletePairs = vendors.flatMap((vendor) => vendor.scorerProgress
    .filter((scorer) => !scorer.completed)
    .map((scorer) => ({ vendorName: vendor.vendorName, ...scorer })));
  const vendorsNotSubmitted = vendors.filter((vendor) => vendor.submission.status !== "submitted");
  const departments = new Map<string, Array<{ name: string; vendorName: string; answered: number; total: number; completed: boolean }>>();
  for (const vendor of vendors) {
    for (const scorer of vendor.scorerProgress) {
      const key = scorer.departmentName ?? "No department";
      const list = departments.get(key) ?? [];
      list.push({ name: scorer.name, vendorName: vendor.vendorName, answered: scorer.answered, total: scorer.total, completed: scorer.completed });
      departments.set(key, list);
    }
  }
  const dataNotice = dashboard.migrationRequired || dashboard.scorerHistoryMigrationRequired
    ? "Some older scoring history still needs migrating, so totals and the leading vendor are hidden until an admin runs the migration."
    : dashboard.hasDataConflicts
      ? "Some vendors have conflicting records. Those answers are left out of the totals and no leading vendor is shown until they're resolved."
      : null;

  return shell(
    <>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Project dashboard</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{dashboard.projectName}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {vendors.length} vendor{vendors.length === 1 ? "" : "s"} · {dashboard.assignedScorerCount} scorer{dashboard.assignedScorerCount === 1 ? "" : "s"} · scorer deadline {formatDate(dashboard.scorerDeadlineAt)}
            </p>
          </div>
          <div role="group" aria-label="Score basis" className="flex rounded-xl border border-slate-700 bg-slate-950 p-1 text-sm">
            {([["scorers", "Scorers' scores"], ["vendorSelf", "Vendor self-scores"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={basis === value}
                onClick={() => setBasis(value)}
                className={`rounded-lg px-3 py-1.5 ${basis === value ? "bg-sky-500 text-slate-950" : "text-slate-300 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {basis === "vendorSelf" ? (
          <p className="mt-3 text-xs text-amber-200">Vendor self-scores are what each vendor claimed. They're for comparison only; the official totals use your scorers' scores.</p>
        ) : null}
        {dataNotice ? <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">{dataNotice}</p> : null}
      </section>

      <section className="rounded-2xl border border-sky-500/40 bg-sky-500/5 p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Leading vendor</p>
        {leaderNames.length === 0 ? (
          <p className="mt-2 text-lg text-slate-300">No leading vendor yet. {vendors.length === 0 ? "No vendors are assigned." : "Nothing has been scored yet."}</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h3 className="text-2xl font-semibold text-white">{leaderNames.join(" and ")}</h3>
            {leader.isTie ? <StatusPill label="Tie" className="border-amber-500/50 bg-amber-500/10 text-amber-200" /> : null}
            {leader.isProvisional
              ? <StatusPill label="Provisional" className="border-amber-500/50 bg-amber-500/10 text-amber-200" />
              : <StatusPill label="All scoring complete" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-200" />}
          </div>
        )}
        {leaderNames.length > 0 && leader.isProvisional ? (
          <p className="mt-2 text-sm text-slate-400">Provisional until every scorer has completed every vendor.</p>
        ) : null}
      </section>

      <Panel title="Vendor totals" subtitle="Weighted total = priority × score (Must 9, Should 3, Could 1). Out of scope and withdrawn requirements are excluded.">
        {vendors.length === 0 ? <p className="text-sm text-slate-400">No vendors are assigned to this project yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th className="py-2 pr-3">Vendor</th>
                  <th className="py-2 pr-3 text-right">Requirements</th>
                  <th className="py-2 pr-3 text-right">NFRs</th>
                  <th className="py-2 pr-3 text-right">Combined</th>
                  <th className="py-2 pr-3 text-right">Must</th>
                  <th className="py-2 pr-3 text-right">Should</th>
                  <th className="py-2 pr-3 text-right">Could</th>
                  <th className="py-2 pr-3">Scoring coverage</th>
                  <th className="py-2">Vendor status</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => {
                  const totals = totalsFor(vendor);
                  const isLeader = leader.vendorIds.includes(vendor.vendorId);
                  const coverage = vendor.totals.coverage;
                  const closed = typeof vendor.submission.deadlineAt === "number" && vendor.submission.deadlineAt <= now;
                  return (
                    <tr key={vendor.vendorId} className={`border-t border-slate-800 ${isLeader ? "bg-sky-500/10" : ""}`}>
                      <td className="py-3 pr-3 font-medium text-white">{vendor.vendorName}{isLeader ? <span className="ml-2 text-xs text-sky-300">Leader</span> : null}</td>
                      <td className="py-3 pr-3 text-right text-slate-200">{formatTotal(totals.requirements)}</td>
                      <td className="py-3 pr-3 text-right text-slate-200">{formatTotal(totals.nfr)}</td>
                      <td className="py-3 pr-3 text-right font-semibold text-white">{formatTotal(totals.combined)}</td>
                      <td className="py-3 pr-3 text-right text-slate-300">{formatTotal(totals.must)}</td>
                      <td className="py-3 pr-3 text-right text-slate-300">{formatTotal(totals.should)}</td>
                      <td className="py-3 pr-3 text-right text-slate-300">{formatTotal(totals.could)}</td>
                      <td className="py-3 pr-3 text-xs text-slate-300">
                        {basis === "scorers"
                          ? `${coverage.fullyScored} of ${coverage.scorableRequirements} by all scorers · ${coverage.partlyScored} partly · ${coverage.unscored} unscored`
                          : `${coverage.vendorAnswered} of ${coverage.scorableRequirements} answered`}
                      </td>
                      <td className="py-3 text-xs text-slate-300">
                        <StatusPill label={getVendorLifecycleLabel({ status: vendor.submission.status, deadlineLocked: closed })} />
                        <span className="ml-2">{vendor.submission.submittedAt ? `Submitted ${formatDate(vendor.submission.submittedAt)}` : `Due ${formatDate(vendor.submission.deadlineAt)}`}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {vendors.length > 0 ? (
        <Panel title="Vendor comparison" subtitle={basis === "scorers" ? "Combined weighted totals from scorers' scores" : "Combined weighted totals from vendor self-scores"}>
          <div className="mb-3 flex gap-4 text-xs text-slate-300">
            <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: REQUIREMENTS_COLOUR }} />Requirements</span>
            <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: NFR_COLOUR }} />NFRs</span>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 border-b border-slate-800 pb-3 text-sm">
              <span className="truncate font-medium text-slate-200" title="Range: the totals if every requirement were Met">Range (all Met)</span>
              <div className="flex h-4 gap-[2px]" title={`Range: Requirements ${formatTotal(range.requirements)}, NFRs ${formatTotal(range.nfr)}, total ${formatTotal(range.combined)}`}>
                {range.requirements > 0 ? <div className="h-full rounded-l-[4px]" style={{ width: `${(range.requirements / maxCombined) * 100}%`, background: REQUIREMENTS_COLOUR }} /> : null}
                {range.nfr > 0 ? <div className="h-full rounded-r-[4px]" style={{ width: `${(range.nfr / maxCombined) * 100}%`, background: NFR_COLOUR }} /> : null}
              </div>
              <span className="w-14 text-right font-semibold text-white">{formatTotal(range.combined)}</span>
              <span className="col-span-3 -mt-2 text-xs text-slate-400">
                Requirements {formatTotal(range.requirements)} · NFRs {formatTotal(range.nfr)} · Total {formatTotal(range.combined)}
              </span>
            </div>
            {vendors.map((vendor) => {
              const totals = totalsFor(vendor);
              return (
                <div key={vendor.vendorId} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate text-slate-200" title={vendor.vendorName}>{vendor.vendorName}</span>
                  <div className="flex h-4 gap-[2px]" title={`${vendor.vendorName}: Requirements ${formatTotal(totals.requirements)}, NFRs ${formatTotal(totals.nfr)}`}>
                    {totals.requirements > 0 ? <div className="h-full rounded-l-[4px]" style={{ width: `${(totals.requirements / maxCombined) * 100}%`, background: REQUIREMENTS_COLOUR }} /> : null}
                    {totals.nfr > 0 ? <div className="h-full rounded-r-[4px]" style={{ width: `${(totals.nfr / maxCombined) * 100}%`, background: NFR_COLOUR }} /> : null}
                  </div>
                  <span className="w-14 text-right font-medium text-white">{formatTotal(totals.combined)}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      <Panel title="What needs action">
        {incompletePairs.length === 0 && vendorsNotSubmitted.length === 0 ? (
          <p className="text-sm text-emerald-200">Nothing outstanding. Every vendor has submitted and every scorer has completed every vendor.</p>
        ) : (
          <ul className="space-y-2 text-sm text-slate-300">
            {vendorsNotSubmitted.map((vendor) => (
              <li key={`v-${vendor.vendorId}`}>{vendor.vendorName} hasn't submitted their responses yet (due {formatDate(vendor.submission.deadlineAt)}).</li>
            ))}
            {incompletePairs.map((item) => (
              <li key={`s-${item.vendorName}-${item.userId}`}>{item.name}{item.departmentName ? ` (${item.departmentName})` : ""} hasn't completed {item.vendorName}: {item.answered} of {item.total} scored.</li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Unscored requirements" subtitle="Requirements no scorer has scored yet, per vendor.">
        {vendors.every((vendor) => vendor.unscoredRequirements.length === 0) ? (
          <p className="text-sm text-slate-400">Every requirement has at least one scorer's score for every vendor.</p>
        ) : (
          <div className="space-y-2">
            {vendors.filter((vendor) => vendor.unscoredRequirements.length > 0).map((vendor) => (
              <details key={vendor.vendorId} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <summary className="cursor-pointer text-sm text-white">{vendor.vendorName}: {vendor.unscoredRequirements.length} unscored</summary>
                <ul className="mt-3 space-y-2">
                  {vendor.unscoredRequirements.map((requirement) => (
                    <li key={requirement.requirementId} className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                      <span className="font-mono text-xs text-slate-400">{requirement.requirementId}</span>
                      <StatusPill label={requirementTypeLabel(requirement.type)} className={requirementTypePillClassName(requirement.type)} />
                      <StatusPill label={priorityLabel(requirement.priority)} className={priorityPillClassName(requirement.priority)} />
                      <span>{requirement.text}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Scorer progress by department" subtitle="Grouped by each scorer's current department.">
        {departments.size === 0 ? <p className="text-sm text-slate-400">No scorers are assigned to this project yet.</p> : (
          <div className="space-y-4">
            {[...departments.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([department, rows]) => (
              <div key={department}>
                <h4 className="text-sm font-semibold text-white">{department}</h4>
                <ul className="mt-2 space-y-1 text-sm text-slate-300">
                  {rows.map((row) => (
                    <li key={`${row.name}-${row.vendorName}`} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-950 px-3 py-2">
                      <span>{row.name} · {row.vendorName}</span>
                      <span className={row.completed ? "text-emerald-200" : "text-slate-400"}>{row.completed ? "Completed" : `${row.answered} of ${row.total} scored`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <p className="text-sm"><Link href={projectHref} className="text-sky-300 hover:text-sky-200">Back to project</Link></p>
    </>,
  );
}
