# Copilot instructions for this repository

## Standing rules
- Read BRIEF.md before starting any task.
- Never use hard-coded sample data in the UI; all data comes from Convex.
- Access rules are enforced on the server only; never rely on the UI to hide data.
- Before saying a task is done: run npx tsc --noEmit (zero errors) and the full test suite, show me both outputs, commit and push, and give me the commit code.
- Tests must call the same Convex functions the pages use.
- When giving me arguments to run in the Convex dashboard, use clearly marked placeholders like <REAL_WORKOS_USER_ID>, never realistic-looking example values.
- Never put deploy keys or secrets in code, chat or .env.local.
- Explain things in plain English and give me exact steps one at a time.
- Diagnose the cause and explain it before changing code when something fails.

## Working expectations
- Keep the existing WorkOS login, Convex backend, access checks and company isolation intact unless the task specifically requires a change there.
- Prefer the smallest root-cause fix over broader rewrites.
- Do not introduce UI-only access logic or mock data in screens.
- Keep production and preview/dev behavior separated and guarded.
- Schema migration rule: any schema change that removes or narrows a field must be done in two steps. Step 1 is to keep the old value allowed, add a migration function, deploy that migration, and tell me to run the migration before any stricter deploy. Step 2 is to tighten the schema only after the migration has been run successfully. Always tell me if a change needs existing data migrated before it deploys.
- Screen map rule: every route must be listed in BRIEF.md, and the canonical consultant-home route must be used for / and /workspaces instead of legacy duplicate layouts.
- When a task includes a verification step, run the exact proving commands and report the real output.
