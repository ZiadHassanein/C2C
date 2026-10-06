# Project notes and continuation guide

Last updated: 2026-10-06. This is the maintained project summary, not a transcript. Read it before rediscovering the design or repeating validation. Check the current source, Git state, and run manifests before relying on dated observations.

## Objective and current status

Build a reusable skill that lets Codex and Claude Code contribute independent proposals, critique each other, and produce one actionable plan with a decision record. The user requested Markdown notes to make later sessions faster and more accurate.

- Version 0.1.0 is implemented and published at [Ziad501/codex-claude-council](https://github.com/Ziad501/codex-claude-council).
- The initial published implementation is commit `6343b8b4b3efa5dd96b02b048185d8c6889299fb`.
- The skill was installed in both products on the development machine; installation and authentication are machine-specific, not guarantees for another user.
- License: MIT. No npm dependencies. Node.js 18+; CI covers Node 22 and 24.
- Real CLI calls succeeded in both directions. A complete live planning cycle has **not** been demonstrated: the longer Claude verification stage exhausted its test budget. Preserve that distinction.

## Decisions and reasons

| Decision | Reason |
|---|---|
| The existing chat coordinates; only the peer CLI is launched | Preserves the user's working context and avoids requiring a second CLI login for the coordinator itself. |
| Skill instructions plus a Node runner | Instructions govern planning; code handles transport, state, validation, deadlines, and evidence. |
| Independent drafts and independent critiques | Reduces anchoring. A peer's draft packet excludes the coordinator draft; its critique packet excludes the coordinator critique. |
| One coordinator produces the final plan | Makes responsibility and finding dispositions clear without demanding consensus. |
| Explicitly selected, frozen UTF-8 context | Both participants work from identifiable evidence; the runner does not scan the repository or copy the whole chat. |
| Restricted peer invocation in a temporary directory | The coordinator supplies evidence and performs authorized actions; the peer cannot recursively launch councils or freely modify the project. Managed policies still apply. |
| JSON reports and Markdown plans/handoffs | Structured state supports validation; concise Markdown lets people and future agents resume efficiently. |
| One successful response per stage and bounded attempts/runtime | Prevents accidental loops and silently repeated paid calls. |
| Keep post-verification edits visible | A revised plan must not be represented as the exact version the peer reviewed. |
| Scope collaboration by task | Support substantial planning and requested reviews without making every small edit require two agents. |

## File map

| File | Purpose |
|---|---|
| `SKILL.md` | Instructions used by either coordinator. |
| `references/protocol.md` | Commands, report schemas, finding decisions, and handoff format. |
| `scripts/council.mjs` | Dependency-free runner and CLI adapters. |
| `scripts/install.mjs` | Installs both product copies by default; does not overwrite different existing files. |
| `tests/council.test.mjs` | Automated state, transport, timeout, and installer tests. |
| `agents/openai.yaml` | Codex skill name and suggested invocation. |
| `.github/workflows/test.yml` | Windows/Ubuntu tests on Node 22/24. |
| `README.md` | User setup and usage. |

## Workflow and persisted evidence

The runner commands are `doctor`, `prepare`, `ask`, `status`, and `finish`. The coordinator writes the intermediate reports and final plan; the runner does not autonomously perform the entire discussion.

- **Plan mode:** coordinator draft → peer draft → coordinator critique → peer critique → synthesis → peer verification → finding dispositions → finish. Three successful peer calls.
- **Review mode:** existing plan and coordinator critique → peer critique → synthesis → peer verification → finding dispositions → finish. Two successful peer calls.
- Coordinator findings use `C-D…` / `C-R…`; the runner assigns peer IDs `P-D…` / `P-R…` / `P-V…`.
- Every finding needs an accepted, rejected, or unresolved disposition and a substantive reason.
- Defaults: 300 seconds per peer call, 900 seconds cumulative peer runtime, four model-launch attempts. Failed model calls count. Preflight checks do not. These are not billing/token caps.
- A run retains `snapshot.json`, `run.json`, schemas, report files, attempt inputs/logs, `final-plan.md`, and `decisions.json`. Successful completion also produces `completion.json` and `RESULT.md`.
- The coordinator maintains a concise `HANDOFF.md` in the run directory. It is a navigation summary, not the authority for stage success or permission to retry.
- Resume by reading `HANDOFF.md` and running `status`, then inspect only the relevant evidence. Do not replay successful stages. Start a new run only when justified by changed task/evidence; do not reset a run to escape its budget.

## Validation actually performed

Observed on 2026-10-06:

| Check | Result and limit |
|---|---|
| Skill frontmatter validation | Passed for source and both installed copies. |
| Automated suite | All 24 tests passed locally on Windows. Tests use fixtures, except actual child-process timeout behavior. |
| Initial GitHub CI | [Run 37416553250](https://github.com/Ziad501/codex-claude-council/actions/runs/37416553250) passed all four Windows/Ubuntu × Node 22/24 jobs at the initial implementation commit. |
| Real Claude draft | Passed in about 78 seconds using Claude Code 2.1.291. |
| Real Claude mutual critique | Passed in about 126 seconds. It supplied concrete transaction, rendering, backup, and offline-test improvements. |
| Real Claude final verification | Timed out at 180 seconds, then at the remaining approximately 155 seconds. The sample used a 540-second total budget and all four attempts; it remains incomplete. These were shorter limits than the default configuration. |
| Real Codex adapter | One successful draft call in about 12 seconds using Codex CLI 0.160.1. It correctly returned `insufficient_context` for an underspecified synthetic README task. This was adapter validation, not a full Claude-led council. |
| Normal-user authentication | Both CLIs were authenticated. A sandboxed Codex check falsely appeared signed out because that process could not access the normal credential store. Do not assume this historical login state persists. |

No model override was used for those live calls. Do not infer a precise model identity from CLI version or product name. No real application was built or browser-tested as part of the synthetic planning exercise.

## Reliability fixes already made

- Windows timeout cleanup handles a nonzero `taskkill` exit and falls back to terminating the owned direct child process.
- Empty peer drafts and malformed/error responses cannot become successful stage evidence.
- Evidence modified during a peer call invalidates the result.
- Verification hashes identify the exact plan and decision record submitted, including edits made during or after the call.
- Interrupted attempts are persisted and charged before budget checks; recovery does not charge them twice.
- Temporary-directory cleanup checks its target and reports a cleanup failure without overwriting the substantive invocation result.
- Installer preflight checks all destinations before copying and preserves existing different files.

## Known limits and sensible next work

1. Investigate the long Claude verification stage before claiming an entirely successful live council. The root cause is unconfirmed. Smaller verification packets, concise output instructions, and appropriately chosen time allowances are possible experiments, not proven fixes. Do not reopen the exhausted sample run.
2. The runner inherits provider defaults unless a peer model is explicitly requested. Codex peer runs ignore ordinary user configuration for isolation. Exact model selection and availability require current checks.
3. Limits bound calls and runtime, not money or tokens. The runner does not implement autonomous coding, continuous monitoring, or unrestricted agent messaging.
4. The initial CI passed with non-blocking warnings about the action runtime of `checkout@v4` and `setup-node@v4`; updating those actions is optional maintenance, not a failed test.
5. Source paths/content and local run logs can contain private project information. Keep live run records out of the public repository unless separately sanitized and authorized.

## Commands for continuing development

```sh
node scripts/council.mjs doctor
node --test tests/council.test.mjs
node scripts/council.mjs status --run /absolute/path/to/existing/run
git status --short
```

For documentation-only changes, validate affected skill instructions and links rather than making new paid model calls. Run the existing tests when runtime or installation behavior changes. Update this file when decisions, validation evidence, or limitations materially change; link to detailed evidence instead of copying complete transcripts.
