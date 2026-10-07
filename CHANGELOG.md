# C2C release notes

C2C is a Codex and Claude Code skill for collaborative planning and mutual plan review. Invoke it with `$C2C` in Codex or `/C2C` in Claude Code. [Install and get started](README.md#install).

## 0.10.0 — Current model research and selected planning workers

- Researches current official planning and coding guidance for both providers on every new task, then reuses the dated evidence during that task. Choices remain task-specific; no permanent best-model list is bundled.
- Automatically selects eligible worker models within user limits. Exact model choices, advice-only requests and reserved selection take precedence; chat/global settings and billing sources stay unchanged.
- Adds an optional background planning author. Same-provider discussion pairs a planner with a distinct coding-focused critic; cross-provider discussion uses a planning model from each provider. Requested, declared and reported identities stay distinct.
- Background-author focused review takes three successful worker calls; independent planning takes five. Matching host-author routes retain two/three. All attempts share the existing bounded history; additional worker calls are not described as token savings.
- Retains independent critique, complete selected evidence, security review, testing requirements and visible unresolved findings. Validation evidence is recorded in [project notes](PROJECT_NOTES.md).
- Removes repeated canonical context paths and redundant outbound bookkeeping while preserving distinct sources and task data. Matching ordinary-input fixtures measured **2.00–3.54%** smaller worker inputs; deliberate duplicate-path fixtures measured **12.21–16.04%**. These ranges are separate and conditional, not total-session or quality guarantees. Includes a [reproducible offline benchmark](benchmarks/README.md) and [recorded evidence](docs/benchmarks/v0.10.0.md).
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

The [v0.7 PDF guide](docs/C2C-LinkedIn-Guide.pdf) and [token benchmark](docs/BENCHMARKS.md) document that release; their measurements are not new v0.8.0 measurements. See the [current setup](docs/SETUP.md#choose-the-participants) and [plan presentation guide](references/plan-presentation.md).

## 0.7.0 — Less repeated planning context

- Shorter entry instructions and focused review prose reduce repetition while retaining the selected evidence, full findings, security review, and verification stages.
- Peer packets omit local bookkeeping such as byte counts and hashes; sealed local records retain it.
- Agents can reuse reports already returned by the runner and request compact JSON output without dropping fields.
- Two offline fixtures measured **8.19% fewer peer-input tokens** for a small feature and **10.93% fewer** for a production roadmap. The entry skill measured **12.18% fewer tokens**, separately. These are input-text proxies, not total billing savings or proof of equal model quality. [Method, numbers, and limits](docs/BENCHMARKS.md).
- All **135 automated tests** passed locally; the [release commit's CI](https://github.com/ZiadHassanein/codex-claude-council/actions/runs/37445356743) passed on Windows and Ubuntu with Node 18, 22, and 24. No live provider calls were made for this update.

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

The installed skill identifier is `C2C`, with `$C2C` and `/C2C` entry points. The GitHub repository remains `codex-claude-council`. [Upgrade instructions](docs/SETUP.md#update-the-skill).

## 0.3.0 — Understand the project before planning

- Assess existing behavior, deployment evidence, readiness gaps, and planning direction before starting peer work.
- Clarify material requirements and record unknowns instead of silently assuming production status or readiness.
- Scale from focused feature review to project roadmaps with milestone gates.

## 0.2.0 — Security and implementation handoff

Every plan includes a scoped security review and proposed verification checks. Failure diagnostics persist, and an optional implementation brief can hand off a chosen milestone. Proposed tests remain distinct from executed results.

Task sizing and model recommendations remain advisory. Review completion is not a security certification or permission to deploy.
