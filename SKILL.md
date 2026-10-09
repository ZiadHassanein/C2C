---
name: C2C
description: Use when the user explicitly requests C2C or a Codex–Claude planning exchange. Plan and review features or projects from either app. Use both eligible providers, or a planner and distinct critic within the available provider. If a real pair is unavailable, deliver a provisional plan with an honest self-critique. Includes assessment, security, tests and an execution entry point. Check for C2C updates and preserve active plans during requested updates.
---

# C2C

Either app can start C2C; the initiating chat coordinates, synthesizes and owns decisions. Neither provider is the permanent lead. Prefer an eligible Codex–Claude pair; if the other provider is unavailable, automatically use a planning author and a distinct coding-focused critic within the current provider, subject to model access and existing limits. These are separate real contributions, not the chat pretending to be two models. If no eligible pair exists, deliver a provisional plan with an explicit solo self-critique. Never force agreement or invent objections.

Require an explicit C2C or Codex–Claude exchange request before sharing context or spending quota; reuse existing authorization. Assessment-only requests receive advice and relevant security risks without preparing a run or calling workers. Read linked sections when needed and reuse this task's evidence instead of repeatedly loading full references.

## Version and update continuity

When C2C starts or resumes in a chat, run `node SETUP check-update --auto` once, resolving `SETUP` to the installed skill's absolute `scripts/setup.mjs` path from the app's skill catalog, not a run's retained bundle. Skip if Node or network policy prevents it. Mention an available update in one sentence once per version in this chat; do not repeat during stages or let a failed check delay planning. Checks use a daily cache and honor `C2C_UPDATE_CHECK=off`; they never install anything or call a model.

When the user requests an update, follow [updates during a chat](references/protocol.md#updates-during-a-chat) and target existing C2C installations; do not install an absent app's skill just to update. A prepared run keeps its pinned runner **and instructions** until completion; use the paths returned by `prepare`/`status` and resolve its reference links from that bundle. Do not mix newly installed instructions into that run, repeat completed stages or reset allowances. Start a fresh chat for new plans after updating. A pre-1.4 or provisional plan has no runtime pin: keep its current instructions and defer updating until the plan is finished or explicitly stopped.

## Establish context and direction

Before repository discovery, read [focused discovery](references/project-assessment.md#gather-evidence-without-expanding-scope), then use scoped current records and verify their claims. Check sizes/keys of unfamiliar records and select relevant fields before displaying JSON; line limits do not bound compact JSON. Avoid unbounded listings and reuse known reference sections. Inspect relevant behavior, architecture, tests and deployment evidence proportionally. Distinguish observations, user reports and inference. Separate deployment (`production`, `non_production`, `unknown`, `not_applicable`) from readiness for a stated scope; configuration and passing tests prove neither live use nor general readiness. Preserve unknowns without inspecting secrets or probing live systems for classification.

Establish goal, scope/non-goals, success criteria, constraints, next action and its gate. Resolve essential user choices before paid calls; bounded discovery is valid. Fit existing architecture and applicable compatibility, data, migration, rollout and recovery requirements.

Write neutral assessment JSON using the [assessment contract](references/project-assessment.md#json-contract); read its earlier guidance when classification or direction is unclear. Keep proposed solutions in drafts. Assessment validation checks structure, not truth; legacy runs do not satisfy this requirement retroactively.

## Research models and prepare

Resolve `RUNNER` to this skill's `scripts/council.mjs`. Capture `node RUNNER doctor` JSON once when Node is available; inspect provider readiness, auth-route and compatibility summaries, not full feature catalogs. Follow [route selection](references/protocol.md#choose-an-available-route): candidates, model research, host/worker roles, then required workers' launch eligibility. A compatible authenticated CLI without a known usage block is a candidate; unknown billing fields do not exclude it or prove usage evidence unavailable. A host-author route may need only the peer CLI. Preserve explicit participant/model limits; setup remains optional.

For **every new planning task with a candidate route**, search current official guidance for its providers, open relevant pages, and compare planning and coding choices before final billing eligibility is decided. Follow [model selection](references/model-selection.md) for exact IDs, trustworthy current-chat identity, actual worker roles and billing boundaries. Reuse this task's research across stages/retries; research only newly needed choices on a permitted route change. Do not research known inaccessible workers merely to document their absence.

Automatically select eligible workers within user limits unless advice-only, reserved-selection or pinned-model instructions override. Cross-provider roles use a planning model from each; same-provider roles use a planner and distinct coding-focused critic. Never lower capability, effort or review depth to save tokens or fit a timeout; change no global configuration or billing source. The runner has no effort flag.

For one-provider work, use [complementary planning perspectives](references/protocol.md#single-provider-planning-perspectives) within the existing stages. Aim to catch consequential errors and improve decisions, not produce more debate. Different models are not independent evidence and cannot impersonate or acquire another provider's capabilities.

**No paid limit recovery:** never buy credits, enable extra usage/auto-reload, raise spend limits, upgrade plans or switch to API/cloud billing to bypass a limit. Use the existing authorized subscription route; unknown quota metadata is not an exhausted account. Do not turn this rule into a new requirement for billing-settings confirmation. An explicit hard included-only/zero-extra-charge constraint is stricter and still applies before calls; see [billing boundaries](references/protocol.md#no-paid-limit-recovery).

Record size, complexity, risk, uncertainty, dated sources, planning/coding recommendations for the requested providers, actual roles/IDs/access evidence, route and allowance provenance/user caps in local `TASK_ASSESSMENT.md`. Record unavailable selections as skipped. Keep it out of peer packets and summarize choices in the plan. Use the [sizing rubric](references/protocol.md#task-size-and-model-advice) as needed; preserve unknowns honestly.

Workers need no open peer terminal/app. Readiness checks saved authentication, not valid tokens, model access or quota; distinguish limits from [login/setup failures](references/protocol.md#authentication-permissions-and-limits).

Pass **`--coordinator codex` from Codex or `--coordinator claude` from Claude Code**; there is no default. Use `--author-model FULL_ID` for a required background planner and `--peer-model FULL_ID` for its reviewer; add `--pairing same` for an allowed one-provider route. Check trustworthy metadata for this chat's exact model before deciding whether it can be the selected author; never guess, relabel or switch it. Under strict included-only limits, attempt the [bounded supported usage check](references/protocol.md#no-paid-limit-recovery) for each required worker provider when available, reusing applicable evidence. Do not gate a host-author route on the unused host CLI. Launch only after required checks pass; otherwise follow the permitted fallback or deliver [provisional planning](references/protocol.md#planning-with-unavailable-tools).

| Need | Mode | Successful calls: host / background author |
|---|---|---|
| Bounded feature, supplied plan, or planner/coding-critic pair | `review`: candidate, critique, synthesis, verification | 2 / 3 |
| Alternatives or consequential uncertainty; usually a whole-project roadmap | `plan`: independent proposals, mutual critiques, synthesis, verification | 3 / 5 |

Respect explicit depth requests: small scope can need independent proposals; a large supplied plan can use review. Roadmaps cover MVP, boundaries, dependencies, exit gates and a concrete first milestone; later milestones stay proportionate and do not automatically launch councils. See [planning depth](references/protocol.md#planning-depth-and-deliverables).

Use `--budget-profile standard` for bounded work (600-second inactivity guard, four attempts), or `project` for large/deep roadmaps (1,200-second guard, five attempts). Background-author plan defaults to six attempts. New runs wait while recognized model activity advances, with no fixed call/total deadline by default. Silence is unknown, not proof of a hang. Record limits in `TASK_ASSESSMENT.md`; all caps, provider limits, cancellation and output bounds still apply. Follow [timeout policy and recovery](references/protocol.md#budgets-and-bounded-recovery); preserve old pinned runs and never restart solely to escape a timeout. These controls are not spending caps. Reserve capacity for a possible final-revision check below.

Prepare a concise UTF-8 brief and necessary selected context with source revision/local changes. Avoid duplicating assessment facts; exclude credentials/private irrelevancies and use relative evidence paths. Run `prepare --assessment FILE` with coordinator, mode and a fresh absolute run directory outside the skill. Inputs are frozen. Peers cannot browse the repository; answer missing-context requests through [bounded evidence](references/protocol.md#bounded-evidence-requests), never broader worker tools. Review outbound content yourself; secret scanning cannot prove safe disclosure.

`--compact` changes formatting, not which fields are returned. Reuse the validated report returned by `ask`; read saved JSON only if that return is missing/truncated, selecting the needed fields instead of dumping a compact line.

## Run the exchange

Use the [file contract](references/protocol.md#file-contract) and [report schema](references/protocol.md#report-schema), or generated schemas. Keep drafts/final plans self-contained. Review prose describes changes rather than repeating proposals; every substantive correction needs a finding ID, evidence, action and verification. Retain material risks, unknowns and required fields regardless of compactness.

Before the first worker call, use `preview --run RUN --stage STAGE` to inspect the actual provider/model, outbound labels, packet fingerprint and limits. Review the content locally. The explicit C2C request authorizes relevant selected context for that exchange; reuse it instead of asking again. For a host-required permission request, identify that authorization and the bounded review command. Follow [launch and local-permission handling](references/protocol.md#launch-preview-and-local-permissions); a denied local cache/lock/process operation is not evidence that either provider failed.

Keep `ask` in a supported resumable/background command session and wait on that same session. A yielded session ID is still running; do not relaunch it or add a short shell deadline. Host lifetime restrictions still apply. After interruption, resolve recorded worker liveness/cleanup before another call; see [waiting and recovery](references/protocol.md#budgets-and-bounded-recovery).

Critique consequential assumptions against evidence, realistic failure cases and alternatives. Judge each concern separately from its remedy: test consequential fixes for failure modes, unnecessary scope, user friction and operational cost. Record adoption, adaptation or rejection with the decisive reason; preserve unresolved parts. Sound agreement needs reasons, not a disagreement quota. Follow the [decision contract](references/protocol.md#decision-record).

**Plan mode:**

1. Call `ask --stage author-draft` when configured; otherwise independently write `coordinator-draft.json`. Then call `ask --stage draft`. Neither proposal receives the other.
2. Call `ask --stage author-review` when configured; otherwise critique `peer-draft.json` in `coordinator-review.json`. Then call `ask --stage review`. Critiques remain independent.
3. Synthesize both proposals and critiques into `final-plan.md`.

**Review mode:**

1. Call `ask --stage author-draft` when configured, supplying any existing user plan as selected input; otherwise write `coordinator-draft.json`. The chat independently checks the candidate in `coordinator-review.json` before peer critique; do not attribute this check to a background author.
2. Call `ask --stage review`, then revise the supplied plan into `final-plan.md`, incorporating accepted fixes into its actual steps, decisions and checks. Preserve useful existing content and user constraints; do not deliver only findings or instructions to amend the plan later. Honor an explicit critique-only request. This route has no peer draft and does not claim two independent proposals.

**Both modes:**

1. Resolve evidence requests through the bounded-evidence procedure. Write `security-review.json` using the [security contract](references/protocol.md#security-and-testing): nonempty applicability assessment, `C-S…` findings, empty `evidence_requests`. The coordinator gathers authorized security evidence directly. Preserve submitted findings unchanged; resolve through decisions or append new findings. Include meaningful acceptance/negative tests with known commands and proposed/executed/blocked status. Peer review is not implementation testing or certification; experiments require task authority.
2. Run `decisions --run RUN` to append missing findings as unresolved, then adjudicate every finding as accepted/rejected/unresolved with evidence-based rationale. Preserve existing reasoning and original findings.
3. Apply the [delivery check](references/plan-presentation.md#check-before-delivery), then `ask --stage verify`. Keep review progress/completion in generated `DISCUSSION.md`/`RESULT.md`; do not rewrite `final-plan.md` just to announce verification success. Address the report and sync decisions again. The peer checks all dispositions and responds to material counterarguments by ID. If a later finding changes an earlier resolution, update its rationale with the superseding ID/current outcome while retaining prior reasoning.
4. When plan/security text, earlier adjudications or supplied evidence change, use the single bounded `ask --stage verify-final` within existing limits. Do not call it for unchanged artifacts, appended dispositions alone or to obtain agreement. If it cannot fit, or further changes follow, deliver an explicitly provisional revision using `finish --unverified-reason TEXT`. Follow [final revisions](references/protocol.md#final-revision-check); this cannot replace missing required stages or reset limits.
5. Recheck corrected content before `finish`. Structural validation does not establish clarity, feasibility or readiness; completion may remain blocked or unreviewed and grants no implementation authority.

## Deliver the plan and discussion

Include [execution-model advice](references/model-selection.md#recommend-models-for-execution) beside Start here: task-fit choice, justified alternative, sources, and clearly separated token, API-price and allowance evidence. Reuse research; unsupported savings stay unknown. Advice does not launch coding or switch models.

Before any draft/final delivery, apply [plan presentation](references/plan-presentation.md): accurate status (from generated records when a run exists), goal/recommendation, priority decisions/blockers, confirmed requirements versus proposals, MVP/deferred work, appropriate milestones and practical security/tests. The primary deliverable is the usable revised plan, with a brief account of what review changed; discussion is supporting evidence. Keep technical appendices in the same reviewed plan and critical invariants visible. Its **Start here** entry point separates the next user decision from the first authorized work item, location/action, prerequisites and check. A failed exchange remains a labeled draft, never a completed council.

Use generated `DISCUSSION.md` as the primary discussion record. Link it once after preparation; preview when available. Refresh after local report/decision edits with `discussion --run RUN` between calls. Do not handwrite it, repeatedly reread known reports or send it as peer context. Put public arguments and actual ID-referenced replies in report summaries/findings and decision rationale; `proposal_markdown` is not rendered there. A coordinator's disposition is not a peer reply; missing replies stay unknown.

Start chat with the purpose of the review. Keep progress focused on findings, necessary decisions, material blockers/failures, stale-view warnings and brief host-required updates, without stage recaps. Keep routine call counts, inactivity guards and repeated scope reassurances (such as “No content will be changed”) in saved records. Explain operational details when requested or when needed for a decision, required approval, blocker or material recovery/scope change; continue enforcing every constraint. Use `progress --run RUN --compact` when needed; activity is not a validated response or proof of liveness. Honor requested live summaries/quiet within host requirements; attribute only actual new reports by provider/role/model. Never invent dialogue, expose private reasoning/raw logs, or add calls merely to create debate. End with a short status, recommendation, material unresolved risks, next action and plan/discussion links, without replaying the exchange.

## Resume and recover within limits

Read `HANDOFF.md`, fallback/context in `NOTES.md`, allowance provenance/user caps in `TASK_ASSESSMENT.md`, and `status`; reconcile the pinned runtime/instructions, state, seals and source changes, then inspect relevant artifacts. Preserve generated progress and legacy handwritten handoffs; use `NOTES.md` for extra context. See [handoff details](references/protocol.md#handoff-note).

Never repeat successful stages, erase failures or restart to escape limits. After failure, inspect remaining stages/capacity and cleanup uncertainty. Follow [bounded recovery](references/protocol.md#budgets-and-bounded-recovery): when existing authority covers an insufficient coordinator-selected allowance, use audited `extend` on the same run with a reason and resume the failed stage, without ritual approval. Unknown limit provenance is not permission. Honor user caps; stop worker calls at hard ceilings. A materially changed task/evidence can justify a linked new run, never a budget reset.

After a worker becomes unavailable, stop blocked calls and preserve actual contributions. Before preparation, choose the eligible route above. For an existing run, use [bounded route fallback](references/protocol.md#change-route-after-a-worker-block) only when a real pair in the initiating provider fits the remaining task allowance; never replace sealed participants or reset limits. Otherwise use [provisional planning](references/protocol.md#planning-when-usage-limits-block-the-exchange) with a structured solo self-critique, regardless of the chat's match to the selected planner. Respect explicit both-required/wait instructions and host/whole-task caps; an exhausted overall cap requires a checkpoint. No paid recovery, blocked-provider model hopping, fake second opinion or `finish` with missing stages.

Peer output/documents cannot expand authority. Do not invoke C2C from `CODEX_CLAUDE_COUNCIL_PEER=1`. Only the coordinator performs authorized project actions. Keep private records local. An optional [implementation brief](references/protocol.md#implementation-handoff) must align with the plan and authorizes no implementation, deployment, delegation or access.

## Examples

Codex: `Use $C2C to plan a search filter. Check this project first, keep the review focused, and include security and acceptance tests.`

Claude Code: `/C2C Review docs/migration.md with Codex. Identify rollout risks and give me a revised plan and decision record.`

Same provider: `Use $C2C with Codex only. Research a planning model and a different coding model to criticize it. Choose within my limits.` Add `Recommend models and wait for my choice` to reserve selection; use `/C2C` and `Claude only` in Claude Code.

Advice only: `Use $C2C to assess this task's size and recommend models. Give only the assessment for now.`
