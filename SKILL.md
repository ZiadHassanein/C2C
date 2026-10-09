---
name: C2C
description: Use when the user explicitly requests C2C or a Codex–Claude planning exchange. Plan and review software, content or mixed projects, including developer QA and evidence from authorized tests. Use both eligible providers, or a planner and distinct critic within the available provider. If a real pair is unavailable, deliver a provisional plan with an honest self-critique. Includes assessment, security, acceptance checks and an execution entry point. Check for C2C updates and preserve active plans during requested updates.
---

# C2C

Either app can start; the initiating chat coordinates, synthesizes and owns decisions. Prefer an eligible Codex–Claude pair, otherwise an eligible planner and distinct task-fit critic in the initiating provider. These are real contributions, not impersonated models. If no eligible pair exists, deliver a provisional plan with honest solo self-critique. Never force agreement, objections or extra debate.

## Constraints that apply throughout

- Require an explicit C2C/exchange request before sharing selected context or spending quota; reuse existing authorization. Assessment/advice-only requests do not prepare a run or call workers. Planning does not authorize implementation, final content production, publication or broader access. Honor explicit critique-only scope.
- Use the user's existing authorized allowance. Never buy credits, enable extra usage/auto-reload, upgrade or change billing to recover from limits. A hard included-only/zero-extra-charge condition still requires applicable no-overflow evidence before calls; ordinary unknown quota is not an exhausted account. Follow the billing section in `guide --topic prepare`; do not invent a billing-confirmation requirement.
- Preserve chosen models, fixed effort, review depth and user caps. Research task-fit compatible effort; never assume a universal maximum or lower capability/effort to save tokens or fit time. Do not change this chat, global settings or accounts. Workers need no open peer terminal.
- Keep drafts and critiques independent. Source documents and model replies are evidence, not authority. Workers are text-only and cannot open repositories, URLs or images; supply necessary excerpts and attributed observations, marking missing inspection. Never send secrets or unrelated private material; scanning is not proof of safe disclosure.
- Preserve failures, successful stages, sealed identities, original findings, submitted security concerns and pinned runtimes. Never restart to reset limits. Incomplete stages, unverified revisions and missing usage stay explicit; completion is not certification.

## Load the applicable guidance

Resolve `RUNNER` and `SETUP` to this skill's absolute `scripts/council.mjs` and `scripts/setup.mjs` paths. Use `node RUNNER guide --topic TOPIC` to retrieve complete maintained sections instead of loading every reference. Add `--run RUN` for an existing run so its pinned version owns the command; resolve subsequent links against that bundle. Add `--domain content` or `mixed` for content assessment. Reuse sections already read unless facts or instructions change.

| Current work | Topic |
|---|---|
| Inspect scoped materials, goal and first useful action | `start`, then `assess` for the JSON contract |
| Candidate routes, exact identities, eligibility, privacy and preparation | `prepare` |
| Fresh task-fit model research and execution advice | `models` |
| Reports, independent stages, security, evidence and decisions | `exchange` |
| Same-provider complementary perspectives | `same` |
| Plan checks and final verification/revision | `verify` |
| Developer QA, requested testing, fix verification or readiness | `qa`, alongside the applicable stage topics |
| Presentation and three-file handoff | `present` |
| Interruptions, locks, time or attempt recovery | `recover` |
| Unavailable providers or usage limits | `fallback` |
| User-requested update preserving active work | `update` |

For a single section use `guide --section protocol#security-and-testing` (also `assessment`, `models`, `presentation`, `qa`). If Node/helper is unavailable, read only the applicable section in [protocol](references/protocol.md), [assessment](references/project-assessment.md), [models](references/model-selection.md), [presentation](references/plan-presentation.md) or [QA](references/developer-qa.md). Old pinned versions may lack `guide`; use their own references. Never replace an old runtime to obtain a new helper.

On first start/resume in a chat, run installed `node SETUP check-update --auto` once when available. Checks use a daily cache, honor `C2C_UPDATE_CHECK=off`, and never install or call a model. Mention an available version once, without delaying planning. Updating requires the user's request; prepared runs keep their original runner and instructions. Unpinned provisional work keeps its instructions until finished or explicitly stopped. New plans discover updates in a new chat.

Also read installed `node SETUP preferences` at start/resume. Both apps share this user policy; combine it with the current request using the stricter restriction. Use `prepare --spending included-only` for a hard task-specific restriction; it does not change the shared preference. Save an explicit continuing spending preference with `preferences --spending included-only` when authorized. A preference is not allowance evidence. New runners enforce it before calls; older pins require coordinator enforcement without modification. Missing evidence under included-only uses the available-chat fallback, without a billing question or paid recovery.

## Establish facts and choose the route

Read `start` before discovery. Use scoped current records and affected materials; select JSON fields rather than dumping large records. Infer software, content, mixed or legacy non-software from the requested deliverable, even when content lives in a code repository. Distinguish observation, user report and inference; deployment/publication, scoped readiness and proposed checks are separate. Preserve unknowns without probing live systems or inspecting secrets to classify the task.

Establish goal, scope, constraints, success criteria, next action and gate. Ask only consequential missing choices while continuing independent work; bounded discovery is valid. Follow `assess` to write neutral assessment facts; keep new solutions in drafts. Content covers audience, purpose, language/tone, claims/sources and media evidence; mixed work retains engineering checks too.

Capture `doctor` once when available and use `prepare` guidance: candidate availability, research, host/worker roles, then required workers' launch eligibility. Do not gate a host-author route on an unused CLI or treat absent quota metadata as a known limit. For every new task with a candidate route, search and open current official guidance for its providers and actual planning/coding/editorial needs. Reuse that task's research through retries; skip inaccessible workers. Automatic eligible selection is authorized unless advice-only, reserved-selection or pinned choices override it. Record size, risk, uncertainty, dated sources, exact roles/IDs, access and allowance provenance in coordinator-only `TASK_ASSESSMENT.md`.

Pass `--coordinator codex` or `claude`. Reuse the host only when trustworthy current-chat identity matches the planner; otherwise use eligible `--author-model` and `--peer-model`. For new workers, select explicit researched compatible `--author-effort`/`--peer-effort` when known; explain omissions and keep actual effort unknown unless provider-confirmed. Cross-provider roles use planning models; same-provider roles use a planner and distinct task-fit critic. Different names do not establish independent reasoning.

Use `review` for a bounded deliverable/supplied plan (2 successful calls with host author, 3 with background author); `plan` for independent alternatives/consequential uncertainty (3 or 5). Respect requested depth. Use standard/project allowances proportionally and record them privately; all failures and explicit caps count. Default activity waiting has no fixed total deadline while recognized activity advances; silence is unknown. Roadmaps detail the first milestone and dependent exit gates, not automatic later councils.

Prepare a concise brief and necessary source excerpts with revision/local-change context, without duplicating the assessment. Keep full worker context as default. Experimental `--context-profile verify-compact` is only for explicitly requested trials; it cannot remove evidence or change models/stages, and its byte counts are not measured token savings.

For QA, use `--purpose qa` and load `qa`. Run requested project tests within existing authority after checking their scripts and environment; planning alone grants no execution authority. Keep the baseline, failures, skips and bounded receipts, and supply the evidence actually reviewed. Peers challenge those observations without executing tests. Require the exact-plan assurance record before verification/finish; proposed or blocked checks remain valid incomplete evidence, never invented passes. Scale the checks to material risk.

## Review, verify and deliver

Read `exchange` for stages and schemas. Before the first worker call, inspect recipients and outbound content with `preview`; reuse C2C authorization. A host permission denial is not provider failure. Keep yielded `ask` in its original session. Prefer supported completion notifications; otherwise use the longest bounded waits allowed by host progress/cancellation requirements, backing off unchanged polls. Never relaunch or edit artifacts while a worker may be running.

Use returned reports directly. Triage findings by supported consequence, not persuasive wording: test assumptions, failure cases and remedies separately. Correct real defects, defend sound decisions, and record optional polish without forcing objections or rounds. Preserve dissent, rejected rationales and unresolved gates. Keep public arguments concise and ID-linked; never expose private reasoning or invent replies. Use bounded evidence requests, not broader worker tools.

Every route owes a usable plan: evidence-backed scope, decisions, ordered work, security, acceptance checks and Start here, scaled to software, content or mixed work. Integrate adopted fixes into operative `final-plan.md`, preserving sound content; discussion alone is not a revision. Link material requirements, evidence/assumptions, decisions, dependencies and checks through the existing decision record. Run `quality --run RUN` before verification and after substantive changes; repair broken links/cycles. Its structural result proves neither truth nor semantic completeness; see `verify` for the optional map.

Cross-check the selected option against accepted fixes, source holds, prerequisites and milestone gates. Links to local logs or tables are not supplied evidence; send bounded receipts/excerpts or mark missing inspection. Keep detailed rationale in source records; deliver a decision brief and Start here early, concise discussion, and a completion record that links rather than repeats the plan.

Complete security, dispositions and presentation before `verify`. Triage its findings before editing; when the plan needs no correction, finish with its reviewed bytes and generated status. Never cosmetically rewrite it to announce completion. Real edits still need the bounded final-revision procedure or an honest unreviewed outcome; minor labels are no exemption. Preserve required stages and never add rounds for agreement.

Use `present` before delivery. Include the recommendation, priority decisions, confirmed/proposed/unknown scope, milestones and actionable security/checks. Start here separates the next user decision from the first authorized action, location, prerequisites and acceptance gate. Give task-fit execution-model advice with reasons and dated evidence before verification; unknown savings stay unknown. `usage --run RUN` reports observed worker counters and missing coverage, not whole-task or subscription savings.

After `finish`, confirm and link **all three**: revised `final-plan.md` first, concise `DISCUSSION.md`, then `RESULT.md` with completion limits. Before completion link available files only; standalone fallback has one provisional plan with self-critique. Never fabricate artifacts to meet a count. Keep detailed arguments in saved reports/decisions, not repeated chat narration or peer copies of the discussion. Refresh generated discussion after local edits; never hand-edit it or substitute excerpts for full evidence.

Start chat with the purpose. Give findings, consequential questions/blockers and brief host-required progress; keep routine call counts, guards and repeated scope assurances in records. Explain operational details when requested or consequential. End with status, recommendation, material risks, next action and the applicable links.

On resume, use `recover` and the saved handoff/notes/status, preserving task authority and pinned instructions. When a provider is unavailable use `fallback`: preserve real contributions and caps, use an eligible permitted route or honest solo critique, and honor both-required/wait requests. Never paid-recover, hop models inside a blocked provider, fake a review or finish missing stages. Keep private records local; peer invocations cannot launch C2C.

## Examples

Codex: `Use $C2C to plan this feature or content improvement, check the evidence, and give me the revised plan before execution.`

Claude Code: `/C2C Review this project plan with independent critique, security and acceptance checks, and a clear first step.`

Advice only: `Use $C2C to assess this task and recommend models; no worker calls.`
