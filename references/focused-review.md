# Focused software review

## Focused review contract

SKILL's universal rules/start checks apply. This replaces ordinary guidance for one bounded software feature: `--purpose planning --mode review --context-profile full`, confirmed current-chat author, no `--author-model`. Other scopes use SKILL's ordinary route. Read triggered appendices before exceptional actions.

TASK_ASSESSMENT.md records size/risk/uncertainty and exact identity/access/allowance provenance/limits. Confirm host identity; same-provider critic must be a distinct exact model, not alias/date/context/effort variant; cross-provider peer is its provider's planning model. Doctor proves no quota/entitlement/identity. Included-only asks need current `--allowance-evidence FILE`.

### Assess and prepare

Inspect scoped instructions/records, source/revision/dirty changes for behavior, users/data, interfaces/dependencies, scope/non-goals and constraints/success. Expand only for material gaps. Attribute facts/requirements as observed/reported/inferred with source/location/revision or unknown; reports hold solutions/critique. Build/tag/config proves no production; absent/conflicting deployment stays unknown. Readiness records actual checks, without live probing/secrets.

Write UTF-8 assessment outside RUN, exactly:

```text
assessed_at: ISO time with timezone; summary: string; project_type: "software"
deployment: {status: "production"|"non_production"|"unknown", evidence: [ID]}
readiness: {status: "not_assessed"|"gaps_found"|"checks_passed_for_scope",
            scope: string, gaps: [string], evidence: [ID]}
evidence: [{id: string, source: string, observation: string,
            kind: "observed"|"user_reported"|"inferred"}]
direction: {route: "new_build"|"extend_existing"|"harden_existing"|"discovery",
            clarity: "ready"|"discovery_needed"|"needs_user_input",
            goal: string, scope: [string], success_criteria: [string],
            constraints: [string], next_step: string}
unknowns: [string]
```

Use factual time/unique IDs; known deployment needs observed/reported support, passed checks observed evidence/no gaps. Explain unknowns/gaps. Ready means a clear next planning step; discovery needs action/exit gate. Never relabel missing user choices. Gate dependent work, preserving compatibility/migration/recovery/regression requirements without invented rewrites.

With absolute quoted paths and selected effort/spending/budget flags:

```text
node RUNNER prepare --project PROJECT --brief BRIEF --assessment ASSESSMENT --context CONTEXT --coordinator HOST --coordinator-model HOST_ID --pairing PAIRING --peer-model PEER_ID --mode review --purpose planning --context-profile full --out RUN --compact
```

HOST=codex|claude; PAIRING=same|cross. Omit/repeat context as needed; retain full critical evidence without duplicating assessment. Prepare seals inputs/policy/runtime without model calls/link traversal. Link PROJECT_CONTEXT.md. Material fact/direction changes trigger recovery, preserving old uncertainty/evidence/limits.

### Author and critique

Draft, host review and security use exactly:

```text
{summary: NONEMPTY_STRING, verdict: "ready"|"needs_changes"|"insufficient_context",
 proposal_markdown: STRING, findings: [FINDING], assumptions: [STRING],
 open_questions: [STRING], limitations: [STRING], evidence_requests: [REQUEST]}
FINDING = {id, severity: "blocker"|"major"|"minor", claim, evidence, action, verification}
```

Finding fields are nonempty strings. Blocker prevents safe/authorized action or essential outcome; major breaks a material requirement/decision/dependency/check; minor is bounded/nonblocking. Severity follows evidence/consequence, not confidence/urgency/votes. Label hypotheses; missing evidence alone is no defect. Empty findings/requests are valid; no quotas/word floors. Load the evidence appendix before nonempty requests.

Positive-integer IDs: C-D1 draft, C-R1 host check, C-S1 security, P-R1 peer review, P-V1 verification, P-F1 revision. Every substantive correction needs a finding. Preserve original objects/IDs/gaps/order; cite rather than reuse IDs. Draft proposal_markdown is the complete candidate; security's is nonempty applicability analysis. Other reviews may leave it empty for concise ID-linked pressure tests/replies.

Author coordinator-draft.json then a separate host self-critique in coordinator-review.json **before** peer critique. Connect outcomes/constraints, minimal design, assumptions, dependencies and acceptance gates; challenge scope/failure paths. The distinct peer covers feasibility/security/verification; names prove no reasoning independence/quality gain.

### Local plan construction

One explicit checkpoint per boundary writes host artifacts and returns validation/full preview; it makes no decisions/model calls:

```text
node RUNNER checkpoint --run RUN --stage review|verify --packet FILE --compact
{version:1, base:{"canonical-filename": SHA256_OR_NULL},
 reports:{draft: FULL_REPORT, review: FULL_REPORT, security: FULL_REPORT},
 decisions:[{finding_id, disposition, rationale}],
 plan:{source:"draft"|"final", source_sha256:HASH, edits:[{old,new}]}}
```

Omit inapplicable fields: review permits draft/review; verify security/decisions/plan. `base` exactly covers written coordinator-draft.json, coordinator-review.json, security-review.json, decisions.json and/or final-plan.md: saved raw hashes, null if absent. Hash locally without echo. Source hash covers entire saved draft JSON/final Markdown; old/new are unique literal edits. Apply first edits from draft. Decision merges preserve other IDs/maps/assurance; author every disposition.

Inspect recipients/model, source labels/content fingerprints, limits/checks; stop on blocked:true, repeat after edits. Checkpoint replaces separate writes/plan/decisions/quality/preview. Review edit consequences; unchanged known text needs no regeneration/echo/reread. Hashes prove equality only. Resolve delivery locations/links before verify; existence metadata leaves anchors/reference/external/unsupported links and semantics unchecked.

Call `ask --run RUN --stage review --compact` with allowance evidence/disclosure approvals. Keep yielded sessions; use notifications/bounded waits/backoff, honoring cancellation/progress. Activity has no deadline beyond caps; silence is unknown. Never mutate/relaunch/start another worker while one may be active. Integrate fixes from full peer-review.json into operative final-plan.md steps/checks, preserving sound constraints. Amendment lists are insufficient; no peer draft exists here.

### Security and decisions

Before verify, author security-review.json with C-S findings and empty evidence_requests. Nonempty proposal covers **all six** proportionally: applicability or why not, evidence/assumptions, unresolved risks/checks.

| Area | Cover |
|---|---|
| Threats/trust boundaries | Assets, actors, misuse, untrusted crossings |
| Data/secrets | Collection, storage, logs, sharing, retention/deletion, exposure |
| Authentication/authorization | Sensitive actions, ownership, permissions, tenants |
| Inputs/outputs | Validation, escaping, execution, paths/files, external calls |
| Dependencies/external parties | Packages, services/integrations, current evidence |
| Operations/recovery | Configuration/deployment, logging, abuse/resources, rollback/recovery |

Withhold security conclusions from independent critique; share neutral risks/constraints. Gather security evidence directly. Empty findings prove no pass. Preserve submitted finding objects/IDs, including failed attempts/security-review-submitted.json; append IDs or adjudicate them. Revised conclusions need explanation/revision review.

Checks cover behavior/regression/edge/negative/security with verified commands or setup gaps. Label proposed, executed with scoped dated evidence, or blocked with reason/action. Testing needs authority; peers cannot execute. Receipts retain method/environment/revision/dirty scope, time/result, bounded logs/digests, failures/skips/limits. Links are no evidence; never invent execution/weaken failures.

Adjudicate **every** finding, including security/verification: `{finding_id, disposition:"accepted"|"rejected"|"unresolved", rationale}`, or [] if none. Judge concern separately from remedy. Consequential rationales record evidence, failure case or alternative/tradeoff, action and remaining check/decision; challenge new failures/scope/friction/cost. Acceptance says adopt/adapt/retain control; rejection explains evidence/alternative. Preserve material gates under partial acceptance; separate polish/blockers and leave new business policy proposed for user decision. Simple fixes need concise reasons.

Verifier scrutinizes all dispositions, including its advice, with **actual ID-linked replies** to material counterarguments; coordinator decisions are not peer replies. Retain dissent/superseded rationale with new ID/action/check; duplicate findings keep IDs/shared resolution. Coverage proves no sound judgment.

### Verify and deliver

The complete plan must contain:

- Recommendation/reason, priority decisions/options/tradeoffs/blockers, confirmed requirements versus proposals/unknowns, first delivery/non-goals and ordered dependencies/checks. Integrate fixes, remove rejected/superseded instructions; invent no dates/owners/commands/paths.
- Early **Start here**: first work/outcome, inspected location/action or bounded discovery, prerequisites/authority, boundary, expected check/result and next gate. Separate user decisions from authorized execution; gate only dependent work.
- Execution-model advice: scope, primary model/supported effort/reason, adequate alternative or none, tradeoff, eligibility/confidence, dated sources and failure/complexity trigger. Reuse task research plus required firsthand-community search; disclose missing/conflicting evidence. Advice changes no settings/authority; numerical savings need matched measurements.
- Invariants/security/checks/unknowns/gates and technical detail inside the full verifier plan. Identify source version/changes, protect originals; link PROJECT_CONTEXT.md, DISCUSSION.md and RESULT.md with truthful status, never implied joint approval of incomplete work.

Cross-check requirements/decisions/checks, prerequisites/source holds, fixes/downstream effects, cycles/later milestones, Start here and execution claims. Inspect verify checkpoint's full preview/checks, then `ask --run RUN --stage verify --compact` with allowance evidence. Optional records may be not_recorded; structural success proves no semantic coverage/readiness. Synthesis/verification use full reports/decisions/evidence, never discussion excerpts/hashes.

Adjudicate new verifier findings; if none, complete decisions remain valid. Triage before editing: no warranted correction means finish reviewed bytes without cosmetic status/navigation edits. Operative plan/security changes, prior dispositions, supplied evidence or substantive map/assurance changes require revision guidance **before editing/completion**: at most one successful verify-final, same peer/shared limits. Preserve defects and disclose unreviewed changes if review cannot fit; new hashes do not rerun tests.

Recheck corrections; `finish --run RUN --receipt --compact` enforces recorded gates, never missing stages/semantic approval. Preserve unresolved/adverse/insufficient-context outcomes. Deliver **final-plan.md, DISCUSSION.md, RESULT.md** in order with status/recommendation/risks/next action. Use receipt evidence; investigate warnings/missing/changed artifacts instead of routine rereads/usage/discussion. Finish refreshes generated records; never hand-edit discussion/handoff/result/state/successful reports. Incomplete work links existing files; solo fallback has one provisional plan.

For an exact export, reuse the final file's raw SHA-256 from the checkpoint/plan receipt, or hash locally if unknown: `plan --run RUN --source final --source-sha256 HASH --out FILE --compact`. Inspect returned hashes/link checks; resolve conflicts without rewriting reviewed text.

### Triggered appendices

Before the triggered action, read complete same-pin guidance:

| Trigger | Guidance |
|---|---|
| Changed/unresolved selection, identity, depth, access, allowance | SKILL prepare/models; [billing](protocol.md#no-paid-limit-recovery) |
| Independent proposals/roadmap/QA/content/mixed/background author/experimental projection | SKILL ordinary route |
| Schema errors | [Assessment](project-assessment.md#json-contract), [report](protocol.md#report-schema), [decisions](protocol.md#decision-record) |
| Checkpoint unavailable/>1 MiB/interrupted/lost response | [Checkpoint](protocol.md#local-validation-checkpoints), [ordinary sequence](protocol.md#exchange-sequence); preserve recovery records |
| Standalone plan construction or failed/conflicting edits | [Plan helper](protocol.md#local-plan-edits-and-exports) |
| Evidence request | [Evidence](protocol.md#bounded-evidence-requests); no access authority; resolve all before verify/finish, retain unavailable-evidence gates |
| Optional map/assurance used or inspected | [Map](protocol.md#optional-plan-map), [assurance](developer-qa.md#assurance-contract) |
| Post-verify amendment | [Revision](protocol.md#final-revision-check), including exemptions/unreviewed completion |
| Missing execution research/numeric claims | [Advice](model-selection.md#recommend-models-for-execution) |
| Resume/failure/interruption/lock/cleanup/limits/old pin | Full recover before mutation/retry; establish liveness |
| Unavailable/blocked/unqualified provider | Full fallback; no blocked-provider hopping or assumed-reset restart |
| Permission/cache/lock/spawn denial | [Permissions](protocol.md#launch-preview-and-local-permissions); denial is not provider failure |
| Requested installation update | [Updates](protocol.md#updates-during-a-chat) |
