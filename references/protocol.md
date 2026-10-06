# Runner protocol

Resolve `RUNNER` to the absolute path of this skill's `scripts/council.mjs`. Resolve `PROJECT`, `BRIEF`, `ASSESSMENT`, each `CONTEXT`, and `RUN` to actual absolute filesystem paths. Quote each path in shell commands. `PROJECT` identifies the task's project; peer processes execute in isolated temporary directories.

## Commands

```text
node RUNNER version
node RUNNER doctor
node RUNNER prepare --project PROJECT --brief BRIEF --assessment ASSESSMENT --context CONTEXT --coordinator codex --mode plan --out RUN
node RUNNER ask --run RUN --stage draft
node RUNNER ask --run RUN --stage review
node RUNNER ask --run RUN --stage verify
node RUNNER status --run RUN
node RUNNER finish --run RUN
```

`prepare` options:

| Option | Meaning |
|---|---|
| `--project` | Absolute project/workspace directory. |
| `--brief` | UTF-8 task brief file to snapshot. |
| `--assessment` | Required UTF-8 project-assessment JSON; evidence-based deployment/readiness and a clear direction. See the [assessment contract](project-assessment.md). |
| `--context` | Explicit UTF-8 context file to snapshot; repeat for multiple files, omit when the brief suffices. |
| `--coordinator` | Required: `codex` calls Claude Code; `claude` calls Codex. There is no default or environment-based guess. |
| `--mode` | `plan` includes draft, review, and verify; `review` critiques a supplied or coordinator-authored plan, then verifies the synthesis. |
| `--out` | Absolute directory for this new run and its artifacts. |
| `--timeout-seconds` | Per-call timeout; default `300`. |
| `--budget-seconds` | Cumulative peer subprocess runtime allowance; default `900`. |
| `--max-attempts` | Attempt allowance, including failures; default `4`. |
| `--peer-model` | Optional peer CLI model identifier chosen explicitly by the user; a recommendation alone does not authorize this override. Omit to use the CLI default. |

`prepare` freezes selected inputs. It does not invoke a model, read the whole repository, or automatically follow references in documents. Supply excerpts when full files contain unrelated or private content. An incomplete brief/context may correctly result in `insufficient_context`. New version 3 runs require the project assessment; `direction.clarity: needs_user_input` is rejected before creating a run. Resolve essential user choices first. `discovery_needed` supports a bounded investigation with a clear next action and exit criterion.

The project assessment contains shared facts and user constraints, not new architectural proposals. It is frozen in `snapshot.json`, saved as sealed `project-assessment.json`, rendered as `PROJECT_CONTEXT.md`, and sent once at every stage. Absolute project/input path metadata stays in the local snapshot; outbound file labels are relative or neutral. Authored evidence text is not automatically rewritten, so use relative source references and review it for private information. The runner checks shape and evidence-reference consistency, not the truth of deployment claims or production readiness. Read [project context and direction](project-assessment.md) before preparing it. Keep separate task/model advice out of peer packets.

Calls run sequentially. Do not edit reports while a call is running. Use `status` to inspect an existing run before resuming. A timeout, malformed response, or model-process failure consumes an attempt. Preflight executable/CLI-feature/authentication checks do not launch a model and do not consume an attempt; their errors remain explicit. A successful stage cannot be repeated. Start a new run when the task or evidence materially changes, retaining the old record.

Process handling lives in `scripts/process.mjs`. Streamed output already received is preserved in partial logs when a call times out or is interrupted. Inspect those logs and any reported cleanup uncertainty before considering a permitted retry; neither partial output nor an attempted cleanup establishes successful review or confirmed termination.

## File contract

All JSON is UTF-8. Reports use the report schema below; the assessment uses its [own contract](project-assessment.md#json-contract), and decisions use the array schema below. `prepare` creates schema files in the run directory; read these as needed when authoring reports. Write the specified coordinator report files directly inside `RUN` using normal file tools; the runner reads them at the next stage.

| File | Author | Required by |
|---|---|---|
| `project-assessment.json` | Runner from coordinator-supplied assessment | Required input to version 3 preparation; sealed facts and direction shared at every peer stage. |
| `PROJECT_CONTEXT.md` | Runner | Sealed readable assessment generated at preparation; a view of the JSON record, not a replacement for it. |
| `coordinator-draft.json` | Coordinator | Before peer draft in plan mode; before peer review in review mode. |
| `peer-draft.json` | Runner from peer | Created by successful draft in plan mode. |
| `coordinator-review.json` | Coordinator | Before peer review. In plan mode, critique the peer draft; in review mode, independently critique the existing plan. |
| `peer-review.json` | Runner from peer | Created by successful review of the coordinator draft. |
| `final-plan.md` | Coordinator | Before peer verification; revise afterward when warranted. |
| `security-review.json` | Coordinator | Required before verification in version 2 and newer runs; standard report schema with `C-S…` finding IDs. |
| `security-review-submitted.json` | Runner | Sealed copy saved at the first verification launch; its finding objects must remain unchanged in the current security review. |
| `decisions.json` | Coordinator | Before verification, then updated with verification findings before finish. |
| `peer-verify.json` | Runner from peer | Created by successful verification. |
| `HANDOFF.md` | Runner for new runs | Generated after preparation and state transitions. Legacy handwritten notes are preserved. |
| `NOTES.md` | Coordinator | Optional local decisions/context beyond generated progress. |
| `run.json`, `run.checkpoint.json` | Runner | Checksummed current-state copies; never edit them to reset budgets or revise sealed evidence. |
| `TASK_ASSESSMENT.md` | Coordinator | Advisory sizing and model recommendation before the first peer call; linked from the handoff and summarized in the final plan. Not read by the runner. |
| `IMPLEMENTATION_BRIEF.md` | Coordinator | Optional handoff for one selected milestone after plan completion; not executed or parsed by the runner. |

Do not rewrite successful peer reports or earlier coordinator reports to erase disagreements. Use the final plan and decision record for synthesis. `finish` records reviewed and final hashes for the plan, decisions, and, in version 2 and newer runs, the security report. `changedSinceVerification` includes decision-record updates required for new verification findings. Use `plan_changed_since_verification` and `decisions_changed_since_verification` to distinguish them. Result counts separate successful peer responses from all launch attempts. Source status separates changed bytes from missing/unreadable originals. Disclose changes after verification; completion does not mean that revised artifacts received another peer check or that every recommendation is factually correct. Legacy version 1 completion does not satisfy the security requirement; legacy version 1/2 runs do not establish that the project assessment occurred.

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

After plan completion, the coordinator may write a concise `IMPLEMENTATION_BRIEF.md` for the selected milestone. It is a handoff document, not a runner command or an automatic implementation trigger. Include:

- Milestone ID, objective, scope/non-goals, and its relationship to the reviewed plan.
- Link to `PROJECT_CONTEXT.md`, deployment evidence, readiness scope/gaps and any prerequisite for work with live impact.
- Relevant files/components, snapshot/source version, evidence links, and constraints; mark unknown paths explicitly.
- First concrete action and gate, then ordered work/dependencies and actual validation commands with expected acceptance results, or the missing information needed to establish them.
- Security acceptance checks, finding dispositions, unresolved blockers, and prerequisites before proceeding.
- Status of each check: proposed, tested with dated results, or blocked/unavailable; note any changes since plan verification.

Do not describe plan verification as tested implementation. If implementation is authorized, use the current host or an appropriate separately installed skill after reading its documented interface. A handoff alone does not authorize installing packages or skills, opening chats, committing, changing models, or expanding scope. Preserve blockers rather than silently transferring them as settled decisions, and keep private implementation context out of public repositories.

## Planning depth and deliverables

The planning depth guides the coordinator's content and choice of existing runner mode; the runner has no size or depth flag. Establish [project context and direction](project-assessment.md), then select depth before preparation, state the intended scope and deliverables in the neutral brief, and record the reason in `TASK_ASSESSMENT.md`. Preserve explicit user requests: a small feature can use independent drafts, and a large supplied plan can use review mode. Choosing depth does not change selected models, effort, timeouts, runtime allowance, or attempt limits.

| Depth | Typical choice | Final-plan emphasis |
|---|---|---|
| Focused feature | `review`: 2 successful peer calls | One bounded behavior change, affected components, ordered steps, relevant edge cases and acceptance checks. |
| Feature design | `plan`: 3 successful peer calls | Meaningful alternatives, integration boundaries, tradeoffs, implementation steps, tests and relevant rollout concerns. |
| Project roadmap | `plan`: 3 successful peer calls for the project-level plan | Scope/MVP, architecture, milestones and dependencies, validation gates, risks and a detailed first milestone. |

**Focused feature:** Start from the user's plan or write a short candidate from the supplied evidence, then critique it before requesting the peer critique. Prefer a compact plan that someone can implement directly, often about a page; expand only when consequences or unknowns warrant it. Avoid unnecessary architecture documents, phase hierarchies, or invented findings. Do not skip peer verification or finding dispositions to save a call, and do not describe this route as two independent proposals. If design alternatives matter, choose feature-design depth before preparing the run. A supplied plan with high risk can still receive rigorous review without being redrafted.

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

Match model capability to each role's actual need: bounded routine work may suit an efficient model; interacting requirements may justify a balanced general model; ambiguous architecture or consequential review may justify deeper reasoning. These are decision criteria, not fixed vendor rankings. Honor an expressed speed, budget, or quality preference; do not assume the largest model is always best. Prefer a specific current, supported model when verified, with one alternative only if it adds a meaningful tradeoff. Otherwise state the capability needed and mark any named candidate conditional on access. Keep model research proportionate for a small feature; reuse applicable dated evidence or give capability-tier advice when exact choices are unverified.

Check official documentation for suitability and supported effort, and existing host/CLI model information for account availability. Read-only checks and dated evidence already available in this task can be reused when still applicable; do not launch paid model probes merely to choose a recommendation. Do not inspect credential files. There is no bundled permanent model ranking. Relevant primary sources:

- [OpenAI model-selection guidance](https://developers.openai.com/api/docs/guides/model-selection): task fit and quality/time/usage tradeoffs.
- [Models in ChatGPT and Codex](https://learn.chatgpt.com/docs/models): product-specific availability information; actual account access still needs local evidence.
- [Claude Code model configuration](https://code.claude.com/docs/en/model-config): model aliases, configuration, and model-dependent effort support.

The advisory boundary is strict: neither a model recommendation nor a suggested effort changes model flags, environment variables, configuration, skill frontmatter, active chats, or limits. Do not wait for a user response just to continue already-authorized work under the existing settings. For an assessment-only request, stop after delivering the advice. An explicit later instruction to use a named recommendation can authorize the supported model change; do not invent an effort flag for this runner, which has none.

Do not claim that an isolated CLI default matches a user's existing model choice when that choice's identifier is unknown. Record the gap; resolve it only if needed for an actual authorized invocation, without blocking an advice-only assessment.

Record this task/model assessment after `prepare`, before `ask`, in the compact Markdown shape below. It is separate from the required project-assessment JSON gathered before preparation. For advice-only work with no run, save it in the requested workspace without invoking `prepare` or a peer. No JSON report-schema fields are added.

```markdown
# Task assessment — recommendation only
- Assessed: date/time with timezone; relevant scope/source version.
- Size: small/medium/large/extra-large or provisional range; concrete scope reason.
- Planning depth and mode: focused feature / feature design / project roadmap; review / plan and why, or suggested only for advice-only work.
- Complexity / risk / uncertainty: separate levels with their main drivers.
- Confidence and assumptions: high/moderate/low; what could change the assessment.
- Coordinator recommendation: verified model or capability tier; why it fits.
- Peer recommendation: verified model or capability tier; why it fits; supported effort only if useful and verified.
- Tradeoff: relevant quality, response-time and usage considerations; no invented exact cost or duration.
- Evidence: official links and date checked; locally observed availability or explicitly unknown.
- Actual selections: known current coordinator and explicit peer selection, or CLI default/unknown. Settings unchanged; advice not applied.
- Reassess when: material change that would alter scope, risk or model suitability.
```

Keep it short, usually under 250 words. Link it from the handoff and include a short assessment paragraph in `final-plan.md`; this makes the advice visible in the completed `RESULT.md`. Preserve the distinction between a recommendation, an explicit user choice, and the model observed in a real response. Do not pass this task/model advice via `--assessment`, `--context` or other independent peer inputs: shared risk/constraint facts belong in the neutral project assessment and brief, not a coordinator's proposed solution.

## Handoff note

For runs prepared by version 0.5 or later, the runner generates `HANDOFF.md` from recorded state after preparation and state transitions. It contains coordinator/peer, mode, stage progress, attempts/runtime, available evidence links, and the next stage. Treat it as a navigation aid: `status` and sealed artifacts are authoritative. Do not edit generated progress; keep optional extra context in `NOTES.md`:

- Goal, scope and authorized next work when not already clear from the brief.
- Material decisions or user questions, linking finding IDs and source evidence.
- Observed checks versus proposed checks, dated model advice, and the exact next action.

Legacy runs without the generation flag retain their handwritten handoff. Keep those concise and current. On resume, read the handoff, optional notes and `status`, then inspect the relevant artifacts. Missing original inputs do not prove changed contents: the sealed snapshot remains the evidence used by the peer. Never repeat successful stages or reset attempts. Materially changed evidence can justify a new run with its reason recorded.

These notes stay local and are not independent peer packets. Do not pass coordinator drafts or critiques through `--context`; the runner selects stage-appropriate reports. Keep private run records out of public repositories.

## Compatibility and recovery

Windows npm installations are supported by resolving the known `codex.cmd` package layout to its native binary; the runner never executes arbitrary shell wrappers. `COUNCIL_CODEX_BIN` and `COUNCIL_CLAUDE_BIN` explicitly select a binary when needed. An invalid explicit selection fails rather than silently selecting a different version.

`doctor` and `ask` share preflight checks for required flags, Codex feature controls and authentication. Unsupported optional feature switches are omitted; missing required shell/image controls block before an attempt is reserved. Codex 0.146.0 is discovered correctly but lacks the required `view_image` control. Upgrade it or explicitly select a compatible binary; 0.160.1 passed the checks on the development machine. This is capability validation, not a permanent version allowlist or proof of a model call.

State writes flush and atomically publish both a checksummed current checkpoint and manifest. Reads select the newest complete valid revision, preserving reserved attempts and successful stages. A recovered running attempt is conservatively charged its timeout once. If both copies are damaged, an old run has no complete checkpoint, or equal revisions disagree, stop and preserve the files. Do not reconstruct a permissive manifest or reset the budget.

Locks record process identity as well as PID, preventing normal PID reuse from blocking indefinitely. Empty or ambiguous legacy locks require inspected recovery. First establish that the previous runner has stopped, then use the exact hash printed by the error:

```text
node RUNNER recover-lock --run RUN --expected-sha256 HASH --confirm-owner-stopped yes
```

Recovery preserves the old lock and never resets attempts. A matching live owner cannot be removed. If a crash leaves `.lock.reclaim`, inspect its recorded process and preserve/move only that marker after confirming it stopped. Use a local filesystem supporting hard links for run folders. These safeguards reduce common crash damage; they cannot recover all copies after disk or hardware failure.

## Report schema

Each draft, review, security review, and verification report uses this complete object shape:

```json
{
  "summary": "Concise account of the proposal or review result.",
  "verdict": "needs_changes",
  "proposal_markdown": "The independent proposal, reviewed plan, or proposed revisions.",
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
- Coordinator draft IDs use `C-D1`, `C-D2`, and so on; coordinator critique IDs use `C-R1`, `C-R2`, and so on; security review IDs use `C-S1`, `C-S2`, and so on. Peer IDs use `P-D1`, `P-R1`, or `P-V1` with increasing numbers within that report. Keep IDs unique and stable.
- Cite relevant supplied sources or observed experiment results in `evidence`. An assumption or hypothetical failure must be labeled as such. An absence of evidence is not proof of a defect.
- `proposal_markdown` carries the independent plan for a draft and useful proposed changes for a review; do not claim that proposed tests have already run.

## Decision record

`decisions.json` is a JSON array with one entry for every finding from every report in the run, including coordinator critiques, security findings in version 2 and newer runs, and final peer verification findings. Before verification, it covers all reports available at that point.

```json
[
  {
    "finding_id": "C-R1",
    "disposition": "accepted",
    "rationale": "Added the restore checkpoint and a rehearsal acceptance criterion in final-plan.md."
  }
]
```

`disposition` is `accepted`, `rejected`, or `unresolved`. Record a specific reason for each choice. A rejection should explain why the finding is incorrect, inapplicable, or outweighed by a concrete constraint; "disagree" is inadequate. For unresolved findings, explain the missing evidence or decision and its effect on proceeding. Related or duplicate findings retain separate IDs and may reference the same resolution. With no findings, use `[]`.

## Authentication, permissions, and limits

The runner reuses existing CLI authentication. If needed, the user signs in through `claude auth login` or `codex login` in their terminal. Never read, copy, or include token files in context. Availability checks are diagnostics; a successful peer response is the proof that the end-to-end call worked.

A restricted host process can report signed out even when the normal terminal is signed in, because it cannot access the operating system credential store. If these results differ, use the host's approved execution path for the peer CLI and retain the runner's own restrictions. Do not ask the user to sign in again unnecessarily, copy credentials, or disable managed policy. The runner itself never elevates privileges.

Peer calls disable shell, browser, image, connector and agent features where supported, use a neutral working directory, and request read-only permissions. Claude also receives an empty tools list; Codex may retain tools that its read-only sandbox must deny. Calls reduce inherited configuration and instruct the peer to use supplied evidence only. They do not run in `PROJECT` and do not automatically inspect its files. Managed organization policies still apply. This is an application-level collaboration boundary, not a promise of OS-level isolation or a substitute for the host's permissions.

The runner checks the complete outbound packet for conservative patterns for private keys, common OpenAI/AWS/GitHub/Slack/Google credentials and password-bearing connection strings before sending it, including report content rather than only initial context. This is not complete data-loss prevention: it cannot prove that content is safe to share or detect every secret. Continue selecting and reviewing context carefully; never treat a passed scan as permission to transmit unrelated private data.

The runner bounds stages, attempts, and subprocess runtime, not provider charges. A single run permits at most three successful peer calls in plan mode or two in review mode. A peer outage produces a partial run, never simulated consensus. The coordinator must tell the user what was actually reviewed, what remains unresolved, and whether the final plan changed after verification.
