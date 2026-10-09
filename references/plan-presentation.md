# Plan presentation

Use this when presenting a draft, revised plan, or completed council. The reader should see what is proposed, what needs their decision, and what happens next before encountering execution detail. Apply the structure proportionally; a small feature or article plan does not need empty sections or a project-sized roadmap. Keep one self-contained plan, not another required artifact. Content work still delivers a plan rather than a finished article or media asset unless separately requested; planning grants no building or publication authority.

## Put the decision brief first

Open with:

- **Status:** for prepared runs, show current review progress/outcome from generated `DISCUSSION.md` and, after `finish`, `RESULT.md`; preserve actual roles and verification limits. In `final-plan.md`, use a stable review-status link to the generated discussion from its first verification onward. Keep task scope, implementation authority and proposed/executed test status in the plan. A coordinator draft is not a jointly approved plan.
- **Goal and recommendation:** the outcome and proposed approach in a short paragraph, with the decisive reason. Mark an approach as provisional when a blocker controls it.
- **Decisions needed:** numbered in priority order. For each material choice, state the decision, useful options or recommendation, and what it blocks. Keep non-blocking technical unknowns with their discovery action. Never turn a recommendation into a confirmed user requirement.

Without a prepared run, state draft/provisional status directly; do not link nonexistent generated records. If nothing blocks the next action, say so briefly. Do not repeat the same status caveat before every section. Do not call an incomplete exchange a final or agreed plan even if its local working filename is `final-plan.md`.

Finalize presentation before `ask --stage verify`. A successful verification does not require editing the plan to say “review completed”, adding a completion time or updating a reviewer count. Let `finish` generate the outcome, link the unchanged plan, discussion and result, and state accurate status in the short final reply. Do not hand-edit generated files. Any actual edit to reviewed plan/security content still follows the [final revision rules](protocol.md#final-revision-check); even a header edit is not exempt from integrity checks.

For a [usage-limit fallback](protocol.md#planning-when-usage-limits-block-the-exchange), use **Provisional plan — completed by the available chat; council incomplete**. Name actual contributions and missing stages, then present the useful recommendation. Record reversible defaults with their reasons, consequences if wrong and validation gates in the plan; self-checks are not independent review. Keep security and testing sections. Link the discussion only if it exists; a preflight block may have no run at all.

## Show scope and sequence

Distinguish **confirmed requirements**, **proposed choices**, and **unknowns** where confusion would change execution. Then state the MVP/first delivery and deferred work; do not bury scope exclusions among database, API or editorial details.

For a roadmap, use a compact milestone table:

| Milestone | Deliverable | Depends on | Exit gate |
|---|---|---|---|
| M1 | A concrete outcome | Required evidence, decision, or milestone ID | Observable result that permits proceeding |

Detail the first useful milestone; keep later ones proportionate to their uncertainty. For a small feature, ordered steps with their checks are enough. Do not invent dates, owners, infrastructure, or staffing. Explain a consequential sequencing choice rather than letting the list imply it is settled.

Record technical choices that control the first work item or architecture: the choice, reason/tradeoff, and whether it is confirmed, proposed, or awaiting evidence. Reuse suitable project tools and patterns; leave routine coding details to implementation. A short paragraph or compact decision table is enough.

For content, show the intended audience/purpose, format, language/tone, outline or editing approach, source/claim gaps and applicable media plan. Distinguish existing assets and inspected evidence from proposed images, descriptions, rights assumptions and alt-text work. Keep editorial readiness separate from publication state. For mixed work, connect these requirements to the software milestones without duplicating the plan.

## Keep safety and verification actionable

Put critical invariants next to the affected scope or milestone. Examples, only when relevant, include authorization boundaries, ownership of mutable data, consistency requirements, safe migration, and rollback. A shorter plan must not hide these in a collapsed appendix.

Summarize applicable security measures and meaningful acceptance/negative checks. For content, use relevant source, editorial, rights/consent and accessibility checks, without adding unrelated engineering or approval gates. Label checks **proposed**, **executed** with evidence, or **blocked** with a reason. Distinguish review of a proposed check from its execution. State source/image inspection limits: text-only workers cannot establish visual verification or publication clearance. Link detailed security evidence without replacing practical checks with a file link alone.

## Show what review changed

For a supplied-plan review, deliver the revised plan with accepted fixes incorporated where they apply. Retain sound steps, exact identifiers and constraints; remove superseded or contradictory directions. Include a short change summary and link the discussion as evidence. The reader must not have to merge a critique or amendment list into the old plan. Respect an explicit request for critique only.

When originals must remain unchanged, write a clearly identified revised copy or plan package with one entry point. Keep unresolved decisions and blocked work explicit; do not invent missing facts to make it appear complete. A provisional outcome still gets the best supported revised plan. Consolidating or correcting a plan does not authorize implementing its proposed changes or inherit earlier verification: send the actual revised content for the permitted check, or label the revision unreviewed.

Briefly connect significant challenges to the coordinator's decision: concern accepted with remedy adopted or adapted, rejected with evidence, or unresolved with its consequence. State the decisive tradeoff when adapting a fix; reference superseding finding IDs when a later correction replaces an earlier resolution. Distinguish the peer's actual reply from the coordinator's own judgment. Preserve a meaningful disagreement even if it prevents implementation. Empty findings do not require an invented argument; “no material objection reported” does not prove correctness or agreement with later edits.

## Make the execution entry point explicit

Include a concise **Start here** block in the main plan before any appendices. Identify:

- **First work item:** the selected milestone or bounded task and its intended outcome.
- **Entry point and action:** the inspected repository/component/files or current draft/source/media and first concrete action. Distinguish existing paths from proposed new ones. When location or tooling is unknown, start with bounded discovery and name the evidence needed; never invent an executable command or pretend a proposed path exists.
- **Prerequisites and boundary:** decisions, access, dependencies or authorization that gate this work; what it covers and where it stops. Name an owner only when known. Production blockers gate affected live work, not unrelated authorized local discovery.
- **Check and handoff:** the relevant command or editorial/source/accessibility procedure, expected result, and condition for moving to the next step. Use verified project commands where appropriate; content checks need not be executable commands. Keep planned checks labeled proposed.

Beside this block, include the concise [execution model recommendation](model-selection.md#recommend-models-for-execution), tied to this work item. Distinguish it from the models that reviewed the plan. Lead with why it fits this task better than the alternative, the tradeoff and the check that could change the choice. Then explain any supported saving and show its metric/baseline/assumptions, or mark it unknown; keep the research detail in the existing assessment. Prepare this advice before verification so delivery does not trigger another review solely to append it.

For a small feature, a few lines can cover this; reuse milestone/check IDs instead of repeating their detail. For a project, detail its first executable milestone. If a decision blocks choosing that milestone, state the decision and any bounded discovery that can resolve it, with later implementation explicitly conditional.

Keep the **next user action** separate from the **first execution action**. For “show me the plan before coding/writing,” ask for the plan decision and still show where authorized work would begin. Honor execution authority already given without adding a new approval ritual. This block also applies to provisional plans; it does not establish missing peer review or authorize coding or publication.

## Check before delivery

For an existing-plan review, deliver its revised version in `final-plan.md`, not a review report that tells someone else how to repair it. Briefly identify the original filename/version and the main changes; retain sound structure, identifiers and constraints, replacing superseded instructions in place. Keep the debate in the separate generated `DISCUSSION.md`. If originals are protected, deliver a revised copy. Read full source reports and decision rationales for synthesis; the compact discussion contains excerpts and is only a navigation aid.

Check the assembled plan before peer verification, then check corrections again before `finish` and delivery. For a draft or usage-limit fallback, apply the same check within available limits and state missing review. Resolve contradictions in the plan itself:

- The recommendation, scope, technical/editorial decisions, milestone order and Start here block agree with the latest finding dispositions and actual project evidence.
- Accepted fixes appear in the operative plan; the user can follow it without reconciling an older plan against separate review notes. Preserve an explicit critique-only scope.
- The first work item has a concrete location/action, prerequisites and observable acceptance result, or an explicit discovery/blocking condition. Dependencies do not require an unfinished later milestone or form a cycle.
- Execution advice fits that work item and the user's limits; sources, eligibility gaps and savings labels are accurate. Price differences are not presented as token or subscription savings, and the recommendation grants no new implementation authority.
- Applicable security, acceptance checks and unresolved decisions remain actionable; proposed checks are not reported as executed. Content claims, source/media gaps and publication state are accurate. Review status identifies material edits after verification and remaining limitations.

Keep this a coordinator check within the existing workflow, not a new report, score, or extra peer round. Do not repeat it as chat narration. `finish` checks saved stages and evidence; it does not assess semantic quality. Complete corrections before sealing the result; a later revision must not inherit an earlier review/completion claim.

After `finish`, confirm that `final-plan.md`, `DISCUSSION.md` and `RESULT.md` exist and link each directly in the final reply, with the plan first. Keep this three-file handoff even for a completed run with unresolved findings or an unreviewed revision, stating its actual outcome. For an incomplete run, link only available artifacts and explain why the completion record is absent. A standalone fallback delivers one provisional plan with self-critique; never create missing review/completion records just to match the completed-run file count.

## Put technical depth after the decisions

Large plans may need schema details, interfaces, state transitions, migration steps, test matrices, and rationale. Keep these in named appendices in the same plan, with a short contents list or Markdown links for navigation. A `<details>` block is optional if the reader supports it; ordinary headings must remain useful elsewhere. All review-critical content must stay in the plan sent for verification: a peer cannot follow a local appendix file link.

Use short paragraphs for explanations and tables for comparisons or dependencies. Avoid repeated boilerplate, long chains of nested bullets, and giant tables with paragraph-sized cells. Retain essential detail rather than imposing a word quota. Put this complete structure in `final-plan.md`. In chat, lead with accurate review status and the revised plan link, then briefly state the main changes, material blockers and next action. Include the discussion and completion links required above. Do not replay the debate or paste the milestone table and technical appendix unless requested. A file link alone must not hide a failed review or a decision that blocks the user.
