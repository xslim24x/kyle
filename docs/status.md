# Implementation status

## Implemented

- React/TypeScript weekly and daily graphical planner, plus keyboard-accessible shift editors and shift list.
- PostgreSQL persistence, optimistic concurrency, deliberate publication, and published estimate snapshots.
- Employees, effective-dated rates, recurring availability, leave, preferences, personal weekly-hour/rest restrictions, and archive status.
- Recurring coverage needs with skip dates, shift assignment, drag/move/resize, overnight shifts, breaks, explicit overlap reasons, coverage gaps, and double-booking prevention.
- Weekly CAD budgets, base-rate wages, percentage and fixed employer-cost estimates, historical inputs, incomplete-cost indicators, and publication acknowledgements.
- Direct application access with no password/PIN login, sessions, Access tab, or lock/sign-out controls. Same-origin write checks remain enabled.
- Read-only HTTPS calendar feeds, bounded recurrence expansion, Google OAuth/read-only integration, multiple-calendar visibility, manual refresh status, and revocable published-shift export.
- Docker Compose, private database networking, daily backup/retention tooling and deployment instructions.

## Remaining limitations and external prerequisites

- Ontario employment-category and rule verification is blocked by proxy denial of official Ontario pages. No statutory compliance claim is made. Overtime, public-holiday calculations, and overnight pay treatment are not implemented as verified rules. Base-rate overnight estimates include all hours and are labelled incomplete.
- Live Google authorization requires the owner's OAuth client credentials and consent. The integration is implemented but has not been verified against a real Google account.
- Calendar refresh is manual. Calendar providers requiring non-HTTPS feeds or private-network access are unsupported. Recurrence expansion has a safety limit.
- Preferences are recorded for manual use; automated assignment suggestions are the agreed later phase.
- Any schedule-state edit conservatively marks published weeks as changed, even if the edit concerned another week. The original publication snapshot is preserved until explicit republication.
- No payroll processing, staff self-service, two-way appointment editing, or automatic publication.

See [requirements](requirements.md) for the complete target and [deployment](deployment.md) for operation and validation commands.

## Validation evidence

Initial implementation verified on 2026-10-20 (before the subsequent authentication removal):

- 17 domain/API tests passed against a fresh disposable PostgreSQL database, including authentication, PIN revocation, concurrent saves, publication persistence, availability exceptions, multiple breaks, costs, coverage union, week boundaries, daylight-saving time, recurrence changes, and timezone handling.
- Two Chromium end-to-end tests passed: the desktop planning/publication/export-revocation workflow and narrow-screen navigation/dialog behavior. No browser page errors were observed in the desktop workflow.
- Type checking, production build, formatting checks, diff whitespace checks, and a production dependency audit passed. The audit reported zero vulnerabilities. The build emits a JavaScript bundle-size advisory; code splitting remains a possible performance improvement.
- The Docker image built successfully using a verified offline npm cache because container egress to npm was unavailable. The standard online image build was not verified in this cloud network.
- The non-root Docker application logged in successfully. A populated database was dumped, restored into a separate database, and served by a separate application container; restored staff, shifts, budget calculations, publication snapshots, and calendar metadata were checked through the API. The primary local instance was returned to its original empty planning state.
- The Dockerfile explicitly assigns runtime-file ownership to the non-root app user; this corrected a runtime permission failure found during packaging validation.

This evidence describes the current workspace. It does not establish VPS deployment, cloud publication, fresh-task restoration, live Google authorization, or verified Ontario legal compliance.

## Authentication removal

The user subsequently requested removal of application authentication. Password/PIN routes, session guards, login/Access screens, lock/sign-out controls, owner bootstrap, password recovery, and the cookie dependency were removed. Startup no longer reads `APP_PASSWORD` or `AUTH_MODE`. Provider authorization and encrypted calendar credentials remain part of calendar integration. Existing scheduling records and publication snapshots require no migration.

Regression checks cover direct API access without credentials, obsolete authentication endpoints returning 404, same-origin write protection, planner reload without cookies, mobile editing, and recovery from an initial loading failure.

After removal, 17 API/domain tests passed against a fresh database with no owner password, and all three Chromium workflows passed. The rebuilt Docker application served planner and calendar APIs without credentials or cookies, and the existing planning state's revision and checksum were unchanged across the upgrade. Build, type checking, formatting, and diff checks passed.
