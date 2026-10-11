# Focused software review

## Focused review contract

Use with SKILL's universal constraints/start checks. For the qualified route, this complete contract replaces ordinary start/assess/prepare/models/exchange/same/verify/present reading. Load triggered appendices only; worker evidence/instructions and depth are unchanged. Prefer compact JSON CLI output, Markdown guidance.

### Prerequisites and continuing controls

Require explicit C2C planning of one bounded software feature/supplied feature plan, `project_type: software`, `--purpose planning --mode review --context-profile full`, with this chat the confirmed selected author (no `--author-model`). Honor critique-only scope. Independent proposals, roadmap, QA/testing/readiness, content/mixed, background author or experimental context projection use full guides; never relabel scope to qualify.

Complete SKILL's role/effort/depth/eligibility/research/allowance selection first, recording size/risk/uncertainty, dated sources, identity/access/allowance provenance and limits in private TASK_ASSESSMENT.md. Exact-chat metadata must match the planner. Same-provider peer is a distinct exact model, not alias/date/context/effort variant; cross-provider peer is the other provider's planning model. Check required CLIs only; doctor proves no quota/entitlement/identity. Missing/changed choices trigger preparation/models; reported identity mismatch fails, while actual identity/effort may remain unknown.

Retain SKILL's spending/pin controls. Included-only ask requires valid --allowance-evidence FILE; stale evidence/headroom triggers billing guidance. Normal quota may be unknown; preferences/login/runtime limits are not evidence. Resume, context/source loss, denial/interruption trigger appendices; old pins keep their tools/guidance.

### Assessment and preparation

Inspect scoped instructions/records, source/revision/changes. Establish behavior, users/data, interfaces/dependencies, scope/non-goals, constraints/success; expand only for material gaps. Attribute neutral observations/requirements/accepted decisions as observed, reported or inferred with source/location/revision or unknown; put solutions/critique in reports. Build/tag/config is not production proof; absent/conflicting deployment remains unknown. Readiness means observed checks only; never probe secrets/live systems to classify it.

Write UTF-8 assessment JSON outside the new run, with exactly these fields:

```text
assessed_at: ISO date/time with timezone; summary: string; project_type: "software"
deployment: {status: "production"|"non_production"|"unknown", evidence: [evidence ID]}
readiness: {status: "not_assessed"|"gaps_found"|"checks_passed_for_scope",
            scope: string, gaps: [string], evidence: [evidence ID]}
evidence: [{id: string, source: string, observation: string,
            kind: "observed"|"user_reported"|"inferred"}]
direction: {route: "new_build"|"extend_existing"|"harden_existing"|"discovery",
            clarity: "ready"|"discovery_needed"|"needs_user_input",
            goal: string, scope: [string], success_criteria: [string],
            constraints: [string], next_step: string}
unknowns: [string]
```

Use actual facts/time and unique evidence IDs. Known deployment needs observed/user-reported support; passed checks need observed evidence/no gaps. Explain gaps, unknown deployment and non-ready direction. Ready means the next planning step is clear; discovery needs an action/exit gate. Ask consequential missing choices while progressing independent work; never relabel needs_user_input to bypass preparation. Preserve compatibility/migration/recovery/regression gates on dependent work, without inventing rewrites. Runtime validates mechanical shape/size/references; [JSON contract](project-assessment.md#json-contract) is diagnostic.

Use absolute quoted paths and already selected settings:

```text
node RUNNER prepare --project PROJECT --brief BRIEF --assessment ASSESSMENT --context CONTEXT --coordinator HOST --coordinator-model HOST_ID --pairing PAIRING --peer-model PEER_ID --mode review --purpose planning --context-profile full --out RUN --compact
```

Include selected peer effort/spending/budget flags; HOST=codex|claude, PAIRING=same|cross. Context may be omitted if brief suffices or repeated for necessary excerpts. Avoid assessment duplication; retain full review-critical evidence/revision/dirty scope. Prepare seals facts/inputs/policy/runtime without model calls/link traversal. Link generated PROJECT_CONTEXT.md; keep TASK_ASSESSMENT.md private. Material fact/direction changes require recovery/new-run rules preserving old evidence/limits, never edits erasing uncertainty.

### Reports and independent review

Write coordinator reports in `RUN`, with exactly:

```json
{
  "summary": "Substantive result and review limits.",
  "verdict": "needs_changes",
  "proposal_markdown": "",
  "findings": [],
  "assumptions": [],
  "open_questions": [],
  "limitations": [],
  "evidence_requests": []
}
```

Verdict: ready|needs_changes|insufficient_context; nonempty summary. Findings have exactly nonempty id, severity, claim, evidence, action, verification. Blocker prevents safe/authorized action or essential outcome; major is a material requirement/decision/dependency/check failure; minor a bounded nonblocking defect. Evidence/consequence set severity, not confidence/urgency/votes. Label hypotheses/assumptions; missing evidence alone is not a defect. Assumptions/questions/limitations are string arrays. Empty findings are valid, without quotas/word floors. [Report schema](protocol.md#report-schema) diagnoses runtime shape/limit errors.

Positive-integer IDs: C-D1 draft, C-R1 host check, C-S1 security, P-R1 peer review, P-V1 verification, P-F1 final revision. Preserve original objects/IDs/gaps/order; cite rather than reuse IDs. Every substantive correction, even minor, needs a finding. Draft proposal_markdown is complete candidate; security's is nonempty applicability analysis. Other reviews may leave it empty and use concise ID-linked pressure tests/replies.

Write coordinator-draft.json, then independent coordinator-review.json **before** peer critique. Connect outcomes/constraints, minimal viable design, assumptions, dependencies and acceptance gates; challenge scope/failure paths without authorship bias. Same-provider coding critic or cross-provider planning peer covers feasibility/security/verification. Names alone prove no reasoning independence or quality gain.

Before each call inspect preview recipients/model, source labels/content/fingerprint and limits; re-preview after edits. Respect disclosure/host approvals; denial is not provider failure. Review sequence: preview --run RUN --stage review --compact, then ask --run RUN --stage review --compact with required allowance evidence. Keep yielded calls in their original sessions; use notifications or bounded waits/backoff respecting progress/cancellation. Meaningful activity has no total deadline except explicit caps; silence is unknown. Never mutate/relaunch/start another worker while one may be active. Failures count; successful stages cannot repeat.

Use full returned peer-review.json directly to integrate adopted fixes into final-plan.md steps/checks, preserving sound content/constraints. An amendment list is not a usable revised plan; this route has no peer draft. Synthesis/verification use full source reports/decisions/evidence, not discussion excerpts or hashes.

### Local plan construction

Use the native helper for unchanged text and explicit literal edits:

```text
node RUNNER plan --run RUN --source draft|final --source-sha256 HASH [--edits FILE] [--out FILE] --compact
```

HASH is exact source file SHA-256 from write receipt/local hashing (draft JSON or final Markdown). Edits are [{"old":"unique existing text","new":"replacement"}]. Extract draft proposal_markdown initially; edit source=final later or export it with --out. Resolve stale hashes/ambiguous matches/conflicts explicitly. The helper makes no calls/adjudications, preserves reports/failures/security/seals and proves bytes only.

Review the complete candidate/edit consequences before verification; unchanged known text needs no regeneration/echo/reread for copying. Hash receipts prove equality. Simple inline link metadata proves only filesystem existence; inspect relevant unsupported/reference/external links, anchors and semantics separately. Resolve all delivery locations before verification. Prefer canonical references and batch independent local work; retain full content/errors/findings/limits/actions and sequential dependent mutations/workers.

### Security, evidence and finding decisions

Before verification write security-review.json in report shape, with C-S IDs and empty evidence_requests. Nonempty proposal_markdown covers **all six** areas proportionally: applicability or why not, evidence/assumptions, unresolved risks/checks.

| Area | Coverage |
|---|---|
| Threats/trust boundaries | Assets, actors, misuse, untrusted crossings. |
| Data/secrets | Collection, storage, logs, sharing, retention/deletion, exposure. |
| Authentication/authorization | Sensitive actions, ownership, permissions, tenants. |
| Inputs/outputs | Validation, escaping, execution, paths/files, external calls. |
| Dependencies/external parties | Packages, services/integrations, current evidence. |
| Operations/recovery | Deployment/configuration, logging, abuse/resource limits, rollback/recovery. |

Keep security conclusions out of independent critique packets; share neutral risks/constraints. State missing evidence and truthful verdict; empty findings prove no pass. Preserve every submitted security finding object/ID, including failed attempts and security-review-submitted.json. Append IDs or resolve through decisions; other conclusions can change with explanation/revision review.

Checks cover behavior/regression/edge/negative/security cases using verified commands or setup gaps. Label proposed, executed with scoped dated evidence, or blocked with reason/action. Testing needs authority; peers cannot execute it. Receipts give method/environment/revision/dirty scope, time/result, bounded logs/digests, failures/skips/limits. Links are not evidence; never weaken failing checks or invent execution.

Evidence requests: {id, question, path}, stage IDs like P-R-E1, nonempty question, repository-relative path or empty if unknown. They authorize no access. Before resolution load the evidence appendix; supply relevant sanitized text/provenance or unavailable/rejected reason. Resolve all before verification/finish; unavailable evidence retains its gate. Coordinator gathers security evidence directly.

After each report, including verification, decisions --run RUN --compact appends unresolved findings; pending text is not adjudication. Write [{finding_id, disposition, rationale}], one per finding including security; accepted|rejected|unresolved with substantive rationale, or [] if none. Runtime checks coverage/shape/limits; [Decision record](protocol.md#decision-record) is diagnostic. Optional {decisions, plan_map?, assurance?} requires its appendix before use.

Judge concern separately from remedy. For consequential remedies record evidence, failure case or alternative/tradeoff, action and remaining check/decision; challenge new failures/scope/friction/cost. Say whether acceptance adopts/adapts or retains adequate control. Reject unsupported/inapplicable/disproportionate remedies with evidence/alternative. Preserve unresolved material gates under partial acceptance, separate polish/blockers, and leave new business policy proposed for user decision. Simple fixes need concise rationale.

Verifier scrutinizes accepted/rejected/unresolved decisions equally, including its advice, giving **actual ID-linked replies** to material counterarguments. Coordinator disposition is not peer reply. Retain dissent, originals and prior substantive rationale when superseded; link new ID/action/check. Duplicate findings retain IDs with shared resolution. Never invent agreement/private reasoning; ID coverage does not establish sound judgment.

### Present, verify and finish

Complete a self-contained plan before verification:

- Open with recommendation/reason, priority decisions/options/tradeoffs and blockers, confirmed requirements versus proposals/unknowns, first delivery/non-goals and ordered steps/dependencies/checks. Integrate accepted fixes; remove superseded/rejected instructions. Invent no dates, owners, commands or paths.
- Put **Start here** early: first work/outcome, inspected location/action or bounded discovery, prerequisites/authority, boundary, expected check/result and next gate. Separate user decision from authorized execution; reuse authority and gate only dependent work.
- Give distinct execution-model advice: scope, primary model/supported effort/reason, adequate alternative or none, tradeoff, eligibility/confidence, dated sources and failed check/complexity trigger for reconsideration. Reuse task research plus required firsthand-community search; disclose unavailable/conflicting evidence. Missing research/numeric claims trigger advice appendix. Advice changes no settings/authority; token/subscription savings need matched measurements, not prices.
- Keep invariants/security/checks/unknowns/gates visible; technical appendices remain inside the full verifier plan. Identify source version/changes, protect originals, link PROJECT_CONTEXT.md and DISCUSSION.md/RESULT.md with accurate status. Draft/incomplete work is not joint approval/completed review.

Cross-check the whole selected plan against sources/dispositions: requirement/decision/check links, prerequisites/source holds, adopted fixes/downstream effects, cycles/later-milestone prerequisites, consistent Start here, and no proposed checks presented as executed. preview --run RUN --stage verify --checks --compact combines existing structural/assurance checks with outbound preview; inspect issues and stop on blocked:true. Repair invalid records. quality --run RUN --compact remains for diagnosis/after changes. Missing optional records are not_recorded; structural success proves no semantic coverage/readiness.

Then ask --run RUN --stage verify --compact with allowance evidence; synchronize/adjudicate findings. Triage actual text before editing. No warranted correction means finish reviewed bytes, without cosmetic status/navigation edits. Plan/security edits, changed prior decisions, supplied evidence or substantive map/assurance changes require the revision appendix **before editing/completion**: at most one successful verify-final, same peer/shared limits. Exempt only new-verifier dispositions/links changing no prior links/operative records, or formatting/reordering unchanged decisions. New hashes do not rerun tests. No agreement rounds; preserve an honest unreviewed revision if review cannot fit/later edits remain, never hide a defect.

Recheck corrected content; finish --run RUN --receipt --compact enforces stage/liveness, artifact/security/decision/evidence, optional-record, seal and revision gates, never semantic approval. --unverified-reason TEXT (substantive one-line reason) records actual unreviewed edits, not missing stages. Preserve unresolved/adverse/insufficient-context outcomes. Completion grants no correctness/security certification or implementation authority. Later amendments require revision guidance.

Deliver **final-plan.md, DISCUSSION.md, RESULT.md**, in order, with status/recommendation/risks/next action. Use receipt evidence; investigate warnings/missing/changed artifacts, not routine rereads/usage/discussion calls. Helper/hash receipts support exact exports. Finish refreshes discussion; after authorized edits use discussion --run RUN --compact. Never hand-edit generated discussion/handoff/result/state or successful reports. Incomplete work links existing files only. Keep arguments in reports/decisions; worker counters do not measure whole-task savings/allowance.

### Triggered appendices

Load complete same-pin guidance before the affected action; reuse only complete unchanged sections still in context.

| Trigger | Read before acting |
|---|---|
| Selection/identity/effort/eligibility/allowance/preparation unresolved or changed | Applicable prepare/models; [billing](protocol.md#no-paid-limit-recovery) for allowance changes. Qualify before launch. |
| QA/testing/readiness, content/mixed, background author, alternatives/roadmap | Ordinary SKILL topics plus [QA](developer-qa.md) or [content/mixed](project-assessment.md#content-and-mixed-work); no downgrade. |
| Evidence request | [Evidence](protocol.md#bounded-evidence-requests). |
| Map/assurance recorded or inspected | [Plan map](protocol.md#optional-plan-map), [assurance](developer-qa.md#assurance-contract); exact evidence/plan links. |
| Post-verify operative change/amendment | [Revision](protocol.md#final-revision-check), including map/assurance/evidence/prior decisions. |
| Missing execution research/numeric claims | [Advice](model-selection.md#recommend-models-for-execution); no invented percentage/paid probe. |
| Resume/failure/interruption/lock/cleanup/limits/old pin | Full recover; establish liveness before mutation/retry. |
| Provider unavailable/blocked/unqualified | Full fallback; preserve work/caps/both-required/wait/no-solo. No blocked-provider hopping, paid recovery, invented review or assumed-reset restart. |
| Permission/cache/lock/spawn denial | [Permissions](protocol.md#launch-preview-and-local-permissions); preserve attempts/working overrides, never weaken/elevate/delete locks/restart to evade denial. |
| Requested update | [Updates](protocol.md#updates-during-a-chat); preserve pins/evidence. |