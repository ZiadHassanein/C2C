# Plan presentation

Use this when presenting a draft, revised plan, or completed council. The reader should see what is proposed, what needs their decision, and what happens next before encountering implementation detail. Apply the structure proportionally; a small feature does not need empty sections or a project-sized roadmap. Keep one self-contained plan, not another required artifact.

## Put the decision brief first

Open with:

- **Status:** draft only, review in progress, or review completed; name the actual participating roles and material verification limits once. If the peer failed, state which stages are missing. A coordinator draft is not a jointly approved plan.
- **Goal and recommendation:** the outcome and proposed approach in a short paragraph, with the decisive reason. Mark an approach as provisional when a blocker controls it.
- **Decisions needed:** numbered in priority order. For each material choice, state the decision, useful options or recommendation, and what it blocks. Keep non-blocking technical unknowns with their discovery action. Never turn a recommendation into a confirmed user requirement.

If nothing blocks the next action, say so briefly. Do not repeat the same status caveat before every section. Do not call an incomplete exchange a final or agreed plan even if its local working filename is `final-plan.md`.

For a [usage-limit fallback](protocol.md#planning-when-usage-limits-block-the-exchange), use **Provisional plan — completed by the available chat; council incomplete**. Name actual contributions and missing stages, then present the useful recommendation. Record reversible defaults with their reasons, consequences if wrong and validation gates in the plan; self-checks are not independent review. Keep security and testing sections. Link the discussion only if it exists; a preflight block may have no run at all.

## Show scope and sequence

Distinguish **confirmed requirements**, **proposed choices**, and **unknowns** where confusion would change implementation. Then state the MVP/first delivery and deferred work; do not bury scope exclusions among database or API details.

For a roadmap, use a compact milestone table:

| Milestone | Deliverable | Depends on | Exit gate |
|---|---|---|---|
| M1 | A concrete outcome | Required evidence, decision, or milestone ID | Observable result that permits proceeding |

Detail the first useful milestone; keep later ones proportionate to their uncertainty. For a small feature, ordered steps with their checks are enough. Do not invent dates, owners, infrastructure, or staffing. Explain a consequential sequencing choice rather than letting the list imply it is settled.

Record technical choices that control the first work item or architecture: the choice, reason/tradeoff, and whether it is confirmed, proposed, or awaiting evidence. Reuse suitable project tools and patterns; leave routine coding details to implementation. A short paragraph or compact decision table is enough.

## Keep safety and verification actionable

Put critical invariants next to the affected scope or milestone. Examples, only when relevant, include authorization boundaries, ownership of mutable data, consistency requirements, safe migration, and rollback. A shorter plan must not hide these in a collapsed appendix.

Summarize applicable security measures and meaningful acceptance/negative checks. Label checks **proposed**, **executed** with evidence, or **blocked** with a reason. Separate “the reviewers examined this test plan” from “the implementation passed these tests.” Link the detailed security evidence without replacing the practical checks with a file link alone.

## Show what review changed

Briefly connect significant challenges to the coordinator's decision: concern accepted with remedy adopted or adapted, rejected with evidence, or unresolved with its consequence. State the decisive tradeoff when adapting a fix; reference superseding finding IDs when a later correction replaces an earlier resolution. Distinguish the peer's actual reply from the coordinator's own judgment. Preserve a meaningful disagreement even if it prevents implementation. Empty findings do not require an invented argument; “no material objection reported” does not prove correctness or agreement with later edits.

## Make the execution entry point explicit

Include a concise **Start here** block in the main plan before any appendices. Identify:

- **First work item:** the selected milestone or bounded task and its intended outcome.
- **Entry point and action:** the inspected repository/component/files and first concrete action. Distinguish existing paths from proposed new ones. When location or tooling is unknown, start with bounded discovery and name the evidence needed; never invent an executable command or pretend a proposed path exists.
- **Prerequisites and boundary:** decisions, access, dependencies or authorization that gate this work; what it covers and where it stops. Name an owner only when known. Production blockers gate affected live work, not unrelated authorized local discovery.
- **Check and handoff:** the relevant command/check, expected result, and condition for moving to the next step. Use verified project commands when available, otherwise state how to establish them. Keep planned checks labeled proposed.

For a small feature, a few lines can cover this; reuse milestone/check IDs instead of repeating their detail. For a project, detail its first executable milestone. If a decision blocks choosing that milestone, state the decision and any bounded discovery that can resolve it, with later implementation explicitly conditional.

Keep the **next user action** separate from the **first implementation action**. For “show me the plan before coding,” ask for the plan decision and still show where authorized work would begin. Honor implementation authority already given without adding a new approval ritual. This block also applies to provisional plans; it does not establish missing peer review or authorize coding.

## Check before delivery

Check the assembled plan before peer verification, then check corrections again before `finish` and delivery. For a draft or usage-limit fallback, apply the same check within available limits and state missing review. Resolve contradictions in the plan itself:

- The recommendation, scope, technical decisions, milestone order and Start here block agree with the latest finding dispositions and actual project evidence.
- The first work item has a concrete location/action, prerequisites and observable acceptance result, or an explicit discovery/blocking condition. Dependencies do not require an unfinished later milestone or form a cycle.
- Applicable security, tests and unresolved decisions remain actionable; proposed checks are not reported as executed. Review status identifies material edits after verification and remaining limitations.

Keep this a coordinator check within the existing workflow, not a new report, score, or extra peer round. Do not repeat it as chat narration. `finish` checks saved stages and evidence; it does not assess semantic quality. Complete corrections before sealing the result; a later revision must not inherit an earlier review/completion claim.

## Put technical depth after the decisions

Large plans may need schema details, interfaces, state transitions, migration steps, test matrices, and rationale. Keep these in named appendices in the same plan, with a short contents list or Markdown links for navigation. A `<details>` block is optional if the reader supports it; ordinary headings must remain useful elsewhere. All review-critical content must stay in the plan sent for verification: a peer cannot follow a local appendix file link.

Use short paragraphs for explanations and tables for comparisons or dependencies. Avoid repeated boilerplate, long chains of nested bullets, and giant tables with paragraph-sized cells. Retain essential detail rather than imposing a word quota. Put this complete structure in `final-plan.md`. In chat, give only a short decision brief: accurate review status, recommendation, material blockers or unresolved risks, next action, and links to the plan and `DISCUSSION.md`. Do not replay the debate or paste the milestone table and technical appendix unless requested. A file link alone must not hide a failed review or a decision that blocks the user.
