# Reproduce the planning-input comparison

## Compare pinned v0.11.3 and v0.12.0 inputs

This offline harness compares pinned v0.11.3 and v0.12.0 runtime/instruction sources. It records signed changes, including increases. Use it to inspect input text and workflow preservation; [evaluation methods and limits](../docs/BENCHMARKS.md) explain what it cannot establish.

Run from an updated C2C clone containing both commits. Use new sibling paths for checkouts and outputs. The harness scripts come from your updated clone; the two detached snapshots supply the measured runtimes:

```sh
git worktree add --detach ../c2c-input-before-v0113 d7d3189404f0665f52852dc5d92aa3999d8a758f
git worktree add --detach ../c2c-input-v012 c2b33715195aa0812c2225024bdc6e9dccaddc01
node benchmarks/measure-current.mjs --baseline ../c2c-input-before-v0113 --candidate ../c2c-input-v012 --output ../c2c-input-v012-results
node benchmarks/measure-final-revision.mjs --candidate ../c2c-input-v012 --output ../c2c-revision-v012-results
```

The first command-driven comparison completes 24 workflows, with 78 prompts and 78 separately captured schemas. Original evidence, findings, participants, stage counts and final hashes must match; only the listed protocol changes are allowed. Current worker reports include the required empty `evidence_requests` array, whose later propagation is counted. The optional helper runs four fresh current-only workflows and exports only the extra final-check input for incremental counting. Neither helper calls a provider or probes authentication.

Keep generated artifacts outside the repository: local run files contain filesystem paths. Source, fixture and harness hashes are checked before and after execution. Controller times are diagnostic filesystem/fixture overhead, not model latency. The matched fixtures do not request supplemental evidence.

For token proxies, create an isolated Python environment and activate it using your shell's command. Then install the optional pinned tokenizer and count the captured text:

```sh
python -m venv ../c2c-tokenizer-v012
```

After activating that environment:

```sh
python -m pip install -r benchmarks/requirements.txt
python benchmarks/count_tokens.py ../c2c-input-v012-results/metrics.json
python benchmarks/count_tokens.py --incremental ../c2c-revision-v012-results/metrics.json
python benchmarks/count_instructions.py --baseline ../c2c-input-before-v0113 --candidate ../c2c-input-v012 --baseline-ref d7d3189404f0665f52852dc5d92aa3999d8a758f --candidate-ref c2b33715195aa0812c2225024bdc6e9dccaddc01 --output ../c2c-instructions-v012.json
```

Both encodings (`o200k_base`, `cl100k_base`) are proxies, not either provider's billed usage. Tokenizer initialization may download public encoding assets; `TIKTOKEN_CACHE_DIR` can reuse a populated cache. Python/tiktoken remain optional benchmark dependencies, not C2C runtime requirements.

The workflow counters write `token-metrics.json` beside their input metrics. They verify capture hashes, confinement, matching identities and completed stage/call records. Incremental mode reports one final-call input per fixture without a savings percentage. The instruction counter refuses an existing output and records per-file hashes, LF-normalized counts and a hypothetical full-load total. Declared commit IDs identify the intended snapshots; hashes identify actual measured bytes.

For the identical-source control, use a new output directory:

```sh
node benchmarks/measure-current.mjs --baseline ../c2c-input-v012 --candidate ../c2c-input-v012 --output ../c2c-input-v012-control
python benchmarks/count_tokens.py ../c2c-input-v012-control/metrics.json
```

All prompt/schema byte and token deltas should be zero. The harness also rejects deliberate preservation violations. This demonstrates measurement controls, not live model quality or speed. Keep schema text, worker prompts and coordinator instructions separate; never add their percentages or label them total-session savings.

## Historical v0.10.0 comparison

This developer benchmark executes complete **offline** workflows with fixed fictional reports. It makes no provider calls, reads no account credentials and modifies neither source checkout. The fixtures are in [fixtures.mjs](fixtures.mjs); no private project or historical local run is required.

Use Node.js 18+. To run the historical v0.10.0 comparison, use baseline commit `738afbf68a993a7ac81b6c4c1da5fbf6d05d63a2` and candidate tag `v0.10.0`. From the repository root of a clone containing that commit and tag, create detached checkouts at new sibling paths:

```sh
git worktree add --detach ../c2c-benchmark-before 738afbf68a993a7ac81b6c4c1da5fbf6d05d63a2
git worktree add --detach ../c2c-benchmark-v0.10.0 v0.10.0
node ../c2c-benchmark-v0.10.0/benchmarks/compare.mjs --baseline ../c2c-benchmark-before --candidate ../c2c-benchmark-v0.10.0 --output ../c2c-benchmark-output
```

The checkout paths and output directory must be new. Keep generated run artifacts outside the repository: they contain local filesystem paths even though their planning content is fictional. Each run records the source hashes it actually measures.

These are historical measurements, not remeasurements of later releases. The equivalence check retains stage instructions and allows only the specific efficiency changes below. Releases that intentionally change prompts, including v0.10.2, are not expected to pass this historical baseline comparison; using the current checkout as the candidate does not satisfy that historical comparison contract.

The default comparison runs 24 complete workflows and captures 78 prompts: a small feature and a production roadmap, each with unique evidence, duplicate paths, and distinct files containing identical text, through both source versions and both author routes. Use `--case unique` for an eight-workflow comparison of ordinary nonduplicate inputs. Baseline and candidate runs receive exactly the same authored evidence and fixed responses.

| Route | Small feature | Project roadmap |
|---|---|---|
| Host author, cross provider | Review: 2 successful calls | Plan: 3 successful calls |
| Background author | Same-provider review: 3 successful calls | Cross-provider plan: 5 successful calls |

The worker model IDs are deliberately fictional routing fixtures, not recommendations. There is no real model execution. The harness checks requested IDs/provider roles and keeps those values in packet-equivalence comparisons. It verifies independent drafts and critiques, full source/assessment/report preservation, required security review, unresolved policy findings, identical final-plan/decision hashes, and unchanged call counts for each matching route.

`metrics.json` records byte counts, source hashes and relative capture paths. Equivalence allows only the intended removal of transport/derived identity metadata and exact duplicate context entries. Measured prompts normalize random run IDs to `BENCHMARK_RUN`; they do not strip duplicate content or metadata before counting. Different source labels containing the same text stay separate.

## Optional token proxies

Install the pinned tokenizer into an isolated Python environment, then count the captured prompts. This is optional; the runner has no Python or tokenizer dependency. The first tokenizer initialization may download public encoding assets. Setting `TIKTOKEN_CACHE_DIR` permits reuse of a local cache.

```sh
python -m venv ../c2c-benchmark-venv
# Activate that environment using the command for your shell.
python -m pip install -r ../c2c-benchmark-v0.10.0/benchmarks/requirements.txt
python ../c2c-benchmark-v0.10.0/benchmarks/count_tokens.py ../c2c-benchmark-output/metrics.json
```

The counter writes `token-metrics.json`, with `o200k_base` and `cl100k_base` counts. Compare each workflow against itself in the baseline. Do not combine percentages from different routes or claim that adding author calls lowers total use.

The results measure selected input text. They exclude provider-added system/tool/schema envelopes, research work, coordinator chat, generated output and reasoning tokens. They establish neither billed savings, cache hits, response speed nor equal real planning quality. Fixed-report equivalence demonstrates preserved evidence and workflow contracts; it does not evaluate a model's judgment. Duplicate-path removal only changes inputs when selected paths actually repeat.
