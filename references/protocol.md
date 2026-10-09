# Runner protocol

Resolve `RUNNER` to the absolute path of this skill's `scripts/council.mjs`. Resolve `PROJECT`, `BRIEF`, `ASSESSMENT`, each `CONTEXT`, and `RUN` to actual absolute filesystem paths. Quote each path in shell commands. `PROJECT` identifies the task's project; peer processes execute in isolated temporary directories.

Read only the section needed for the current step: [route selection](#choose-an-available-route), [waiting/recovery](#budgets-and-bounded-recovery), [billing boundary](#no-paid-limit-recovery), [evidence](#bounded-evidence-requests), [security](#security-and-testing), [decisions](#decision-record), or [updates](#updates-during-a-chat). Reuse already-read contracts and saved facts across stages instead of loading this entire reference.

## Updates during a chat

Resolve `SETUP` to the **installed** `scripts/setup.mjs`, separate from an active run's pinned runner. `node SETUP check-update --auto` checks public stable GitHub tags at most daily using a local cache. A newer version gets one short notice per version per chat: “C2C VERSION is available; this plan stays on its current version. Say ‘Update C2C’ to install it for future plans.” Do not repeat notices in stage recaps. Offline, disabled or failed checks do not block planning; no model request is made. Follow host network policy rather than requesting an exception just for an automatic notice.

An update request authorizes `node SETUP update`; include `--run RUN` for a current prepared run and `--target codex|claude` when only that installation is selected. Run this between worker calls, after recording current progress in the existing handoff/notes. It installs the latest stable release with managed-file protection and recoverable backups. `--dry-run` previews; `--source` uses the already downloaded package offline. Do not treat “an update is available” as authorization to install it.

From 1.4 onward, `prepare` pins runtime code and planning instructions in a local content-addressed store outside skill discovery. The run seals the bundle identity; it does not supply an executable path to trust. Use the validated runner/instruction paths reported by `prepare` or `status`. Installed runner commands with `--run` dispatch to that bundle; direct imported calls reject a different runtime. Keep the pinned `SKILL.md` and reference files for the entire run, even after a new installed skill is loaded. Reuse known sections rather than reading all instructions again. A missing or modified bundle stops continuation instead of substituting new behavior.

Updating the installation does not migrate a run, replace participants, restart a stage or change spent/remaining allowance. Finish the current plan on its pinned version and start a fresh chat for new-version planning. For a critical fix requiring immediate adoption, checkpoint/stop the old plan and explicitly decide how to continue; never silently replay work under new rules. The pin preserves C2C code/instructions, not provider CLI binaries, hosted model behavior, credentials or the chat host's instruction cache.

Pre-1.4 runs have no recorded runtime identity. The new updater refuses `--run` hot updates for unfinished legacy runs; finish with their original runner or stop and preserve the plan before updating. Provisional plans without a prepared run likewise keep their loaded instructions and defer the update until completion or an explicit stop. Do not claim historical runs were retroactively pinned. Runtime bundles contain only C2C package files, not project inputs; retain them while any saved plan needs resuming. Uninstall does not delete them.

## Commands

```text
node RUNNER version
node RUNNER doctor
node RUNNER prepare --project PROJECT --brief BRIEF --assessment ASSESSMENT --context CONTEXT --coordinator HOST --mode plan --out RUN
node RUNNER preview --run RUN --stage STAGE
node RUNNER ask --run RUN --stage author-draft
node RUNNER ask --run RUN --stage draft
node RUNNER ask --run RUN --stage author-review
node RUNNER ask --run RUN --stage review
node RUNNER ask --run RUN --stage verify
node RUNNER ask --run RUN --stage verify-final
node RUNNER decisions --run RUN
node RUNNER evidence --run RUN --request P-R-E1 --status supplied --file src/contract.txt --source-revision REVISION --reason "This scoped source answers the requested contract."
node RUNNER progress --run RUN
node RUNNER status --run RUN
node RUNNER extend --run RUN --idle-timeout-seconds NEW_IDLE_GUARD --reason "Coordinator-selected inactivity guard was too short; continuing the authorized plan."
node RUNNER discussion --run RUN
node RUNNER finish --run RUN
```

Replace `HOST` with `codex` when starting in Codex or `claude` when starting in Claude Code. The initiating chat coordinates; neither provider is the permanent lead. Append `--compact` to routine commands to receive single-line JSON with every field preserved. This changes only console formatting; saved artifacts remain readable. `ask` already returns the complete validated report: use that result and open the report file only if it was unavailable or truncated.

Read the `doctor` field for the selected route, even when the command exits successfully:

| Current chat and pairing | Required readiness field |
|---|---|
| Codex, `cross` (Claude peer) | `codex_chat_ready` |
| Claude Code, `cross` (Codex peer) | `claude_chat_ready` |
| Codex, `same` (Codex peer) | `codex_only_ready` |
| Claude Code, `same` (Claude peer) | `claude_only_ready` |

For `--author-model`, also require the coordinator provider's `codex_only_ready` or `claude_only_ready` field. A cross-provider run with a background author therefore needs both CLIs. Unused routes need not be ready. These fields check the CLI and visible saved authentication, not provider acceptance, model access, or runtime identity. The author stages above apply only to a configured background author; `author-review` applies only to plan mode.

`prepare` options:

| Option | Meaning |
|---|---|
| `--project` | Absolute project/workspace directory. |
| `--brief` | UTF-8 task brief file to snapshot. |
| `--assessment` | Required UTF-8 project-assessment JSON; evidence-based deployment/readiness and a clear direction. See the [assessment contract](project-assessment.md). |
| `--context` | Explicit UTF-8 context file to snapshot; repeat for multiple files, omit when the brief suffices. |
| `--coordinator` | Required: `codex` or `claude`, matching the current chat. There is no default or environment-based guess. |
| `--pairing` | `cross` (manual CLI default) calls the other provider; `same` calls a different model from the coordinator's provider. The skill selects the eligible route below before preparing. |
| `--mode` | `plan` includes draft, review, and verify; `review` critiques a supplied or coordinator-authored plan, then verifies the synthesis. |
| `--out` | Absolute directory for this new run and its artifacts. |
| `--budget-profile` | `standard` (default): 600-second inactivity guard, 4 attempts. `project`: 1,200-second guard, 5 attempts. No fixed call/total deadline under the default activity policy. |
| `--timeout-policy` | `activity` (default) waits while recognized model activity advances. `fixed` retains standard 300 seconds/call and 900 total, or project 600/call and 2,400 total. |
| `--idle-timeout-seconds` | Inactivity guard for `activity` policy; `60`–`3600` seconds. It is not a total runtime limit. |
| `--timeout-seconds` | Explicit hard per-call cap, `10`–`900` seconds; still enforced during activity. |
| `--budget-seconds` | Explicit hard cumulative worker-runtime cap, `10`–`3600` seconds; still enforced during activity. |
| `--max-attempts` | Explicit attempt allowance, including failures; overrides the selected profile. Maximum `6`. |
| `--coordinator-model` | The current chat's full model ID when known; required for host-authored `same` pairing. A declaration, never a change to the chat. |
| `--author-model` | Optional background planning model in the coordinator provider. Its draft and, in plan mode, review use real CLI calls; the current chat remains coordinator. Requires a resolved peer model; same-provider workers must differ. |
| `--peer-model` | Researched worker choice within the user's limits, or an explicitly pinned model. Required for an author worker and for `same`; legacy cross-provider manual commands may omit it. |

`prepare` freezes selected inputs and pins the C2C runtime/instructions. It does not invoke a model, read the whole repository, or follow document links. Supply excerpts when full files contain unrelated or private content. An incomplete packet may correctly result in `insufficient_context`. New runs use format 7 for explicit timeout policy and optional hard time caps, retaining evidence requests and final-revision checks. Existing pinned runs keep their original policy/runtime; never silently migrate them. Historical formats remain inspectable with `status`/`progress`, while unpinned runs must use their original runner for mutation/completion. Version 3+ requires project assessment; `direction.clarity: needs_user_input` is rejected before creating a run. Resolve essential user choices first. `discovery_needed` supports bounded investigation with a next action and exit criterion.

The project assessment contains shared facts and user constraints, not new architectural proposals. It is frozen in `snapshot.json`, saved as sealed `project-assessment.json`, rendered as `PROJECT_CONTEXT.md`, and sent once at every stage. Absolute project/input path metadata stays in the local snapshot; outbound file labels are relative or neutral. Authored evidence text is not automatically rewritten, so use relative source references and review it for private information. The runner checks shape and evidence-reference consistency, not the truth of deployment claims or production readiness. Read [project context and direction](project-assessment.md) before preparing it. Keep separate task/model advice out of peer packets.

Calls run sequentially. Do not edit reports while a call is running. Use `status` to inspect an existing run before resuming. A timeout, malformed response, or model-process failure consumes an attempt. Preflight executable/CLI-feature/authentication checks do not launch a model and do not consume an attempt; their errors remain explicit. A successful stage cannot be repeated. A new run requires materially changed task/evidence or the bounded route transition below, retaining the old record; use bounded recovery for an insufficient coordinator-selected allowance.

Process handling lives in `scripts/process.mjs`. Streamed output already received is preserved in partial logs when a call times out or is interrupted. Use the safe status summary first, including any cleanup uncertainty, before a useful permitted retry. Raw logs are diagnostic evidence and may contain private reasoning or project content; do not repeatedly tail or expose them. Neither partial output nor attempted cleanup establishes successful review or confirmed termination.

## Budgets and bounded recovery

The optional `verify-final` adds at most one successful worker call. It shares the original attempts/runtime and cannot repeat after success. Reserve capacity when revisions are likely; if none remains, deliver a provisional revision rather than expanding an explicit user cap. A five-call author route can use its sixth attempt for recovery or this check, not both unless earlier calls leave capacity.

Use `standard` for bounded features and `project` for large or deep planning. Under the default `activity` policy, these profiles use 600- and 1,200-second inactivity guards and four/five attempts, respectively. There is no fixed per-call or cumulative deadline by default: recognized advancing model activity renews the idle guard. Record limits and their authority in `TASK_ASSESSMENT.md`; generated run records retain the configured values. Do not routinely announce them in chat; follow [visible discussion](#visible-discussion) when they affect the user. These controls are not money/token caps or completion estimates.

Only substantive recognized model output or advancing work counters renew the guard. Initialization, retries, heartbeat/no-op events, stale duplicates, malformed output and stderr do not. A CLI may be computing silently or omit activity events: silence means no recognized progress was observed, not that the provider stopped thinking or is unavailable. Do not display raw reasoning as a progress report. Provider failures/limits, cancellation and the 4 MiB combined-output bound still stop a call; no extra paid recovery is implied.

The captured Codex 0.160.1 run emitted only final output; current-version intermediate activity is unverified. For any worker silent until completion, the inactivity guard acts as its effective call deadline. For a long Codex review, an authorized `--idle-timeout-seconds` value up to 3600 may help, without guaranteeing completion or overriding explicit caps. Record actual activity from ordinary authorized work; do not launch an extra call to fill this evidence gap. Stream bytes vary, so a sample's byte rate cannot predict a universal duration ceiling.

Explicit `--timeout-seconds` and `--budget-seconds` remain hard caps even while activity continues. `--timeout-policy fixed` preserves the earlier profile defaults: standard 300 seconds/call and 900 total; project 600/call and 2,400 total. Do not add a fixed cap to an activity run merely to reproduce an older default. Existing pinned runs retain their original fixed behavior and successful stages; updating C2C does not migrate their policy.

When preparation supplies a call cap but no idle setting, the default guard is at least that call cap. An explicitly shorter idle guard still applies. Extending a saved call cap does not silently extend its saved idle guard; increase both when authorized and needed.

Launch `ask` using the host's supported background or resumable command session, then wait on that same session in short intervals. A tool returning a session ID means the command is still running, not that it failed. Do not launch a second `ask` while waiting or impose a separate short shell deadline. If the host cannot retain a sufficiently long command, state that limitation; C2C cannot override host process limits. Neither provider's interactive terminal needs to remain open.

New real launches persist the direct worker's PID and OS process identity before sending its prompt. Locked recovery refuses a replacement while that identity is alive or ambiguous, including unresolved launch registration; it never kills a PID read from a manifest. Dead or reused identities allow normal recovery. Normal cancellation still requests owned-tree cleanup. A hard-killed coordinator cannot guarantee descendant cleanup, and old untracked attempts have no retroactive worker identity; inspect cleanup before retrying those cases. Preserve an ambiguous checkpoint instead of starting another worker.

Shared doctor/ask preflight first checks the same OS identity mechanism with an inert owned Node child, without a model turn or attempt reservation. This catches host-wide inspection restrictions; it cannot rule out a later process-specific race. A worker already dead at registration follows its ordinary exit diagnostics without receiving the prompt. An unresolved `launch_pending` record has no durable PID: normal recovery cannot continue that run. Preserve it and deliver a provisional checkpoint; do not claim its unknown child stopped, erase the reservation or silently clear it. An audited operator-release workflow is not implemented.

A background author adds one required call in review mode or two in plan mode: three or five successful worker calls respectively, versus two or three for a host author. All worker attempts share the run allowance. Author plan defaults to six attempts unless explicitly capped; timeout policy and any user caps still apply. Check feasibility before launching; do not promise that routing to more workers lowers total usage.

For pending calls, use read-only `progress --run RUN --compact`: phase, elapsed time, guard/cap metadata and log bytes, without repeating the project assessment/history. An uncapped activity call has no absolute deadline or remaining-time countdown. Log modification times describe output arrival, not the semantic idle clock. Use `status` for pending stages, remaining attempts and any finite runtime allowance. A `null` time cap/availability means no fixed cap, not zero seconds; duration feasibility remains unknown.

Neither command exposes provider prose through `peer_progress`. Growing logs mean output arrived, not that the peer returned a valid proposal or renewed its idle guard. A recorded response event is not report validation; authoritative successful stage state establishes that distinction. Neither command proves process liveness or authentication. Do not infer silence, success or a login failure from unrelated diagnostics.

Read `phase` with `attempt_status` and `recorded_running`: for an ended attempt, it describes the activity observed before that attempt ended, not a currently running model.

While an attempt is recorded as running, `budget.attempts_sufficient` is unknown (`null`); `attempts_sufficient_if_running_fails` is a conservative projection, not a proven blocker. Status does not recover or charge an interruption. Locked commands establish the safe resume state before a new call.

After a failure, check the recorded cause, completed/pending stages, remaining attempts/runtime, and cleanup state. Fix authentication or another known precondition before launching again. `ask` rejects a launch if remaining attempts cannot cover the remaining required stages; this check consumes no attempt. Do not skip a required stage to fit the allowance.

Before recovery, consult the allowance provenance, user caps, and existing recovery permission recorded in `TASK_ASSESSMENT.md`, together with relevant user instructions. A numeric limit alone does not reveal who chose it. If old custom limits have unknown provenance, resolve that from existing evidence before treating them as coordinator defaults.

When the coordinator chose an insufficient allowance and existing task authorization covers bounded recovery, increase it on the **same run**. State the reason and the authorization source in the reason text or local notes. Do not ask for permission merely to replace your own conservative default. An explicit user cap on time, attempts, or spending still applies: preserve it unless the user already authorized the increase, and ask only when an actual user decision or new authority is required. Models and reasoning settings stay unchanged.

```text
node RUNNER extend --run RUN --idle-timeout-seconds NEW_IDLE_GUARD --reason "Allow more unobserved work within the authorized plan; the prior guard was coordinator-selected."
node RUNNER status --run RUN
node RUNNER ask --run RUN --stage FAILED_STAGE
```

Replace placeholders with numeric **absolute values**, not additions, and omit unchanged values. Activity guards may increase up to 3,600 seconds; use `--max-attempts NEW_ATTEMPT_TOTAL` for up to six attempts. Existing finite caps can increase with `--timeout-seconds NEW_CALL_TOTAL` (up to 900) and `--budget-seconds NEW_RUN_TOTAL` (up to 3,600), subject to user authority. `extend` cannot remove caps, change fixed/activity policy or reset used allowance. Repeating applied values is idempotent. A reason is required: a nonempty single line, at most 500 characters. The command records `limit_history`, preserves successful stages, seals and reviewed hashes, and makes no worker call. Use it between calls; it does not alter a running timer, and completed runs cannot be extended. Legacy runs retain their original rules.

After an interrupted uncapped call, elapsed runtime can be unknown. Keep that uncertainty and its known lower bound; never present it as zero or invent unused time. A finite reservation is charged conservatively once. If an explicit whole-task time cap cannot be accounted for, preserve a checkpoint instead of inferring spare allowance.

With a cumulative cap but no per-call cap, the reserved deadline can be the entire remaining allowance. An interruption before completion is saved can therefore exhaust that allowance; preparation/status warn about this case. This is conservative accounting, not measured model runtime. Wall clocks and log times cannot safely establish a refund. Preserve the attempt and use only an authorized extension within existing ceilings, or deliver a provisional plan when no allowance remains.

Retries require a useful reason to expect a different result, such as repaired login or more time for an active but unfinished response. Exhausting the hard ceilings stops worker calls; continue useful planning through the fallback below while preserving the partial run. Never edit a manifest, erase failures, replay success, or create a fresh run solely to escape a cap. A later materially different scope/evidence can justify a new run with a recorded link and reason; that is not timeout recovery.

## Choose an available route

A normal C2C request authorizes selecting eligible workers within the user's limits. Start from the actual chat provider, never a fixed Codex lead. Apply explicit both-required/wait, provider-only, pinned-role, advice-only and reserved-selection instructions first; do not reinterpret a specific participant requirement as permission to replace it.

1. Identify **candidate routes** from Node, `doctor` capability/authentication results and known availability/usage blocks. Compatible authenticated CLIs with no known block are candidates, not yet authorized launches. `doctor`'s unknown billing fields neither disqualify them nor establish that supported usage evidence is unavailable. Never make model/access probes or inspect secrets.
2. Prefer a cross-provider candidate when the peer CLI is available. Do not first require the initiating CLI: the current chat may serve as author. Research current task-fit model choices for the candidate providers using [model selection](model-selection.md), before final billing checks. Then check trustworthy exact metadata for the current chat and decide whether the selected planner is the host or a background worker.
3. Check model access and the [billing policy](#no-paid-limit-recovery) for **actual worker calls**. A matching host-author cross route needs only the peer CLI's eligibility; a background author additionally needs its provider's CLI. Do not abandon an unchecked host-author route because an unused initiating CLI has unknown eligibility. Existing host and whole-task limits still apply. Unknown live quota alone is not exhaustion; a strict spending restriction still requires applicable no-overflow evidence.
4. If cross cannot qualify, consider the existing permitted fallback: an eligible planner and **distinct coding-focused critic** in the initiating provider. Apply the same candidate/research/role/check sequence and reuse evidence; a missing opposite CLI is irrelevant. Do not lower capability, infer spare quota from model names, bypass unresolved billing restrictions or override explicit participant requirements. If no permitted route qualifies after its applicable checks, use provisional self-critique.
5. Record roles/IDs, actual worker providers, identity/access/billing evidence, checks attempted or concretely unavailable, and remaining limits in `TASK_ASSESSMENT.md`; announce participants once. No installation, login/configuration change, account switch or automatic cross-app takeover is implied.

| Starting chat | Eligible cross route | Fallback when the other provider is unavailable |
|---|---|---|
| Codex | Codex planner + Claude planning peer | Codex planner + distinct Codex coding critic |
| Claude Code | Claude planner + Codex planning peer | Claude planner + distinct Claude coding critic |

The CLI does not autonomously choose a route: the coordinating skill supplies explicit `--coordinator`, `--pairing` and model flags. Review/plan stages and critique standards are identical in both directions. Separate model reports provide genuine critique; neither agreement nor disagreement is guaranteed.

## Planning with unavailable tools

Use existing tools and [select an available route](#choose-an-available-route) before defaulting to solo work. If no real pair can run, complete a provisional plan in the current chat within its authorized allowance. Do not install, upgrade, sign in, alter permissions, replace an explicit executable selection or change configuration/account/billing merely to complete planning. Offer setup instructions only when requested. Report the blocker once. If the user explicitly requires both participants or asks to wait, preserve a checkpoint instead of implying a substitute route satisfies that requirement.

Check the selected route, not whether every possible tool is present. A host-author exchange only needs the peer's CLI; a background author needs its provider's CLI too. A same-provider exchange needs only that provider's CLI and eligible distinct models. An open app does not prove its own CLI is available. The current chat can write a provisional plan even if neither CLI or Node is available; this is not an autonomous switch to another app. If the current chat cannot continue, save a checkpoint if possible.

Describe observed readiness precisely: executable not found by C2C, incompatible capabilities, inaccessible login, or another setup failure. PATH discovery failure is not proof the software is absent everywhere; none of these conditions proves quota exhaustion. `doctor` makes metadata/auth-status checks, not a model request or allowance guarantee. Never weaken required feature/tool controls to treat an incompatible CLI as ready. Preserve explicit overrides and distinguish available configuration from permission to spend.

Use the existing [provisional-plan record procedure](#planning-when-usage-limits-block-the-exchange): assessment, supported decisions and reversible assumptions, security, proposed tests, author self-check and Start here. Label it **Provisional plan — completed by the available chat; independent review unavailable** and identify the missing tool/review. With no run, write standalone plan/review notes; do not create fake reports or a discussion. With a partial run, preserve contributions, attempts, seals and participant identities, record the setup block in NOTES.md, and refresh derived views only through the runner. Resolve any running-worker cleanup before editing. Do not call finish with missing required stages.

In a solo plan, write a concise **Self-critique — one model, no independent review**. For material decisions, connect **decision → source or explicit assumption → failure case or practical alternative → revise, defend or leave unresolved → proposed check**. Focus on uncertainties that could change scope, architecture, security or the first step; do not manufacture concerns or repeat the whole plan. This is useful self-review, not a two-model discussion. Skip worker research only when no candidate route exists or applicable checks have already ruled it out; record why. Never simulate the absent reviewer, invent a second identity or start background retries when a CLI later becomes available.

## Change route after a worker block

Once a run exists, its sealed participants and successful stages cannot change. A setup/authentication failure or confirmed/user-reported opposite-provider usage block may justify **one linked same-provider run**, subject to the route checks above. A timeout alone is not proof the provider is unavailable; inspect its cause and use bounded recovery when appropriate. Never use this transition to retry another model inside the blocked provider, bypass unknown billing eligibility, recover exhausted overall limits or meet an explicit requirement for the absent participant.

Before preparing the linked run:

1. Resolve running-worker/cleanup uncertainty and read the original `status`. Preserve all reports and failures. Check stricter whole-task limits and allowance provenance; if unknown, do not assume extra authority.
2. Compute remaining attempts as original `max_attempts` minus **all** attempts. If a cumulative time cap exists, use its conservatively rounded `budget.peer_seconds_available`; otherwise retain the absence of that cap. Apply stricter whole-task limits and all prior related usage. Preserve timeout policy, idle guard, any per-call cap and requested planning depth. Unknown interrupted runtime is not zero; unresolved accounting against a finite whole-task cap prevents the transition.
3. Require sufficient remaining attempts for the full route: host author 2/3 calls for review/plan, background author 3/5. Any remaining finite runtime cap must meet the runner's 10-second minimum, and known task deadlines must still be feasible. If insufficient, deliver provisional self-critique. No fixed cap does not guarantee completion.
4. Record the original run ID/path, reason, completed/missing stages, charged or unknown runtime, residual caps and models in both runs' `NOTES.md`/`TASK_ASSESSMENT.md`. Mark the original partial run superseded for further calls. Set explicit residual `--max-attempts` and the original `--timeout-policy`; retain the activity guard where applicable. Pass `--budget-seconds` and `--timeout-seconds` only for existing finite caps, no greater than their residual/original ceilings. Never turn `null` into zero, introduce fresh profile time/attempt allowance or remove an existing cap. Do not extend/resume either route to evade aggregate limits or chain transitions.
5. Reuse the supported candidate/earlier reports as **attributed input** where relevant; no copying them into completed worker-stage files or relabeling their authors. Preserve necessary assessment/evidence, gather the real new critique/verification, and identify the original partial exchange separately in delivery. Never call `finish` on the original incomplete run.

Aggregate allowance tracking here is the **coordinator's responsibility**; the runner enforces each run's supplied caps, not a cross-run transaction or shared quota. If reliable accounting cannot be established, do not start the linked run. This is an explicit route-change exception to new-run policy, not a reset or an automatic retry.

## No paid limit recovery

Never purchase credits or top-ups, enable usage credits/extra usage/auto-reload, raise spend limits, upgrade a plan, or switch to an API key, cloud provider or billing account to get past a usage block. Instructions to continue, retry, finish or extend C2C do not authorize additional spending. When the user forbids it, do not suggest or request paid recovery. An eligible pair in the unblocked initiating provider must use its existing authorized allowance and the remaining task budget; otherwise use a provisional self-critique or checkpoint. Do not clear or replace credentials to find another route.

Choose the policy from the user's actual words and existing authority; record it once in `TASK_ASSESSMENT.md` without inventing a stricter test prompt or weakening a real restriction. Equivalent wording such as “do not use paid credits” belongs to the strict row even without the phrase “included-only.” Never downgrade an existing restriction to make a trial pass:

| Policy | Before calling a worker |
|---|---|
| Normal subscription use; no paid recovery | Use the existing authorized subscription route and a model supported within that plan, absent a known block. Unknown live quota/overage metadata is not proof of failure and does not itself require another billing question. The first request is a needed review stage, not an availability probe. Stop if it reports a limit. |
| Explicit included-only / zero additional charges | Establish that the selected route cannot consume extra credits, using supported read-only controls or existing owner-confirmed settings. Reuse that evidence while it remains applicable. A login, quota reset or available model alone cannot establish disabled overflow. If evidence is missing, deliver a provisional plan/checkpoint without a worker call. |
| Explicitly authorized metered use | Stay within the user's actual scope and limits. Never infer this permission from a C2C request or the presence of an API key. |

After assigning roles, reuse applicable evidence or, under strict limits, attempt **one bounded supported read-only usage check per required worker provider** when available. Choose a documented CLI/account surface or already-signed-in usage page that can answer the missing billing question; quota-only metadata cannot establish disabled overflow. Match the account to the selected CLI using nonsecret metadata. Record only the relevant setting, match result, date/source and concrete access limitations. `doctor` alone cannot establish that these checks are unavailable. A missing supported surface, denied access, failed account match or inconclusive result leaves the strict gate unresolved; do not launch. Do not check unused CLIs, repeat inconclusive checks without new evidence, read secret stores, use undocumented endpoints or change account/billing settings. API/cloud overrides need existing metered authorization; never remove credentials to manufacture another route.

C2C's runtime/attempt limits are not provider billing controls: existing account settings can permit charges without a quota error. Do not promise zero charges under ordinary subscription use. Hard no-overage enforcement remains in the provider's supported account controls. Worker processes disable Claude's credit-only fast mode, automatic updates and background terminal-title generation without changing account settings, model or reasoning effort; these controls are not a universal spending cap.

Provider behavior checked 2026-10-08: [Codex authentication](https://learn.chatgpt.com/docs/auth), [Claude usage](https://code.claude.com/docs/en/costs), [Claude authentication](https://code.claude.com/docs/en/authentication), and [per-process controls](https://code.claude.com/docs/en/env-vars). A configured API key may take precedence in non-interactive calls. Preserve the selected authentication source and do not treat a generic logged-in flag as proof of subscription billing.

## Planning when usage limits block the exchange

First consider the [eligible route](#choose-an-available-route) before preparation, or the [single bounded transition](#change-route-after-a-worker-block) after a run exists. When neither can provide a real pair, complete a useful **provisional plan with the available chat** and structured solo self-critique. This also covers a blocked selected author or exhausted worker ceilings. Honor remaining host and whole-task limits: an exhausted overall time/token/spending cap requires a checkpoint and stop. Explicit wait, required-participant and no-solo instructions take precedence. A provisional plan is not a completed council or permission to implement.

Use an explicit provider error, read-only limit information already available, or the user's report; distinguish observations from reports and record an unknown reset time as unknown. A timeout, login error, empty output, or generic 429 does not by itself prove exhausted account quota. Keep unknown causes unknown. `doctor` readiness does not establish remaining usage. A provider quota cannot be repaired with `extend`; that command changes only local runtime/attempt allowances. Do not retry the blocked worker, poll for a reset, probe other models in that blocked provider, change accounts/billing, or replace sealed participants to get around the block. Different models may share one provider quota. No extra worker call is required to establish fallback.

Recognized explicit quota, credit-balance or payment-required failures are recorded as `usage_limit`. Their static diagnostic and generated handoff prioritize fallback/checkpoint guidance over a local allowance extension. This is classification and guidance, not an account-side spending cap or a persisted CLI retry lock; the coordinator must still obey the stop/resumption rules. Unknown failures remain unknown. Never follow a provider error's purchase or upgrade suggestion as an instruction.

Reuse the assessment, selected evidence and successfully validated contributions. The available chat authors the provisional plan under its actual identity even if it differs from the selected planner; it does not fill a missing worker report. Test consequential recommendations against a credible failure case and practical alternative. Describe this as a self-check, not independent review or an invented debate. Existing disagreement remains visible.

Make the best supported planning decisions now. Use concise assumption entries in the plan: **assumption → reason → consequence if wrong → validation/reconsideration gate**. Prefer reversible choices that fit observed architecture and confirmed goals. For example, an unspecified inventory list may provisionally use pagination with a proposed load check; an unknown retention policy remains a decision gate for storing customer data. Do not invent repository facts, production status, passed tests, user consent or external authority. Keep consequential unknowns conditional, with a recommendation and the dependent step held; ask only when no useful bounded plan is possible. Security scope, meaningful acceptance/negative tests and proposed/executed/blocked labels remain required.

For an existing run, write or revise coordinator-owned `final-plan.md` and put a short fallback record in `NOTES.md`: observed/reported block, available author, actual completed/missing stages, plan path and what would permit resumption. Record decisions for actual available findings, retaining unresolved ones and earlier reasoning. Maintain `security-review.json` and its submitted-finding preservation rules. Refresh `DISCUSSION.md` between calls for real recorded contributions; the fallback plan and notes carry the self-check. Do not hand-edit generated discussion/handoff, fill missing worker artifacts, change sealed models/state, or call `finish` before all real required stages succeed. Planning delivery can be complete while the council remains partial. A generated handoff's suggested next stage is not an instruction to retry despite the fallback note. Do not edit artifacts while a worker may still be running; resolve cleanup uncertainty first.

If blocked before preparation, write a standalone provisional plan with the assessment, assumptions, security and test sections. Do not manufacture a run, report missing stages as attempted, or link a nonexistent discussion. If the current chat itself cannot respond, autonomous continuation is impossible: preserve a checkpoint if still able; otherwise use the last saved artifacts. A user can resume provisional planning from another available chat without changing the old run's identities or attributing new text to its participants. Never promise automatic cross-app takeover.

Announce the fallback once, keep the detailed decisions in Markdown, and deliver the plan with the missing-review status and next action. Do not automatically restart peer work after delivery or after an assumed reset. A request to resume the council requires checking real availability, authorization, intact state, current evidence and limits; resume only missing stages on the original route when valid. Completed stages remain immutable. Changed evidence follows the existing new-run rules, never a cap reset. Final edits not sent for successful verification remain unreviewed.

## Pairing and model identity

Use [available-route selection](#choose-an-available-route), honoring explicit user choices. Research models for each new task using [model selection](model-selection.md). Cross-provider roles use a task-fit planning choice from each provider; same-provider roles use a planner and a distinct coding-focused critic. Either initiating chat coordinates, synthesizes, handles security and records dispositions. Model selection never switches the chat or its configuration. Existing sealed routes stay intact; a bounded linked transition is recorded separately.

After researching the planner, check trustworthy metadata for **this current chat** before deciding its role: use supplied host metadata or one bounded read-only metadata check scoped to this exact session, extracting only its current model identity. Do not read message/analysis contents, search other sessions, infer identity from a product name, recommendation, CLI default or reasoning effort, or ask unnecessarily for an identity that can be checked. Reuse the chat as author only on an exact match to the selected planner; otherwise configure `--author-model` subject to its own access/billing checks. Unknown host identity remains unknown, not evidence that a feasible background pair exists. With an author worker, distinctness compares author and peer; without one, same-provider pairing compares the declared chat and peer. Explicit advice-only, reserved-selection and pinned-model requests override selection. A provisional fallback can be chat-authored without claiming the selected worker participated.

Use full versioned worker IDs; moving aliases such as `default`, `latest`, or a Claude family alias and identical same-provider IDs are rejected. These are placeholders, not model recommendations:

```text
node RUNNER prepare --project PROJECT --brief BRIEF --assessment ASSESSMENT --coordinator codex --pairing same --author-model PLANNER_FULL_ID --peer-model DIFFERENT_CODING_FULL_ID --mode review --out RUN
node RUNNER prepare --project PROJECT --brief BRIEF --assessment ASSESSMENT --coordinator claude --pairing cross --author-model CLAUDE_PLANNER_FULL_ID --peer-model CODEX_PLANNER_FULL_ID --mode plan --budget-profile project --out RUN
```

Current model controls: [Codex commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli) and [Claude Code model configuration](https://code.claude.com/docs/en/model-config). Provider availability and managed policies can affect which model runs. Coordinator IDs are declarations; worker IDs are requests, not independent attestation. A positively reported mismatch fails an exact model request, including a cross-provider peer paired with a matching host author. Missing runtime identity remains unknown; legacy unpinned/alias routes are not attested. Different models can still share blind spots.

For an author worker, `author-draft` creates `coordinator-draft.json` without seeing the peer proposal. In plan mode, `draft` independently creates the peer proposal; `author-review` critiques it into `coordinator-review.json`, then `review` critiques the author's proposal without seeing that critique. In review mode, the chat writes its own independent check to `coordinator-review.json`; do not attribute that check to the author worker. The chat synthesizes `final-plan.md`, security review and decisions before peer verification. Successful worker artifacts and participant settings are sealed; do not replace them with chat-authored text.

Identify participants by provider, role, and declared/requested model in the discussion file and any requested chat summaries. Review as an independent skeptic: check consequential assumptions, credible failure examples, and useful alternatives; require evidence for objections and reasons for dispositions. Do not manufacture disagreement or discard sound work to seem adversarial. A separate real report, not the coordinator writing both sides of a dialogue, supplies the second perspective.

## Single-provider planning perspectives

Use complementary questions inside the existing author/critic stages, with the same real participant identities and call allowance. These perspectives apply to Codex-only and Claude-only work alike; they do not imitate an absent provider or establish equivalent capabilities. Cross-provider planning retains its usual workflow.

| Contribution | Focus |
|---|---|
| Planning author, including a matching host author | Connect required outcomes and constraints to a minimal viable design, decisive assumptions, dependencies and acceptance gates. Compare alternatives where evidence could change the choice. |
| Independent implementation proposal, in plan mode only | Derive a buildable approach from interfaces, data/state transitions and failure paths. Trace a thin end-to-end slice to a proposed check, without seeing the other proposal. |
| Author's critique in plan mode; coordinator's candidate check in review mode | Challenge whether the approach actually meets outcomes, preserves constraints and avoids unnecessary scope. Do not favor a proposal just because you authored it. |
| Coding critic and verifier | Connect consequential decisions to source evidence, failure cases and minimal adequate remedies. Challenge accepted as well as rejected fixes, reconsider earlier advice and preserve unresolved risks. |

All roles still cover relevant security, tests and unknowns; perspectives are not exclusive ownership of those checks. A source fact outweighs agreement between models. Preserve supplied controls that already work, distinguish blockers from optional improvements, and avoid speculative rewrites. Use findings and dispositions for the arguments; reviews report changes and unresolved risks instead of reproducing plans. No minimum objection count, extra specialist, extra round or extra call is required. The coordinator responds and synthesizes; the peer verifier supplies actual replies to material counterarguments. Never invent a background author's response.

The intended benefit is fewer supported errors and clearer executable decisions for the work spent. Separate-role prompts, passing tests or a larger discussion do not prove improvement over ordinary planning. Use [matched outcome evaluation](https://github.com/ZiadHassanein/C2C/blob/main/docs/BENCHMARKS.md#evaluate-real-plans) before making comparative accuracy, token or speed claims.

## File contract

All JSON is UTF-8. Reports use the report schema below; the assessment uses its [own contract](project-assessment.md#json-contract), and decisions use the array schema below. `prepare` creates schema files in the run directory; read these as needed when authoring reports. Write the specified coordinator report files directly inside `RUN` using normal file tools; the runner reads them at the next stage.

| File | Author | Required by |
|---|---|---|
| `project-assessment.json` | Runner from coordinator-supplied assessment | Required input to version 3 and newer preparation; sealed facts and direction shared at every peer stage. |
| `PROJECT_CONTEXT.md` | Runner | Sealed readable assessment generated at preparation; a view of the JSON record, not a replacement for it. |
| `coordinator-draft.json` | Configured author worker, otherwise host | Before peer draft in plan mode; before peer review in review mode. |
| `peer-draft.json` | Runner from peer | Created by successful draft in plan mode. |
| `coordinator-review.json` | Author worker in plan mode when configured; otherwise host | Before peer review. In plan mode, critique the peer draft; in review mode, host independently checks the candidate. |
| `peer-review.json` | Runner from peer | Created by successful review of the coordinator draft. |
| `final-plan.md` | Coordinator | Before peer verification; revise afterward when warranted. |
| `security-review.json` | Coordinator | Required before verification in version 2 and newer runs; standard report schema with `C-S…` finding IDs. |
| `security-review-submitted.json` | Runner | Sealed copy saved at the first verification launch; its finding objects must remain unchanged in the current security review. |
| `decisions.json` | Coordinator | Before verification, then updated with verification findings before finish. |
| `peer-verify.json` | Runner from peer | Created by successful verification. |
| `DISCUSSION.md` | Runner | Generated view of available proposals, critiques, findings and coordinator responses; never sent as peer context. |
| `HANDOFF.md` | Runner for new runs | Generated after preparation and state transitions. Legacy handwritten notes are preserved. |
| `NOTES.md` | Coordinator | Optional local decisions/context beyond generated progress. |
| `run.json`, `run.checkpoint.json` | Runner | Checksummed current-state copies; never edit them to reset budgets or revise sealed evidence. |
| `TASK_ASSESSMENT.md` | Coordinator | Task sizing, dated model research, recommendations, actual authorized choices and limits before worker calls; summarized in the final plan. Local instruction-level record, not parsed or web-verified by the runner. |
| `IMPLEMENTATION_BRIEF.md` | Coordinator | Optional handoff for one selected milestone after plan completion; not executed or parsed by the runner. |

Do not rewrite successful peer reports or earlier coordinator reports to erase disagreements. Use the final plan and decision record for synthesis. `finish` records reviewed and final hashes for the plan, decisions, and, in version 2 and newer runs, the security report. `changedSinceVerification` includes decision-record updates required for new verification findings. Use `plan_changed_since_verification` and `decisions_changed_since_verification` to distinguish them. Result counts separate successful peer responses from all launch attempts. Source status separates changed bytes from missing/unreadable originals. Disclose changes after verification; completion does not mean that revised artifacts received another peer check or that every recommendation is factually correct. Legacy version 1 completion does not satisfy the security requirement; legacy version 1/2 runs do not establish that the project assessment occurred.

## Bounded evidence requests

Reports may include `evidence_requests`: up to ten objects with `id`, `question`, and `path`. IDs use the report prefix plus `-E1`, for example `P-R-E1`; `path` is repository-relative or empty if unknown. CLI output schemas require an array, empty when nothing is needed. Historical/coordinator reports may omit it. Requests are public questions, not private reasoning or permission to access a source.

The coordinator inspects each pending request, checks relevance and existing disclosure authority, and supplies only the necessary sanitized file. `--file` is relative to the prepared project; traversal, credential paths, binary input and symlink escapes are rejected. For an excerpt, create a sanitized file inside that project and use a clear relative `--label`. Record the original location/revision or an explicit unknown in the reason. A revision value is coordinator-declared provenance, not automatic Git attestation.

```text
node RUNNER evidence --run RUN --request P-R-E1 --status supplied --file src/contract.txt --source-revision REVISION --reason "This contract answers the requested compatibility question."
node RUNNER evidence --run RUN --request P-R-E2 --status unavailable --reason "No approved policy exists in the supplied project; retain this as a decision gate."
node RUNNER evidence --run RUN --request P-R-E3 --status rejected --reason "The requested private data is unnecessary; plan with the documented interface."
```

Each request receives one immutable resolution in sealed `evidence-N.json`; existing snapshots and successful reports stay intact. The runner applies credential scans and caps: 60 KB per supplied file, 20 supplemental files/120 KB, and 30 context files/240 KB combined with the original packet. At most 50 resolution records are retained. These limits do not prove safe disclosure. New facts augment the frozen evidence; conflicting revisions remain visible and may justify a new materially scoped run instead of mixing incompatible premises.

Independent drafts receive no supplemental material. Critiques receive supplied facts without the requesting participant's question or rationale; verification sees full resolutions. Answer requests before verification and completion. Missing evidence stays unavailable/rejected with a reason; it must not become a fabricated fact or settled conclusion. Security-review evidence is gathered directly by the coordinator; `security-review.json` requires an empty request array. No evidence command launches a worker or broadens tool permissions. `status` and `DISCUSSION.md` list requests and outcomes.

## Final revision check

Run `decisions --run RUN` after reports to append missing findings as **unresolved**. Existing decisions are preserved. The generated rationale is a pending marker; the coordinator must still adjudicate the concern and remedy, keeping real unresolved risks visible. The command updates the discussion and makes no worker call.

Before `verify`, use a stable plan header linking to `DISCUSSION.md`, as described in [plan presentation](plan-presentation.md#put-the-decision-brief-first). Keep changing review status in the generated discussion/result and final reply. When verification needs no plan correction, proceed to `finish` without rewriting the plan merely to announce success; generated status updates make no worker calls.

After `verify`, a format 6 or newer run requires a review boundary for changed plan/security text, changes to earlier adjudications, or newly supplied evidence. Appending dispositions for new verifier findings and merely reformatting/reordering existing decisions do not require another call. All plan content, including headings and status text, remains covered by verification; there is no cosmetic-edit exemption.

```text
node RUNNER ask --run RUN --stage verify-final
node RUNNER finish --run RUN
```

This is one optional successful revision check, using the same peer and original shared budget. It includes the current plan, prior verification, decisions and evidence; findings use `P-F1` etc. It cannot run before verification, repeat after success, or launch when plan/security text, prior decisions and supplied evidence are unchanged. Reviewers test consequential remedies and answer material counterarguments, preserving legitimate disagreement. It is not a consensus loop. Original reports and failed attempts remain intact.

If there is insufficient authorized allowance, the provider is blocked, or further changes follow this last check, preserve a provisional revision:

```text
node RUNNER finish --run RUN --unverified-reason "The authorized allowance is exhausted; these corrections remain unreviewed."
```

All original required stages, finding dispositions and evidence-request resolutions must still exist. This option cannot manufacture a missing council. Completion records the latest successful verification, exact artifact hashes, whether the delivered plan was reviewed, and the reason for an unreviewed revision. Describe such a result as provisional. Unresolved findings or `needs_changes`/`insufficient_context` verdicts remain visible even when bytes match. Formats 1–5 retain their original completion behavior.

## Security and testing

Every actual plan in either mode needs a security assessment proportionate to its consequences. Before `ask --stage verify`, the coordinator writes `security-review.json` using the complete standard report schema, with `C-S1`, `C-S2`, … IDs. Include every security finding in `decisions.json`. Version 2 and newer runs enforce this report and send it with the final plan to the peer for verification; there is no additional peer stage or security CLI flag. Keep coordinator security conclusions out of independent draft and critique packets; neutral risk and constraint facts belong in the shared brief and project assessment. Carry relevant deployment consequences and readiness gaps into this review without claiming that a production classification proves security.

The report's nonempty `proposal_markdown` briefly addresses each area below, stating applicability, evidence or assumptions, unresolved risk, and necessary checks. Explain why an area does not apply instead of silently omitting it. Scale depth to the plan; this is not a mandatory exhaustive audit.

| Area | Questions to resolve when applicable |
|---|---|
| Threats and trust boundaries | What assets and actors matter? Where could misuse or untrusted content cross a boundary? |
| Data and secrets | What sensitive data is collected, stored, logged, shared, retained, or deleted? What constrains exposure? |
| Authentication and authorization | Who may perform each sensitive action? Are permission, tenant, or ownership boundaries preserved? |
| Inputs and outputs | Which inputs are untrusted? What validation, escaping, execution, file/path, or external-call risks follow? |
| Dependencies and external parties | Which packages, services, vendors, or integrations add risk, and what current evidence supports their use? |
| Operations and recovery | What deployment, configuration, logging, abuse/resource limits, rollback, or recovery checks are needed? |

For non-code plans, map these areas to relevant access, information-sharing, third-party, and operational concerns rather than inventing software components. Use `assumptions`, `open_questions`, and `limitations` for missing evidence. `ready` means ready within the report's stated scope and evidence, never proof that a system is secure. When evidence cannot support a material conclusion, use `insufficient_context` or `needs_changes` as appropriate. An empty findings list is allowed, but does not replace the applicability assessment or prove a security pass.

The final plan must name risk-relevant behavior, regression, edge-case, and security checks. Use commands found in the actual project when available; otherwise mark the command or setup unknown and name how to establish it. Record each check as proposed, run with dated results, or blocked/unavailable. A peer review of proposed tests is not test execution. Actual implementation testing follows an authorized implementation or experiment; security testing does not expand targets or permissions. Follow up on failures and identify remaining gaps instead of marking an unrun check passed.

At the first verification launch, the runner seals `security-review-submitted.json`. Each attempt also saves a sealed `attempt-N-security-review.json`, so retry-specific findings are preserved. Every submitted `C-S…` finding object must remain unchanged under the same ID in the mutable `security-review.json`. Resolve or reject findings through `decisions.json`, with evidence and rationale; do not rewrite the original claim or severity. New findings may be appended using new IDs and must receive dispositions. Other report conclusions may be updated with an explanation, and final artifact hashes expose the revisions; an updated report has not had another peer review. `RESULT.md` surfaces the security verdict and limitations, not a security-pass certification. Never erase unresolved findings to obtain completion. Assessment-only work gives security-risk advice in `TASK_ASSESSMENT.md` without creating a run, report, or paid peer call.

## Implementation handoff

Every delivered plan includes an [execution entry point](plan-presentation.md#make-the-execution-entry-point-explicit). After plan completion, the coordinator may extract a concise `IMPLEMENTATION_BRIEF.md` for the selected milestone. Keep it aligned with the current plan and its review status; new decisions require a plan revision, not a conflicting second plan. It is a handoff document, not a runner command or an automatic implementation trigger. Include:

- Milestone ID, objective, scope/non-goals, and its relationship to the reviewed plan.
- Link to `PROJECT_CONTEXT.md`, deployment evidence, readiness scope/gaps and any prerequisite for work with live impact.
- Relevant files/components, snapshot/source version, evidence links, and constraints; mark unknown paths explicitly.
- First concrete action and gate, then ordered work/dependencies and actual validation commands with expected acceptance results, or the missing information needed to establish them.
- The plan's advisory execution-model choice, scope, evidence/eligibility limits and savings labels; reuse it rather than starting new research or silently changing models.
- Security acceptance checks, finding dispositions, unresolved blockers, and prerequisites before proceeding.
- Status of each check: proposed, tested with dated results, or blocked/unavailable; note any changes since plan verification.

Do not describe plan verification as tested implementation. If implementation is authorized, use the current host or an appropriate separately installed skill after reading its documented interface. A handoff alone does not authorize installing packages or skills, opening chats, committing, changing models, or expanding scope. Preserve blockers rather than silently transferring them as settled decisions, and keep private implementation context out of public repositories.

## Planning depth and deliverables

The planning depth guides content and runner mode; `--budget-profile` separately selects inactivity/attempt defaults, or time defaults when fixed policy is requested. Establish [project context and direction](project-assessment.md), then select depth before preparation, state scope and deliverables in the neutral brief, and record the reason in `TASK_ASSESSMENT.md`. Preserve explicit user requests: a small feature can use independent drafts, and a large supplied plan can use review mode. Choose `project` for large/deep roadmaps and `standard` for bounded work, respecting user caps. Neither depth nor profile changes models or effort.

| Depth | Typical choice | Final-plan emphasis |
|---|---|---|
| Focused feature | `review`: 2 worker calls with host author, 3 with background author | One bounded behavior change, affected components, ordered steps, relevant edge cases and acceptance checks. |
| Feature design | `plan`: 3 worker calls with host author, 5 with background author | Meaningful alternatives, integration boundaries, tradeoffs, implementation steps, tests and relevant rollout concerns. |
| Project roadmap | `plan`: 3 worker calls with host author, 5 with background author | Scope/MVP, architecture, milestones and dependencies, validation gates, risks and a detailed first milestone. |

Present drafts and final plans using the [decision-first presentation guide](plan-presentation.md). Lead with status, recommendation, and priority user decisions; keep detailed technical appendices in the same file. Critical invariants and blocked next actions stay in the visible summary. A failed peer stage leaves an organized draft, not a completed council.

**Focused feature:** Start from the user's plan or write a short candidate from the supplied evidence, then critique it before requesting the peer critique. Prefer a compact plan that someone can implement directly; expand only when consequences or unknowns warrant it. Avoid unnecessary architecture documents, phase hierarchies, or invented findings. Do not skip peer verification or finding dispositions to save a call, and do not describe this route as two independent proposals. If design alternatives matter, choose feature-design depth before preparing the run. A supplied plan with high risk can still receive rigorous review without being redrafted.

**Feature design:** Identify the unresolved decisions worth independent proposals. Compare viable approaches against the user's actual constraints; do not manufacture alternatives for settled details. Explain what peer critique changed and provide evidence-based acceptance criteria. Medium size is not a requirement: a small authentication change may deserve this depth, while a large mechanical edit may need only focused review.

For either feature depth, anchor the plan in current behavior, affected architecture and dependencies before describing the target change. Include a concrete starting action and proceeding gate. Add compatibility, data protection, migration and rollout/recovery checks when the assessed deployment and change make them relevant; do not burden a local cosmetic change with unrelated production work.

**Project roadmap:** Cover the whole requested project; detail the first milestone without silently narrowing the assignment to it. Keep the council at project level rather than trying to design every future feature in one packet. Build the final plan around:

- Assessed current project/deployment context, users, desired outcomes, scope, non-goals, MVP boundary and known constraints. Existing projects retain their relevant architecture and compatibility constraints.
- Architecture or workstream boundaries, relevant data flows/interfaces, dependencies and consequential tradeoffs.
- A milestone table with stable IDs, outcome/deliverable, prerequisite IDs, acceptance/exit criteria, and responsible role where known. Flag dependencies that control sequencing; do not invent staffing or calendar commitments.
- A concrete first milestone with ordered work and verification. Describe later milestones at a coarser level, with open decisions and triggers for refinement. If requirements are missing, the first milestone gathers the missing evidence rather than assuming an architecture is settled.
- Relevant integration, security, migration, rollout/rollback and operational risks, plus how they will be tested or resolved. Include only concerns that apply to the project.

Preserve this roadmap in `final-plan.md` and link it from `HANDOFF.md`. Link the assessment's `PROJECT_CONTEXT.md` and summarize material facts, remaining gaps and the next action in the plan. Supporting Markdown is optional when it improves navigation; evidence sent for verification must be self-contained in the supported inputs and final plan. A linked file alone is not reviewed. Select focused excerpts or a dated, source-linked factual summary; peers cannot follow local links. Keep inputs within runner limits and current independent proposals and critiques out of shared context.

A roadmap request normally produces one project-level council. Recommend later milestone discussions where useful, without starting them automatically or pausing the current roadmap for another approval. When follow-up planning is within the user's requested scope, give each materially different milestone a new brief/run and retain links to prior accepted decisions and evidence. Mark previously accepted constraints as such rather than claiming they were independently rediscovered. Each run retains its own limits; there is no project-wide billing cap or automatic multi-run scheduler. Never split a failed run just to reset its budget. Identify exactly which scope each completed review covers; project-level verification does not verify all future feature plans or implementations.

## Task size and model advice

Make a proportionate assessment from the brief and available evidence. These are qualitative judgments, not a numerical score or an exact estimate of hours, tokens, or price.

| Size | Typical scope |
|---|---|
| Small | One bounded change or deliverable with a short verification path. |
| Medium | A bounded feature or coordinated deliverable involving a few components and integration checks. |
| Large | Multiple interacting components, substantial investigation or migration, and broader validation. |
| Extra-large | A program of work with several independent milestones; recommend splitting it before detailed planning. |

Separately rate complexity, risk, and uncertainty as low/moderate/high. Cite drivers: novelty, dependencies, context volume, reversibility, affected users/data, missing requirements, and verification burden. A small access-control change may be high risk; hundreds of mechanical replacements can have low reasoning complexity. If evidence is missing, give a provisional size or range, explain the missing facts, and use low/moderate/high confidence rather than a fabricated probability. A stronger model does not resolve missing requirements by itself.

Use the [model-selection procedure](model-selection.md) for fresh official research on every new task, task-fit planning/coding choices, worker routing, access evidence and user limits. Research within the same task is reused; a new task gets a fresh check. Do not invent price, latency or quality rankings. This runner does not expose an effort flag.

Keep one compact local record after preparation and before any worker call. For advice-only work, save it in the requested workspace without preparing a run. The runner does not parse this Markdown or independently verify web research; the coordinator must perform and record it honestly.

```markdown
# Task assessment
- Assessed/researched: date/time with timezone; task scope and source revision.
- Size / complexity / risk / uncertainty: separate judgments, reasons and confidence.
- Route: pairing, planning depth, mode and host/background author; why appropriate.
- Model research: planning and coding recommendation for each provider, source links/date, task-fit rationale and local availability evidence or gap.
- Execution advice: first work item, recommended model/effort and justified alternative, official/firsthand sources with dates and limits, eligibility/confidence, reconsideration trigger; token, API-price and subscription evidence kept separate.
- Actual roles: author and critic model IDs, why selected, identity provenance and selection authority; separate recommendations from requested/reported models.
- Limits: actual profile and per-call/total/attempt ceilings; who chose them, explicit user time/attempt/spending caps, existing recovery permission and unknown provenance.
- Assumptions or blockers: material unknowns and what would change the recommendation.
```

The final plan briefly states the choices, their evidence and meaningful tradeoffs. Keep the full TASK_ASSESSMENT record and worker-selection research out of --assessment, --context and other worker inputs; neutral project risk/constraint facts belong in shared assessment and brief. The compact execution recommendation with relevant rates, assumptions, source dates and limitations belongs in the final plan for verification; workers cannot independently open its source links. Never claim an unreported runtime model was verified.

## Visible discussion

Use `DISCUSSION.md` as the primary discussion record. Start with the purpose of the review, for example: “I’ll review the plan for missing requirements, conflicting instructions, and a clear execution order.” Link the generated discussion once after preparation. Keep roles and limits in the saved records; omit routine call counts, guard durations and repeated assurances about what will not change. Preserve scope enforcement and required disclosures: explain relevant operational details on request or when needed for a decision, required approval, blocker or material recovery/scope change. Default progress carries new findings, user decisions, material blockers, actionable failures and brief host-required updates. Explicit requests for live summaries override this default; summarize only new material points from completed reports. A pending call has no response yet. Keep the final decision brief short and link the plan and discussion.

New runs create `DISCUSSION.md` and refresh it at saved state transitions, including before a call and after success/failure. It contains report summaries, finding evidence/actions/checks, accepted/rejected/unresolved coordinator dispositions, and current verification limits. It labels unsubmitted working drafts and excludes failed partial output. Decisions belong to the coordinator and do not establish peer agreement. Source report links allow closer inspection.

Between peer calls, use `discussion --run RUN` after editing local reports or decisions to refresh the view. The command returns its path and any validation warnings. It does not change the manifest, seals, successful stages or budgets. It takes the run lock while refreshing; during a peer call, the existing file shows the last saved state. Reading the file needs no lock, but do not reload the full view when its source reports are already known. Report refresh failures honestly; do not claim a stale view is current or handwrite a replacement. Older runs can opt in using the same command, without another peer call. An existing unmarked file is preserved rather than overwritten.

The view uses validated report fields, not raw prompts, provider logs or internal reasoning. Malformed working records are flagged; they are not treated as agreement or an empty review. If a security working copy is missing or invalid, including removal or rewriting of a submitted finding, the view retains the latest sealed security submission with a clear label and source link. `DISCUSSION.md` remains a derived local view outside the sealed evidence set, and a view-write failure cannot turn a successful call into a failed one. Never add it to an independent peer packet.

## Handoff note

For runs prepared by version 0.5 or later, the runner generates `HANDOFF.md` from recorded state after preparation and state transitions. It contains coordinator/peer, mode, stage progress, attempts/runtime, available evidence links, and the next stage. Treat it as a navigation aid: `status` and sealed artifacts are authoritative. Do not edit generated progress; keep optional extra context in `NOTES.md`:

- Goal, scope and authorized next work when not already clear from the brief.
- Material decisions or user questions, linking finding IDs and source evidence.
- Observed checks versus proposed checks, dated model advice, and the exact next action.

Legacy runs without the generation flag retain their handwritten handoff. Keep those concise and current. On resume, read the handoff, optional notes and `status`, then inspect the relevant artifacts. Missing original inputs do not prove changed contents: the sealed snapshot remains the evidence used by the peer. Never repeat successful stages or reset attempts. For an insufficient allowance, use [bounded recovery](#budgets-and-bounded-recovery) on the same run; materially changed evidence can justify a new run with its reason recorded.

These notes stay local and are not independent peer packets. Do not pass coordinator drafts or critiques through `--context`; the runner selects stage-appropriate reports. Keep private run records out of public repositories.

## Compatibility and recovery

On Windows, discovery also checks known native Codex user/app-cache locations after PATH. This is best-effort support for internal layouts, not a guaranteed installation contract. Automatic fallbacks must report a stable version; selecting a prerelease requires an explicit override. Windows `claude.cmd` shims remain unsupported: the error directs users to an existing native `claude.exe` or optional native setup, never executes the wrapper or forces installation.

Windows npm installations are supported by resolving the known `codex.cmd` package layout to its native binary; the runner never executes arbitrary shell wrappers. Without an override, preflight checks distinct installed candidates in PATH order (then Claude's native user location), skipping only candidates missing required capabilities. It stops at the first compatible binary; execution or authentication failures do not trigger another selection. `COUNCIL_CODEX_BIN` and `COUNCIL_CLAUDE_BIN` explicitly select one binary: an invalid or incompatible override fails without fallback. No installations, global PATH/configuration changes or account/billing switches occur.

On Linux/macOS, CLI files must be executable. PATH discovery skips non-executable files; executable symlinks and shebang scripts are supported. An explicit non-executable override fails. The installer uses the same Node commands and user configuration roots on all platforms; see [platform setup and CI coverage](https://github.com/ZiadHassanein/C2C/blob/main/docs/SETUP.md#linux-and-macos).

`doctor` and `ask` share preflight checks for required flags, Codex feature controls and authentication. Unsupported optional feature switches are omitted; missing required shell/image controls reject that candidate before an attempt is reserved. `doctor` reports the selected path/version and `candidate_checks`, including incompatible paths and their reasons; failed metadata checks retain the path and version when known. Inspect this local record when the interactive app works but the worker does not. Continue with [available-chat planning](#planning-with-unavailable-tools) if no eligible route exists. Capability checks are not a version allowlist or proof of model access, authentication freshness or included usage; verify allowance for the selected route before a model call.

State writes flush and atomically publish both a checksummed current checkpoint and manifest. Reads select the newest complete valid revision, preserving reserved attempts and successful stages. A recovered finite reservation is conservatively charged once. Interrupted uncapped calls retain unknown elapsed time and any known lower bound, without fabricating a total. If both copies are damaged, an old run has no complete checkpoint, or equal revisions disagree, stop and preserve the files. Do not reconstruct a permissive manifest or reset the budget.

Locks record process identity as well as PID, preventing normal PID reuse from blocking indefinitely. Empty or ambiguous legacy locks require inspected recovery. First establish that the previous runner has stopped, then use the exact hash printed by the error:

```text
node RUNNER recover-lock --run RUN --expected-sha256 HASH --confirm-owner-stopped yes
```

macOS process identities use a fixed locale and UTC timezone so different terminal environments cannot make the same live process appear stale. New runners preserve ambiguous older macOS identities when that PID is still alive; inspect them before recovery rather than assuming PID reuse. Use one current runner version for a run when upgrading.

Recovery preserves the old lock and never resets attempts. A matching live owner cannot be removed. If a crash leaves `.lock.reclaim`, inspect its recorded process and preserve/move only that marker after confirming it stopped. Use a local filesystem supporting hard links for run folders. These safeguards reduce common crash damage; they cannot recover all copies after disk or hardware failure.

## Report schema

Worker schemas constrain finding-ID spelling without renumbering authored references. Diagnostic prose around JSONL can be ignored, but malformed JSON records, fatal stream errors and missing substantive finding fields still fail validation. Descriptive evidence hints may contain `./`, a trailing slash or a `:line` suffix; their original text is preserved and actual supplied-file paths remain strict. A failed model call still counts as an attempt; no output repair fabricates missing content or refunds usage.

Each draft, review, security review, and verification report uses this complete object shape:

```json
{
  "summary": "Concise account of the proposal or review result.",
  "verdict": "needs_changes",
  "proposal_markdown": "The independent proposal, or optional supporting context for a review.",
  "findings": [
    {
      "id": "C-R1",
      "severity": "major",
      "claim": "The proposed migration has no tested rollback path.",
      "evidence": "The supplied migration plan lists only forward migration steps.",
      "action": "Add a backup-and-restore checkpoint before data conversion.",
      "verification": "Run a restore rehearsal against representative test data."
    }
  ],
  "assumptions": [],
  "open_questions": [],
  "limitations": []
}
```

- `verdict`: `ready`, `needs_changes`, or `insufficient_context`.
- `severity`: `blocker`, `major`, or `minor`.
- All top-level keys and all finding keys are required. Empty arrays are valid; do not manufacture findings merely to fill them.
- Coordinator draft IDs use `C-D1`, `C-D2`, and so on; coordinator critique IDs use `C-R1`, `C-R2`, and so on; security review IDs use `C-S1`, `C-S2`, and so on. Peer IDs use `P-D1`, `P-R1`, or `P-V1`. Use unique positive integers within the stage namespace; gaps and report order do not change an ID. The runner preserves valid worker IDs and their authored references exactly. New worker reports with invalid or wrong-stage IDs fail validation; they are never silently renumbered. Cite earlier-stage IDs in prose when replying to them, without reusing those IDs for new findings. Already saved reports remain unchanged.
- Cite relevant supplied sources or observed experiment results in `evidence`. An assumption or hypothetical failure must be labeled as such. An absence of evidence is not proof of a defect.
- `proposal_markdown` carries the independent plan for a draft. For review/verification it is optional supporting context; substantive corrections belong in numbered findings. Do not claim that proposed tests have already run.
- Review and verification `proposal_markdown` may be empty. Do not duplicate findings, restate whole plans or hide additional action items there. Put concise pressure tests and actual ID-referenced replies in `summary` or findings so the discussion view shows them. Drafts still need complete nonempty proposals; security reviews still need their nonempty applicability assessment. There is no minimum report word count. Retain all material findings, assumptions, questions and limitations.

## Token efficiency

Worker packets retain exact selected evidence, assessment, applicable full reports and actual participant roles/model IDs. Preparation validates every context argument, then keeps the first occurrence of each canonical context path. Distinct files remain separate even when their text matches; brief and assessment roles are not deduplicated against context. Repeated paths no longer consume the aggregate context allowance more than once. Existing file-count, per-file and prompt bounds remain.

Run UUIDs, source byte counts/hashes and derived identity labels stay in local records. The prompt keeps the model-identity caveat without repeating it in packet metadata. Common instructions and context precede stage-specific data, permitting but not guaranteeing cache reuse. Reuse returned reports, the task's model research and compact progress views. Avoid duplicate prose/reads, never material evidence or findings. Read reference sections only when relevant.

These controls preserve models, effort, security and review stages. Selected background authors add genuine calls when the host does not match. Per-attempt provider usage is retained when returned. The [offline harness](https://github.com/ZiadHassanein/C2C/blob/main/benchmarks/README.md) checks exact task content and workflow invariants. [Evaluation methods](https://github.com/ZiadHassanein/C2C/blob/main/docs/BENCHMARKS.md) distinguish input-text proxies from billed usage, live speed and model judgment; no total-saving or equal-quality guarantee is made.

## Decision record

`decisions.json` is a JSON array with one entry for every finding from every report in the run, including coordinator critiques, security findings in version 2 and newer runs, and final peer verification findings. Before verification, it covers all reports available at that point.

```json
[
  {
    "finding_id": "P-R1",
    "disposition": "accepted",
    "rationale": "The supplied handler lacks an owner check, so the concern is accepted. Replacing the authentication service would expand scope without fixing this boundary; adapt the remedy by using the existing owner policy on this route. The plan includes a cross-user negative test, still proposed."
  }
]
```

`disposition` is `accepted`, `rejected`, or `unresolved`. Judge the concern separately from its proposed remedy. Accepting a concern may mean adopting or adapting the remedy, or retaining an existing control supported by evidence; say which in `rationale`. Accepting every finding is neither proof of a good review nor automatically wrong. Do not require a rejection quota.

For consequential remedies, record the supplied evidence, a credible counterexample or practical alternative and its tradeoff, the chosen action, and the check or decision still needed. Consider whether the fix introduces a failure mode, user friction, dependency or unnecessary scope. A tautological acceptance check does not validate the fix. Keep straightforward corrections concise; repeating a checklist for every minor point wastes context.

Reject incorrect, inapplicable or disproportionate recommendations with evidence and the chosen alternative. Use `unresolved` if a material part of the concern remains open; agreement with only part of it must not hide that gap. New business policy remains proposed pending the user's decision. Every disposition receives the same scrutiny during verification, including the verifier's own earlier advice. Structural validation checks IDs, coverage and bounded rationale text; it cannot prove sound judgment.

When a later finding overturns an earlier resolution, update the earlier rationale to say what was originally chosen, which finding supersedes it, and the current action/check. Preserve the original finding and substantive prior reasoning; do not leave contradictory decisions appearing current. Related or duplicate findings retain separate IDs and may reference one resolution. With no findings, use `[]`; the report summary can explain the decisive evidence and review limits without invented objections.

The peer's verification summary supplies its actual response to material counterarguments about its own proposal or recommendations, citing the relevant finding IDs and whether its position stands, changes, or remains uncertain. A coordinator's disposition of its own critique is not that response. Put substantive new corrections in numbered findings, including corrections first discussed in prose; `proposal_markdown` is supporting context, not a second untracked task list. Do not invent a peer finding ID or agreement when an older report lacks one: identify any resulting coordinator-proposed change and its review limit explicitly in the plan.

## Launch preview and local permissions

`node RUNNER preview --run RUN --stage STAGE` validates the stage and describes the actual outbound packet: provider, role/model, selected input labels, included report names, evidence identifiers, prompt bytes/hash, controls and remaining allowance. It does not print raw context, call a provider, check authentication, lock/write state, recover attempts or reserve budget. Inspect selected content locally as well; labels and a passed secret scan cannot establish safe disclosure. The preview is not a permission or billing attestation, and edits after preview require a fresh preview.

An explicit C2C/exchange request authorizes sharing the relevant selected brief and review artifacts with those providers, subject to the user's exclusions and host policy. Reuse this authorization; do not invent a second mandatory consent step. When the host requires approval to run outside its sandbox, describe the exact prepared run/stage, provider, selected context purpose, existing user request and worker restrictions. Do not claim read-only planning means no data leaves the machine. If approval is rejected, respect it, preserve the run and report the stated reason; do not disguise or reroute the same action.

An `EPERM`, `EACCES` or `EROFS` during runtime-cache access or lock publication is a local filesystem/host-permission failure, not a model rejection or quota error. Use the host-approved execution path for the unchanged command when authorized. Do not run as administrator, weaken locks/checks, delete an existing lock or create a new run to escape the failure. Before a **new** preparation, a persistent writable `C2C_RUNTIME_HOME` may be selected; retain it for every later command. Existing pinned runs need their original store available; do not silently relocate them. Diagnose process-spawn denial separately and preserve any already-recorded attempts. An explicit permission requirement comes from the host, not a new C2C consent rule.

## Authentication, permissions, and limits

Workers run non-interactively through `claude -p` or `codex exec`, with piped input/output and hidden Windows process windows. Only the coordinating chat needs to remain open; never require a peer app, panel, or terminal. The runner reuses saved CLI authentication and probes with the same filtered environment used for peer calls. `authenticated` and readiness fields indicate locally visible authentication, not live token validation.

If the provider rejects authentication, explain the runtime error and identify the selected source without revealing credentials. Default to [available-chat planning](#planning-with-unavailable-tools); login repair is not required to deliver a provisional plan. If the user requests setup repair, renew a saved CLI login through `claude auth login` or `codex login`; the browser flow may require user interaction. An environment key/token may take precedence and needs repair through its own authorized source. Then inspect status and resume only when requested and within remaining allowance. Never repeat successful stages, automatically retry a rejected login, or switch account/billing. A successful response proves only that call worked. Never read, copy, or include token files in context.

A restricted host may not access the normal credential store. Different OS accounts, CLI/config paths, or inherited credential environment variables can also select different authentication. Check those differences without exposing secrets before asking a signed-in user to log in again. Use the host's approved execution path while retaining runner restrictions; never copy credentials, silently change authentication settings, or disable managed policy. The runner never elevates privileges. See [Claude login renewal](https://code.claude.com/docs/en/authentication#renew-an-expiring-login).

Peer calls disable shell, browser, image, connector and agent features where supported, use a neutral working directory, and request read-only permissions. Claude also receives an empty tools list; Codex may retain tools that its read-only sandbox must deny. Calls reduce inherited configuration and instruct the peer to use supplied evidence only. They do not run in `PROJECT` and do not automatically inspect its files. Managed organization policies still apply. This is an application-level collaboration boundary, not a promise of OS-level isolation or a substitute for the host's permissions.

The runner checks the complete outbound packet for conservative patterns for private keys, common OpenAI/AWS/GitHub/Slack/Google credentials and password-bearing connection strings before sending it, including report content rather than only initial context. This is not complete data-loss prevention: it cannot prove that content is safe to share or detect every secret. Continue selecting and reviewing context carefully; never treat a passed scan as permission to transmit unrelated private data.

The runner bounds stages, attempts, inactivity and output, plus any explicit hard time caps; it does not cap provider charges. Required peer stages use three successful calls in plan mode or two in review mode; a configured author adds two or one, respectively. The optional final-revision check adds at most one successful peer call within the same allowance. An outage before required stages finish leaves a partial run, never simulated consensus. A limit-blocked exchange can still deliver a [provisional plan](#planning-when-usage-limits-block-the-exchange). State what was reviewed, what remains unresolved, and whether the final plan changed after verification.
