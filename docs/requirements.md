# Kyle: agreed product requirements

Status: scope confirmed by the user on 2026-10-20. This document specifies intended behavior. See [implementation status](status.md) for delivered capabilities and remaining limits.

## Purpose and users

Help one individual employer cover changing weekly support needs within available funding. Cover required needs first, then expose unused funding for additional useful support. Spending the entire allocation is not an objective by itself.

Only the employer uses the application. All employees have the display role support staff, are directly employed, and do not live in the home. Support is provided mainly at home and on outings. Employee accounts, staff self-service, agency staffing, multiple employers, and payroll processing are outside the first release.

Terminology is defined in [the glossary](../CONTEXT.md).

## Planning and assignment

- Maintain employees, effective-dated hourly rates, recurring availability, date-specific availability exceptions, leave, mandatory restrictions, and preferences.
- Define recurring coverage windows with date-specific changes. Default to one employee at a time; permit explicit overlap exceptions.
- Keep coverage needs, shift blocks, and assignments independent. Removing an assignment must leave the underlying need visible as uncovered.
- Allow the employer to create, resize, move, assign, and unassign shift blocks in a weekly calendar. Provide click/keyboard controls alongside drag-and-drop.
- Support nights, weekends, cross-midnight shifts, and shifts crossing a workweek boundary.
- Overnight coverage is sleeping/on-call. Record that arrangement without inferring unpaid time.
- Breaks do not require replacement coverage. Record breaks and their pay treatment explicitly; do not automatically deduct unpaid time.
- Show gaps, assignment conflicts, availability violations, overlap exceptions, and estimated spending while editing.
- Prevent an employee being assigned to simultaneous shifts. An overlap exception permits different employees to overlap, not double-booking one employee.
- Keep drafts editable and require deliberate publication. Flag revisions to a published schedule and require deliberate republication.
- A budget shortfall must remain visible. Publication above budget requires explicit acknowledgement; the app must not silently delete coverage.
- Assignment suggestions are a later phase. The employer reviews and applies proposed changes; suggestions never silently publish a schedule.

## Funding and costs

- Use CAD and Monday–Sunday workweeks in America/Toronto.
- Funding may change between weeks, never midweek. Preserve historical budget amounts and effective dates.
- No automatic funding carryover. Show remaining funds or overspend for each week.
- Include wages and configurable employer-cost estimates, displaying them separately. Estimates may use percentages and fixed amounts, with their allocation basis recorded explicitly.
- Maintain effective dates for employee rates and employer-cost settings so future changes do not silently rewrite prior estimates.
- Split costs across weekly boundaries. Use actual elapsed time for overnight and daylight-saving transitions rather than subtracting displayed clock times.
- Display missing cost inputs as incomplete estimates, not zero cost. An incomplete estimate must not appear as a verified within-budget result.
- Holiday pay, overtime, sleeping/on-call pay, break treatment, and employer contributions require verified calculation rules before corresponding amounts are described as complete.
- Scheduled costs are planning estimates, not payroll calculations or remittances.

## Calendar portal

- Display editable staff shifts and read-only appointments together, with distinct visual treatment, per-calendar colours, filtering, and an event details view.
- Initially support multiple Google calendars and calendar subscription feeds. Additional providers and two-way appointment editing are deferred.
- Appointments are contextual overlays by default. They do not automatically create coverage needs or make employees unavailable.
- Preserve provider timezone, all-day, recurrence, update, and cancellation semantics. Show sync errors and last successful refresh; failed refreshes must not masquerade as empty calendars.
- Provide a read-only export of staff shifts. Treat private subscription URLs as credentials and allow revocation.
- Keep provider credentials and private feed URLs server-side and out of logs. Store only appointment information needed for the portal.

## Ontario employment rules

The employer wants restrictions aligned with Ontario employment law. Direct employment, no live-in staff, private-home work plus outings, and sleeping/on-call overnight coverage are confirmed facts. No special employment agreements are assumed; their existence has not been independently established.

Before enabling legal enforcement or describing the application as compliant:

1. Verify the applicable employment category and any relevant exemptions or special rules. The support staff display role is not a legal classification.
2. Verify current hours, rest, meal-period, overtime, minimum-pay, and public-holiday requirements and permitted exceptions for that category.
3. Resolve whether overnight availability and interruptions count as working time and how they are paid. Do not assume sleeping hours are unpaid or that an arbitrary flat allowance is valid.
4. Confirm break duties and pay treatment. No replacement coverage does not by itself establish that a break is unpaid or satisfies statutory requirements.
5. Record sources, verification dates, rule effective dates, and any applicable agreements. Distinguish mandatory restrictions, documented legal exceptions, and preferences.

An employer override cannot make an unlawful schedule lawful. Unverified rules must be labelled as unresolved rather than represented by fabricated legal defaults.

Official sources identified for verification:

- [Employment Standards Act, 2000](https://www.ontario.ca/laws/statute/00e41)
- [Ontario Regulation 285/01](https://www.ontario.ca/laws/regulation/010285)
- [Hours of work guide](https://www.ontario.ca/document/your-guide-employment-standards-act-0/hours-work)
- [Overtime pay guide](https://www.ontario.ca/document/your-guide-employment-standards-act-0/overtime-pay)
- [Public holidays guide](https://www.ontario.ca/document/your-guide-employment-standards-act-0/public-holidays)
- [Exemptions and special rules](https://www.ontario.ca/document/industries-and-jobs-exemptions-or-special-rules)

Research limitation: official-page retrieval returned a proxy 403 during discovery. Current legal content was not verified. This blocks a compliance claim, not development of the manual planner.

## Hosting and access

- Use TypeScript, React, a Node.js backend, PostgreSQL, and Docker Compose. The user supplies a reverse proxy to a VPS.
- Open the application directly without application authentication, per the user's subsequent scope change. Provide no login screen, password/PIN settings, session requirement, or lock/sign-out controls.
- Access restrictions, when needed, are managed outside the application through the reverse proxy or network. Retain same-origin checks for browser writes.
- Support TLS termination at the trusted reverse proxy. Keep the database private and secrets outside source control.
- Include automated backups and a tested restore procedure. Live processes and external calendar authentication must be recoverable after restart.
- Restrict server-side calendar fetching against private-network access and unsafe redirects; treat external event text as untrusted content.

## Acceptance scenarios

1. Create recurring coverage and an unassigned shift; the portal shows uncovered need until an available employee is assigned.
2. Moving a shift across an unavailable interval exposes the conflict; double-booking the same employee is prevented.
3. Two different employees may overlap only through an explicit overlap exception.
4. An overnight shift appears across both days and is apportioned correctly across Sunday/Monday and daylight-saving transitions.
5. A future budget or rate change leaves historical inputs intact. Wages, employer costs, and remaining budget reconcile to the configured inputs.
6. An over-budget draft remains editable and requires acknowledgement to publish; missing pay inputs remain visibly incomplete.
7. Multiple calendars appear beside shifts. Filtering affects visibility only; remote appointment editing is unavailable. Recurrences, cancellations, all-day events, and failed refreshes are handled explicitly.
8. The planner and API open without credentials, and editing/publication work without session cookies. Cross-site writes remain blocked. Revoked calendar export tokens stop working.
9. A backup restored into a fresh deployment recovers staff, schedules, budgets, and settings; calendar reconnection requirements are visible.
