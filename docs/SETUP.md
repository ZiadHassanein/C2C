# Setup and help

[← Quick start](../README.md)

Use this page when you need help with installation, updating, or a failed setup check. For normal use, paste a request into your project chat and let the AI handle the runner.

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
- `codex_only_ready: true`: a Codex chat can call the Codex CLI for an explicitly requested same-provider run.
- `claude_only_ready: true`: a Claude Code chat can call the Claude CLI for an explicitly requested same-provider run.

A missing CLI is okay only when the selected route has no worker from that provider. Cross-provider planning with a background author needs both CLIs ready; same-provider planning needs that provider's CLI. Readiness does not validate credentials with the provider or establish model access or identity. A successful response confirms that particular call worked.

## Do I need another terminal open?

No. Keep your coordinating chat open; C2C runs the peer non-interactively using `claude -p` or `codex exec`, with piped input/output and hidden Windows process windows. Claude can work for Codex without an open Claude panel, and Codex can work for Claude without an open Codex app. The peer CLI must be installed, accessible to the coordinator, and authenticated.

Sign in through the native CLI once when needed. If the saved CLI login expires or is rejected, renew it with `claude auth login` or `codex login`; the browser flow may require your interaction. An environment-supplied key or token may instead be the selected credential; native login does not replace it. After fixing the selected authentication source, ask C2C to inspect the existing run and resume its failed stage within the remaining allowance. Opening a peer terminal alone does not renew a login. See [Claude's non-interactive mode](https://code.claude.com/docs/en/headless) and [login renewal](https://code.claude.com/docs/en/authentication#renew-an-expiring-login).

## Troubleshooting

| What you see | What to do |
|---|---|
| `node` is not recognized or not found | Install [Node.js](https://nodejs.org/en/download), reopen your terminal, and try `node --version`. |
| `git` is not recognized or not found | Use the [ZIP download](https://github.com/ZiadHassanein/C2C/archive/refs/heads/main.zip), extract it, and open a terminal in the folder containing `scripts`. |
| Cannot find `scripts/install.mjs` | You are in the wrong folder. Open a terminal in the extracted or cloned repository folder, then rerun the command. |
| `doctor` cannot find `claude` or `codex` | Install the required CLI using the [Claude Code](https://code.claude.com/docs/en/quickstart) or [Codex](https://learn.chatgpt.com/docs/codex/cli) setup guide. Reopen the terminal and check again. |
| `doctor` reports signed out | If the same CLI works in your normal terminal, check the environment/access row below first. Otherwise run `claude auth login` or `codex login` for the required peer, then rerun `doctor`. |
| `doctor` is ready, but a call reports expired/rejected authentication | Authentication was visible; the provider rejected it during the call. Repair the selected credential source or renew native CLI login, then resume within the remaining allowance. C2C does not retry automatically or switch accounts/billing. |
| A provider, account, or model reports a usage limit | The available chat continues a provisional plan within your remaining limits, preserving actual work and identifying missing review. See [usage-limit fallback](#when-a-participant-hits-a-usage-limit). |
| Codex is missing the required `view_image` control | Upgrade Codex or select a compatible binary using `COUNCIL_CODEX_BIN`. Version 0.146.0 lacks this control; 0.160.1 passed local checks. C2C blocks before spending an attempt. |
| A required CLI flag is missing | Update that CLI using its official setup guide, then rerun `doctor`. |
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

When a provider, account, or model usage block is reported, C2C defaults to completing a **provisional plan with the available chat**, within your remaining limits. It keeps actual contributions, security analysis, acceptance checks, and unresolved risks. The chat can choose reasonable reversible assumptions, label them, and specify how to validate them; material decisions and missing authority remain gates. The plan names completed and missing review stages. This preserves planning discipline while independent review remains incomplete.

To require the full exchange, say “wait for both participants” or “require both reviews.” C2C honors that choice and preserves the partial work. It does not automatically wait and retry, select another worker/provider, change accounts, enable credits, or switch billing sources. Models from one provider may share the exhausted allowance. Your explicit time, attempt, spending, or whole-task caps still apply.

Usage limits, timeouts, and rejected authentication are separate causes. C2C records the observed failure without guessing, and a larger runner allowance cannot remove a provider usage block. [Timeout recovery](#when-a-peer-call-takes-longer) and [login repair](#do-i-need-another-terminal-open) retain their existing rules.

For a prepared run, the provisional plan remains in `final-plan.md`; `NOTES.md` records the fallback and resume point. Reports, attempts, participant settings, and successful stages remain intact. Generated progress and discussion keep their real stage status, and the run remains incomplete. If the block occurs before preparation, the chat saves a standalone plan and notes, linking only files that exist.

If the current chat also becomes unavailable, automatic takeover cannot be guaranteed. Open an available chat and ask it to continue provisional planning from the saved artifacts. It must preserve the original council's sealed participants and unfinished stages. To resume the council after access returns, ask C2C to inspect the saved handoff, notes, assessment, and status, then continue only pending stages within the remaining authority and allowance. Successful stages are never replayed, and a new run cannot erase used attempts.

## Install for one app only

The default installer adds the skill to both apps. To choose one, run **one** of these instead:

```sh
node scripts/install.mjs --target codex
```

```sh
node scripts/install.mjs --target claude
```

This chooses where the **skill** is installed. Cross-provider discussion needs the other provider's CLI and, when using a background author, the coordinator provider's CLI too. Same-provider discussion uses that provider's own CLI.

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

## Update the skill

For a clone created before the repository was renamed to C2C, update its remote once from inside that clone:

```sh
git remote set-url origin https://github.com/ZiadHassanein/C2C.git
```

1. Get the latest repository files. For a Git clone, run `git pull` inside it; for a ZIP installation, download and extract the latest ZIP.
2. Move each older installed `C2C` folder (or `codex-claude-council` from an earlier release) to a backup location **outside all skill directories**, such as `~/skill-backups/`. Use distinct backup names for Codex and Claude. Moving the backup outside prevents duplicate skill discovery.
3. From the updated repository folder, run `node scripts/install.mjs` again. Use `--target codex` or `--target claude` if you only want one installation.
4. Run `node scripts/council.mjs doctor` and open a new chat.

The commands are now `$C2C` in Codex and `/C2C` in Claude Code. The repository folder can keep its original name.

Downloading updates alone does not update the installed copies. If their files already match (including harmless LF/CRLF differences), the installer reports `Already installed` and leaves them alone. Keep your backup until the new installation works.

## Uninstall

Remove only the `C2C` folder from the installed locations above, then start a new chat. Your separately saved plans and run folders remain available.

## Follow the discussion

The generated `DISCUSSION.md` is the default place to follow the discussion. C2C links it at the start, keeps chat focused on questions, blockers and necessary progress, then gives a short final decision brief with the plan and discussion links. Ask “show the main disagreements and plan changes as you go” if you also want live chat summaries. Quiet/final-only requests are honored within the host app's requirements. The AI handles the runner commands for you.

The file identifies each agent's submitted points, the coordinator's decisions, and unresolved questions. It updates at saved transitions, not on every output token; a pending call is not a completed review. C2C does not invent dialogue or stream private reasoning. [Call counts](#usage-and-privacy) depend on whether the selected author runs in the current chat or in the background.

Open the run's generated `DISCUSSION.md` to read the evidence-backed account. It stays local and is excluded from peer inputs. To refresh it after local report or decision edits, ask the AI to refresh the discussion. For manual inspection from the repository folder:

```sh
node scripts/council.mjs discussion --run "/absolute/path/to/run"
```

Replace the path with the run folder. Run this between stages to refresh the discussion and return its file path, then open that file. You can read the existing file while a peer call is pending. Refreshing does not make another model call or advance the planning stages.

## Choose the participants

The default is Codex–Claude, with a suitable planning model from each provider. To stay within one provider, ask for “Codex only” or “Claude only”: C2C selects a planning author and a distinct coding-focused critic. These are real reports from the selected models, not an imagined dialogue.

For **every new planning task**, C2C searches and opens current official model guidance for both providers, compares planning and coding suitability, and checks local access evidence. It selects workers within your limits and honors exact choices or advice-only requests. Findings and reasons go in `TASK_ASSESSMENT.md`; retries reuse that research. There is no permanent model ranking. If one model leads both roles, C2C explains why it chose a different adequate critic. See the [selection policy](../references/model-selection.md).

Your current chat stays unchanged. When trustworthy metadata shows it exactly matches the selected planner, C2C can reuse it as author. Otherwise `--author-model` launches that provider's selected planner in the background; `--peer-model` selects the other participant. Unknown chat identity need not block this route. Both CLIs are required when background workers use both providers.

Exact versioned IDs distinguish participants; different effort, alias, or context variants of one model do not. Local catalog entries do not prove account entitlement, and recorded selections do not prove a provider honored them. CLI-reported identity and unknowns remain visible. C2C avoids models outside the known authorized billing scope and makes no paid model-selection probes. [Technical pairing rules](../references/protocol.md#pairing-and-model-identity) preserve independent contributions, security, and verification. Reviewers challenge weak claims with evidence; sound conclusions can survive review.

## Usage and privacy

Before planning, the AI checks the relevant project context and makes the goal, scope, success criteria, and next step explicit. It writes the assessment files for you. It may ask a focused question when an essential requirement is missing; unknown deployment details alone do not prevent a useful plan. Read `PROJECT_CONTEXT.md` for the evidence and limits. For an assessment without a peer discussion, ask for “assessment only.”

The skill runs a short, bounded exchange through your existing provider accounts. Normal provider usage applies.

C2C reduces repeated instructions, report reads and review prose by default. The AI uses `--compact` for routine runner output; it preserves every JSON field while removing formatting whitespace. Manual commands remain formatted for readability unless you add that flag. This does not change models, review stages or limits; real token savings depend on the task and provider. See [token efficiency](../references/protocol.md#token-efficiency).

| Allowance | Standard: bounded work | Project: large/deep plans |
|---|---|---|
| Time per peer call | 5 minutes | 10 minutes |
| Combined peer runtime per run | 15 minutes | 40 minutes |
| Launch attempts, including failed calls | 4 | 5 |

With the current chat as author, focused review uses two successful calls and independent planning uses three. A background author raises these to three and five respectively; its independent-planning route defaults to six attempts unless explicitly capped. All author and peer calls share the run's allowance. The coordinator states the route and ceilings before starting; manual `prepare` defaults to `standard`, and explicit limit flags override defaults. These are runtime and attempt limits, **not spending or token caps**. [Bounded recovery](#when-a-peer-call-takes-longer) preserves successful stages and charged attempts; starting over cannot reset a failed run's budget.

Your current chat selects the brief and relevant context to send to the peer's provider. The runner does not automatically copy your whole project or chat. Exclude secrets and unrelated private material. Its check for obvious secrets is limited and cannot detect everything.

The peer is instructed to use supplied evidence. Calls disable applicable shell, image, browser, connector and agent features, use a neutral working directory and request read-only permissions. Some CLI tools may remain present but subject to those permissions. These settings are not a substitute for the host sandbox or managed policy. The current chat gathers evidence and performs any work you have authorized.

Worker selection uses current research and your constraints; it does not change the current chat or global settings. Ask for “advice only” to get recommendations without calls. Codex workers ignore ordinary user configuration for isolation, so C2C uses explicit selected IDs rather than assuming a CLI default matches another session. Some models can consume additional credits in non-interactive mode: C2C must establish that this is within your authorized scope before choosing them.

Every new council plan includes a security review and relevant test checks. The [plan presentation guide](../references/plan-presentation.md) puts priority decisions, the proposed scope, and the next action before technical appendices. Unresolved findings and edits made after peer verification remain visible. Completing the discussion does not mean every issue is resolved or the implementation has been tested.

## For contributors

Read [PROJECT_NOTES.md](../PROJECT_NOTES.md) before changing the skill. The [protocol](../references/protocol.md) documents commands, schemas, and saved evidence; [SKILL.md](../SKILL.md) contains the AI's instructions.

For runtime or installer changes, run:

```sh
npm test
```

For documentation-only changes, check links and examples without starting paid planning calls.
