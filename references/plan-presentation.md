# Plan presentation

Use this when presenting a draft, revised plan, or completed council. The reader should see what is proposed, what needs their decision, and what happens next before encountering implementation detail. Apply the structure proportionally; a small feature does not need empty sections or a project-sized roadmap. Keep one self-contained plan, not another required artifact.

## Put the decision brief first

Open with:

- **Status:** draft only, review in progress, or review completed; name the actual participating roles and material verification limits once. If the peer failed, state which stages are missing. A coordinator draft is not a jointly approved plan.
- **Goal and recommendation:** the outcome and proposed approach in a short paragraph, with the decisive reason. Mark an approach as provisional when a blocker controls it.
- **Decisions needed:** numbered in priority order. For each material choice, state the decision, useful options or recommendation, and what it blocks. Keep non-blocking technical unknowns with their discovery action. Never turn a recommendation into a confirmed user requirement.

If nothing blocks the next action, say so briefly. Do not repeat the same status caveat before every section. Do not call an incomplete exchange a final or agreed plan even if its local working filename is `final-plan.md`.

## Show scope and sequence

Distinguish **confirmed requirements**, **proposed choices**, and **unknowns** where confusion would change implementation. Then state the MVP/first delivery and deferred work; do not bury scope exclusions among database or API details.

For a roadmap, use a compact milestone table:

| Milestone | Deliverable | Depends on | Exit gate |
|---|---|---|---|
| M1 | A concrete outcome | Required evidence, decision, or milestone ID | Observable result that permits proceeding |

Detail the first useful milestone; keep later ones proportionate to their uncertainty. For a small feature, ordered steps with their checks are enough. Do not invent dates, owners, infrastructure, or staffing. Explain a consequential sequencing choice rather than letting the list imply it is settled.

## Keep safety and verification actionable

Put critical invariants next to the affected scope or milestone. Examples, only when relevant, include authorization boundaries, ownership of mutable data, consistency requirements, safe migration, and rollback. A shorter plan must not hide these in a collapsed appendix.

Summarize applicable security measures and meaningful acceptance/negative checks. Label checks **proposed**, **executed** with evidence, or **blocked** with a reason. Separate “the reviewers examined this test plan” from “the implementation passed these tests.” Link the detailed security evidence without replacing the practical checks with a file link alone.

## Show what review changed

Briefly connect significant challenges to the coordinator's decision: accepted and changed, rejected with evidence, or unresolved with its consequence. Cite finding IDs or report links when useful. Preserve a meaningful disagreement even if it prevents implementation. Empty findings do not require an invented argument; “no material objection reported” does not prove correctness or agreement with later edits.

End with the **next action**, its owner if known, and the condition for proceeding. For “show me the plan before coding,” the next action is the user's decision on the plan, not implementation started implicitly.

## Put technical depth after the decisions

Large plans may need schema details, interfaces, state transitions, migration steps, test matrices, and rationale. Keep these in named appendices in the same plan, with a short contents list or Markdown links for navigation. A `<details>` block is optional if the reader supports it; ordinary headings must remain useful elsewhere. All review-critical content must stay in the plan sent for verification: a peer cannot follow a local appendix file link.

Use short paragraphs for explanations and tables for comparisons or dependencies. Avoid repeated boilerplate, long chains of nested bullets, and giant tables with paragraph-sized cells. Retain essential detail rather than imposing a word quota. Put this complete structure in `final-plan.md`. In chat, give only a short decision brief: accurate review status, recommendation, material blockers or unresolved risks, next action, and links to the plan and `DISCUSSION.md`. Do not replay the debate or paste the milestone table and technical appendix unless requested. A file link alone must not hide a failed review or a decision that blocks the user.
