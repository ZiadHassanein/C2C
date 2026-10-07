# C2C token-efficiency measurements

## Planning outcome evaluation

The [outcome evaluation harness](../evals/README.md) separately supports actual plan-quality and whole-task resource measurements. It includes frozen feature/production tasks, preregistered arms and limits, private imports, blind scoring and checks for incomplete or mismatched evidence. A partial live pilot is not a completed comparison; no current release claims superior plan quality or total cost savings. See [current validation notes](../PROJECT_NOTES.md#version-0120-evidence-and-outcome-review-improvements).

The entry instructions in v0.12.0 contain 1,794 whitespace-delimited words versus 2,356 in v0.11.3 (23.9% fewer). This is an instruction-length measurement only. Detailed procedures remain in references; actual loading, provider envelopes, outputs and coordinator activity determine total usage.

## Version 0.10.0

The v0.10.0 lossless efficiency change measured **2.00–3.54% smaller worker inputs** across four matching ordinary-input routes. Deliberately repeated-context cases saved **12.21–16.04%**; these conditional results are not normal-input expectations or additive to the first range. All evidence, roles, review stages and final hashes were preserved in fixed-output comparisons.

Read the [full v0.10.0 results](benchmarks/v0.10.0.md), [measurement JSON](benchmarks/v0.10.0-lossless-input.json), and [reproducible benchmark](../benchmarks/README.md). The test ran 24 offline workflows and 78 injected prompts, with no provider calls. It does not establish equal live-model quality, lower bills or faster responses. New background-author routing adds calls when needed, so compare each route against itself.

The recorded comparison uses baseline commit `738afbf68a993a7ac81b6c4c1da5fbf6d05d63a2` and candidate `v0.10.0`. These percentages have not been remeasured for later releases or their changed prompts and chat behavior. Use the pinned checkout commands in the benchmark instructions to reproduce this historical result; newer prompt-changing releases are not expected to satisfy its exact instruction-equivalence check.

## Historical version 0.7.0

C2C v0.7.0 reduces repeated planning text while retaining the selected evidence and review stages. In two offline synthetic workflows, measured peer-input tokens decreased **8.19%** for a small feature and **10.93%** for a production roadmap. Entry instructions decreased **12.18%**. These figures describe different inputs; they are not additive or a measure of total-session savings.

The benchmark used fixed injected reports and made **zero provider calls**. It demonstrates input preservation and runner behavior, not equivalent model planning quality, lower bills, or faster live responses.

### Comparison and method

| Item | Recorded value |
|---|---|
| Baseline | v0.6.0, commit [`d7b6607`](https://github.com/ZiadHassanein/C2C/commit/d7b6607fcdfdea430f9963fc75fffc0c9ce8ca88) |
| Updated version | v0.7.0, commit [`a67657d`](https://github.com/ZiadHassanein/C2C/commit/a67657d4787c08bf89c22eb2ff6872797bcf061e) |
| Measurement recorded | 2026-10-06 |
| Tokenizer | `tiktoken 0.12.0`, primarily `o200k_base` |
| Scenarios | Small feature in review mode; production roadmap in plan mode |
| Execution | Two complete workflows per version, four total, using the actual runner with fixed schema-valid reports |
| Provider calls | 0 |

Both versions received identical briefs, selected source contents, assessments, findings, security reviews, final plans, and finding dispositions. Only random run IDs were normalized in captured prompts. Instruction-file comparisons normalized line endings to LF. Input sizes were measured independently of the fixed outputs. The [machine-readable measurements](benchmarks/v0.7.0-input-tokens.json) include both tokenizer encodings, character and byte counts, and the measured source hash.

### Peer-input results

These totals count the text supplied to the peer across the complete workflow, excluding additional provider or CLI envelopes.

| Workflow | Successful peer stages before → after | Before tokens | After tokens | Tokens removed | Reduction |
|---|---:|---:|---:|---:|---:|
| Small feature | 2 → 2 | 3,808 | 3,496 | 312 | **8.19%** |
| Production roadmap | 3 → 3 | 8,945 | 7,967 | 978 | **10.93%** |

The alternative `cl100k_base` encoding measured 3,802 → 3,492 tokens (8.15%) and 8,936 → 7,960 tokens (10.92%), respectively. The exact count depends on the tokenizer.

#### By stage

| Scenario and stage | Before tokens | After tokens | Reduction |
|---|---:|---:|---:|
| Small feature: review | 1,378 | 1,222 | 11.32% |
| Small feature: verification | 2,430 | 2,274 | 6.42% |
| Production roadmap: draft | 1,979 | 1,653 | 16.47% |
| Production roadmap: review | 2,668 | 2,342 | 12.22% |
| Production roadmap: verification | 4,298 | 3,972 | 7.58% |

### Coordinator instructions

Each file is counted separately. Loading reference sections depends on the task; these numbers are not part of the peer-input totals above.

| File | Before tokens | After tokens | Change |
|---|---:|---:|---:|
| `SKILL.md` | 2,184 | 1,918 | 12.18% smaller |
| `references/protocol.md` | 6,658 | 6,872 | 3.21% larger |
| `references/project-assessment.md` | 1,958 | 1,958 | Unchanged |
| All three read in full | 10,800 | 10,748 | 0.48% smaller |

The entry instructions became shorter; the protocol grew to explain the updated interface. Reading only relevant reference sections matters more than the size reduction across all three files.

### CLI formatting

The optional `--compact` flag removes JSON formatting whitespace while retaining all fields. Both actual `status` formats were parsed and asserted equal. For `ask`, the same captured return object was serialized in both formats; this did not produce a second model response.

| Fixed output example | Pretty JSON tokens | Compact JSON tokens | Reduction |
|---|---:|---:|---:|
| Small feature: status | 1,601 | 1,230 | 23.17% |
| Small feature: ask result | 286 | 245 | 14.34% |
| Production roadmap: status | 2,327 | 1,797 | 22.78% |
| Production roadmap: ask result | 304 | 259 | 14.80% |

These are formatting savings on fixed objects, not measurements of generated-output savings. They must not be added to the peer-input or instruction percentages.

### What the checks preserved

- All five corresponding stage packets retained the same substantive task data: selected source contents and labels, assessment, applicable reports, findings, security evidence, final plans, and dispositions. Outbound byte/hash metadata was removed, JSON keys were reordered, and stage instructions were relocated.
- The independent draft excluded the coordinator draft; the independent review excluded the coordinator review.
- Both versions completed the small feature in two stages and the roadmap in three, with identical final-plan and decision-file hashes.
- Security review remained required. The production fixture retained an unresolved retention-policy decision and an `insufficient_context` final verdict.

Local snapshot bookkeeping remains available even when omitted from the peer packet. No models, review rounds, or required security checks were removed by the efficiency update.

### Software validation

Version 0.7.0 passed **135 automated tests** locally on Windows / Node 24. Its [GitHub Actions run at the release commit](https://github.com/ZiadHassanein/C2C/actions/runs/37445356743) passed all **six jobs** across Windows and Ubuntu with Node 18, 22, and 24.

This suite checks C2C's runner and related behavior, including context preservation, state, compatibility, discussion rendering, and compact output. It does not establish that a user's application or generated plan passes its own acceptance tests. Earlier live CLI observations and their limits are recorded separately in [project notes](../PROJECT_NOTES.md#validation-actually-performed).

### Limits and audit trail

The benchmark covers two synthetic scenarios. Real context sizes, tokenizer choices, CLI-added instructions, tool definitions, output schemas, and provider envelopes affect actual usage. The fixed reports cannot establish reasoning-token savings, cache hits, output length, equal planning quality, or production performance. No application was implemented or production-tested by this benchmark.

This page and its [measurement JSON](benchmarks/v0.7.0-input-tokens.json) publish the recorded results and method. The original measurement harness and raw local run fixtures are not currently packaged in this repository, so a fresh clone alone does not reproduce the exact fixture counts. The source versions and automated runner tests are public; [project notes](../PROJECT_NOTES.md) retain the dated validation record. See the [efficiency protocol](../references/protocol.md#token-efficiency) for the supported behavior.

[Back to C2C](../README.md) · [FAQ](FAQ.md) · [Visual guide](C2C-LinkedIn-Guide.pdf)
