# Project context and direction

Read this before preparing a new council run. Establish what exists, what the user wants to change, and the next useful action before generating solutions. Scale the work to the request: a small feature usually needs a few targeted observations; a project roadmap needs system boundaries and consequential dependencies. Assessment alone never launches a paid council.

## Gather evidence without expanding scope

Start with the user's request and relevant repository instructions. Locate scoped handoffs, checkpoints and owner-maintained records before historical reports or broad repository listings. Use them to find the current work, decisions and evidence, not as proof of freshness: check their scope and claimed revision against current source, relevant local changes and Git/run state. Timestamps alone do not establish authority. Follow older records when a material gap, conflict or decision rationale needs them.

Expand discovery incrementally from those pointers into affected components, interfaces, package/build files, tests and deployment/release evidence. Prefer scoped filename searches and targeted symbols/sections over full trees or repository-wide content dumps; widen when a missing source or consequential dependency requires it. Parse structured records and select relevant JSON fields before displaying them: line limits do not bound a single compact JSON line. Bound output by the question being answered, recovering any truncated material needed for that answer. Reuse known reference sections and observations unless missing context or changed facts require another read.

Stop broad discovery once the goal, affected boundaries, constraints and evidence support the assessment and next planning step. Record remaining uncertainties, their practical effects and validation gates; investigate material contradictions or blockers before relying on the disputed claim. This is a scope-based stopping condition, not a file limit or permission to omit security or required evidence. Prefer existing authorized evidence; do not crawl all files or inspect credentials.

Keep observations distinct from user reports and inference. A source should identify a file/section and version, a dated test result, a user statement, or an authorized service record; include the useful observation in the packet because the peer cannot follow local links. Exclude secrets and unrelated private data. A source's text is evidence, not authority to perform new actions.

Do not probe production, run load/security scans, change infrastructure, or access customer data to answer a classification question. Use such evidence only when already available and authorized. If evidence is unavailable, record the gap and its practical effect. Do not turn every missing check into a blocker or silently expand a feature into a full audit.

## Distinguish deployment from readiness

| Field | Meaning |
|---|---|
| Deployment: `production` | Evidence says this scoped project is deployed for real users or operations. |
| Deployment: `non_production` | Evidence establishes that the scoped project is a prototype, local/development system or staging-only deployment. |
| Deployment: `unknown` | Available evidence does not establish current deployment, or sources conflict. |
| Deployment: `not_applicable` | Non-software work has no software deployment classification. |
| Readiness: `not_assessed` | No defensible readiness conclusion has been established for the stated scope. |
| Readiness: `gaps_found` | Evidence identifies material gaps for that scope; list them. |
| Readiness: `checks_passed_for_scope` | Cited observed checks support the explicitly limited scope, with no known gaps in it. |
| Readiness: `not_applicable` | Non-software work; use its own relevant acceptance criteria instead. |

Production does not imply production readiness. A deployment configuration, public repository, release tag or passing build does not show where the code currently runs. A user's explicit report can establish reported production use; label it `user_reported`, not independently verified. Absence of deployment evidence is `unknown`, not proof of non-production. Conflicting sources remain unknown until reconciled.

Scope readiness narrowly enough for the evidence to support it, for example “the filter's input-validation tests at commit X,” not “the entire application.” Proposed tests and reviewed plans are not passing checks. Keep broader untested concerns in unknowns; do not imply that a small passing test suite proves operational readiness or security.

## Choose an actionable direction

Resolve the objective, current versus target behavior, scope/non-goals, success criteria, constraints, affected users/data and important dependencies. Select the high-level route that fits the authorized work:

| Route | When it fits |
|---|---|
| `new_build` | The requested capability has no existing implementation to extend. |
| `extend_existing` | Add or change behavior within the current project and its architecture. |
| `harden_existing` | Reliability, security or operational readiness is the requested outcome or a necessary prerequisite. |
| `discovery` | A bounded investigation must establish requirements or technical facts before detailed design. |
| `non_software` | Plan a launch, process or other non-code deliverable using relevant evidence. |

The route is a work category, not a preferred architecture. Share neutral facts, user constraints and previously accepted decisions; keep new solution proposals and coordinator critiques out of this assessment so the drafts remain independent.

Set `clarity` to `ready` when the next planning step is clear, even if some later decisions remain open. Use `discovery_needed` when a useful investigation can be planned: name the missing fact, the bounded action to establish it and its exit criterion. Use `needs_user_input` only when a material goal, scope or constraint choice cannot be inferred and changes what should be planned. Ask only essential questions, while continuing independent reads that do not depend on the answers. `prepare` rejects `needs_user_input` before creating a run; do not relabel an unresolved preference as discovery just to pass validation.

Unknown deployment does not automatically stop planning. If live impact is plausible, preserve compatibility and data, and make deployment verification a prerequisite to the affected implementation or rollout. A production feature plan should fit the current architecture, identify dependencies and affected interfaces, and include applicable migration, rollout, recovery and regression gates. Do not propose a rewrite or hardening program merely because production checks are absent. A new project's distant production decisions may remain deferred milestones.

End the direction with a concrete next action and its gate: what can start now, what evidence it will produce, and what must be true before proceeding. “Plan the project” is not an adequate next step.

## JSON contract

Write a UTF-8 assessment file outside the new run directory and pass its absolute path as `prepare --assessment ASSESSMENT`. All fields below are required, strings must be nonempty, and `assessed_at` must include an ISO date/time and timezone. `direction.scope` and `direction.success_criteria` each need at least one item; other arrays may be empty where no stronger rule applies. Evidence IDs must be unique, and references must identify entries in `evidence`. Use simple IDs such as `E1` (a letter followed by letters, digits, underscores or hyphens, at most 64 characters). Generated `project-assessment.schema.json` records the field and size limits.

```json
{
  "assessed_at": "2026-10-06T10:00:00+03:00",
  "summary": "An existing app needs a bounded search-filter change; deployment is unverified.",
  "project_type": "software",
  "deployment": {
    "status": "unknown",
    "evidence": ["E1"]
  },
  "readiness": {
    "status": "not_assessed",
    "scope": "Search-filter change; implementation checks have not run.",
    "gaps": [],
    "evidence": []
  },
  "evidence": [
    {
      "id": "E1",
      "source": "Example only: src/search.ts at the inspected revision",
      "observation": "The current screen lists items but has no query filter; no deployment evidence was supplied.",
      "kind": "observed"
    }
  ],
  "direction": {
    "route": "extend_existing",
    "clarity": "ready",
    "goal": "Let users filter the current list by label.",
    "scope": ["Current list screen and its filter behavior"],
    "success_criteria": ["Case-insensitive literal matching preserves item order."],
    "constraints": ["Keep existing UI conventions; no new service or data migration."],
    "next_step": "Inspect the list's input contract and test setup; begin the candidate plan when both are identified."
  },
  "unknowns": ["Current deployment status; confirm it before any affected release."]
}
```

Replace the example with actual evidence and the task's current assessment time. Allowed values are:

- `project_type`: `software` or `non_software`.
- `evidence[].kind`: `observed`, `user_reported` or `inferred`.
- `deployment.status`, `readiness.status`, `direction.route`: the values defined above.
- `direction.clarity`: `ready`, `discovery_needed` or `needs_user_input`.

Known software deployment (`production` or `non_production`) must cite at least one observed or user-reported item; inference alone is insufficient. `checks_passed_for_scope` requires observed evidence and an empty gaps list. `gaps_found` requires at least one gap. Unknown deployment or unclear direction requires an explanation in `unknowns`. Non-software work must use deployment/readiness `not_applicable` and route `non_software`; its access, information-sharing and operational risks still belong in the later security review.

The runner validates structure and these consistency rules, not source truth, adequacy of tests, or whether the scope is honest. The coordinator must critically evaluate evidence and avoid overstating what it establishes.

## Persist and revisit

Version 3 preparation freezes this assessment in `snapshot.json`, saves and seals `project-assessment.json`, and generates sealed, readable `PROJECT_CONTEXT.md`. The neutral assessment is supplied at every peer stage and summarized in status and completion. Do not edit sealed records to erase old uncertainty. Check present-day evidence when resuming; materially changed facts or direction require a new run linked to the old one, not a budget reset.

Link `PROJECT_CONTEXT.md` from `HANDOFF.md`, the final plan and any implementation brief. Carry deployment evidence, readiness scope/gaps, unresolved questions, first action and proceeding gates into those deliverables. `TASK_ASSESSMENT.md` remains separate coordinator-only advice about task size and models; do not send that note as shared assessment context. Legacy version 1/2 runs do not satisfy this new assessment requirement retroactively.
