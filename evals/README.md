# Evaluate planning outcomes

This offline harness collects **actual plans**, hides arm labels for review, and
reports separate quality and resource measurements. It never launches providers,
uses credentials or invents scores. There are **no measured outcome results** in
this directory. The unit tests validate the harness with fictional data only.

Two preregistered, fictional tasks cover a small catalogue filter and a production
multi-dealer migration. Each includes a frozen repository snapshot and an evaluator
rubric. Correct criticism, harmful accepted remedies, missing requirements and
implementability are scored separately; disagreement count and verbosity earn no
credit. Rubrics allow alternative correct designs.

## A fair comparison

Run each task once in each selected arm, with a fresh session and the same
participant packet, available model pool and whole-task limits. The default is
`solo`, `independent-review` and `c2c`; `external` is opt-in. You can preregister
any subset of at least two distinct arms to keep the trial proportional:

| Arm | Procedure |
| --- | --- |
| `solo` | One model plans and self-checks, without an independent reviewer. |
| `independent-review` | One author drafts, a second independent reviewer critiques, then the author revises once. |
| `c2c` | Use C2C's documented task-appropriate workflow; record the exact version and role choices. |
| `external` | A comparison workflow chosen before execution; record its exact revision, prompt and procedure in execution notes. |

The available model pool and limits match; actual role assignments may differ.
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
   Selecting `external` adds only the comparison workflow you explicitly choose.

2. Create isolated participant packets. Each arm receives an unchanged copy of the
   same task packet. The manifest records the evidence, rubric and protocol hashes.

   ```sh
   node evals/evaluate.mjs packet --task feature --config ../c2c-eval/config.json --out ../c2c-eval/feature
   node evals/evaluate.mjs packet --task production --config ../c2c-eval/config.json --out ../c2c-eval/production
   ```

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

4. Repeat for all selected arms and both tasks. Save a JSON array of the imported
   directory paths in `../c2c-eval/runs.json`. Paths resolve from your current working
   directory. The default comparison has six outcomes; two arms need four outcomes.
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

The JSON report preserves task-level metrics, role/model differences and missing
measurements. Missing/unmatched cells, synthetic outputs, compromised blinding,
inconsistent evaluators, unknown call/time allowances or exceeded limits block
matched comparisons. Unknown whole-task tokens block efficiency comparison.
Even a complete batch is **descriptive evidence for these two tasks**, never proof
of general superiority, equal quality or guaranteed savings. The harness checks
provenance consistency and quotation presence, not truth or evaluator competence.

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
