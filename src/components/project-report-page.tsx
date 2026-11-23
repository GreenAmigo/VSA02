"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  downloadReportWorkbook,
  formatReportDate,
  leaderText,
  metLabel,
  priorityName,
  reportTitle,
  SCORING_RULE_TEXT,
  type ProjectReport,
} from "../lib/projectReportExport";

const STATUS_NAMES = { "not-started": "Not started", "in-progress": "In progress", submitted: "Submitted" } as const;

function n(value: number) {
  return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 border-b border-slate-300 pb-1 text-lg font-semibold text-slate-900 print:break-after-avoid">{children}</h2>;
}

/** Green for Met, red for Not met, amber for Unscored; the words are always shown too. */
function MetBadge({ value, suffix = "" }: { value: 0 | 1 | null; suffix?: string }) {
  const colour = value === 1 ? "bg-emerald-100 text-emerald-900" : value === 0 ? "bg-rose-100 text-rose-900" : "bg-amber-100 text-amber-900";
  return <span className={`inline-block rounded px-1 font-medium ${colour}`}>{metLabel(value)}{suffix}</span>;
}

/** Browsers use the page title as the suggested PDF file name. */
function saveAsPdf(report: ProjectReport) {
  const previousTitle = document.title;
  document.title = reportTitle(report);
  const restore = () => {
    document.title = previousTitle;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}

const th = "border border-slate-300 bg-slate-100 px-2 py-1 text-left align-top font-semibold";
const td = "border border-slate-300 px-2 py-1 align-top";

export function ProjectReportPage({ companyId, projectId }: { companyId: string; projectId: string }) {
  const { user, loading: workosLoading } = useAuth();
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();
  const isProtectedLoading = workosLoading || convexLoading || !user || !isAuthenticated;
  const access = useQuery(api.access.getCurrentUserAccess, isProtectedLoading ? "skip" : {}) as any;
  const vendorContact = useQuery(api.access.getWorkspaceVendorContact, isProtectedLoading ? "skip" : { companyId: companyId as Id<"companies"> });
  const companies = useQuery(api.access.listAccessibleCompanies, isProtectedLoading ? "skip" : {}) as Array<{ _id: string; name: string }> | undefined;
  const canView = vendorContact === null && Boolean(companies?.some((item) => item._id === companyId))
    && Boolean(access && (access.isConsultant || access.role === "company-admin"));
  const report = useQuery(api.report.getProjectReport, canView ? { projectId: projectId as Id<"projects"> } : "skip") as ProjectReport | undefined;

  if (isProtectedLoading || access === undefined || vendorContact === undefined || companies === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Checking access…</div>;
  }
  if (!canView) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 text-slate-200">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <h1 className="text-xl font-semibold text-white">No access to this report</h1>
          <p className="mt-2 text-sm text-slate-400">Only consultants and company admins can view sign-off reports.</p>
          <Link href="/workspaces" className="mt-4 inline-block text-sm text-sky-300 hover:text-sky-200">Go to my workspaces</Link>
        </div>
      </div>
    );
  }
  if (report === undefined) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-200">Preparing report…</div>;
  }

  const max = report.summary.maximum;
  const vendorById = new Map(report.vendorNames.map((vendor) => [vendor.vendorId, vendor.vendorName]));

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-6 py-3 print:hidden">
        <Link href={`/workspaces/${companyId}/projects/${projectId}/dashboard`} className="text-sm text-sky-300 hover:text-sky-200">← Back to dashboard</Link>
        <div className="flex gap-2">
          <button type="button" onClick={() => downloadReportWorkbook(report)} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400">
            Download Excel
          </button>
          <button type="button" onClick={() => saveAsPdf(report)} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
            Save as PDF
          </button>
        </div>
      </div>
      <p className="px-6 pt-3 text-xs text-slate-600 print:hidden">Save as PDF opens your browser&apos;s print window: choose &quot;Save as PDF&quot; as the printer. Landscape fits the comparison table best.</p>

      <article
        style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
        className="mx-auto my-6 max-w-5xl bg-white p-10 text-sm text-slate-800 shadow print:my-0 print:max-w-none print:p-0 print:shadow-none"
      >
        <header>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Vendor selection report</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{report.projectName}</h1>
          <p className="text-slate-600">{report.companyName}</p>
          {report.projectDescription ? <p className="mt-2 text-slate-700">{report.projectDescription}</p> : null}
          <p className="mt-2 text-xs text-slate-500">
            Generated {new Date().toLocaleString("en-GB")} · Vendor deadline {formatReportDate(report.vendorDeadlineAt) || "not set"} · Scorer deadline {formatReportDate(report.scorerDeadlineAt) || "not set"} · {report.summary.assignedScorerCount} scorer{report.summary.assignedScorerCount === 1 ? "" : "s"}
          </p>
        </header>

        <Heading>Result</Heading>
        <p className="mt-2 text-base"><span className="font-semibold">Leading vendor:</span> {leaderText(report)}</p>
        <p className="mt-1 text-xs text-slate-500">{SCORING_RULE_TEXT}</p>
        <p className="mt-1 text-xs text-slate-500">Key: <MetBadge value={1} /> <MetBadge value={0} /> <MetBadge value={null} /></p>

        <Heading>Vendor totals</Heading>
        <table className="mt-2 w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={th}>Vendor</th><th className={th}>Requirements</th><th className={th}>NFRs</th><th className={th}>Combined</th>
              <th className={th}>Must</th><th className={th}>Should</th><th className={th}>Could</th><th className={th}>Vendor self-score</th>
              <th className={th}>Fully scored</th><th className={th}>Vendor status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-50 italic">
              <td className={td}>Range (all Met)</td><td className={td}>{n(max.requirements)}</td><td className={td}>{n(max.nfr)}</td><td className={td}>{n(max.combined)}</td>
              <td className={td}>{n(max.must)}</td><td className={td}>{n(max.should)}</td><td className={td}>{n(max.could)}</td><td className={td} /><td className={td} /><td className={td} />
            </tr>
            {report.summary.vendors.map((vendor) => (
              <tr key={vendor.vendorId} className={report.summary.leader.scorers.vendorIds.includes(vendor.vendorId) ? "bg-emerald-50 font-semibold" : ""}>
                <td className={td}>{vendor.vendorName}</td>
                <td className={td}>{n(vendor.totals.scorers.requirements)}</td>
                <td className={td}>{n(vendor.totals.scorers.nfr)}</td>
                <td className={td}>{n(vendor.totals.scorers.combined)}</td>
                <td className={td}>{n(vendor.totals.scorers.must)}</td>
                <td className={td}>{n(vendor.totals.scorers.should)}</td>
                <td className={td}>{n(vendor.totals.scorers.could)}</td>
                <td className={td}>{n(vendor.totals.vendorSelf.combined)}</td>
                <td className={td}>{vendor.totals.coverage.fullyScored} of {vendor.totals.coverage.scorableRequirements}</td>
                <td className={td}>{STATUS_NAMES[vendor.submission.status]}{vendor.submission.submittedAt ? ` ${formatReportDate(vendor.submission.submittedAt)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Heading>Requirement comparison</Heading>
        <p className="mt-1 text-xs text-slate-500">For each vendor: the scorers&apos; verdict, then the vendor&apos;s own answer.</p>
        <table className="mt-2 w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className={th}>ID</th><th className={th}>Requirement</th><th className={th}>Priority</th>
              {report.vendorNames.map((vendor) => <th key={vendor.vendorId} className={th}>{vendor.vendorName}</th>)}
            </tr>
          </thead>
          <tbody>
            {report.comparison.map((row) => (
              <tr key={row.requirementId} className={`print:break-inside-avoid ${row.counted ? "" : "text-slate-400"}`}>
                <td className={td}>{row.requirementId}</td>
                <td className={td}>{row.text}<div className="text-[10px] text-slate-500">{row.type === "nfr" ? "NFR" : "Requirement"}{row.status === "withdrawn" ? " · Withdrawn" : ""}</div></td>
                <td className={td}>{priorityName(row.priority)}</td>
                {row.cells.map((cell) => (
                  <td key={cell.vendorId} className={td}>
                    <div>Scorers: <MetBadge value={cell.scorerVerdict} /></div>
                    <div className="mt-0.5 text-slate-500">Vendor: <MetBadge value={cell.vendorScore} suffix={cell.vendorAmended ? " (amended)" : ""} /></div>
                    {cell.vendorComment ? <div className="text-[10px] italic text-slate-500">“{cell.vendorComment}”</div> : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <Heading>Scorers&apos; overall views</Heading>
        {report.views.length === 0 ? <p className="mt-2 text-slate-500">No overall views recorded.</p> : (
          <div className="mt-2 space-y-3">
            {report.views.map((view, index) => (
              <div key={index} className="print:break-inside-avoid">
                <p className="font-semibold">{view.vendorName} · {view.scorerName}{view.departmentName ? ` (${view.departmentName})` : ""} · {formatReportDate(view.updatedAt)}</p>
                <p className="whitespace-pre-wrap">{view.viewText}</p>
              </div>
            ))}
          </div>
        )}

        <Heading>Amendments to vendor answers</Heading>
        {report.amendments.length === 0 ? <p className="mt-2 text-slate-500">No vendor answers were amended.</p> : (
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr><th className={th}>Vendor</th><th className={th}>ID</th><th className={th}>Change</th><th className={th}>Amended by</th><th className={th}>Reason</th><th className={th}>Date</th></tr>
            </thead>
            <tbody>
              {report.amendments.map((row, index) => (
                <tr key={index} className="print:break-inside-avoid">
                  <td className={td}>{row.vendorName}</td><td className={td}>{row.requirementId}</td>
                  <td className={td}><MetBadge value={row.originalScore} /> → <MetBadge value={row.newScore} /></td>
                  <td className={td}>{row.amendedBy}</td><td className={td}>{row.reason}</td><td className={td}>{formatReportDate(row.amendedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Heading>Individual scorer scores</Heading>
        {report.scorerScores.length === 0 ? <p className="mt-2 text-slate-500">No scorer scores recorded.</p> : (
          <table className="mt-2 w-full border-collapse text-[11px]">
            <thead>
              <tr><th className={th}>Vendor</th><th className={th}>ID</th><th className={th}>Scorer</th><th className={th}>Department</th><th className={th}>Score</th><th className={th}>Comment</th><th className={th}>Date</th></tr>
            </thead>
            <tbody>
              {report.scorerScores.map((row, index) => (
                <tr key={index} className="print:break-inside-avoid">
                  <td className={td}>{row.vendorName}</td><td className={td}>{row.requirementId}</td><td className={td}>{row.scorerName}</td>
                  <td className={td}>{row.departmentName}</td><td className={td}><MetBadge value={row.score} /></td><td className={td}>{row.comment}</td><td className={td}>{formatReportDate(row.enteredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-8 text-[10px] text-slate-400">Vendors shown: {[...vendorById.values()].join(", ")}.</p>
      </article>
    </div>
  );
}
