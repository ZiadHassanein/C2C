# Codex-Claude Council

A shared skill that lets an existing Codex or Claude Code chat ask the other product for proposals and reviews, then produce an actionable plan with a decision record. It scales from a small feature to a whole project.

The current chat coordinates the work. A small local Node.js runner invokes the other product's CLI, captures structured responses, and preserves what was actually reviewed. It does not open a new user-facing chat or automatically run on every edit.

## Install

Requirements:

- Node.js 18 or newer.
- The peer's native CLI on `PATH`: `claude` when starting from Codex, or `codex` when starting from Claude Code. Install both for use in either direction.
- An authenticated account for the peer CLI. Sign in from your terminal with `claude auth login` or `codex login` as appropriate. The coordinator's own CLI does not need a separate login to call its peer.

Download or clone this repository, open a terminal in its root, and run:

```sh
git clone https://github.com/Ziad501/codex-claude-council.git
cd codex-claude-council
node scripts/install.mjs
node scripts/council.mjs doctor
```

The installer defaults to installing the skill for both products:

- Codex: `~/.codex/skills/codex-claude-council`
- Claude Code: `~/.claude/skills/codex-claude-council`

Restart or open a new chat if an existing session does not discover the skill. To uninstall, manually remove only the `codex-claude-council` folder from each installed location.

Use `--target codex` or `--target claude` to install only one copy. The installer respects `CODEX_HOME` and `CLAUDE_CONFIG_DIR`, preserves identical installations, and refuses to overwrite different files. Back up or rename an older named skill folder before upgrading.

If a sandboxed chat reports signed out but `doctor` works in your normal terminal, the host may need approved access to the operating system credential store. The runner does not copy credentials or elevate itself.

## Use it

In Codex:

```text
Use $codex-claude-council to plan offline support for this app.
Have both agents propose an approach independently, review each other,
and give me one plan with acceptance criteria.
```

In Claude Code:

```text
/codex-claude-council Review docs/migration.md with Codex.
Find rollout and rollback risks, then give me a revised plan and decision record.
```

It also supports non-code planning. Supply a brief, constraints, and success criteria just as you would for a normal planning conversation. You can explicitly choose a peer model or smaller time allowance in your prompt; the coordinator passes supported settings to the runner.

Before the discussion, the coordinator assesses task size (small to extra-large), complexity, risk, and uncertainty, then recommends suitable models for planning and review with a brief rationale and confidence level. A small security change can need deeper review than a large repetitive edit. It checks current model information before naming candidates and labels unverified availability clearly.

**Recommendations do not change your settings.** Your chosen models or CLI defaults remain in use unless you explicitly ask to change them. Advice does not pause already-authorized work. You can also request only an assessment:

```text
Use $codex-claude-council to assess this task's size and recommend
models for planning and review. Keep my current models; advice only.
```

The coordinator saves this in `TASK_ASSESSMENT.md`, links it from the handoff, and summarizes it in the final plan. This is an agent-authored recommendation; the runner does not automatically select a model from the file.

| Mode | Workflow | Successful peer calls |
|---|---|---:|
| Plan | Independent drafts, mutual critique, synthesis, peer verification | 3 |
| Review | Independent critiques of a supplied or newly drafted candidate plan, synthesis, peer verification | 2 |

### Small features and big projects

The coordinator chooses a proportionate planning depth and explains it in the task assessment. You can ask for a particular depth; model recommendations remain advisory.

| Task | Usual approach | What you receive |
|---|---|---|
| Small feature with a clear approach | Focused review of a supplied or newly drafted plan; 2 successful peer calls | Concise implementation steps, edge cases and acceptance checks. |
| Feature with meaningful design choices | Independent drafts and mutual critique; 3 successful peer calls | Compared approaches, chosen design, integration details and verification plan. |
| Big project | One project-level planning council; 3 successful peer calls | Scope and MVP, architecture, milestone dependencies, acceptance gates and a detailed first milestone. |

Risk and uncertainty can justify deeper planning even for a tiny change. Reviewing an existing big-project plan can use the two-call review workflow. Later milestones remain provisional where evidence is missing; the skill does not automatically launch a council for every feature or increase your usage limits. It retains the Markdown roadmap and decision history for future refinement.

Small feature:

```text
Use $codex-claude-council to plan a search filter for this screen.
Keep it focused, with implementation steps and acceptance checks.
```

Big project:

```text
Use $codex-claude-council to plan this whole product from the brief.
Compare architectures, define the MVP, map dependent milestones,
and detail the first milestone. Recommend models without changing mine.
```

In Claude Code, start the same request with `/codex-claude-council`.

### Saved plans and handoffs

The coordinator handles the runner commands and writes a final plan. Each run retains the selected input snapshot, both agents' reports, `final-plan.md`, `decisions.json`, and completion provenance in `RESULT.md`. Decisions record which findings were accepted, rejected with reasons, or remain unresolved. Agreement is not required.

The coordinator also maintains a concise `HANDOFF.md` in the run directory, including progress, evidence links, unresolved decisions, remaining limits, and the exact next step. On resume, it reads that note and checks current runner state instead of repeating completed work. Failed or partial runs retain the evidence produced so far; they do not have a completed `RESULT.md`.

## Context and permissions

Only the explicitly selected UTF-8 brief, context files, and relevant reports are transmitted to the peer provider. Projects are not automatically scanned or copied. Select relevant excerpts and exclude secrets before invoking a peer.

Peers run in isolated temporary working directories with project tools disabled and reduced inherited configuration. The coordinator gathers evidence, runs authorized experiments, and makes project edits. Managed organization policies still apply; these controls do not provide an OS-level security boundary. Planning does not grant permission to implement or deploy.

The runner prevents recursive council calls, parallel use of one run, silent changes to sealed reports, and repeated successful stages. Defaults are 300 seconds per peer call, 900 seconds of cumulative peer runtime, and four attempts including failures. These are runtime limits, not token or billing caps; ordinary provider usage applies.

Failures preserve partial results and are reported explicitly. A plan changed after peer verification is marked as changed and has not received another peer review. A completed exchange can still contain unresolved findings; it is not a guarantee that the plan is ready to implement.

## Development and verification

No npm dependencies are required. Run the automated suite with:

```sh
node --test tests/council.test.mjs
```

The tests cover independent inputs, report and source integrity, failure paths, stage sequencing, run isolation, and verification provenance. They also exercise a real child-process timeout, including the Windows termination path when run on Windows. Peer response fixtures test the runner without paid model calls; they do not prove that either provider is currently authenticated or available. Use `doctor` and a real task to verify your local setup.

See [SKILL.md](SKILL.md) for the agent workflow and [references/protocol.md](references/protocol.md) for runner commands and report formats.

For continued development, read [PROJECT_NOTES.md](PROJECT_NOTES.md) first. The repository's `AGENTS.md` and `CLAUDE.md` point both products to that maintained record.

## License

[MIT](LICENSE).
