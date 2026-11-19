"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { parseWorkspaceCsv } from "@/lib/workspaceImport";

const emptyJsonTemplate = "[]";
const emptyCsvTemplate = `workspace_id,workspace_slug,workspace_name,project_name
`;

type ImportMode = "json" | "csv";

export function WorkspaceImportForm() {
  const importWorkspaceBundle = useMutation(api.workspaceSeed.importWorkspaceBundle);
  const access = useQuery(api.access.getCurrentUserAccess, {}) as
    | { email?: string | null; role?: string | null; isConsultant?: boolean }
    | undefined;
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>("json");
  const [jsonText, setJsonText] = useState(emptyJsonTemplate);
  const [csvText, setCsvText] = useState(emptyCsvTemplate);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDownloadTemplate = () => {
    const blob = new Blob([emptyCsvTemplate], { type: "text/csv;charset=utf-8;" });
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
      {menuOpen ? (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
        />
      ) : null}

      <aside className={`fixed inset-y-0 left-0 z-50 w-80 shrink-0 border-r border-slate-800 bg-slate-950/90 p-5 transition-transform duration-200 lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-300">Authorized</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-white">Workspace navigation</h2>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 lg:hidden"
            >
              Close
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Workspace actions</p>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <Link href="/workspaces" className="block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 hover:border-slate-500">
              All workspaces
            </Link>
            <Link href="/workspaces/activity" className="block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 hover:border-slate-500">
              Activity log
            </Link>
            <Link href="/workspaces/import" className="block rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sky-100 hover:border-sky-400">
              Bulk data import
            </Link>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Signed in</p>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p className="truncate" title={access?.email ?? "Unknown user"}>{access?.email ?? "Unknown user"}</p>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{access?.isConsultant ? "VS Consultant" : access?.role ?? "User"}</p>
          </div>
          <Link
            href="/api/auth/logout"
            className="mt-2 inline-flex w-fit rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:border-slate-500"
          >
            Sign out
          </Link>
        </div>
      </aside>

      <main className="min-h-screen lg:ml-80">
      <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-500"
              >
                Menu
              </button>
            </div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Seed import</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Bulk data import</h1>
          </div>
          <div className="flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3 xl:ml-auto">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Signed in</p>
            <p className="truncate text-sm font-medium text-white" title={access?.email ?? "Unknown user"}>{access?.email ?? "Unknown user"}</p>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{access?.isConsultant ? "VS Consultant" : access?.role ?? "User"}</p>
            <Link
              href="/workspaces"
              className="mt-1 inline-flex w-fit rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs text-sky-200 hover:border-sky-400"
            >
              All workspaces
            </Link>
            <Link
              href="/api/auth/logout"
              className="mt-1 inline-flex w-fit rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:border-slate-500"
            >
              Sign out
            </Link>
          </div>
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
            <pre>{isJsonMode ? "[]" : "workspace_id,workspace_slug,workspace_name,project_name\n"}</pre>
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
                  setJsonText(emptyJsonTemplate);
                } else {
                  setCsvText(emptyCsvTemplate);
                }
              }}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            >
              Clear form
            </button>
          </div>

          {status ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              {status}
            </div>
          ) : null}
        </div>
      </div>
      </main>
    </div>
  );
}
