# C2C release notes

C2C is a Codex and Claude Code skill for collaborative planning and mutual plan review. Invoke it with `$C2C` in Codex or `/C2C` in Claude Code. [Install and get started](README.md#install).

## 2.4.0 — Explicit effort and clearer revision checks

- Adds pinned, per-worker effort selection with separate requested and unreported effective settings. Compatible CLI flags are checked before launching; omitted effort retains existing CLI settings/defaults with its effective value unknown. No global settings or billing changes.
- Gives final revision verification a bounded textual comparison alongside the full plan, source evidence, decisions and security review. Exact integrity checks, existing stage limits and honest unreviewed-revision outcomes remain intact.
- Shares material outcome, dependency and acceptance guidance across provider routes. Defines finding severity and triage without forcing criticism or agreement; includes planning-depth guidance in scoped retrieval.
- Reduces unnecessary host wakeups through supported completion notifications or bounded waiting with backoff. Host progress and cancellation requirements still apply.
- Registers a separate frozen 2.3.0 baseline for the seven-task evaluation suite, preserving the 2.2.0 capture. Neither template contains measured outcomes; this release makes no numerical saving or planning-quality claim.
- Preserves active runtime pins and the revised-plan, discussion and result handoff.

## 2.3.0 — Evidence links and measured resources

- Adds optional requirement/source/assumption/decision/step/check links inside the existing decision record. `quality` detects broken references, dependency cycles and missing recorded checks; it does not certify factual truth or semantic coverage. Plan-text revisions retain a full-plan impact review.
- Records available terminal usage on successful and failed attempts. `usage` keeps cache/reasoning subsets separate, rejects ambiguous counters and marks missing coordinator or historical coverage unknown.
- Retrieves complete applicable reference sections with `guide`; the shorter entry skill retains routing, independent review, security, spending boundaries and the three-file handoff.
- Expands the fictional outcome bank from two to seven cases, adds an opt-in independent-proposals/synthesis comparison, and separates quality eligibility from unknown resource measurements. The frozen 2.2.0 capture manifest contains no measured outcomes.
- Adds experimental, explicitly selected `verify-compact` context. It replaces only entire proposal text identical to the full current plan with a reference; full context remains the default and fallback. No measured token-saving or quality improvement is claimed.
- Preserves active runtime pins, stage counts, capable model selection and existing installation/update behavior.

## 2.2.0 — Software, content and mixed planning

- Classifies work as software, content, mixed or general non-software in the frozen assessment. Content uses scoped editorial readiness and records publication evidence separately from software deployment; mixed projects retain engineering checks.
- Adapts worker guidance to engineering, editorial/factual or combined review. Content checks cover audience, sources, structure, clarity, relevant rights/privacy and accessibility. Text-only workers cannot claim to have opened sources or visually inspected supplied asset descriptions.
- Adapts model advice, acceptance checks and the first execution step to the requested work. Planning still delivers the revised plan, compact discussion and result; it does not automatically write finished content, code or publish.
- Existing routes, required review stages, spending boundaries and pinned runs remain intact. Synthetic workflow tests exercise content and mixed routing; they do not establish real editorial quality or token savings.

## 2.1.4 — Consistent three-file handoff

- A completed run delivers direct links to `final-plan.md`, `DISCUSSION.md` and `RESULT.md`, with the revised plan first. The instructions now match the README's three-file promise.
- Clarifies fewer-file cases: incomplete runs expose only available artifacts and explain the missing result; a standalone fallback delivers one provisional plan with self-critique. No completion report is fabricated for unfinished review.
- Aligns the delivery check, artifact contract, setup guide and FAQ. Runtime behavior and existing run pins are unchanged.

## 2.1.3 — Compact discussion, complete revised plan

- Keeps the revised plan and discussion separate. Verification explicitly checks that adopted fixes are integrated into the plan's operative steps, preserving critique-only requests.
- Replaces repeated report detail with source-linked concern/proposal/decision excerpts. Every finding ID, disposition and superseding reference remains visible; full reports and decisions are unchanged.
- Moves review limitations above the discussion, groups operational progress, and links the plan only when its file exists. Shortening this derived view adds no model calls and is not a claim of planning-token savings.
- Existing runs retain their original pinned runtime and instructions; new plans use this release.
- Windows startup preflight rechecks a missing identity once for its still-live inert child, then blocks if identity remains unavailable. This bounded metadata check sends no prompt and does not retry a model call.

## 2.1.2 — Deliver the revised plan

- Reviewing an existing plan delivers a revised version with accepted fixes incorporated into its steps and checks. The discussion and change summary support that deliverable.
- When originals must be preserved, write a revised copy with one entry point. Unresolved decisions and unreviewed edits remain explicit; critique-only requests are respected.
- Adds a delivery check for applied fixes and contradictory old instructions. This changes coordinator guidance, not worker stages or implementation authority.

## 2.1.1 — Clearer review updates

- Chat updates focus on the review purpose, findings and decisions. Routine call counts, inactivity guards and repeated scope reminders stay in saved records.
- Relevant operational details still appear when requested or needed for an approval, blocker or material change. Limits, scope enforcement, review stages and active-run pins are unchanged.

## 2.1.0 — Wait for active reviews and clarify launch checks

- Known recovery limits: a previously recovered PID can later become uninspectable after reuse, pausing the run again; unresolved registrations without a PID require a provisional checkpoint. Preserve state and never signal an unrelated process. A possible CLI stdin-wait conflict during registration is unverified; include missing-input/no-stdin exits in ordinary-use canary diagnostics. [Recovery details](docs/SETUP.md#when-a-peer-call-takes-longer).

- Checks host process-identity inspection with an inert local child before reserving a planning attempt. Preserves the ordinary exit diagnostics of an already-exited worker. CI publishes per-platform skips and requires essential registration/recovery tests to execute successfully.
- Coverage: real Claude review/verification exercised an earlier pinned 2.1 candidate. The final launch refinements have offline/process tests and metadata preflight, not a completed final-source live exchange. Peer verification covers supplied excerpts, not every source file. First ordinary authorized use is the canary; unexpected `worker_registration_error`, `worker_identity_unavailable`, CLI argument/schema rejection or `cli_incompatible` requires inspection and, for a confirmed release regression, rollback to the retained managed backup. Do not start an extra paid call to fill this gap.
- Captured Codex 0.160.1 output was final-only; current intermediate activity is unverified. For a silent worker the idle guard is the effective call deadline. Long reviews can use an authorized `--idle-timeout-seconds` up to 3600; this does not guarantee completion or override hard caps.

- New format 7 runs use activity-based waiting: recognized advancing model output renews a 10-minute standard or 20-minute project inactivity guard. There is no fixed call/total deadline by default. Attempts, cancellation, provider failures/limits and output bounds remain enforced.
- Explicit call/total time caps still apply during activity. `--timeout-policy fixed` keeps the earlier profile deadlines; pinned older runs keep their original code and policy. No silent migration or new run just to escape a timeout.
- Supports idle-guard adjustments and audited increases to existing numeric limits on the same run. Interrupted uncapped runtime remains unknown with a known lower bound; finite reservations are charged conservatively. These are not spending controls or performance guarantees.
- Recognizes substantive output/counters rather than stderr, retries, initialization, heartbeats or stale duplicates. Uses Claude partial-message events when supported. Quiet computation can still outlast the guard; missing observed activity is not proof of a hang.
- Persists new direct-worker process identities before prompt delivery and blocks replacement calls while a previous worker is alive or ambiguous. Documents resumable host sessions and hard-crash/descendant-cleanup limits. Observer errors retain a sanitized diagnostic without immediately discarding an otherwise valid response.
- Honors explicit call caps when choosing an implicit idle guard, and warns when crash recovery can reserve all remaining finite runtime. Longer active calls can consume more included allowance; there is no token-saving guarantee.
- Reports connection failures separately from authentication and usage limits. Compatible stable native Codex installations can be found beyond PATH on Windows; prerelease fallbacks require explicit selection. Incompatibility errors include the detected version and an actionable override/upgrade option. Windows Claude shell shims receive explicit native-binary guidance.
- Tolerates diagnostic prose around JSONL and harmless evidence-path citation formatting without rewriting findings or weakening actual file access. Worker schemas constrain finding IDs. Real model names ending in Max are accepted; recognized Claude context labels preserve identity checks, and unexpected fallback models remain rejected.
- Makes generated discussion text easier to read while neutralizing Markdown/HTML/link injection in both discussion and result questions. Completion rejects a spurious provisional reason and checks source status once. Finite remainders below ten seconds cannot launch a worker.
- Adds bounded Windows atomic-rename retries, caches only the current process's stable Windows identity, uses a provider-neutral update cache by default, fixes installed-reference links and makes the explicit invocation trigger discoverable. CI prevents changing an already tagged package without a version increment.

- Separates normal authorized subscription use, no-paid-limit recovery and explicit zero-extra-charge restrictions. Unknown quota metadata no longer implies a provider is unavailable; genuine strict billing limits remain enforced by the coordinating instructions.
- Selects candidate models and host/worker roles before checking launch eligibility. Only required workers need account checks; strict limits use available supported read-only evidence before falling back.
- Adds an offline `preview` of the actual review packet, selected provider/model and remaining limits, with no worker call or run-state changes. Makes existing exchange authorization clear while respecting host permission decisions.
- Reports sanitized authentication routes and local runtime-cache/lock permission failures without disclosing credentials, weakening locks or losing prior work.
- Disables Claude credit-only fast mode and unrelated updater/title work for worker processes only. Model, effort and account settings remain unchanged; this is not a universal spending cap.
- Handles Windows environment-name casing when clearing Claude's nested-session marker and setting worker controls, including duplicate spellings. POSIX environment semantics and unrelated configuration are preserved.

## 2.0.0 — Planning and maintenance milestone

- Consolidates the existing planning, review, available-provider fallback, managed setup and stable-update workflows under the 2.0 release requested by the maintainer. No runner, schema, command or migration change is introduced by this version bump.
- Updates the quick-install, update and uninstall commands to the 2.0.0 archive and corrects the README version label.
- A real managed uninstall/reinstall and a fresh planning task passed scoped review. That task used an explicitly provisional self-critique because included-only worker eligibility was unverified; no independent model exchange ran. This does not establish improved accuracy, token savings or guaranteed plan quality.

## 1.4.0 — Update notices and stable active plans

- Adds a lightweight release check with a daily cache, chat notice and opt-out. Offline checks do not block planning; no background service or model call is needed.
- `update` finds the latest stable release; `--source` preserves offline updates from a downloaded package. Managed backups and local-edit protection remain in place.
- Newly prepared runs pin C2C runtime code and instructions outside the installed skill. Updating during a chat keeps the current plan on its original version, with reviews, participants and limits intact; new chats use the installed release.
- Active older runs without a pin require completion or an explicit stop before updating. No silent migration or paid provider recovery is introduced.

## 1.3.0 — Simpler setup and recoverable uninstall

- Adds one-command installation from a versioned GitHub archive using Node and npx, without Git, a global package, or an npm account. The local download-and-run option remains available.
- Adds readable `install`, `update`, `uninstall`, `rollback`, `recover`, `doctor` and `version` commands. Use `--target` to choose one app and `--dry-run` to preview installation, update or removal.
- Uninstall moves verified C2C folders into retained backups and prints a restore command. Customized or unknown files, other skills, settings and projects remain protected. Interrupted removals use the existing transaction recovery mechanism.
- Includes setup helpers in installed copies for offline maintenance. Planning behavior, provider selection and spending limits are unchanged.

## 1.2.1 — Explain execution choices before savings

- Execution advice leads with concrete task fit, evidence, comparison with the alternative, tradeoffs and acceptance checks that could change the choice.
- Supported savings explain their cause. Price tables cannot establish fewer reasoning tokens/retries, hidden architecture or equivalent results; missing evidence remains explicit. No new worker calls or automatic changes.

## 1.2.0 — Execution model recommendations with sourced estimates

- Adds task-specific execution advice beside the plan's first work item: primary model, justified alternative, task-fit rationale, eligibility, sources and conditions for reconsideration. Planning-worker selection remains separate from advisory implementation choices.
- Reuses official research and checks relevant firsthand community evidence, retaining source dates, experimental limits and uncertainty. No permanent model ranking or automatic implementation/model/billing change.
- Separates measured task-token changes, equal-token API price estimates and subscription allowance. Percentages require explicit baselines and compatible evidence; missing savings remain unknown. No guaranteed performance or reduction in total usage is claimed.

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
