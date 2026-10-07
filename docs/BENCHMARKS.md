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

The live outcome comparison remains incomplete. Software validation is recorded in [project notes](../PROJECT_NOTES.md) and [CI runs](https://github.com/ZiadHassanein/C2C/actions/workflows/test.yml); those checks do not certify security, production readiness or planning quality.

## Controls for repeated work

C2C deduplicates repeated context paths, reuses returned reports and task research, offers compact runner output, and records discussion in Markdown. These are specific workflow behaviors. They do not guarantee lower total token use or faster planning.

[Back to C2C](../README.md) · [FAQ](FAQ.md) · [Visual guide](C2C-LinkedIn-Guide.pdf)
