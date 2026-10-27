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

## Technology
- Next.js, Convex, GitHub and Vercel (I have used these before).

## How to work with me
- I am not a coder. Explain things in plain English and give me exact commands one at a time.
- Build in small phases. After each phase, tell me how to test it and wait for my go-ahead.
