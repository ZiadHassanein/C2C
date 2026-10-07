# Reproduce the planning-input comparison

This developer benchmark executes complete **offline** workflows with fixed fictional reports. It makes no provider calls, reads no account credentials and modifies neither source checkout. The fixtures are in [fixtures.mjs](fixtures.mjs); no private project or historical local run is required.

Use Node.js 18+ and two source checkouts with the background-author API (version 0.10.0 or compatible). The output directory must be new. Keep generated run artifacts outside the repository: they contain local filesystem paths even though their planning content is fictional.

```sh
node benchmarks/compare.mjs --baseline ../c2c-before --candidate . --output ../c2c-benchmark-output
```

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
python -m pip install -r benchmarks/requirements.txt
python benchmarks/count_tokens.py ../c2c-benchmark-output/metrics.json
```

The counter writes `token-metrics.json`, with `o200k_base` and `cl100k_base` counts. Compare each workflow against itself in the baseline. Do not combine percentages from different routes or claim that adding author calls lowers total use.

The results measure selected input text. They exclude provider-added system/tool/schema envelopes, research work, coordinator chat, generated output and reasoning tokens. They establish neither billed savings, cache hits, response speed nor equal real planning quality. Fixed-report equivalence demonstrates preserved evidence and workflow contracts; it does not evaluate a model's judgment. Duplicate-input savings exist only when the selected paths actually repeat.
