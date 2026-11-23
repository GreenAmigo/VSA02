// One "Signed in" panel used by every page frame: display name, role, department and email.

type SignedInAccess = {
  email?: string | null;
  displayName?: string | null;
  isConsultant?: boolean;
  role?: string | null;
  consultantDisplayName?: string | null;
  profiles?: Array<{ companyId: string; role: string; displayName: string; departmentName: string | null }>;
} | null | undefined;

const ROLE_LABELS: Record<string, string> = {
  "vs-consultant": "VS Consultant",
  "company-admin": "Company admin",
  "company-scorer": "Company scorer",
  vendor: "Vendor",
};

function isEmailLike(value: string | null | undefined) {
  return Boolean(value && value.includes("@"));
}

export function signedInDetails(access: SignedInAccess, companyId?: string | null, fallbackEmail?: string | null, roleLabelOverride?: string) {
  const profile = companyId ? access?.profiles?.find((row) => row.companyId === companyId) : access?.profiles?.[0];
  const candidates = [
    access?.isConsultant ? access?.consultantDisplayName : null,
    profile?.displayName,
    access?.displayName,
  ];
  const name = candidates.find((value) => value && !isEmailLike(value)) ?? null;
  const roleKey = access?.isConsultant ? "vs-consultant" : profile?.role ?? access?.role ?? "";
  return {
    name,
    roleLabel: roleLabelOverride ?? ROLE_LABELS[roleKey] ?? "User",
    departmentName: access?.isConsultant ? null : profile?.departmentName ?? null,
    email: access?.email ?? fallbackEmail ?? null,
  };
}

export function SignedInPanel({ access, companyId, fallbackEmail, roleLabel, className = "" }: {
  access: SignedInAccess;
  companyId?: string | null;
  fallbackEmail?: string | null;
  roleLabel?: string;
  className?: string;
}) {
  const details = signedInDetails(access, companyId, fallbackEmail, roleLabel);
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900 p-4 ${className}`}>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Signed in</p>
      <div className="mt-3 space-y-1 text-sm">
        {details.name ? <p className="truncate font-semibold text-white" title={details.name}>{details.name}</p> : null}
        <p className="text-xs uppercase tracking-[0.14em] text-sky-300">{details.roleLabel}</p>
        {details.departmentName ? <p className="truncate text-slate-300" title={details.departmentName}>{details.departmentName}</p> : null}
        <p className="truncate text-slate-400" title={details.email ?? "Unknown user"}>{details.email ?? "Unknown user"}</p>
      </div>
    </div>
  );
}
