# Setup and help

[← Quick start](../README.md)

Use this page when you need help with installation, updating, or a failed setup check. For normal use, paste a request into your project chat and let the AI handle the runner.

**Start in either app; setup is optional.** The initiating chat coordinates C2C. Before calls, it prefers an eligible cross-provider exchange, then a planner and distinct coding critic from the current provider if the other is unavailable. The latter needs that provider's ready CLI and two eligible exact models within your limits. If neither route qualifies, the chat produces a provisional plan with structured self-critique. It does not require installing, updating or signing in to another tool. The repair instructions below apply when you choose to enable that exchange.

**Install:** [Quick start](../README.md#install) · [One app](#install-for-one-app-only) · [Linux/macOS](#linux-and-macos) · [Check setup](#check-your-setup)

**Maintain:** [Update or roll back](#update-the-skill) · [Uninstall](#uninstall) · [Models](#choose-the-participants) · [Usage and privacy](#usage-and-privacy)

**Fix a problem:** [Troubleshooting](#troubleshooting) · [Login and background workers](#do-i-need-another-terminal-open) · [Timeouts](#when-a-peer-call-takes-longer) · [Usage limits](#when-a-participant-hits-a-usage-limit)

## Install for one app only

The default installer adds the skill to both apps. To choose one, run **one** of these instead:

```sh
node scripts/install.mjs --target codex
```

```sh
node scripts/install.mjs --target claude
```

This chooses where the **skill** is installed. Cross-provider discussion needs the other provider's CLI and, when using a background author, the coordinator provider's CLI too. Same-provider discussion uses that provider's own CLI, whether selected automatically or requested. Missing unused CLIs do not block a valid route. See [routing and provisional planning](../references/protocol.md#planning-with-unavailable-tools).

Default locations (`~` means your user folder):

| App | Skill folder |
|---|---|
| Codex | `~/.codex/skills/C2C` |
| Claude Code | `~/.claude/skills/C2C` |

If you already use `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, the installer uses that configured root. You do not need to set either variable for a normal installation.

## Linux and macOS

Use the same `node scripts/install.mjs` and `node scripts/council.mjs doctor` commands as the quick start. Install as your normal user; `sudo` would target another user's configuration. Keep the uppercase `C2C` folder name on case-sensitive filesystems. C2C's scripts are run with Node, so they do not need their own executable bit.

The test matrix runs the complete offline suite with Node 18, 22 and 24 on:

| Platform | Architectures | GitHub runner |
|---|---|---|
| Linux (Ubuntu) | x64, ARM64 | `ubuntu-latest`, `ubuntu-24.04-arm` |
| macOS | Apple Silicon, Intel | `macos-latest`, `macos-15-intel` |
| Windows | x64 | `windows-latest` |

See the [CI workflow](../.github/workflows/test.yml) and [GitHub runner definitions](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). These tests exercise installation, executable discovery, process cleanup, state/locks and planning workflows with local fixtures. They do not authenticate real provider accounts or establish compatibility with every Linux distribution, filesystem or OS version. Provider CLI requirements still apply: [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) and [Claude Code setup](https://code.claude.com/docs/en/setup).

If `doctor` cannot find a CLI, check the environment that starts your coordinating app:

```sh
command -v node
command -v codex
command -v claude
```

Installed CLIs must be executable and available on that process's `PATH`. npm/Homebrew executable symlinks and executable scripts with a valid shebang are supported on Linux/macOS; shell aliases and functions are not executables. A desktop app may inherit a different `PATH` from your terminal. Restart it after fixing its environment, or supply `COUNCIL_CODEX_BIN` / `COUNCIL_CLAUDE_BIN` with the absolute executable path in its launch environment. An explicit invalid or non-executable override fails instead of selecting another CLI. Use the provider's installer to repair missing executable permissions; C2C does not modify CLI permissions automatically.

Store run folders on a local filesystem supporting hard links and atomic renames. Older macOS locks created before canonical process identities may need inspected recovery after the owner stops; C2C preserves ambiguous live locks rather than reclaiming them. Follow [lock recovery](../references/protocol.md#compatibility-and-recovery).

## Check your setup

Open a terminal in the cloned `C2C` folder (or the extracted `C2C-main` ZIP folder) and run:

```sh
node --version
node scripts/council.mjs version
node scripts/council.mjs doctor
```

Node must be 18 or newer. `doctor` checks CLI availability, required flags and feature controls, and visible saved authentication. Read its readiness values even if the command itself finishes successfully:

- `codex_chat_ready: true`: a Codex chat can call Claude.
- `claude_chat_ready: true`: a Claude Code chat can call Codex.
- `codex_only_ready: true`: a Codex chat can call the Codex CLI for a same-provider run.
- `claude_only_ready: true`: a Claude Code chat can call the Claude CLI for a same-provider run.

A missing CLI does not block a route with no worker from that provider. Before calls, an unavailable other provider can lead to a same-provider exchange; if that cannot qualify, C2C continues provisionally instead of requiring setup. A cross-provider exchange with a background author needs both CLIs ready; a same-provider exchange needs the current provider's CLI and eligible distinct models. Readiness does not validate credentials with the provider or establish model access, identity or included allowance. A successful response confirms that particular call worked.

**Both apps work, but C2C reports an incompatible worker?** The app and terminal may use different CLI installations. C2C checks distinct installed candidates in PATH order and skips those missing required capabilities. `candidate_checks` shows the paths, versions and reasons; `executable` identifies the selected CLI. Explicit `COUNCIL_CODEX_BIN` / `COUNCIL_CLAUDE_BIN` overrides select one binary without fallback. Execution or login failures stop selection; C2C does not try another account or weaken restrictions. No reinstall or extra terminal is required when a compatible, eligible installation is already available.

## Do I need another terminal open?

No. Keep your coordinating chat open; C2C runs the peer non-interactively using `claude -p` or `codex exec`, with piped input/output and hidden Windows process windows. Claude can work for Codex without an open Claude panel, and Codex can work for Claude without an open Codex app. The peer CLI must be installed, accessible to the coordinator, and authenticated.

An inaccessible or expired login leaves that worker unavailable. C2C follows its [routing and recovery rules](../references/protocol.md#planning-with-unavailable-tools) without requiring a repair. If you choose to restore the exchange, renew a saved login with `claude auth login` or `codex login`; the browser flow may require your interaction. An environment-supplied key or token may instead be the selected credential; native login does not replace it. After fixing the selected authentication source, ask C2C to inspect the existing run and resume its failed stage within the remaining allowance. Opening a peer terminal alone does not renew a login. See [Claude's non-interactive mode](https://code.claude.com/docs/en/headless) and [login renewal](https://code.claude.com/docs/en/authentication#renew-an-expiring-login).

## Update the skill

For a clone created before the repository was renamed to C2C, update its remote once from inside that clone:

```sh
git remote set-url origin https://github.com/ZiadHassanein/C2C.git
```

From a Git clone:

```sh
git pull --ff-only
node scripts/install.mjs --update
node scripts/council.mjs doctor
```

For ZIP installs, extract the latest ZIP and run the same Node commands there. Use `--target codex` or `--target claude` for one app. Start a new chat after updating.

The updater checks all selected destinations before replacing files. Managed receipts identify clean installations; a trusted release manifest recognizes clean v0.11.3 copies. Extra, missing, linked or modified installed files are preserved and cause refusal. There is no silent force-overwrite. For an older unrecognized or customized copy, preserve it manually outside every skill-discovery directory before a fresh install.

Backups and transaction records live under each configuration home's `c2c-install-backups`, outside `skills`. Keep the printed transaction ID. To undo the update, use its printed command:

```sh
node scripts/install.mjs --rollback TRANSACTION_ID
```

Rollback also refuses to replace a modified current installation. If an update or rollback was interrupted, inspect the reported transaction and resume recovery with:

```sh
node scripts/install.mjs --recover TRANSACTION_ID
```

Recovery restores the previous installations; retry the intended update afterward. Retain the same selected `--target` from the printed command. Backups are not automatically deleted. Configuration roots and skill folders on different filesystems may prevent atomic renames; repair that layout rather than copying over a partial installation.

The commands are now `$C2C` in Codex and `/C2C` in Claude Code. The repository folder can keep its original name.

Downloading updates alone does not update installed copies. Matching content, including harmless LF/CRLF differences, is idempotent. Keep backups until the new installation works. Receipts detect changes; they are not signed supply-chain attestations.

## Uninstall

No uninstall command is needed. You can remove C2C from one app or both using your file manager:

1. Finish or stop active C2C runs. Removing the skill folder does not stop a worker that is already running.
2. Locate the relevant folder below. Preserve any files you added inside it, then move **only the `C2C` folder** to the Recycle Bin/Trash, or to a backup location outside all skill folders.
3. Start a new chat in each affected app. Existing chats may still contain previously loaded C2C instructions.

| App | Windows: paste into File Explorer's address bar | macOS / Linux |
|---|---|---|
| Codex | `%USERPROFILE%\.codex\skills\C2C` | `~/.codex/skills/C2C` |
| Claude Code | `%USERPROFILE%\.claude\skills\C2C` | `~/.claude/skills/C2C` |

`~` means your home folder. If you installed with `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, use `skills/C2C` inside that configured root instead. The installer's `Installed:` or `Updated:` output shows the exact destination. Keep the parent configuration and `skills` folders; they can contain other settings and skills.

Removing C2C leaves Codex, Claude Code, Node.js, your logins, and projects/plans saved elsewhere in place. The downloaded repository/ZIP and retained installer backups also stay on disk. You can keep those, or remove them separately after preserving any work stored there; deleting backups gives up their rollback option. Deleting the downloaded repository alone does not uninstall the skill.

## Choose the participants

The chat you start is the coordinator; neither provider is permanently in charge. A normal C2C request selects the first eligible route below before calls:

| Starting chat | Preferred route | If the other provider is unavailable |
|---|---|---|
| Codex | Codex planning author + Claude planning reviewer | Codex planning author + distinct Codex coding critic |
| Claude Code | Claude planning author + Codex planning reviewer | Claude planning author + distinct Claude coding critic |

Same-provider review requires the current provider's compatible, authenticated CLI, two eligible exact model IDs, and known authorized allowance. You can also ask for “Codex only” or “Claude only.” These routes use actual responses from distinct models. If the required CLI is missing, no eligible pair exists, or allowance is unknown or unavailable, the current chat delivers a provisional plan with structured self-critique. It identifies assumptions, counterexamples, alternatives and unresolved risks without attributing invented replies to another model.

Requests to require both providers, wait, pin participants or models, reserve selection, or receive advice only override automatic routing. A partially completed run retains its participants, reports and consumed allowance; any continuation follows the [recovery protocol](../references/protocol.md#planning-with-unavailable-tools).

After checking required tool availability, each new task using workers searches and opens current official model guidance for its selected providers, compares planning/coding suitability and checks access evidence. A provisional-only plan records unavailable selections as skipped without blocking on inaccessible-worker research. Findings go in `TASK_ASSESSMENT.md`; retries reuse them. There is no permanent model ranking. If one model leads both roles in a same-provider discussion, C2C explains its distinct adequate critic. See the [selection policy](../references/model-selection.md).

Your current chat stays unchanged. When trustworthy metadata shows it exactly matches the selected planner, C2C can reuse it as author. Otherwise `--author-model` launches that provider's selected planner in the background; `--peer-model` selects the other participant. Unknown chat identity need not block this route. Both CLIs are required when background workers use both providers.

Exact versioned IDs distinguish participants; different effort, alias, or context variants of one model do not. Different IDs and separate calls do not prove independent reasoning. Local catalog entries do not prove account entitlement, and recorded selections do not prove a provider honored them. CLI-reported identity and unknowns remain visible. C2C avoids models outside the known authorized billing scope and makes no paid model-selection probes. [Technical pairing rules](../references/protocol.md#pairing-and-model-identity) preserve separate contributions, security and verification. Reviewers challenge claims with evidence, counterexamples and alternatives; the coordinator adjudicates findings, and the reviewer answers material counterarguments by ID during verification. Sound conclusions can survive review; disagreement is not a quota.

## Follow the discussion

The generated `DISCUSSION.md` is the default place to follow the discussion. C2C links it at the start, keeps chat focused on questions, blockers and necessary progress, then gives a short final decision brief with the plan and discussion links. Ask “show the main disagreements and plan changes as you go” if you also want live chat summaries. Quiet/final-only requests are honored within the host app's requirements. The AI handles the runner commands for you.

The file identifies each agent's submitted points, the coordinator's decisions, and unresolved questions. It updates at saved transitions, not on every output token; a pending call is not a completed review. C2C does not invent dialogue or stream private reasoning. [Call counts](#usage-and-privacy) depend on whether the selected author runs in the current chat or in the background.

Open the run's generated `DISCUSSION.md` to read the evidence-backed account. It stays local and is excluded from peer inputs. To refresh it after local report or decision edits, ask the AI to refresh the discussion. For manual inspection from the repository folder:

```sh
node scripts/council.mjs discussion --run "/absolute/path/to/run"
```

Replace the path with the run folder. Run this between stages to refresh the discussion and return its file path, then open that file. You can read the existing file while a peer call is pending. Refreshing does not make another model call or advance the planning stages.

## Usage and privacy

Before planning, the AI checks the relevant project context and makes the goal, scope, success criteria, and next step explicit. It writes the assessment files for you. It may ask a focused question when an essential requirement is missing; unknown deployment details alone do not prevent a useful plan. Read `PROJECT_CONTEXT.md` for the evidence and limits. For an assessment without a peer discussion, ask for “assessment only.”

The skill runs a short, bounded exchange through your existing provider accounts. Normal provider usage applies.

C2C reduces repeated instructions, report reads and review prose by default. The AI uses `--compact` for routine runner output; it preserves every JSON field while removing formatting whitespace. Manual commands remain formatted for readability unless you add that flag. This does not change models, review stages or limits; actual usage depends on the task and provider. See [token efficiency](../references/protocol.md#token-efficiency).

| Allowance | Standard: bounded work | Project: large/deep plans |
|---|---|---|
| Time per peer call | 5 minutes | 10 minutes |
| Combined peer runtime per run | 15 minutes | 40 minutes |
| Launch attempts, including failed calls | 4 | 5 |

With the current chat as author, required stages use two successful calls for focused review or three for independent planning. A background author raises these to three and five respectively; its independent-planning route defaults to six attempts unless explicitly capped. The optional final-revision check adds at most one successful call. All author and peer calls share the run's allowance. The coordinator states the route and ceilings before starting; manual `prepare` defaults to `standard`, and explicit limit flags override defaults. These are runtime and attempt limits, **not spending or token caps**. [Bounded recovery](#when-a-peer-call-takes-longer) preserves successful stages and charged attempts; starting over cannot reset a failed run's budget.

Your current chat selects the brief and relevant context to send to the peer's provider. The runner does not automatically copy your whole project or chat. Exclude secrets and unrelated private material. Its check for obvious secrets is limited and cannot detect everything.

C2C never buys or enables extra paid usage to recover from a limit. It does not upgrade plans, raise spending limits or move the task to API/cloud billing. A ready login does not establish remaining included usage or disabled account overage; check the provider's supported billing controls when you require included usage only. Unknown eligibility is a reason to keep planning provisional or checkpoint before worker calls, not to test a paid route. [No-paid-recovery behavior](FAQ.md#will-c2c-buy-credits-or-require-paid-usage-after-a-limit).

The peer is instructed to use supplied evidence. Calls disable applicable shell, image, browser, connector and agent features, use a neutral working directory and request read-only permissions. Some CLI tools may remain present but subject to those permissions. These settings are not a substitute for the host sandbox or managed policy. The current chat gathers evidence and performs any work you have authorized.

Worker selection uses current research and your constraints; it does not change the current chat or global settings. Ask for “advice only” to get recommendations without calls. Codex workers ignore ordinary user configuration for isolation, so C2C uses explicit selected IDs rather than assuming a CLI default matches another session. Some models can consume additional credits in non-interactive mode: C2C must establish that this is within your authorized scope before choosing them.

Every new council plan includes a security review and relevant test checks. The [plan presentation guide](../references/plan-presentation.md) puts priority decisions, the proposed scope, and the next action before technical appendices. Unresolved findings and edits made after peer verification remain visible. Completing the discussion does not mean every issue is resolved or the implementation has been tested.

## Troubleshooting

| What you see | What to do |
|---|---|
| `node` is not recognized or not found | The current chat can still deliver a provisional plan. If you choose to enable the scripts, install [Node.js](https://nodejs.org/en/download), reopen your terminal, and check `node --version`. |
| `git` is not recognized or not found | Use the [ZIP download](https://github.com/ZiadHassanein/C2C/archive/refs/heads/main.zip), extract it, and open a terminal in the folder containing `scripts`. |
| Cannot find `scripts/install.mjs` | You are in the wrong folder. Open a terminal in the extracted or cloned repository folder, then rerun the command. |
| `doctor` cannot find `claude` or `codex` | Ignore it if the route does not use that CLI; otherwise apply [available-provider routing](#choose-the-participants). If you choose setup, use the [Claude Code](https://code.claude.com/docs/en/quickstart) or [Codex](https://learn.chatgpt.com/docs/codex/cli) guide. |
| `doctor` reports signed out | Treat that worker as unavailable and apply [routing rules](#choose-the-participants). If you choose setup repair, check the environment/access row below before renewing the selected native login. |
| `doctor` is ready, but a call reports expired/rejected authentication | Preserve the failed attempt and follow [bounded recovery](../references/protocol.md#planning-with-unavailable-tools). Repair is optional; no account or billing change is implied. |
| A provider, account, or model reports a usage limit | Stop that route and preserve actual work and used allowance. See [usage-limit fallback](#when-a-participant-hits-a-usage-limit) for eligible continuation or a provisional plan. |
| Codex is missing the required `view_image` control | Keep required controls enforced and apply [routing rules](#choose-the-participants). If you choose repair, update or explicitly select a compatible binary. Version 0.146.0 lacks this control; 0.160.1 passed local checks. |
| A required CLI flag is missing | Treat that worker as unavailable and apply [routing rules](#choose-the-participants); updating the CLI is optional setup work when requested. |
| The installer finds a legacy skill | Follow [Update the skill](#update-the-skill) to move the old `codex-claude-council` installation outside all skill directories, then rerun installation. |
| A different installation already exists | Follow [Update the skill](#update-the-skill). The installer protects existing files instead of overwriting them. |
| The skill does not appear in chat | Confirm installation, then start a new chat or restart the app. Use the Codex `$C2C` or Claude `/C2C` prompt. |
| Terminal setup works, but the chat reports signed out | Check that the chat uses the same OS account, CLI, and config directory; a restricted host may not see its credential store. Credential environment variables may select another authentication source. Use the approved host execution path; do not copy credentials or change accounts/billing automatically. |
| A discussion times out or fails | Ask the AI to inspect `HANDOFF.md` and `status`, then follow [bounded recovery](#when-a-peer-call-takes-longer) on the same run. Saved activity can distinguish an unfinished response from no observed output; neither is a completed review. |

The installer does not install either provider CLI, create accounts, or sign in for you. Windows npm Codex installations are discovered through their native package binary. When multiple versions are installed, you can set `COUNCIL_CODEX_BIN` to the chosen executable for your terminal session; see [compatibility and recovery](../references/protocol.md#compatibility-and-recovery).

For a damaged or stale run lock, ask the AI to inspect the saved state and follow the [recovery procedure](../references/protocol.md#compatibility-and-recovery). Never delete a live lock or reset attempts to make a run continue.

## When a peer call takes longer

A signed-in peer can take longer than its deadline to return a complete structured plan. Opening another app or terminal does not fix that. C2C uses a larger allowance for large/deep project planning and shows safe activity while waiting: elapsed time, remaining allowance, and received-output size. Activity means the worker has emitted output; it does not mean a usable proposal or review is ready. The AI does not expose raw reasoning or treat a partial response as agreement.

For an existing incomplete run, ask:

```text
Use C2C to inspect and resume this run. Preserve successful stages.
If your original allowance was too small, extend this same run within
the bounded recovery limits. Keep my model settings and explicit caps.
```

C2C first checks the failure and remaining stages. If recovery is covered by your existing request, it can increase its own conservative allowance without another approval prompt. It records why the limits changed and keeps every used attempt, completed stage, and reviewed artifact. It must respect any time, attempt, or spending cap you set. Fixing a rejected login can still require your participation in the native sign-in flow.

Advanced users can check a pending call without repeating the project assessment/history or making a model call:

```sh
node scripts/council.mjs progress --run "/absolute/path/to/run" --compact
```

Use `status` instead of `progress` for full budget and stage details before recovery or resumption.

The [technical recovery command](../references/protocol.md#budgets-and-bounded-recovery) takes absolute totals, with hard ceilings of 15 minutes per call, 60 cumulative peer minutes, and six attempts. It never launches a peer itself or changes a running deadline. Exhausted ceilings leave an honest partial plan; successful stages are never replayed and a fresh run is not a way to bypass the cap.

## When a participant hits a usage limit

Stop calls to the blocked route. Before any calls, an unavailable other provider can lead to an eligible same-provider pair under [participant selection](#choose-the-participants). For a prepared or partial exchange, follow the [usage-limit recovery protocol](../references/protocol.md#no-paid-limit-recovery): preserve actual reports, participant identities and all consumed allowance. A new folder cannot reset a task's limits. Models from one provider may share the exhausted allowance; availability cannot be inferred from a different model name.

If no eligible continuation fits the remaining authority and limits, the available chat completes a **provisional plan with structured self-critique**, or saves a checkpoint if it has no allowance. It retains actual contributions, security, proposed tests and unresolved risks. Reversible assumptions include validation checks; material decisions remain gates. Missing review stays explicit. “Wait for both participants” or “require both reviews” takes precedence. No credits, upgrades, account changes or alternative billing are part of recovery.

Usage limits, timeouts, and rejected authentication are separate causes. C2C records the observed failure without guessing, and a larger runner allowance cannot remove a provider usage block. [Timeout recovery](#when-a-peer-call-takes-longer) and [login repair](#do-i-need-another-terminal-open) retain their existing rules.

For a prepared run, the provisional plan remains in `final-plan.md`; `NOTES.md` records the fallback and resume point. Reports, attempts, participant settings, and successful stages remain intact. Generated progress and discussion keep their real stage status. Missing required stages leave the run incomplete; if only the optional final-revision check is blocked, completion can explicitly record an unreviewed revision. If the block occurs before preparation, the chat saves a standalone plan and notes, linking only files that exist.

If the current chat also becomes unavailable, automatic takeover cannot be guaranteed. Open an available chat and ask it to continue provisional planning from the saved artifacts. It must preserve the original council's sealed participants and unfinished stages. To resume the council after access returns, ask C2C to inspect the saved handoff, notes, assessment, and status, then continue only pending stages within the remaining authority and allowance. Successful stages are never replayed, and a new run cannot erase used attempts.

## For contributors

Read [PROJECT_NOTES.md](../PROJECT_NOTES.md) before changing the skill. The [protocol](../references/protocol.md) documents commands, schemas, and saved evidence; [SKILL.md](../SKILL.md) contains the AI's instructions.

For runtime or installer changes, run:

```sh
npm test
```

For documentation-only changes, check links and examples without starting paid planning calls.
