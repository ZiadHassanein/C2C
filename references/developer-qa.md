# Developer QA and evidence

Use this guide for QA planning, implementation review, authorized tests and retests, and decisions about the next step. Match the checks to the work and its consequences. A small correction may need one meaningful regression check; it does not need every test category below.

## Scope and authority

The coordinating AI may inspect the relevant project, run requested tests, review evidence and verify fixes within the user's existing authorization and host permissions. An explicit request to run those tests authorizes that scoped work; do not turn it into another approval question. A planning request alone does not authorize implementation, production traffic, deployment, publication, destructive migrations, load tests or paid services. When implementation or testing is already authorized, do the applicable work without asking again. Inspect unfamiliar test scripts and their environment before executing them; a command named `test` can still modify data or contact external services.

Peer workers remain text-only reviewers of supplied evidence. They can challenge assertions, find missing cases and request bounded evidence; they do not execute project tests or inspect files, browsers or images independently. Attribute observations to whoever actually made them. Do not add peer rounds merely to produce a green result.

For content, use source accuracy, editorial consistency, audience comprehension, permissions and accessibility checks where relevant. Mixed work needs both editorial and engineering checks, including their dependencies. Do not prescribe a software test framework for a content-only task. Keep the plan, `DISCUSSION.md` and `RESULT.md` as the user-facing deliverables; detailed receipts belong in existing plan/evidence records, without a new required user-authored report.

## Baseline and test selection

Establish the actual baseline: current commit or equivalent version, relevant uncommitted changes and untracked files, selected component or asset revision, runtime/tool versions, test commands, fixtures and environment. Preserve other work. A commit hash alone does not identify a dirty checkout; describe or hash the changed scope. For a reported bug, reproduce the observable failure when feasible before fixing it. If reproduction is unavailable, record the missing evidence rather than inventing a failing baseline.

Select assertions from requirements and failure consequences, then reuse the project's existing test stack. Check behavior that could distinguish a correct change from the plausible bug, rather than duplicating the implementation or asserting only that a process exited. Apply these categories only where they resolve material risk:

| Change or uncertainty | Useful verification |
|---|---|
| A local rule, calculation or state transition | Focused unit assertions, boundaries and invalid inputs; property checks when an invariant spans many inputs. |
| Components, persistence or service boundaries | Integration checks for real interfaces; contract checks for expected request/response and failure semantics. |
| A critical user journey | End-to-end behavior in an isolated environment, including the relevant failure path. |
| Shared mutable state or retries | Concurrency, ordering, cancellation, duplicate delivery or idempotency checks appropriate to the actual design. |
| Data or schema evolution | Representative old data, forward compatibility and the authorized rollback/recovery path in disposable fixtures. |
| User interface changes | Relevant keyboard/focus, accessible name/semantics, responsive and visual checks; automated accessibility results do not establish complete usability. |
| Security boundaries | Positive and negative authorization, input-handling, secret exposure or isolation assertions tied to the scoped threat. |

Use user-visible browser behavior and independent fixture state when the existing stack supports it; Playwright's guidance emphasizes these properties. This does not require installing Playwright. [Playwright testing guidance](https://playwright.dev/docs/best-practices).

For relevant web security requirements, select a bounded set from an appropriate standard and record its version and requirement IDs. ASVS IDs can change between versions; citing the project name alone is not an auditable requirement. A scoped check is not ASVS certification. [OWASP ASVS](https://owasp.org/projects/asvs).

## Execution and evidence

Separate **static inspection**, **proposed checks**, **executed checks** and **blocked checks** in the plan and discussion. Static inspection can support a source-level claim; it is not proof that the application ran. A test list, executable script, screenshot filename or past green CI run does not establish a current pass. Missing tools, authority, data or services are blockers for the affected check, with a specific next action.

Use disposable data and isolated accounts, directories, browser state and service fixtures. Confirm cleanup targets and preserve production and user data. Mock external services when that fits the assertion, and label the mock's limits. A fixture success does not prove live authentication, integration behavior, billing eligibility or production performance. Do not add live provider requests as test probes.

For every consequential executed check, retain a concise receipt in selected evidence or the existing plan appendix:

- Exact command and working directory, or the actual manual inspection method; relevant environment and tool versions, without secret values.
- The tested commit/version and dirty scope or artifact digest, observation time, expected behavior and actual result.
- Exit status when applicable; passed, failed and skipped counts, skip reasons, and relevant retry/flakiness information.
- A retained log/evidence reference, SHA-256 of the exact retained bytes, and bounded excerpts showing the assertion or failure. State excerpt truncation and any sanitization; a sanitized log has its own digest.

Keep sensitive logs local and supply only authorized, scanned excerpts. Preserve the initial failure and later attempts. Never weaken assertions, modify expected output to match a defect, hide skips, remove a failing test, or retry until a pass to misrepresent readiness. A justified test correction may be appropriate, but its reason and changed expectation remain visible. Distinguish an environment limitation from a product failure and from an untested requirement.

## Assurance contract

For a requested QA council, add `--purpose qa` to `prepare` alongside the ordinary project, brief, assessment and participant options. The purpose is sealed; QA verification and finish require an assurance contract. Ordinary `--purpose planning` remains the default and its assurance record is optional. Neither purpose authorizes extra actions or requires inventing executed checks.

Preparation generates `assurance.schema.json`. The `assurance` field in the existing `decisions.json` wrapper records the chosen option, accepted decisions and material claims/acceptance checks alongside `decisions` and optional `plan_map`. Legacy planning decision arrays remain valid; absence means `not_recorded`, not a successful assurance check. For QA, the coordinator maintains the required record, including honest proposed or blocked checks; the user does not need another form.

Follow the generated schema for the run's pinned version. Version 1 contains:

- `plan_sha256` for the full current `final-plan.md`, plus `selected_option.id` and a unique exact plan `quote` containing that ID.
- `accepted_decisions` entries linking each accepted `finding_id` to the unique exact operative plan `quote`. Merely saying a concern was accepted does not show its remedy reached the plan.
- `checks` with an ID, `kind` (`claim` or `acceptance`), unique exact plan `quote`, `status`, substantive `reason`, and `evidence` references containing `source_id` and `sha256`. Optional `finding_ids` connect checks to actual findings.
- For a recorded `passed` or `failed` check, `observation` with `method`, `environment`, `revision`, UTC `observed_at`, matching `result`, and nonempty `evidence` linked to that check. The method identifies static inspection versus actual test execution; attach the receipt described above. `proposed`, `blocked` and `not_applicable` checks carry their reason without pretending an execution was observed.

Use source IDs and exact digests from the run's supplied evidence, as exposed by `quality --run RUN`; a path or URL invented in the contract is not a registered source. Supply new authorized evidence through the existing bounded evidence workflow. Reconcile exact plan hashes and anchors after edits. The checker finds recorded structural mismatches, stale hashes and missing links; it cannot discover omitted requirements or establish that a declared observation is true. `ready_for_review` means ready for peer inspection of this record, not ready to implement or release.

## Retest and readiness

After an authorized fix, rerun the check that exposed the failure and the affected regression scope. Broaden to integration, end-to-end or platform checks when dependencies or residual risk justify them. Once meaningful required checks pass, do not repeat them without a new change, failure or unresolved concern. New evidence and corrections remain traceable to the actual revision; earlier successful worker stages and failed attempts stay preserved.

Evaluate the selected plan as written: accepted remedies must appear in operative steps, alternatives must not conflict with the chosen option, and passing checks must support the claim being made. A check of unrelated code cannot justify a broad readiness statement. Report the narrowest supported next step, such as ready for implementation review, ready for an authorized staging trial, needs changes, or blocked pending named evidence. A completed council or valid contract alone does not certify security, publication or production readiness.

For an authorized release, use the project's existing release gates, observability and rollback criteria. Canary evaluation compares relevant behavior and can stop an unsafe rollout; a local test pass alone does not replace deployment evidence. Production/load actions still require their own authority. [Google SRE guidance on canarying releases](https://sre.google/workbook/canarying-releases/).
