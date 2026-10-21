# Implementation plan

Scope and acceptance scenarios: [requirements](requirements.md). Vocabulary: [glossary](../CONTEXT.md).

This is the original delivery plan. See [implementation status](status.md) for delivered capabilities and remaining verification. Complete each stage with a working end-to-end slice before expanding it.

## 1. Application foundation and private access

Set up the TypeScript React client, Node.js server, PostgreSQL migrations, and Docker Compose development workflow. Choose maintained libraries during implementation against current documentation. Implement single-employer password setup, login, logout, protected routes, and reverse-proxy deployment settings. Keep the database off the public network.

Done when a fresh local deployment starts, persists data across restart, serves an authenticated page, rejects unauthenticated data access, and has reproducible installation/build/test commands. Verify authentication rate limits and session revocation. Add a configuration example containing no secrets.

## 2. Employees, needs, and the manual weekly planner

Implement employees, availability, leave, recurring coverage needs, date exceptions, shift blocks, and assignments. Add a weekly calendar with click/keyboard editing and drag-and-drop. Persist drafts, coverage gaps, explicit overlap exceptions, and publication state. Use timezone-aware intervals and server-side validation with transactional conflict checks.

Done when acceptance scenarios 1–4 pass through both domain tests and representative browser interactions. Cover concurrent conflicting edits, adjacent shifts, midnight, week boundaries, and daylight-saving transitions. A break without replacement must not generate a phantom staffing need.

## 3. Budget and estimated costs

Implement weekly CAD budgets, effective-dated staff rates, employer-cost components, and a transparent estimate breakdown. Allocate costs to the correct weeks, label incomplete inputs, preserve historical configuration, and require acknowledgement for over-budget publication.

Use precise monetary arithmetic and define rounding consistently. Retain the inputs associated with published estimates so they can be explained later. Historical corrections must be explicit rather than a side effect of editing future rates.

Done when acceptance scenarios 5–6 pass, including fixed-cost allocation, incomplete overnight-pay inputs, fractional amounts, and changed future rates. Show configured estimates without claiming payroll accuracy.

## 4. Verify and implement Ontario rules

Research the official sources listed in the requirements, establish applicable classification, and resolve overnight and break pay treatment. Obtain the employer's facts about any relevant agreements before using exceptions. Record the verified rule set and effective dates alongside testable examples.

Implement a separate scheduling-rule evaluator that returns blocking conflicts, applicable documented exceptions, and advisory preference warnings. Evaluate adjacent weeks where a rule's time window crosses the visible week. Integrate verified overtime and holiday cost behavior with budget estimates.

Done when the applicable rules are supported by retrieved sources and meaningful boundary-case tests. Until then, retain an explicit incomplete-compliance status; basic availability and overlap checks can still operate. This stage is required before presenting legal checks as complete or using the product as a verified compliance aid.

## 5. External calendars and shift export

Implement server-side Google authorization with read-only access, selection of multiple calendars, subscription-feed ingestion, and persistent sync state. Support recurrence, exceptions, cancellations, all-day events, and timezone conversion. Add calendar filters, colours, and details in the same planner. Add revocable read-only shift export.

Done when acceptance scenario 7 passes using integration fixtures and an authorized real-provider smoke test when credentials are available. Verify stale-data indicators, expired authorization, token revocation, private-feed handling, and protection against unsafe feed destinations. Real-provider validation remains outstanding if credentials are unavailable.

## 6. Self-hosted release verification

Complete optional trusted-device PIN unlocking, explicit externally protected/private access modes, backup scheduling, restore instructions, and reverse-proxy configuration guidance. Test accessibility and usable layouts on desktop and mobile. Verify sensitive data is excluded from logs and credentials survive only through supported secure storage.

Done when acceptance scenarios 8–9 pass and the complete manual planning workflow works in a fresh Docker Compose deployment. Exercise password recovery and a documented backup restore. Document any remaining limitations accurately before release.

## 7. Later: reviewed assignment suggestions

After the manual workflow and rules are validated, add a proposal engine using needs, availability, verified restrictions, rates, and budget. Prioritize required coverage, then useful additional coverage and preferences. Explain unfilled needs and infeasible constraints. Present proposed changes for explicit employer acceptance without silently altering published assignments.

Done when proposals obey the same server-side checks as manual assignments and infeasible cases remain visible. Automatic publication, payroll processing, staff self-service, and two-way appointment editing remain outside this plan.
