"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";
import { consultantWorkspaces } from "@/lib/consultantWorkspaceData";
import { parseWorkspaceCsv } from "@/lib/workspaceImport";

const sampleJson = JSON.stringify(consultantWorkspaces, null, 2);
const sampleCsv = `workspace_id,workspace_slug,workspace_name,project_id,project_name,project_status,vendor_count,scorer_count,requirement_count,leading_vendor,person_id,person_name,person_role,person_team,person_project,vendor_id,vendor_name,vendor_status,vendor_project,vendor_score,requirement_id,requirement_title,requirement_type,requirement_priority,requirement_status,score_scorer,score_vendor,score_value,score_status
ws-acme-health,acme-health,Acme Health,project-1,HR Platform Review,Active,3,5,18,Northwind Labs,person-1,Priya Singh,VS Consultant,Delivery,Workspace,vendor-1,Northwind Labs,Active,HR Platform Review,89,REQ-101,Recruitment workflow reporting,Functional,High,Active,Priya Singh,Northwind Labs,89,Submitted
ws-acme-health,acme-health,Acme Health,project-2,Payroll Platform,Draft,2,3,9,Pending,person-2,Marcus Reed,Project owner,Operations,HR Platform Review,,,,,,,REQ-102,Audit and logging controls,Non-Functional,High,Active,Operations Team,Northwind Labs,84,Submitted`;

type ImportMode = "json" | "csv";

export function WorkspaceImportForm() {
  const importWorkspaceBundle = useMutation(api.workspaceSeed.importWorkspaceBundle);
  const [mode, setMode] = useState<ImportMode>("json");
  const [jsonText, setJsonText] = useState(sampleJson);
  const [csvText, setCsvText] = useState(sampleCsv);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDownloadTemplate = () => {
    const csvContent = sampleCsv;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "workspace-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    try {
      setIsSubmitting(true);
      setStatus(null);

      let payload: unknown;

      if (mode === "json") {
        payload = JSON.parse(jsonText) as unknown;
        if (!Array.isArray(payload)) {
          throw new Error("The payload must be a JSON array of workspace objects.");
        }
      } else {
        payload = parseWorkspaceCsv(csvText);
        if (!Array.isArray(payload) || payload.length === 0) {
          throw new Error("No valid workspace rows were found in the CSV data.");
        }
      }

      const result = await importWorkspaceBundle({ workspaces: payload as any });
      setStatus(`Imported ${result.importedCount} workspace(s) into Convex.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      setStatus(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isJsonMode = mode === "json";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Seed import</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Bulk data import</h1>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <div className="space-y-6 p-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("json")}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${isJsonMode ? "bg-sky-500 text-slate-950" : "border border-slate-700 bg-slate-950 text-slate-200"}`}
            >
              JSON
            </button>
            <button
              type="button"
              onClick={() => setMode("csv")}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${!isJsonMode ? "bg-sky-500 text-slate-950" : "border border-slate-700 bg-slate-950 text-slate-200"}`}
            >
              CSV from Excel
            </button>
          </div>

          <p className="mt-4 text-sm text-slate-300">
            {isJsonMode
              ? "Paste a JSON array matching the workspace schema and import it directly into Convex."
              : "Paste Excel rows directly into the CSV box; the app converts them into the JSON workspace structure before importing."}
          </p>

          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
            <pre>{isJsonMode ? `[
  {
    "id": "ws-acme-health",
    "slug": "acme-health",
    "name": "Acme Health",
    "projects": [{ "id": "project-1", "name": "HR Platform Review", "status": "Active", "vendorCount": 3, "scorerCount": 5, "requirementCount": 18, "leadingVendor": "Northwind Labs" }],
    "people": [{ "id": "person-1", "name": "Priya Singh", "role": "VS Consultant", "team": "Delivery", "project": "Workspace" }],
    "vendors": [{ "id": "vendor-1", "name": "Northwind Labs", "status": "Active", "project": "HR Platform Review", "score": 89 }],
    "requirements": [{ "id": "REQ-101", "title": "Recruitment workflow reporting", "type": "Functional", "priority": "High", "status": "Active" }],
    "scores": [{ "scorer": "Priya Singh", "vendor": "Northwind Labs", "score": 89, "status": "Submitted" }]
  }
]` : `workspace_id,workspace_slug,workspace_name,project_id,project_name,project_status,vendor_count,scorer_count,requirement_count,leading_vendor,person_id,person_name,person_role,person_team,person_project,vendor_id,vendor_name,vendor_status,vendor_project,vendor_score,requirement_id,requirement_title,requirement_type,requirement_priority,requirement_status,score_scorer,score_vendor,score_value,score_status
ws-acme-health,acme-health,Acme Health,project-1,HR Platform Review,Active,3,5,18,Northwind Labs,person-1,Priya Singh,VS Consultant,Delivery,Workspace,vendor-1,Northwind Labs,Active,HR Platform Review,89,REQ-101,Recruitment workflow reporting,Functional,High,Active,Priya Singh,Northwind Labs,89,Submitted`}</pre>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <textarea
            value={isJsonMode ? jsonText : csvText}
            onChange={(event) => {
              if (isJsonMode) {
                setJsonText(event.target.value);
              } else {
                setCsvText(event.target.value);
              }
            }}
            spellCheck={false}
            className="h-[32rem] w-full rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-sm text-slate-100 outline-none focus:border-sky-500"
          />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={handleImport}
              disabled={isSubmitting}
              className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Importing..." : isJsonMode ? "Import JSON into Convex" : "Convert CSV to JSON and import"}
            </button>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            >
              Download sample CSV template
            </button>

            <button
              type="button"
              onClick={() => {
                if (isJsonMode) {
                  setJsonText(sampleJson);
                } else {
                  setCsvText(sampleCsv);
                }
              }}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            >
              Reset sample data
            </button>
          </div>

          {status ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              {status}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
