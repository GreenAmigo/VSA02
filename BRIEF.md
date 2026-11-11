# IT Vendor Selection App – Brief

## Purpose
This is a multi-company app for IT vendor selection. Each company has its own users, projects, vendors, requirements, scores, and settings. Within a company, the project manager can run multiple vendor selection projects and score many vendors per project. Project managers (PMs) and business analysts (BAs) can load requirements, have vendors and internal scorers score them, and compare vendors on a dashboard.

## Roles
- Project owner (PM or BA): creates projects; manages vendors, scorers, requirements, priorities and deadlines.
- Scorer: an individual or a department within the company. Up to 20 per project.
- Vendor: external supplier. Up to 10 per project.

## Projects
- Each project is fully separate, with its own vendors, scorers, requirements and scores.
- A vendor's scores belong to one project only and never carry over.

## Multiple companies
- The app will be used by multiple, separate companies (organisations).
- Each company's data (projects, vendors, scorers, requirements, scores, views) must be completely separate, and enforced on the server. No user can ever see another company's data.
- Each company has its own administrator who manages its users and settings.

## Requirements
- Two types: Requirements/User Stories, and Non-Functional Requirements (NFRs). Support at least 200 of each per project.
- Loaded by importing a spreadsheet (CSV and Excel .xlsx). Each row has a unique Requirement ID.
- Each requirement has a priority of 9, 3, 1 or 0. The PM/BA can edit priorities in the app.
- Requirement text can only be changed by re-importing. On re-import:
  - match rows by Requirement ID
  - add new requirements, update changed ones, mark missing ones as "withdrawn" (never delete) and keep their scores and comments
  - show a summary of changes for the PM/BA to confirm before applying
  - existing scores and comments must never be changed or lost

## Scoring
- All scores are 0 or 1, Not Met or Met.
- Vendors:
  - see only the requirement ID and text, never priorities, company scores, other vendors or scorer views
  - enter a 0 or 1 and a comment, if applicable, for each requirement
  - these restrictions must be enforced on the server, not just hidden in the UI
- Scorers:
  - score each vendor against each requirement (0 or 1, optional comment)
  - grid view: requirements as rows, one column per scorer
  - whether scorers can see each other's scores is a per-project setting the PM/BA controls
- Record who entered every score and when.

## Vendor views
- For each vendor, a section where each scorer records their overall views.

## Deadlines, status and notifications
- The PM/BA sets a scoring deadline for vendors (and for scorers).
- Show each vendor's and scorer's status (not started / in progress / submitted) and when they submitted.
- Show which scorers have scored, and when.
- Notify scorers when they need to act (e.g. a vendor has submitted, new requirements imported, a deadline is approaching). In-app notifications first; email can come later.

## Dashboard
- Weighted score per requirement = priority × score.
- For each vendor: total for Requirements/User Stories, total for NFRs, and combined total.
- The count of 0s (Not Met) should be subtracted from the total scores
- Highlight the vendor with the highest combined total.
- Show the breakdown by requirement type and by scorer.
- Highlight any requirements not yet scored (per vendor and per scorer).

## Decisions
1. A vendor's official total is based on the company scorers' scores, averaged across scorers. The vendor's own self-scores are shown alongside for comparison but do not count.
2. Company staff log in with company single sign-on (SSO), not shared logins.
   - A scorer can be an individual or a department.
   - Staff log in as themselves. A department scorer column can be scored by any member of that department, and the app records which person entered each score and when.
3. Priority 0 means Out Of Scope. These requirements are shown but add nothing to totals. A requirement can be set to 0 at any time, and it stays in the app for traceability (never deleted).

## Logins
- Company staff log in with their own company's SSO. This must support Microsoft (Entra ID / M365), Google Workspace, and other standard SSO providers (SAML or OIDC), configured per company.
- Use an authentication service that supports per-company SSO and works with Convex (e.g. WorkOS or Clerk). Recommend one and explain the choice and any costs in plain English.
- Build with a simple temporary login first, and make SSO easy to switch on per company later.
- Vendors: separate external login (e.g. emailed sign-in link), restricted to their own project and their own scores only.

## Build status

Legend:
- A = real and stored in Convex with server-side checks
- B = working on screen only or partially wired
- C = not built

| Area | Status | Notes |
| --- | --- | --- |
| Multi-company app model | A | Real company membership and project-scoped data model are enforced in Convex and verified by automated tests. |
| Company admin / scorer / vendor roles | A | Roles are modelled and enforced via membership and access checks in Convex. |
| Project separation | A | Project membership is validated server-side; the data model enforces isolation across projects and companies. |
| Requirement import | A | Import logic is now protected by a preview-and-confirm Convex flow and validated by tests. |
| Requirement priority validation | A | Priority constraints are enforced in Convex on import and saved rows. |
| Vendor scoring and score validation | A | Real Convex score submission and score history are in place, with audit fields for who entered each score and when. |
| Vendor self-view restrictions | A | Vendor project views are filtered server-side to only their own rows, while scorer/admin rows remain appropriately visible. |
| Company score and scorer-view isolation | A | Score-view writes are enforced by project membership and role checks; vendor access is isolated to their own project-view data. |
| Dashboard totals and weighted score math | A | Dashboard aggregation is implemented and validated in Convex tests against seeded project data. |
| Deadline and notification logic | A | Deadline and reminder state are persisted and enforced server-side for project membership, visibility, and submission rules. |
| SSO and login flows | A | WorkOS AuthKit preview sign-in is verified working in the browser; local redirects are restored for dev, and production-only preview-admin guardrails are enforced server-side. |
| Vendor emailed-link login | B | The app can flow through the email-based AuthKit path, but the separate vendor-specific project-scoped emailed-link flow still needs the final app-level wiring and validation. |
| Preview admin membership guard | A | The preview-only admin sync guard is enforced in Convex and tested so it cannot run in production. |
| Server-side access checks | A | Company and project access checks are implemented and validated by Convex tests. |
| Consultant workspace catalogue | A | The consultant directory is routed through a single canonical component so / and /workspaces share the same lifecycle UI, while archived/test workspaces are clearly labelled. |
| TEST-badged preview data | A | Test workspaces are clearly labelled with a TEST badge wherever they appear in the consultant UI and in seeded preview data. |
| Screen map and route governance | A | Every route is accounted for in the project brief and the app uses the canonical screen implementation instead of legacy duplicate layouts. |
| Real data persistence in Convex | A | Core app data is persisted and queried in Convex with automated access-isolation coverage. |

## Screen map

The app uses a single canonical consultant home route for the workspace directory and a dedicated activity log route. The route-to-component map below is the source of truth for the consultant and company screens during Phase 3 planning.

| Route | Component / page | Notes |
| --- | --- | --- |
| / | `src/app/page.tsx` -> `AuthGate` -> `ConsultantWorkspaceDirectoryPage` | Canonical consultant home; same implementation as /workspaces |
| /login | App login flow | WorkOS AuthKit login entry page |
| /workspaces | `src/app/workspaces/page.tsx` -> `AuthGate` -> `ConsultantWorkspaceDirectoryPage` | Consultant workspace directory and lifecycle controls |
| /workspaces/activity | `src/app/workspaces/activity/page.tsx` -> `AuthGate` -> `ConsultantActivityLogPage` | Server-filtered activity log for consultants |
| /workspaces/import | `src/app/workspaces/import/page.tsx` -> `AuthGate` -> `ConsultantWorkspaceImportPage` | Bulk import entry for consultant-managed workspaces |
| /workspaces/[companyId] | `src/app/workspaces/[companyId]/page.tsx` -> `AuthGate` -> `ConsultantWorkspaceOverviewPage` | Company/workspace landing page |
| /workspaces/[companyId]/projects | `src/app/workspaces/[companyId]/projects/page.tsx` -> `AuthGate` -> `ConsultantWorkspaceProjectsPage` | Project catalogue for a workspace |
| /workspaces/[companyId]/projects/[projectId] | `src/app/workspaces/[companyId]/projects/[projectId]/page.tsx` -> `AuthGate` -> `ConsultantWorkspaceProjectDetailPage` | Project detail screen |
| /workspaces/[companyId]/people | `src/app/workspaces/[companyId]/people/page.tsx` -> `AuthGate` -> `ConsultantWorkspacePeoplePage` | People and role management |
| /workspaces/[companyId]/vendors | `src/app/workspaces/[companyId]/vendors/page.tsx` -> `AuthGate` -> `ConsultantWorkspaceVendorsPage` | Workspace-level vendor management |
| /workspaces/[companyId]/requirements | `src/app/workspaces/[companyId]/requirements/page.tsx` -> `AuthGate` -> `ConsultantWorkspaceRequirementsPage` | Requirements and imports |
| /workspaces/[companyId]/scoring | `src/app/workspaces/[companyId]/scoring/page.tsx` -> `AuthGate` -> `ConsultantWorkspaceScoringPage` | Scoring dashboard and views |
| /projects | `src/app/projects/page.tsx` -> `AuthGate` -> project dashboard shell | Project-level app screens |
| /projects/new | `src/app/projects/new/page.tsx` -> `AuthGate` -> project creation flow | New project entry |
| /projects/[id] | `src/app/projects/[id]/page.tsx` -> `AuthGate` -> project detail shell | Project overview |
| /projects/[id]/people | `src/app/projects/[id]/people/page.tsx` -> `AuthGate` -> project people screen | Project people and assignments |
| /projects/[id]/requirements | `src/app/projects/[id]/requirements/page.tsx` -> `AuthGate` -> project requirements screen | Requirement management |
| /projects/[id]/scoring | `src/app/projects/[id]/scoring/page.tsx` -> `AuthGate` -> project scoring screen | Scoring workflow |
| /projects/[id]/decision | `src/app/projects/[id]/decision/page.tsx` -> `AuthGate` -> decision screen | Recommendation and decision output |

## Deployment to-do
- After deploying to Vercel, add https://<vercel-address>/auth/callback to WorkOS Staging Redirects.
- Later, add the live address to WorkOS Production Redirects.
- The custom domain vspreview.maxwellknight.co.uk is temporarily pointed at the consultant-admin branch. When consultant-admin is merged into preview, point the domain back at the preview branch in Vercel (Settings > Domains).

## Technology
- Next.js, Convex, GitHub and Vercel (I have used these before).

## Consultant workspace model and security

### Persona: Vendor Selection (VS) Consultant
A platform-level super-admin who onboards client companies and has full admin over every workspace.

Definition: A workspace belongs to exactly one company, and each company has exactly one workspace (so in the database, workspace and company are the same record, matching one WorkOS organisation). There can be many workspaces. A workspace holds everything that company needs to run vendor selections: its people (admins and scorers, individuals or departments), its vendors, and one or more projects. Each project has its own requirements, NFRs, priorities, scoring, deadlines and dashboard. People and vendors belong to the workspace and are assigned to projects.

Access:
- VS Consultants: full access to every workspace.
- Company people: their own workspace only, according to their role.
- Vendors: only the projects they are invited to, and only their own requirement view and scores (never priorities, company scores, scorer views or other vendors).
- No company can ever see another company's workspace.

The VS Consultant can:
- Create, archive and delete workspaces (archive = hidden/read-only and restorable; delete = permanent, only after archiving, confirmed by typing the workspace name)
- Manage workspaces: add and manage companies, company admins, company people and vendors
- See the full catalogue of workspaces and help each company manage its projects, people, requirements, vendors and scoring
- Bulk import data, either as a whole workspace or separately into an existing company (e.g. just Requirements, People or Vendors):
  - downloadable Excel template, one tab per data type
  - dry run showing what will be added, changed or rejected before anything is saved
  - match records by ID so re-imports update rather than duplicate
  - test data clearly labelled as test
- Manage dashboards, reporting and data for each workspace

Security rules:
- The Consultant role can only be granted on the server, never through sign-up or any company-facing screen.
- A proper server-only role grant is required; the previous preview admin helper is replaced by a dedicated one-off Convex internal function or CLI command run by the developer, never a UI action.
- Every Consultant action is recorded in an activity log (who, what, when, which workspace), not just lifecycle actions.
- Company users must never be able to see or use Consultant features, enforced on the server.
- Automated tests must prove both of these.
- All test data must be clearly labelled as test data in the import and seed commands.

### Phase 1 implementation requirements
Phase 1 is approved with the following changes:
1. Add a safe, server-only way to grant the VS Consultant role, using a one-off Convex internal function or CLI command run by me, never a screen. This replaces the previous preview-admin helper and removes it.
2. Add a preview/development-only command to load realistic test data (several workspaces, people, vendors, projects), with an automated test proving it cannot run in Production. All test data must be labelled as test.
3. Add workspace-level vendor management in Phase 3, including creating and managing vendors at the workspace level, with assignment to projects later.
4. Every phase must record every Consultant action in the activity log (who, what, when, which workspace), not only workspace lifecycle actions.
5. Phases 4 and 5 must reuse the existing project, requirement, import and scoring code and tests. Do not rebuild them. Reused items are the current project model, requirement import flow, scoring validation and persistence, and related tests. New items are the consultant workspace catalogue, server-only consultant role grant, workspace-level vendor management, activity logging, and workspace/project reporting exports.
6. Add a phase before final hardening for Consultant reporting and data management: dashboards per workspace and project, plus export features for Excel/PDF sign-off results.

### Phase plan (approved with changes)
1. Phase 1 — Consultant role grant and preview-only data seed
2. Phase 2 — Workspace lifecycle and admin controls
3. Phase 3 — Workspace-level people and vendor management
4. Phase 4 — Projects, requirements, priorities and dashboard data
5. Phase 5 — Vendor and scorer workflows with strict data separation
6. Phase 6 — Bulk import and dry-run validation
7. Phase 7 — Consultant reporting and data management exports
8. Phase 8 — Final hardening and release prep

### Phase 1 status update
- Consultant access and preview-only workspace visibility are in place and enforced on the server.
- The consultant home, workspace directory and activity-log route are all wired to Convex-backed access queries.
- Test-workspace records are clearly labelled in the UI with a TEST badge wherever they appear in the consultant directory.
- The signed-in email and server-provided role remain visible in the preview environment only, without exposing assumptions in production.
- Remaining work is the next phase: workspace lifecycle and admin controls.

### How to grant the first VS Consultant
The first Consultant must be granted by a developer-run server-only action, not by a user-facing screen.

Exact approach to follow in Phase 1:
- add an internal Convex mutation or script that can only run outside Production, or can be restricted to a trusted local/dev environment, and accepts my personal email or WorkOS user ID
- validate the caller is a trusted admin environment (server-side only)
- grant the Consultant role on the server and create the corresponding workspace access records
- keep the action out of any company-facing route or sign-up flow
- log the role grant in the activity log with user, action, timestamp, and workspace context

This is the approved replacement for the previous preview admin helper and must remove the prior ensurePreviewAdminMembership flow entirely.

### Test data and production guard
The preview/development seed command must:
- create realistic test workspaces, people, vendors and projects
- label every created record as test data
- be disabled in Production with an automated test proving it cannot run there
- be clearly isolated from production records and excluded from any production metrics or exports until explicitly promoted

## How to work with me
- I am not a coder. Explain things in plain English and give me exact commands one at a time.
- Build in small phases. After each phase, tell me how to test it and wait for my go-ahead.
