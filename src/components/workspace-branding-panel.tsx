"use client";

import { useState } from "react";
import { useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 1024 * 1024;

export type WorkspaceBranding = { companyId: string; brandName: string | null; logoUrl: string | null } | null | undefined;

/** Lets a VS Consultant set a client workspace's display name and logo. Shown to consultants only. */
export function WorkspaceBrandingPanel({ companyId, companyName, branding }: {
  companyId: string;
  companyName: string;
  branding: WorkspaceBranding;
}) {
  const generateUploadUrl = useMutation(api.branding.generateBrandLogoUploadUrl);
  const setBranding = useMutation(api.branding.setCompanyBranding);
  const removeLogo = useMutation(api.branding.removeCompanyBrandLogo);
  const [name, setName] = useState(branding?.brandName ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const id = companyId as Id<"companies">;

  const run = async (work: () => Promise<void>, success: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await work();
      setNotice({ kind: "success", message: success });
    } catch (error) {
      const message = error instanceof Error ? error.message.replace(/^[\s\S]*Uncaught Error: /, "").split("\n")[0] : "Something went wrong.";
      setNotice({ kind: "error", message });
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setNotice({ kind: "error", message: "The logo must be a PNG, JPEG or WebP image." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setNotice({ kind: "error", message: "The logo must be 1 MB or smaller." });
      return;
    }
    await run(async () => {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("The logo couldn't be uploaded. Please try again.");
      const { storageId } = await response.json() as { storageId: Id<"_storage"> };
      const result = await setBranding({ companyId: id, logoStorageId: storageId });
      if (result?.error) throw new Error(result.error);
    }, "Logo saved.");
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold text-white">Client branding</h3>
      <p className="mt-1 text-sm text-slate-400">Shown in this workspace&apos;s header for everyone in it, and on its sign-off reports. Only VS Consultants can change this.</p>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Logo</p>
          <div className="mt-2 flex items-center gap-4">
            {branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={`${branding.brandName ?? companyName} logo`} className="h-14 max-w-[180px] rounded bg-white object-contain p-1" />
            ) : (
              <div className="flex h-14 w-28 items-center justify-center rounded border border-dashed border-slate-700 text-xs text-slate-500">No logo</div>
            )}
            <div className="flex flex-col gap-2">
              <label className={`cursor-pointer rounded-xl bg-sky-500 px-3 py-2 text-center text-sm font-medium text-slate-950 hover:bg-sky-400 ${busy ? "pointer-events-none opacity-60" : ""}`}>
                {branding?.logoUrl ? "Replace logo" : "Upload logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadLogo(file);
                  }}
                />
              </label>
              {branding?.logoUrl ? (
                <button type="button" disabled={busy} onClick={() => void run(() => removeLogo({ companyId: id }).then(() => undefined), "Logo removed.")} className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60">
                  Remove logo
                </button>
              ) : null}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">PNG, JPEG or WebP, up to 1 MB. A wide logo on a transparent or white background works best.</p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => setBranding({ companyId: id, brandName: name }).then(() => undefined), "Display name saved.");
          }}
        >
          <label className="text-xs uppercase tracking-[0.14em] text-slate-400" htmlFor={`brand-name-${companyId}`}>Display name</label>
          <input
            id={`brand-name-${companyId}`}
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder={companyName}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
          />
          <p className="mt-1 text-xs text-slate-500">Leave blank to use the workspace name ({companyName}).</p>
          <button type="submit" disabled={busy} className="mt-3 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60">Save name</button>
        </form>
      </div>

      {notice ? (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-4 rounded-xl border p-3 text-sm ${notice.kind === "error" ? "border-rose-500/40 bg-rose-500/10 text-rose-100" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"}`}>
          {notice.message}
        </p>
      ) : null}
    </section>
  );
}
