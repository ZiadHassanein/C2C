# C2C release notes

C2C is a Codex and Claude Code skill for collaborative planning and mutual plan review. Invoke it with `$C2C` in Codex or `/C2C` in Claude Code. [Install and get started](README.md#install).

## 1.1.1 — Focus single-provider planning on consequential decisions

- Gives same-provider author, independent draft and critique stages complementary planning and implementation perspectives. Reviews prioritize supported errors, minimal remedies and unresolved risks; no added worker stage or call is required.
- Strengthens honest solo self-critique with a compact decision/evidence/failure/check trace. Neither route impersonates an absent provider or claims its capabilities.
- Keeps cross-provider prompts, stage order, security/identity controls and allowances unchanged. Documents quality and whole-task resource criteria for comparison with ordinary planning; no accuracy or saving is claimed without matched evidence.

## 1.1.0 — Equal starting points and available-provider review

- Codex and Claude Code are equal entry points: the initiating chat coordinates. Examples and workflow diagrams use symmetric routes and planner/reviewer roles.
- Before calls, the skill automatically selects an eligible planner and distinct coding-focused critic in the initiating provider when cross-provider review is unavailable. Explicit participant requirements, model choices, usage eligibility and no-paid limits take precedence.
- Defines one bounded, linked same-provider transition after an opposite-provider block, preserving prior evidence and subtracting used attempts/runtime. The coordinator accounts for aggregate limits; the runner enforces each run's explicit caps. No sealed participant replacement or fresh allowance is permitted.
- If no real pair can run, delivers an honestly labeled solo self-critique with evidence, failure cases, alternatives, security, tests and an execution entry point. No simulated participants or forced disagreement.

## 1.0.1 — Compatible workers and focused discovery

- Checks distinct installed CLI candidates in order so an incompatible early PATH entry does not hide a compatible installation. Explicit binary overrides remain authoritative; execution, authentication and quota failures do not trigger another binary or account.
- Reports checked executable paths, available versions and rejection reasons in local setup diagnostics. Required worker controls and included-usage checks remain unchanged; discovery makes no model calls or setup changes.
- Starts repository assessment from current scoped records, validates freshness, and reads relevant sections or structured fields. Reuses known evidence and bounds output without removing material risks, security checks or review depth.

## 1.0.0 — Stable plan delivery

- Keeps changing review progress and completion status in generated discussion/result records. The verified plan stays unchanged when announcing success, avoiding a repeat review caused only by rewriting its status paragraph.
- Preserves strict revision checks: changes to reviewed plan/security content, prior decisions or supplied evidence still need the bounded final review or an explicitly provisional result. No header exemptions or weaker content checks.
- Retains cross-provider and explicitly chosen same-provider workflows, project assessment, scoped security/tests, execution entry points, optional-tool fallback and no paid limit recovery. Version 1.0 does not certify generated plans, runtime model identity or account billing.

## 0.12.2 — Plan with the tools already available

- Checks required tool availability before worker selection. Missing or unusable tools lead to a labeled provisional plan in the current chat, with security, proposed tests, self-check and an execution entry point. No installation, upgrade, login or configuration change is required to keep planning.
- Ignores unavailable CLIs that the chosen route does not use. Same-provider discussions remain explicit choices; missing reviewers are never simulated or silently replaced.
- Makes preflight diagnostics and optional setup guidance distinct from quota failures. Unavailable required workers cannot launch or consume a model attempt; existing contributions and run state remain intact.
- Skips inaccessible worker-model research for a provisional-only plan, keeping the missing review and selection evidence clear. Explicit requests to require both participants or wait still take precedence.

## 0.12.1 — No paid recovery from provider limits

- Makes the spending boundary explicit: no credit purchases, extra usage, auto-reload, increased spend caps, upgrades or API/cloud-billing fallback to bypass a limit. Continue within the available chat's authorized allowance or checkpoint without requesting paid recovery.
- Classifies explicit quota, credit-balance and payment-required worker failures, preserves the failed attempt and provides static fallback guidance. Generic rate limits, timeouts, authentication failures and successful report prose remain distinct.
- Gives provider-limit guidance priority over allowance-extension advice in saved handoffs. Local runtime allowances cannot repair provider quota. Explicit later resumption remains the coordinator's responsibility; this is not a provider billing cap or CLI retry lock.
- Clarifies that CLI readiness does not verify remaining included usage or account overage settings. Included-only constraints require billing eligibility before calls; the skill does not silently change credentials or account controls.

## 0.12.0 — Evidence, final revisions and managed updates

- Lets reviewers request scoped missing evidence. Coordinator-supplied files and unavailable/rejected answers form an immutable record; workers retain restricted tools and independent drafts stay isolated.
- Adds one bounded final-revision check using the same participants and allowance. Changed plans, security conclusions, prior adjudications or new supplied evidence require review or an explicit provisional-completion reason. Original stages and legacy runs remain intact.
- Generates pending finding dispositions without overwriting decisions, reducing repetitive coordination while preserving substantive adjudication.
- Adds managed installation updates, retained backups, rollback and restartable interrupted-update recovery. Release hashes recognize clean v0.11.3 installations; local changes are protected.
- Adds a dependency-free outcome evaluation harness with frozen tasks, selected comparison arms, blind scoring, provenance checks and explicit missing measurements. Fixture tests do not establish better plan quality, lower cost or live performance gains.

## 0.11.3 — Consistent C2C naming

- Uses `ZiadHassanein/C2C` as the canonical repository name, with matching clone, ZIP, documentation, badge and guide links. Fresh Git clones use the `C2C` folder.
- Renames private package metadata to `c2c` and documents how an existing clone updates its Git remote. `$C2C`, `/C2C` and installed skill folders keep their existing names.
- Preserves legacy installation detection and migration instructions. Runtime behavior, saved planning runs and review stages are unchanged.
- Gives two process-test fixtures more startup time on slower CI hosts while retaining timeout, streamed-output and termination checks. Runtime deadlines are unchanged.

## 0.11.2 — Clear execution entry points

- Requires a concise Start here block in the plan itself: first work item, project location/action, prerequisites, scope boundary and acceptance check. Unknown paths or commands lead to bounded discovery; a request to approve the plan remains separate from the implementation start.
- Checks organization and consistency before verification and after corrections, including scope, technical decisions, dependencies, finding dispositions, security and test status. Keeps consequential choices explicit without prescribing routine coding details.
- Keeps the optional implementation brief aligned with the plan. Applies proportionally to small features, project roadmaps and provisional plans, using existing artifacts and review stages.
- Changes skill guidance and documentation only. The runner does not enforce semantic plan quality; no additional peer calls or new performance/token-saving claims are introduced.

## 0.11.1 — Linux and macOS compatibility

- Adds full-suite CI on Linux x64/ARM64 and macOS Apple Silicon/Intel, alongside Windows, using Node 18, 22 and 24. Logs the actual platform/architecture; each job is bounded and one failure does not cancel other platforms.
- Skips non-executable PATH candidates on Linux/macOS and rejects non-executable explicit CLI overrides. Adds executable symlink/shebang and installation-path coverage.
- Stabilizes macOS process identities across time zones and locales. Ambiguous older live macOS locks require inspection instead of automatic reclamation; adds regression coverage for lock ownership and POSIX descendant cleanup.
- Documents platform setup and distinguishes offline compatibility tests from real provider authentication and model calls.

## 0.11.0 — Keep planning when usage limits block a participant

- Defaults to completing a provisional plan with the available chat when a confirmed or user-reported usage limit blocks a worker, or further calls cannot fit authorized ceilings. Explicit requests to wait or require both participants take precedence.
- Records evidence-based reversible assumptions, reasons, validation gates and a real self-check while retaining security and testing. Missing peer review stays explicit; planning delivery does not mark an incomplete council successful.
- Preserves actual reports, decisions, identities and attempt history. Uses existing plan/notes files and stops blocked calls without replacement-model probes, account or billing changes, or automatic retries after delivery. A blocked host needs resumption from saved artifacts; automatic cross-app takeover is not promised.
- Changes skill guidance only; worker prompts, schemas, CLI behavior and stage validation are unchanged. No new token-saving or model-quality measurement is claimed.

## 0.10.3 — Stable references in the discussion

- Preserves worker finding IDs, including gaps and report order, so replies, decision records and later review packets keep their references. Previously, silent renumbering could leave a reply pointing at a missing or different finding.
- Rejects invalid or wrong-stage IDs in new worker reports instead of rewriting them. Failed output stays available for diagnosis; existing saved reports are not rewritten. Stage counts, prompts, budgets and run formats are unchanged.
- Pins historical benchmark reproduction to the measured source versions. Version 0.10.0 measurements are not presented as measurements of later review prompts.

## 0.10.2 — Critique the fixes as well as the plan

- Separates finding validity from remedy suitability. Consequential decisions explain the evidence, counterexample or alternative, chosen remedy and check; accepting a concern need not adopt its proposed fix.
- Verification scrutinizes every disposition and the verifier's own earlier advice. Its summary records actual replies to material counterarguments with finding IDs, without manufactured disagreement or extra rounds.
- Requires substantive corrections to have finding IDs and later corrections to be linked from earlier decision rationales. Markdown keeps peer replies distinct from coordinator judgments and does not infer missing responses.
- Keeps existing schemas, run formats, stages, call limits, model selection, security and minimal-chat behavior. No new model-quality or token-saving guarantee is claimed.

## 0.10.1 — Discussion in Markdown, less repeated chat

- Makes generated `DISCUSSION.md` the primary discussion record. Links it at kickoff and completion, without recapping every stage in chat by default.
- Keeps required user decisions, material blockers, actionable failures, and necessary progress visible. The final response gives a short decision brief and artifact links; live chat summaries remain available on request.
- Reuses the existing generated view and validated reports, without rereading or manually rewriting the discussion. Review stages, evidence, security, model selection and worker prompts are unchanged. This targets coordinator narration; no new token-saving percentage or equal-quality claim is made.

## 0.10.0 — Current model research and selected planning workers

- Researches current official planning and coding guidance for both providers on every new task, then reuses the dated evidence during that task. Choices remain task-specific; no permanent best-model list is bundled.
- Automatically selects eligible worker models within user limits. Exact model choices, advice-only requests and reserved selection take precedence; chat/global settings and billing sources stay unchanged.
- Adds an optional background planning author. Same-provider discussion pairs a planner with a distinct coding-focused critic; cross-provider discussion uses a planning model from each provider. Requested, declared and reported identities stay distinct.
- Background-author focused review takes three successful worker calls; independent planning takes five. Matching host-author routes retain two/three. All attempts share the existing bounded history; additional worker calls are not described as token savings.
- Retains independent critique, complete selected evidence, security review, testing requirements and visible unresolved findings. Validation evidence is recorded in [project notes](PROJECT_NOTES.md).
- Removes repeated canonical context paths and redundant outbound bookkeeping while preserving distinct sources and task data. Includes a [reproducible offline benchmark](benchmarks/README.md) for checking input preservation; synthetic inputs do not establish total-session savings or planning quality.
- All **192 automated tests** and **120 local documentation targets** passed. The offline comparison completed 24 workflows and captured 78 prompts with no provider calls. Independent runtime reviews and three instruction scenarios checked routing, identity, limits, privacy and evidence preservation.

## 0.9.0 — Proportional time and recovery without restarting

- Adds `standard` and `project` budget profiles. Bounded work retains 300 seconds per call, 900 cumulative seconds, and four attempts; large/deep project plans use 600 seconds per call, 2,400 cumulative seconds, and five attempts. Explicit flags override profile defaults and user caps remain authoritative.
- Adds audited `extend` for an existing run. Absolute limits can increase up to 900 seconds per call, 3,600 cumulative seconds, and six attempts, preserving used attempts, successful stages, and sealed evidence. It does not launch a peer, reset a run, or alter a running deadline.
- Guides coordinators to recover within existing task authorization when their own allowance was insufficient, while respecting explicit user time, attempt, and spending caps. A timeout no longer implies a fresh run or a ritual approval prompt.
- Adds a small `progress` response for safe activity and elapsed/remaining call time, avoiding repeated project assessments and history while polling. Full `status` retains recovery details. Received output is distinguished from a validated proposal; raw reasoning remains private.
- Checks whether remaining attempts can cover the remaining required stages before launching another call. Runtime feasibility remains advisory because future call duration is unknown.
- Preserves two-/three-call review workflows, model settings, security checks, and independent critique. This addresses long-standing timeout/recovery behavior; it is not an authentication regression introduced by 0.8.1.
- All **177 automated tests** passed locally, including recovery after an authentication failure and timeout, allowance checks, legacy runs, safe progress metadata, and packaging. All 101 local documentation targets passed. Independent review and two offline instruction scenarios passed; no new paid provider calls were made. See [project notes](PROJECT_NOTES.md) for evidence and limits.

## 0.8.1 — Headless workers and clearer authentication failures

- Clarifies that only the coordinating chat needs to remain open. C2C already launches Claude and Codex non-interactively; no peer app, panel, or terminal is required.
- Authentication preflight uses the same filtered environment as worker calls. Readiness reports visible saved authentication, not live token validity or model access.
- Recognized runtime authentication failures, including Claude errors returned on stdout, now explain credential renewal and resuming the existing stage. No automatic retries, account changes, or billing changes are introduced.
- Two synthetic live transport checks succeeded with saved authentication, one per provider, without creating a peer terminal. These were not full councils or tests with all other apps closed.
- All **155 automated tests** passed locally, including non-TTY worker execution, preserved login context, authentication failures and explicit resumption. All 93 local documentation targets passed.

## 0.8.0 — Clearer plans and a choice of participants

- Plans lead with review status, a recommendation, prioritized decisions, and a concrete next action. MVP boundaries, milestone dependencies, exit gates, and test status stay readable; technical depth moves into the same plan's appendix.
- Explicitly requested Codex-only or Claude-only discussion uses a separate peer call with a different full model ID. Codex–Claude remains the default. The current chat stays unchanged; peer model choice requires user selection or explicit delegation.
- Same-provider runs require distinct declared coordinator and requested peer IDs. Those records are not model attestation: runtime identity may be unreported or affected by provider policy. Updates distinguish the participants by role and model information.
- Critiques challenge assumptions, alternatives, and plausible failure cases with evidence. They require neither agreement nor manufactured disagreement; unresolved findings remain visible.
- New runs record pairing in version 4 state. Existing version 1–3 runs retain their original contracts. Security review, independent stage boundaries, and two-/three-call workflows remain in place.
- All **149 automated tests** passed locally, including both same-provider routes and reported-model mismatch cases. Three offline instruction scenarios checked routing and plan presentation. No live provider calls were made for this update.

The [v0.7 PDF guide](docs/C2C-LinkedIn-Guide.pdf) illustrates cross-provider setup. See the [current setup](docs/SETUP.md#choose-the-participants) and [plan presentation guide](references/plan-presentation.md) for later features.

## 0.7.0 — Less repeated planning context

- Shorter entry instructions and focused review prose reduce repetition while retaining the selected evidence, full findings, security review, and verification stages.
- Peer packets omit local bookkeeping such as byte counts and hashes; sealed local records retain it.
- Agents can reuse reports already returned by the runner and request compact JSON output without dropping fields.
- Offline fixtures checked preserved evidence and review stages. Input-text measurements do not establish total billing savings or equal model quality. [Evaluation methods and limits](docs/BENCHMARKS.md).
- All **135 automated tests** passed locally; the [release commit's CI](https://github.com/ZiadHassanein/C2C/actions/runs/37445356743) passed on Windows and Ubuntu with Node 18, 22, and 24. No live provider calls were made for this update.

Model settings and review depth stay unchanged: focused review uses two successful peer calls; independent planning uses three. Failed attempts also consume the run's attempt allowance.

## 0.6.0 — Follow the planning discussion

- Concise chat updates show submitted proposals, challenges, and coordinator responses between completed stages.
- Generated `DISCUSSION.md` links arguments and decisions to the saved evidence, including unresolved disagreements and post-verification edits.
- Ask for quiet output when you only need the final plan. Discussion rendering adds no model calls.

The discussion shows recorded contributions and decisions; it does not display private reasoning or fabricate a live conversation.

## 0.5.0 — CLI compatibility and recovery

- Discover npm-installed Codex on Windows and check CLI capabilities before a paid attempt.
- Route calls to the other provider explicitly; handle linked skill folders.
- Improve recovery, lock validation, attempt accounting, selected-context handling, secret checks, and line-ending-compatible installation.
- Generate `HANDOFF.md` to make resuming an interrupted run easier.

## 0.4.0 — Short invocation in both apps

This release changed the installed skill identifier to `C2C`, with `$C2C` and `/C2C` entry points. The repository kept its original name at that time; version 0.11.3 aligns it with `C2C`. [Upgrade instructions](docs/SETUP.md#update-the-skill).

## 0.3.0 — Understand the project before planning

- Assess existing behavior, deployment evidence, readiness gaps, and planning direction before starting peer work.
- Clarify material requirements and record unknowns instead of silently assuming production status or readiness.
- Scale from focused feature review to project roadmaps with milestone gates.

## 0.2.0 — Security and implementation handoff

Every plan includes a scoped security review and proposed verification checks. Failure diagnostics persist, and an optional implementation brief can hand off a chosen milestone. Proposed tests remain distinct from executed results.

Task sizing and model recommendations remain advisory. Review completion is not a security certification or permission to deploy.
