# Copilot instructions for this repository

## Standing rules
- Read BRIEF.md before starting any task.
- Never use hard-coded sample data in the UI; all data comes from Convex.
- Access rules are enforced on the server only; never rely on the UI to hide data.
- Queries must never write to the database; data migrations and clean-ups are separate internal mutations that I run explicitly.
- Before saying a task is done: run npx tsc --noEmit (zero errors) and the full test suite, show me both outputs, commit and push, and give me the commit code.
- Before saying a task is done: run both npx tsc --noEmit and npx convex dev --once (or the equivalent Convex typecheck), show me both outputs, then run the full test suite, commit and push, and give me the commit code.
- Tests must call the same Convex functions the pages use.
- When giving me arguments to run in the Convex dashboard, use clearly marked placeholders like <REAL_WORKOS_USER_ID>, never realistic-looking example values.
- Never put deploy keys or secrets in code, chat or .env.local.
- Explain things in plain English and give me exact steps one at a time.
- Diagnose the cause and explain it before changing code when something fails.
- Before building a feature, search for an existing one and reuse it; never create a second version of an existing screen, component, or parser.
- Every error a user can trigger must be shown on screen in plain English; never fail silently.
- Never loosen a permission check to make a test pass. If a test fails on permissions, explain it to me and ask before changing who is allowed to do what.
- Hooks must never be called conditionally, after an early return, or inside role/loading branches; call hooks unconditionally at the top of the component.
- Role-specific UI logic (for example consultant/admin-only editors) must live in child components rather than conditional hook blocks in shared parent components.

## Working expectations
- Keep the existing WorkOS login, Convex backend, access checks and company isolation intact unless the task specifically requires a change there.
- Prefer the smallest root-cause fix over broader rewrites.
- Do not introduce UI-only access logic or mock data in screens.
- Keep production and preview/dev behavior separated and guarded.
- Schema migration rule: any schema change that removes or narrows a field must be done in two steps. Step 1 is to keep the old value allowed, add a migration function, deploy that migration, and tell me to run the migration before any stricter deploy. Step 2 is to tighten the schema only after the migration has been run successfully. Always tell me if a change needs existing data migrated before it deploys.
- Screen map rule: every route must be listed in BRIEF.md, and the canonical consultant-home route must be used for / and /workspaces instead of legacy duplicate layouts.
- Shared workspace frame rule: every workspace page must use the same shell: the workspace name header, the same tab strip, and the signed-in panel. People and vendor contact pages must not be exceptions.
- Breadcrumb rule: every workspace page must show a breadcrumb trail; consultants always include All workspaces, and vendor contact screens must link back to the vendor list before the vendor record.
- Role menu rule: menu items are role-aware and server-enforced. Consultant: All workspaces, Activity log, and all workspace tabs; company admin: Overview, People, Departments, Vendors only; company scorer: Overview only; vendor: Vendor home only, with no People, Departments, Vendors or Activity log.
- Left menu visibility rule: the role-aware left menu is always available on every workspace page for every role, collapsing into a Menu button + drawer on narrow screens.
- Header projects shortcut rule: workspace headers include a Projects shortcut for roles that can access projects.
- Vendor breadcrumb safety rule: vendor breadcrumbs and navigation labels use vendor-safe destinations only (My workspaces, My projects, then project-level scoring pages).
- Dashboard project list rule: the workspace Overview dashboard must list the current user's visible projects directly (consultants/company admins: all workspace projects; scorers/vendors: assigned projects) without requiring a secondary "View all projects" hop.
- Long text rule: labels and values in cards must use a smaller, consistent type scale, clamp long strings with ellipses, and keep full values available on hover/focus; long emails and IDs may wrap instead of forcing overflow.
- Requirements/scoring controls rule: long requirement lists expose Expand all/Collapse all controls and each row supports per-item collapse.
- Priority and naming rule: requirement priority labels use P9 Critical/P3 High/P1 Low/P0 Out of scope, and user-facing requirement scoring CTAs are named Score requirements.
- Activity log readability rule: activity rows show a plain-English summary first, then expandable details; field-level changes are listed as changed fields only, and labels should use names with safe fallbacks for legacy rows.
- When a task includes a verification step, run the exact proving commands and report the real output.
