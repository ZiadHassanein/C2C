# Evaluate planning outcomes

This offline harness collects **actual plans**, hides arm labels for review, and
reports separate quality and resource measurements. It never launches providers,
uses credentials or invents scores. There are **no measured outcome results** in
this directory. The unit tests validate the harness with fictional data only.

Seven preregistered, fictional tasks cover software, content and mixed work. Each
includes a frozen source snapshot and an evaluator rubric. Correct criticism,
harmful accepted remedies, missing requirements and
implementability are scored separately; disagreement count and verbosity earn no
credit. Rubrics allow alternative correct designs.

| Task | Observable issue or invariant |
| --- | --- |
| `feature` | Small catalogue filters, API compatibility and price validation. |
| `production` | Multi-dealer ownership migration, delayed queues and policy gaps. |
| `bilingual` | Conflicting English/Arabic hours, a missing fee order, scoped editorial progress and RTL acceptance. |
| `mixed-upload` | Project authorization, byte validation, image rights, missing pixels and separate publication authority. |
| `shared-premise` | Two agreeing drafts incorrectly treat a tenant cache key as authorization. |
| `sound-plan` | An initially correct transaction/authorization plan and a persuasive harmful remedy; no major correction is required. |
| `revision-dependency` | A retention change breaks an unchanged storage lifecycle rule, rollback and dependent acceptance checks. |

The original two fixtures are unchanged. Every new criterion cites an exact raw
evidence excerpt available to participants; the harness checks those references
when preparing packets. Citations establish source binding, not semantic truth.

## A fair comparison

Run each task once in each selected arm, with a fresh session and the same
participant packet, available model pool and whole-task limits. The default is
`solo`, `independent-review` and `c2c`; `external` is opt-in. You can preregister
any subset of at least two distinct arms to keep the trial proportional:

| Arm | Procedure |
| --- | --- |
| `solo` | One model plans and self-checks, without an independent reviewer. |
| `independent-review` | One author drafts, a second independent reviewer critiques, then the author revises once. |
| `independent-synthesis` | Two fresh sessions produce independent proposals from identical evidence; a synthesizer sees both and produces one plan, without mutual critique. Opt-in ablation. |
| `c2c` | Use C2C's documented task-appropriate workflow; record the exact version and role choices. |
| `external` | A comparison workflow chosen before execution; record its exact revision, prompt and procedure in execution notes. |

The available model pool and limits match; actual role assignments may differ.
For a controlled ablation, preregister the same author/critic model assignments,
tool access, research inputs and settings wherever roles overlap; isolate both
independent drafts from each other. Count the synthesizer/host in the model pool
and whole-task resources. Procedure compliance is declared in execution notes,
not independently attested by the importer.
Include the host, research, failed calls and retries in **whole-task** resources.
Choose a call allowance that can accommodate every tested workflow. If the UI
does not expose whole-task usage or timing, record `null` and explain the gap.
Never substitute input-character estimates for measured tokens. A paid benchmark
requires the user's applicable authorization and limits; this harness grants none.

Do not expose `rubric.json` or this source checkout to participants. The packet
command omits rubrics, but that is separation of files, **not an access-control
sandbox**. Run participants in the isolated packet workspace. For replication,
freeze the source commit, CLI versions, prompts, model IDs and sampling settings
where exposed. Keep unexposed settings explicitly unknown in execution notes.

## Quickstart (Node 18+, Windows/macOS/Linux)

Run commands from the repository root. Put every output and supplied metadata file
in a private directory **outside this checkout**; the harness refuses output inside
the checkout and refuses to overwrite existing output directories. The `../c2c-eval`
paths below illustrate a private sibling directory; create it first with your file
manager or shell. Do not commit real plans or transcripts.

1. Save `../c2c-eval/config.json`, replacing the example model IDs with exact models
   available to your account. `null` token caps mean no additional declared token
   cap, not unlimited provider quota. Keep your existing account/user limits.

   ```json
   {
     "arms": ["solo", "independent-review", "c2c"],
     "available_models": [
       {"provider": "provider-a", "model": "exact-model-id-a"},
       {"provider": "provider-b", "model": "exact-model-id-b"}
     ],
     "limits": {
       "max_calls": 12,
       "max_seconds": 1800,
       "max_input_tokens": null,
       "max_output_tokens": null
     }
   }
   ```

   The `arms` field is optional; omitting it selects the three default arms above.
   Selecting `external` or `independent-synthesis` adds only that requested route.
   The optional `tasks` array selects a nonempty subset of the seven task IDs;
   omitting it selects all seven. Freeze the subset before generating output.
   New packets use `c2c-outcomes-v2`; previously saved v1 packets retain their
   original hashes and two-task scope.

2. Create isolated participant packets. Each arm receives an unchanged copy of the
   same task packet. The manifest records the evidence, rubric and protocol hashes.

   ```sh
   node evals/evaluate.mjs packet --task feature --config ../c2c-eval/config.json --out ../c2c-eval/feature
   node evals/evaluate.mjs packet --task production --config ../c2c-eval/config.json --out ../c2c-eval/production
   ```

   Repeat for the remaining selected task IDs in the table. All selected tasks
   must have every selected arm before the report permits a matched comparison.

3. Run a participant using its prescribed arm, then save the final plan and metadata
   outside the packet. The harness imports existing output; it does not run this
   step for you. Example metadata for `../c2c-eval/feature-solo-meta.json`:

   ```json
   {
     "arm": "solo",
     "provenance": "live",
     "tool_version": "actual CLI version or commit",
     "models": [{"provider":"provider-a","model":"exact-model-id-a","role":"author and self-reviewer"}],
     "elapsed_seconds": null,
     "calls": null,
     "usage": {"scope":"whole-task","input_tokens":null,"output_tokens":null},
     "unavailable_reason": "Replace with why the actual whole-task measurements are unavailable.",
     "execution_notes": "Replace with exact prompt/procedure, settings or unknowns, evidence of execution and any deviations.",
     "completed_at": "2026-10-07T12:00:00Z"
   }
   ```

   Replace the date and every example value with actual observations. `live` means
   a real external workflow; `native-evaluation` means a real native-agent trial;
   `synthetic` is only harness testing. These declarations are supplied evidence,
   not independent provider attestation. Use exact model IDs, not rolling aliases.

   ```sh
   node evals/evaluate.mjs import --packet ../c2c-eval/feature --plan ../c2c-eval/feature-solo-plan.md --meta ../c2c-eval/feature-solo-meta.json --out ../c2c-eval/feature-solo
   ```

4. Repeat for all selected arms and tasks. Save a JSON array of the imported
   directory paths in `../c2c-eval/runs.json`. Paths resolve from your current working
   directory. The full default comparison has 21 outcomes; two arms need 14.
   Blinding works with partial batches, but missing preregistered cells keep their
   comparisons blocked. An unselected external arm is never required.

   ```sh
   node evals/evaluate.mjs blind --runs ../c2c-eval/runs.json --out ../c2c-eval/blind-batch
   ```

   Give an evaluator only `blind-batch/review/`. It contains shuffled random candidate
   IDs, unchanged plans, source snapshots, rubrics and score templates. Keep
   `mapping.private.json` private until scoring finishes. Plans may self-identify;
   no text is silently rewritten. Mark compromised blinding in the score.

5. In each candidate folder, fill `score-template.json` and save as `score.json`.
  Every rubric item needs a boolean `met` and evidence. Positive judgments require
  an exact plan quote; negative judgments explain the omission. Adverse judgments
  need `plan_quote`, `explanation` and `evidence_reference`. Use a consistent
   evaluator configuration for one batch; collect independent replications in new
   batches. Model-based evaluation can introduce its own bias.

   ```sh
  node evals/evaluate.mjs report --batch ../c2c-eval/blind-batch
  ```

`harmful_remedies` measures harmful advice retained in the delivered plan. To
score the debate's rejected advice too, retain the discussion separately and use
a separately preregistered rubric; do not mix that with this final-plan metric.

The JSON report preserves task-level metrics, criterion-level judgments,
role/model differences and missing measurements. Missing/unmatched cells, synthetic outputs, compromised blinding,
inconsistent evaluators, unknown call/time allowances or exceeded limits block
matched comparisons. Unknown whole-task tokens block efficiency comparison,
including when a token cap cannot be verified, but preserve otherwise valid
quality comparisons. Known token-cap violations still invalidate the matched
comparison. `quality_limitations` and `efficiency_limitations` distinguish these
conditions; unknown usage remains `null`. The report checks the blinded task
evidence as well as the unchanged plan and rubric.
Even a complete batch is **descriptive evidence for the selected tasks**, never proof
of general superiority, equal quality or guaranteed savings. The harness checks
provenance consistency and quotation presence, not truth or evaluator competence.

## Frozen baseline captures and promotion guards

[The capture manifest](baselines/c2c-2.2.0.capture.json) pins the existing 2.2.0
source commit, its five instruction hashes, and the expanded suite's file hashes.
It is a **capture-required template with zero outcomes**, not an executed
baseline. The expanded fixture suite was prepared after that source revision.
Do not replace older baseline evidence or rewrite this manifest for a changed
suite; add a separately versioned manifest and keep the earlier source available.
The separately registered [2.3.0 capture](baselines/c2c-2.3.0.capture.json) pins
the source before effort, review-diff and orchestration changes, using the same
seven-task suite. It also contains **zero measured outcomes**. To select it, use
`capture_id: "c2c-2.3.0-outcomes-v2"`, `tool_version: "2.3.0"` and
`source_revision: "ec26754e6e8733067e9bfe59fc65ec33508631fb"` in the baseline
configuration and imported baseline metadata. The harness rejects mixed
identities; the 2.2.0 capture and its prior packets remain valid.

To compare the frozen 2.2.0 workflow against a candidate, use `external` for the
exact pinned baseline procedure and `c2c` for the candidate. Add these fields to
the configuration, keep all seven tasks, and replace the control descriptions
with the actual preregistered procedures:

```json
{
  "baseline": {
    "arm": "external",
    "candidate_arm": "c2c",
    "capture_id": "c2c-2.2.0-outcomes-v2",
    "tool_version": "2.2.0",
    "source_revision": "b855a7b8d9107a80f4e429f6a935520cc05c8f4a"
  },
  "controls": {
    "tools": "Record identical allowed tools and evidence access.",
    "research_inputs": "Record identical frozen research inputs for this ablation.",
    "settings": "Record exact model settings, or explicitly unavailable settings.",
    "role_policy": "Record fixed model-to-role assignments, isolation and the synthesis procedure."
  }
}
```

The selected `arms` must contain both baseline and candidate. The baseline import
must supply the exact `tool_version`, `source_revision` and `capture_id` above;
the candidate also supplies its actual full `source_revision`. Record exact CLI
versions and retained instruction/runtime pins in execution notes. Verify the
baseline instructions against the pinned checkout before executing a capture;
the harness validates hash format and fixture integrity, not Git history or what
instructions a real model actually read. A normal end-to-end trial with fresh
research is a separate experiment from a matched-input ablation.

The report's promotion object is a **follow-up evaluation gate**, not permission
to release or claim gains. It requires the complete frozen suite, matched valid
quality evidence and preregistered controls. It blocks any lost previously met
criterion, any candidate critical failure and increased harmful remedies or
unsupported findings. Equal total scores cannot hide a lost criterion. Resource
eligibility additionally requires observed whole-task counters and matched
allowances; a passed resource gate means a comparison is possible, not that the
candidate improved efficiency. No report automatically claims superiority,
equivalence, savings or release readiness. Human calibration and repeated trials
remain necessary; no harness can make a fictional test declaration empirical.

## What to measure next

Use more preregistered tasks and repeated runs, independent blinded evaluators,
and implementation follow-through: defects prevented, harmful changes avoided,
rework, acceptance-test success, elapsed time and actual whole-task tokens. Keep
raw evidence private; publish only consented redacted aggregate observations with
versions, methodology and limitations. Do not announce benchmark gains until
those measurements exist.

Harness verification:

```sh
node --test tests/evaluation.test.mjs
```
