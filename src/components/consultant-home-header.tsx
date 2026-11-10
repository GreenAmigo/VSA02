type ConsultantHomeHeaderProps = {
  isConsultant: boolean;
  displayRole: string;
  email: string;
  onToggleCreate: () => void;
};

export function ConsultantHomeHeader({
  isConsultant,
  displayRole,
  email,
  onToggleCreate,
}: ConsultantHomeHeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">{displayRole}</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">{isConsultant ? "Consultant home" : "Workspace directory"}</h1>
        </div>
        <div className="flex items-center gap-3">
          {isConsultant ? (
            <button
              type="button"
              onClick={onToggleCreate}
              className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400"
            >
              New workspace
            </button>
          ) : null}
          <div className="text-right text-sm text-slate-300">
            <div>{email}</div>
            <div className="text-xs text-sky-300">{displayRole}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
