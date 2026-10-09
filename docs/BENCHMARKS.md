# C2C evaluation methods

C2C makes no quantified token-saving, cost, speed or planning-quality guarantee. Actual resource use depends on the task, selected models, context, outputs, retries and provider behavior. Review adds work and can increase total usage.

## What the tools check

| Check | What it tells you | What it does not establish |
|---|---|---|
| Automated runtime tests | Controller behavior, state, adapters, installation and recovery against fixtures | Whether a real plan is good or an account can make a worker call |
| Offline input comparison | Captured prompt/schema text, source hashes, preserved evidence and workflow contracts | Billed tokens, generated output, reasoning, cache hits or model response speed |
| Instruction counter | Per-file text sizes under pinned tokenizer encodings | Which reference sections an agent actually loads or total session usage |
| Outcome evaluation | Matched real plans, blind rubric review and separately recorded resource use | General superiority from a small or incomplete sample |

## Run an input comparison

The [benchmark guide](../benchmarks/README.md) provides pinned source checkouts, fictional fixtures and reproduction commands. The tooling makes no provider calls or authentication probes. Keep generated results outside the public repository: run files may contain local paths.

Compare each route against the same route and stages. Count full prompts, CLI schema representations and coordinator instructions separately. A check of identical sources should produce identical captures; changed or missing evidence should invalidate the comparison. The optional final-revision stage is measured separately because it adds a call only when used.

Text counts from o200k_base or cl100k_base are proxies. Provider-added instructions, tool envelopes, generated outputs, reasoning and coordinator activity are separate. Adding reductions from different measurements does not produce a whole-session saving.

## Evaluate real plans

The [outcome harness](../evals/README.md) supports frozen tasks, selected comparison arms and limits, private imports, blind scoring and checks for incomplete or mismatched evidence. A live comparison needs complete matched runs and compatible usage observations. Missing measurements stay missing; synthetic reports cannot substitute for real plans.

The bank now includes seven fictional cases: the original feature and project tasks, plus bilingual sources, mixed uploads/rights, a shared false premise, preservation of a sound plan and revision dependencies. An independent-proposals/synthesis arm is opt-in. Critical failures and per-criterion regressions cannot be hidden by an aggregate score. Quality eligibility and resource eligibility are reported separately; missing or capped task tokens cannot support a savings claim.

The separate [2.2.0](../evals/baselines/c2c-2.2.0.capture.json) and [2.3.0](../evals/baselines/c2c-2.3.0.capture.json) capture manifests pin their source commits and contain zero measured outcomes. The live outcome comparison remains incomplete. Software validation is recorded in [project notes](../PROJECT_NOTES.md) and [CI runs](https://github.com/ZiadHassanein/C2C/actions/workflows/test.yml); those checks do not certify security, production readiness or planning quality.

## Inspect observed usage

`node RUNNER usage --run RUN` reads recorded terminal counters, including failures with available output. Cached/reasoning subsets are not counted twice. Missing, malformed, ambiguous and historical unscoped counters remain unknown. Claude terminal main-loop usage and Codex terminal-turn usage are explicitly scoped; neither establishes provider-internal calls or whole-task usage. The coordinator's research, synthesis and other unobserved work are excluded, and subscription cost/savings stay unknown.

The optional `verify-compact` trial reports serialized packet bytes separately. It replaces only complete proposal text exactly equal to the full retained plan. Byte reductions are not token measurements, quality results or permission to promote the experiment. Default context remains full; matched outcome trials are still required before claiming benefit.

## What counts as improvement

Compare C2C with ordinary planning on the same frozen task, evidence, available model pool and whole-task limits. Use independent blind review and repeat across a bounded feature and a project with consequential uncertainty; a single successful fixture is acceptance evidence, not general superiority.

Judge missed requirements, unsupported assumptions, security gaps, harmful accepted remedies and whether the first implementation step is executable. Credit justified corrections and useful restraint; award nothing for verbosity, agreement or disagreement counts. Predefine material errors and acceptable alternatives before viewing outputs.

Report whole-task input/output usage, calls, retries and elapsed time separately from quality, including coordinator work and research. Missing usage remains unknown. Better quality at comparable effort, or equivalent quality at lower effort, supports the efficiency goal. Better quality with higher cost is a tradeoff; lower cost with material regressions is not a win. Do not publish an improvement claim until matched evidence supports it.

## Execution model estimates

Execution recommendations distinguish actual task-token measurements, equal-token API price estimates and subscription allowance. They are different quantities. A model can have lower token prices yet use more tokens or require extra attempts.

For a price estimate, record official rate URLs/date, exact models, input/output and cache categories, context tier, service mode, applicable fees/exclusions and a named baseline. Calculate `(baseline cost - candidate cost) / baseline cost × 100` only with a positive baseline. Unknown workload mix means category-specific comparisons or no total, not a guessed project saving.

An observed token reduction needs compatible complete task measurements, explicit quality/acceptance results and the same scope. Published experiments retain their original models, harness, sample and limitations; community anecdotes cannot supply a forecast. API list prices and credit rates do not quantify included-subscription allowance. If evidence is missing, report unknown. These recommendations do not authorize paid probes, execution, model switching or billing changes.

## Controls for repeated work

C2C deduplicates repeated context paths, reuses returned reports and task research, offers compact runner output, and records discussion in Markdown. These are specific workflow behaviors. They do not guarantee lower total token use or faster planning.

[Back to C2C](../README.md) · [FAQ](FAQ.md) · [Visual guide](C2C-LinkedIn-Guide.pdf)
