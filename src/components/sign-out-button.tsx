"use client";

import { signOutAction } from "../app/actions/sign-out";

export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={`inline-flex items-center gap-2 rounded-xl border border-rose-400/50 bg-rose-500/15 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:border-rose-300 hover:bg-rose-500/25 ${className}`}
        aria-label="Sign out"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
          <path d="M11 2h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5v-2h5V4h-5V2Zm-1 4 1.4 1.4-1.6 1.6H2v2h7.8l1.6 1.6L10 14l-4-4 4-4Z" />
        </svg>
        Sign out
      </button>
    </form>
  );
}
