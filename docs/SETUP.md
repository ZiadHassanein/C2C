# Setup and help

[← Quick start](../README.md)

Use this page when you need help with installation, updating, or a failed setup check. For normal use, paste a request into your project chat and let the AI handle the runner.

**Start in either app; setup is optional.** The initiating chat coordinates C2C for software, content or mixed projects. Before calls, it prefers an eligible cross-provider exchange, then a planner and distinct task-suited critic from the current provider if the other is unavailable. The latter needs that provider's ready CLI and two eligible exact models within your limits. If neither route qualifies, the chat produces a provisional plan with structured self-critique. It does not require installing, updating or signing in to another tool. The repair instructions below apply when you choose to enable that exchange.

**Install:** [Quick start](../README.md#install) · [One app](#install-for-one-app-only) · [Linux/macOS](#linux-and-macos) · [Check setup](#check-your-setup)

**Maintain:** [Update or roll back](#update-the-skill) · [Uninstall](#uninstall) · [Models](#choose-the-participants) · [Usage and privacy](#usage-and-privacy)

**Fix a problem:** [Troubleshooting](#troubleshooting) · [Login and background workers](#do-i-need-another-terminal-open) · [Timeouts](#when-a-peer-call-takes-longer) · [Usage limits](#when-a-participant-hits-a-usage-limit)

## Install without Git

With [Node.js 18+ and npm/npx](https://nodejs.org/en/download), run in PowerShell on Windows or Terminal on macOS/Linux:

```sh
npx --yes https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.3.0.tar.gz install
```

This downloads the named C2C release and runs its setup helper. It needs no Git, npm account or global package installation. Both apps receive the skill for your current user; start a new chat afterward. It does not install the provider CLIs, create accounts or sign in. [Optional CLI setup](../README.md#1-prepare-your-tools) is separate.

Append `--dry-run` to `install`, `update` or `uninstall` to inspect the selected paths and planned changes without changing skill installations. The surrounding `npx` command can still download files into npm's cache. `--target codex`, `--target claude` or `--target both` selects the apps; `both` is the default.

The launcher is pinned to **v2.3.0**. `install` uses that package; `update` explicitly discovers and installs the latest stable C2C release. Use `update --source` to install the launcher's exact version instead.

<details>
<summary>Install from a Git clone or downloaded ZIP</summary>

With Git installed:

```sh
git clone https://github.com/ZiadHassanein/C2C.git
cd C2C
node scripts/setup.mjs install
node scripts/setup.mjs doctor
```

Without Git, [download the v2.3.0 ZIP](https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.3.0.zip), extract it, and run the two `node` commands from the folder containing `scripts`. No `npm install` is needed. Once downloaded, the local helper needs only Node and works offline for installation, `update --source`, uninstall and help.

`node scripts/setup.mjs` prints help without changing anything. The helper accepts `install`, `check-update`, `update`, `uninstall`, `doctor`, `version`, `help`, `rollback TRANSACTION_ID` and `recover TRANSACTION_ID`. Existing direct installer and council commands remain supported.

</details>

## Install for one app only

The default installer adds the skill to both apps. To choose one, run **one** of these instead:

```sh
npx --yes https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.3.0.tar.gz install --target codex
```

```sh
npx --yes https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.3.0.tar.gz install --target claude
```

This chooses where the **skill** is installed. Cross-provider discussion needs the other provider's CLI and, when using a background author, the coordinator provider's CLI too. Same-provider discussion uses that provider's own CLI, whether selected automatically or requested. Missing unused CLIs do not block a valid route. See [routing and provisional planning](../references/protocol.md#planning-with-unavailable-tools).

With a local copy, use `node scripts/setup.mjs install --target codex` or `--target claude`. The same target options apply to update and uninstall.

Default locations (`~` means your user folder):

| App | Skill folder |
|---|---|
| Codex | `~/.codex/skills/C2C` |
| Claude Code | `~/.claude/skills/C2C` |

If you already use `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, the installer uses that configured root. You do not need to set either variable for a normal installation.

## Linux and macOS

Use the same `npx` quick command on Linux/macOS, or `node scripts/setup.mjs install` and `node scripts/setup.mjs doctor` from a local copy. Install as your normal user; `sudo` would target another user's configuration. Keep the uppercase `C2C` folder name on case-sensitive filesystems. When invoking scripts with Node directly, they do not need their own executable bit.

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

From any folder with npm/npx available:

```sh
npx --yes https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.3.0.tar.gz doctor
```

Or open a terminal in your cloned/extracted C2C folder and run:

```sh
node --version
node scripts/setup.mjs version
node scripts/setup.mjs doctor
```

Node must be 18 or newer. `doctor` checks CLI availability, required flags and feature controls, and visible saved authentication. Read its readiness values even if the command itself finishes successfully:

- `codex_chat_ready: true`: a Codex chat can call Claude.
- `claude_chat_ready: true`: a Claude Code chat can call Codex.
- `codex_only_ready: true`: a Codex chat can call the Codex CLI for a same-provider run.
- `claude_only_ready: true`: a Claude Code chat can call the Claude CLI for a same-provider run.

A missing CLI does not block a route with no worker from that provider. Before calls, an unavailable other provider can lead to a same-provider exchange; if that cannot qualify, C2C continues provisionally instead of requiring setup. A cross-provider exchange with a background author needs both CLIs ready; a same-provider exchange needs the current provider's CLI and eligible distinct models. Readiness does not validate credentials with the provider or establish model access, identity or included allowance. A successful response confirms that particular call worked.

`doctor` also identifies the nonsecret authentication route and conflicting environment-variable names. Quota and overage stay `unknown` when unmeasured; that is not a provider failure. It prints no credential values. Normal authorized subscription use does not require repeated billing confirmation; an explicit zero-extra-charge rule still requires applicable no-overflow evidence.

**Both apps work, but C2C reports an incompatible worker?** The app and terminal may use different CLI installations. C2C checks distinct installed candidates in PATH order and skips those missing required capabilities. `candidate_checks` shows the paths, versions and reasons; `executable` identifies the selected CLI. Explicit `COUNCIL_CODEX_BIN` / `COUNCIL_CLAUDE_BIN` overrides select one binary without fallback. Execution or login failures stop selection; C2C does not try another account or weaken restrictions. No reinstall or extra terminal is required when a compatible, eligible installation is already available.

Windows discovery additionally tries known native Codex user/app-cache locations. Automatic fallback requires a stable version; prereleases need explicit selection. These internal locations may change. Windows `claude.cmd` wrappers are not executed—point `COUNCIL_CLAUDE_BIN` to an existing native `claude.exe` when available. Diagnostics explain the detected version and supported remedies.

Connection failures are separate from login and quota errors. C2C preserves the attempt and advises checking connectivity or the host's approved network path; it does not infer that every connection error came from a sandbox or retry automatically. `doctor` also discloses enabled Codex features outside its explicit disable list; its controls are not a complete isolation guarantee.

## Do I need another terminal open?

No. Keep your coordinating chat open; C2C runs the peer non-interactively using `claude -p` or `codex exec`, with piped input/output and hidden Windows process windows. Claude can work for Codex without an open Claude panel, and Codex can work for Claude without an open Codex app. The peer CLI must be installed, accessible to the coordinator, and authenticated.

An inaccessible or expired login leaves that worker unavailable. C2C follows its [routing and recovery rules](../references/protocol.md#planning-with-unavailable-tools) without requiring a repair. If you choose to restore the exchange, renew a saved login with `claude auth login` or `codex login`; the browser flow may require your interaction. An environment-supplied key or token may instead be the selected credential; native login does not replace it. After fixing the selected authentication source, ask C2C to inspect the existing run and resume its failed stage within the remaining allowance. Opening a peer terminal alone does not renew a login. See [Claude's non-interactive mode](https://code.claude.com/docs/en/headless) and [login renewal](https://code.claude.com/docs/en/authentication#renew-an-expiring-login).

## Update the skill

**In chat:** say “Update C2C and keep this plan on its current version.” The AI checks the active run before updating. For a direct terminal update:

```sh
npx --yes https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.3.0.tar.gz update
```

This discovers the latest stable tag in the official C2C repository. Append `--target codex` or `--target claude` for one app, or `--dry-run` to preview. During a prepared run, include `--run "/absolute/path/to/run"` so its retained runtime is checked first. Changed installations are protected. An identical installation needs no replacement. Start a new chat to use the updated instructions for a new plan.

### Update notifications

At C2C startup or resume, the AI runs `check-update --auto` and gives one short notice for a newer version. Automatic checks reuse a local result for 24 hours; they do not run in the background between chats. No project text, prompts, credentials or model requests are sent: only public GitHub release metadata is requested. GitHub receives normal network metadata such as your IP address. Offline, rate-limited or unsuccessful checks do not interrupt planning, and no update is installed automatically.

From a downloaded folder, check immediately with:

```sh
node scripts/setup.mjs check-update
```

Or ask the chat: “Check whether C2C has an update.” To turn automatic checks off, set `C2C_UPDATE_CHECK=off` in the environment that starts your app. You can still request a manual check or update. Environments that prohibit network access skip automatic checking; no network permission exception is needed just for a notice.

### Keep the current plan stable

| Situation | What C2C does |
|---|---|
| Prepared with 1.4 or newer | Uses the run's saved runtime and instructions after the installation updates. |
| New plan after an update | Starts in a fresh chat using the new installation. |
| Older run without a pin | Finishes with its original runner, or is explicitly stopped before updating. |
| Provisional planning without a run | Keeps loaded instructions; update after finishing or explicitly stopping. |
| Retained runtime missing or changed | Stops continuation; never substitutes the new version silently. |

Pinning keeps C2C rules, stages, prior reviews, decisions and allowance accounting consistent. It does not freeze provider CLI versions, hosted models, authentication or the chat app. In-chat updating happens between worker calls and never restarts successful stages. The `--run` guard covers the run you supply; the updater cannot discover every plan in other chats, so finish/stop any older unpinned work before replacing its installation.

Runtime bundles contain C2C code and instructions only, and stay outside skill discovery at `~/.c2c/runtimes` (`C2C_RUNTIME_HOME` can select another location). They are retained across updates and uninstall so saved runs can still reference them. Keep the same location while resuming a plan; deleting it gives up that continuity. Plan data remains in the selected run folder. File hashes detect accidental changes; this is not protection against an attacker who controls the same user account.

<details>
<summary>Update from a Git clone or ZIP</summary>

For a clone created before the repository was renamed to C2C, update its remote once from inside that clone:

```sh
git remote set-url origin https://github.com/ZiadHassanein/C2C.git
```

From a Git clone:

```sh
git pull --ff-only
node scripts/setup.mjs update --source
node scripts/setup.mjs doctor
```

For ZIP installs, extract the desired release ZIP and run the same Node commands there. `--source` uses these downloaded files without checking GitHub. Use `--target codex` or `--target claude` for one app; add `--run RUN` when keeping a prepared plan active. The original `node scripts/install.mjs --update` remains an offline source update but lacks the chat/run guard; prefer the setup helper during a chat.

</details>

The updater checks all selected destinations before replacing files. Managed receipts identify clean installations; a trusted release manifest recognizes clean v0.11.3 copies. Extra, missing, linked or modified installed files are preserved and cause refusal. There is no silent force-overwrite. For an older unrecognized or customized copy, preserve it manually outside every skill-discovery directory before a fresh install.

Backups and transaction records live under each configuration home's `c2c-install-backups`, outside `skills`. Keep the printed transaction ID and rollback command. From a retained source copy, the setup helper also accepts:

```sh
node scripts/setup.mjs rollback TRANSACTION_ID
```

Rollback also refuses to replace a modified current installation. If an update or rollback was interrupted, inspect the reported transaction and resume recovery with:

```sh
node scripts/setup.mjs recover TRANSACTION_ID
```

Recovery restores the previous installations; retry the intended update afterward. Retain the same selected `--target` from the printed command. Backups are not automatically deleted. Configuration roots and skill folders on different filesystems may prevent atomic renames; repair that layout rather than copying over a partial installation.

The commands are now `$C2C` in Codex and `/C2C` in Claude Code. The repository folder can keep its original name.

Downloading updates alone does not update installed copies. Matching content, including harmless LF/CRLF differences, is idempotent. Keep backups until the new installation works. Receipts detect changes; they are not signed supply-chain attestations.

## Uninstall

**Finish or stop active C2C runs first.** Removing the skill does not stop a worker that is already running. Then run:

```sh
npx --yes https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.3.0.tar.gz uninstall
```

The command moves unchanged managed C2C folders out of skill discovery into recoverable backups. It protects customized, unrecognized or linked files instead of deleting them. A missing target is a no-op. It leaves parent settings, other skills, apps, logins, and projects/plans saved elsewhere untouched. Start a new chat in each affected app; an existing chat may still contain previously loaded instructions.

Preview first, without changing skill installations:

```sh
npx --yes https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.3.0.tar.gz uninstall --dry-run
```

Add `--target codex` or `--target claude` to remove the skill from only one app. Keep the printed rollback command to restore it; rollback protects any installation added or changed afterward. For an interrupted operation, use its printed recovery guidance. [Transaction recovery](#update-the-skill) also applies to managed removal.

<details>
<summary>Uninstall offline using an existing local copy</summary>

From a downloaded/cloned C2C folder:

```sh
node scripts/setup.mjs uninstall
```

This needs Node, without npm/npx or network access. Add the same `--target` and `--dry-run` options as above. A v2.3.0 installed copy also contains the helper. For example, with default paths:

PowerShell on Windows:

```powershell
node "$env:USERPROFILE/.codex/skills/C2C/scripts/setup.mjs" uninstall
```

Terminal on macOS/Linux:

```sh
node "$HOME/.codex/skills/C2C/scripts/setup.mjs" uninstall
```

For a Claude-only installation, use `.claude` instead of `.codex`. For custom configuration roots, use the actual installed path. These commands still target both apps by default; add `--target` when needed. Preserve the rollback command printed by the helper rather than trying to rerun a path that the uninstall just moved.

</details>

### Manual removal

For an older, customized or unrecognized installation, you can use your file manager:

1. Finish or stop active C2C runs. Removing the skill folder does not stop a worker that is already running.
2. Locate the relevant folder below. Preserve any files you added inside it, then move **only the `C2C` folder** to the Recycle Bin/Trash, or to a backup location outside all skill folders.
3. Start a new chat in each affected app. Existing chats may still contain previously loaded C2C instructions.

| App | Windows: paste into File Explorer's address bar | macOS / Linux |
|---|---|---|
| Codex | `%USERPROFILE%\.codex\skills\C2C` | `~/.codex/skills/C2C` |
| Claude Code | `%USERPROFILE%\.claude\skills\C2C` | `~/.claude/skills/C2C` |

`~` means your home folder. If you installed with `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, use `skills/C2C` inside that configured root instead. The installer's `Installed:` or `Updated:` output shows the exact destination. Keep the parent configuration and `skills` folders; they can contain other settings and skills.

Removing C2C leaves Codex, Claude Code, Node.js, your logins, and projects/plans saved elsewhere in place. The downloaded repository/ZIP, npm cache, update-check metadata, retained runtime bundles and installer backups also stay on disk; uninstall does not delete its source package. You can keep those, or remove them separately after preserving any work stored there. Deleting backups gives up rollback; deleting runtime bundles prevents their saved plans from resuming. Deleting the downloaded repository alone does not uninstall the skill.

## npx and PowerShell help

If PowerShell blocks `npx.ps1`, use `npx.cmd` in the same command. No execution-policy change is needed:

```powershell
npx.cmd --yes https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.3.0.tar.gz install
```

If npm 12 rejects the remote package URL, permit it for this command only:

```sh
npx --yes --allow-remote=all https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.3.0.tar.gz install
```

This follows npm's [remote URL setting](https://docs.npmjs.com/cli/v12/using-npm/config/#allow-remote); do not change global npm policy. Keep the exact release URL and replace the final action with `update`, `uninstall` or `doctor` as needed. On Windows, the `npx.cmd` form can also include this option. If npm/npx is unavailable or your environment disallows remote packages, use the local Git/ZIP method instead.

## Choose the participants

The chat you start is the coordinator; neither provider is permanently in charge. A normal C2C request selects the first eligible route below before calls:

| Starting chat | Preferred route | If the other provider is unavailable |
|---|---|---|
| Codex | Codex planning author + Claude reviewer | Codex planning author + distinct Codex critic |
| Claude Code | Claude planning author + Codex reviewer | Claude planning author + distinct Claude critic |

Roles follow the task: engineering review for software, editorial and factual review for content, and both perspectives for mixed work. Content review covers audience, structure, evidence, rights and accessibility as relevant; no software repository or coding test command is required for a content-only plan. [Examples in either app](../README.md#use-it).

Same-provider review requires the current provider's compatible, authenticated CLI, two eligible exact model IDs, and authorized usage under your billing policy. You can also ask for “Codex only” or “Claude only.” These routes use actual responses from distinct models. If the required CLI or eligible pair is unavailable, or evidence required by your limits is missing, the current chat delivers a provisional plan with structured self-critique. Unknown live quota alone does not disqualify normal authorized subscription use. Self-critique identifies assumptions, counterexamples, alternatives and unresolved risks without attributing invented replies to another model.

Requests to require both providers, wait, pin participants or models, reserve selection, or receive advice only override automatic routing. A partially completed run retains its participants, reports and consumed allowance; any continuation follows the [recovery protocol](../references/protocol.md#planning-with-unavailable-tools).

After checking candidate tool availability, each new planning task researches current model choices for its domain, identifies the host and assigns roles before checking actual workers' launch eligibility. Unknown quota does not skip candidate research; known inaccessible workers are skipped. Findings go in `TASK_ASSESSMENT.md`; retries reuse them. There is no permanent model ranking. If one model leads both roles in a same-provider discussion, C2C explains its distinct adequate critic. See the [selection policy](../references/model-selection.md).

Your current chat stays unchanged. When trustworthy metadata shows it exactly matches the selected planner, C2C can reuse it as author and check only the peer worker's eligibility. Otherwise `--author-model` selects a background planner, subject to its own access and billing checks; `--peer-model` selects the other participant. Unknown chat identity does not prove that background workers are eligible. Both CLIs are required when background workers use both providers.

Exact versioned IDs distinguish participants; different effort, alias, or context variants of one model do not. Different IDs and separate calls do not prove independent reasoning. Local catalog entries do not prove account entitlement, and recorded selections do not prove a provider honored them. CLI-reported identity and unknowns remain visible. C2C avoids models outside the known authorized billing scope and makes no paid model-selection probes. [Technical pairing rules](../references/protocol.md#pairing-and-model-identity) preserve separate contributions, security and verification. Reviewers challenge claims with evidence, counterexamples and alternatives; the coordinator adjudicates findings, and the reviewer answers material counterarguments by ID during verification. Sound conclusions can survive review; disagreement is not a quota.

## Follow the discussion

The generated `DISCUSSION.md` is the default place to follow the discussion. C2C links it at the start and keeps chat focused on questions, blockers and necessary progress. After completion, the final brief links all three files: `final-plan.md`, `DISCUSSION.md` and `RESULT.md`. Incomplete runs link only available files and explain the missing completion record; standalone fallback planning delivers one provisional plan with self-critique. Ask “show the main disagreements and plan changes as you go” if you also want live chat summaries. Quiet/final-only requests are honored within the host app's requirements. The AI handles the runner commands for you.

The file uses compact concern/proposed-change/decision rows. Every finding ID and disposition remains visible; an ellipsis marks an excerpt, with full evidence and replies in linked reports and `decisions.json`. Review status and missing evidence stay prominent. It updates at saved transitions, not on every output token; a pending call is not a completed review. `final-plan.md` remains the separate, usable revised plan. C2C does not invent dialogue or stream private reasoning. [Call counts](#usage-and-privacy) depend on whether the selected author runs in the current chat or in the background.

Open the run's generated `DISCUSSION.md` to read the evidence-backed account. It stays local and is excluded from peer inputs. To refresh it after local report or decision edits, ask the AI to refresh the discussion. For manual inspection from the repository folder:

```sh
node scripts/council.mjs discussion --run "/absolute/path/to/run"
```

Replace the path with the run folder. Run this between stages to refresh the discussion and return its file path, then open that file. You can read the existing file while a peer call is pending. Refreshing does not make another model call or advance the planning stages.

## Usage and privacy

Before planning, the AI checks the relevant project context and makes the goal, scope, success criteria, and next step explicit. Content work includes its audience, purpose, source material, publication status and editorial constraints; mixed work also records dependencies on software. It writes the assessment files for you. It may ask a focused question when an essential requirement is missing; unknown deployment or publication details alone do not prevent a useful plan. Read `PROJECT_CONTEXT.md` for the evidence and limits. For an assessment without a peer discussion, ask for “assessment only.”

The skill runs a staged exchange through your existing provider accounts. Normal provider usage applies.

C2C reduces repeated instructions, report reads and review prose by default. The AI uses `--compact` for routine runner output; it preserves every JSON field while removing formatting whitespace. Manual commands remain formatted for readability unless you add that flag. This does not change models, review stages or limits; actual usage depends on the task and provider. See [token efficiency](../references/protocol.md#token-efficiency).

| Allowance | Standard: bounded work | Project: large/deep plans |
|---|---|---|
| Inactivity guard | 10 minutes without recognized progress | 20 minutes without recognized progress |
| Fixed call / total deadline by default | None | None |
| Launch attempts, including failed calls | 4 | 5 |

Recognized advancing model activity renews the guard; stderr, retries and heartbeats do not. A silent worker may still be thinking, so guard expiry reports missing observed progress rather than a proven hang. Explicit user time caps, provider failures/limits, cancellation and output bounds still apply. These controls are **not spending or token caps**.

With the current chat as author, required stages use two successful calls for focused review or three for independent planning. A background author makes these three and five; its plan route defaults to six attempts unless explicitly capped. One final-revision check may use another attempt. The coordinator states the route, guard, attempts and any hard caps once. [Same-run recovery](#when-a-peer-call-takes-longer) preserves successful stages and every used attempt.

Your current chat selects the brief and relevant context to send to the peer's provider. The runner does not automatically copy your whole project or chat. Exclude secrets and unrelated private material. Its check for obvious secrets is limited and cannot detect everything.

C2C never buys or enables extra paid usage to recover from a limit. It does not upgrade plans, raise spending limits or move the task to API/cloud billing. Normal authorized subscription use can proceed without live quota metadata; a limit response stops that route. An explicit included-only/zero-extra-charge rule needs applicable no-overflow evidence before calls. Existing provider settings still govern charges. Worker processes disable Claude's credit-only fast mode, automatic updates and background terminal-title generation; this does not change your model/effort or impose a universal billing cap. [Billing policies](../references/protocol.md#no-paid-limit-recovery).

Before launching a new run's first worker, C2C uses `node RUNNER preview --run RUN --stage STAGE` to inspect the provider/model, outbound labels, packet hash and limits without a model call or state change. Your explicit C2C request authorizes relevant selected context for that exchange. The host may separately require approval for a bounded command outside its sandbox. [Launch preview and local permissions](../references/protocol.md#launch-preview-and-local-permissions).

The peer is instructed to use supplied evidence. Calls disable applicable shell, image, browser, connector and agent features, use a neutral working directory and request read-only permissions. Some CLI tools may remain present but subject to those permissions. These settings are not a substitute for the host sandbox or managed policy. The current chat gathers evidence and performs any work you have authorized.

Worker packets are text-only. For image planning, the coordinator inspects authorized assets when possible and supplies attributed descriptions, visible text, source/rights facts and constraints. It records unknown visual details or permissions when inspection or evidence is unavailable. Workers can critique that supplied evidence but do not directly see image pixels. [Content and image evidence](FAQ.md#can-c2c-plan-content-and-image-work).

Worker selection uses current research and your constraints; it does not change the current chat or global settings. Ask for “advice only” to get recommendations without calls. Codex workers ignore ordinary user configuration for isolation, so C2C uses explicit selected IDs rather than assuming a CLI default matches another session. Some models can consume additional credits in non-interactive mode: C2C must establish that this is within your authorized scope before choosing them.

Every new council plan includes a scoped security review and relevant acceptance checks. Software work uses engineering tests; content work uses editorial, factual source, rights and accessibility checks as relevant; mixed work uses both. These checks remain labeled as proposed, executed or blocked. The [plan presentation guide](../references/plan-presentation.md) puts priority decisions, the proposed scope, and the next action before supporting appendices. Unresolved findings and edits made after peer verification remain visible. Completion does not mean every issue is resolved or authorize implementation, final content production, image generation or publication.

## Troubleshooting

| What you see | What to do |
|---|---|
| `node` is not recognized or not found | The current chat can still deliver a provisional plan. If you choose to enable the scripts, install [Node.js](https://nodejs.org/en/download), reopen your terminal, and check `node --version`. |
| `npx` is missing, PowerShell blocks it, or npm rejects the remote URL | Follow [npx and PowerShell help](#npx-and-powershell-help); local Node setup remains available without npm/npx. |
| `git` is not recognized or not found | Use the [one-command install](#install-without-git), or [download the ZIP](https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.3.0.zip), extract it, and open a terminal in the folder containing `scripts`. |
| Cannot find `scripts/setup.mjs` or `scripts/install.mjs` | You are in the wrong folder or using an older source copy. Open a terminal in the extracted or cloned current release, then rerun the command. |
| `doctor` cannot find `claude` or `codex` | Ignore it if the route does not use that CLI; otherwise apply [available-provider routing](#choose-the-participants). If you choose setup, use the [Claude Code](https://code.claude.com/docs/en/quickstart) or [Codex](https://learn.chatgpt.com/docs/codex/cli) guide. |
| `doctor` reports signed out | Treat that worker as unavailable and apply [routing rules](#choose-the-participants). If you choose setup repair, check the environment/access row below before renewing the selected native login. |
| `doctor` reports unknown quota or overage | This is unmeasured usage, not an exhausted account. Follow your [billing policy](../references/protocol.md#no-paid-limit-recovery); do not make a separate availability probe. |
| Runtime cache or lock access reports `EPERM`, `EACCES` or `EROFS` | This is a local filesystem restriction. Use the host-approved path for the unchanged command; retain pins, locks and attempts. Before a new run only, a persistent writable `C2C_RUNTIME_HOME` can be selected. [Recovery details](../references/protocol.md#launch-preview-and-local-permissions). |
| `doctor` is ready, but a call reports expired/rejected authentication | Preserve the failed attempt and follow [bounded recovery](../references/protocol.md#planning-with-unavailable-tools). Repair is optional; no account or billing change is implied. |
| A provider, account, or model reports a usage limit | Stop that route and preserve actual work and used allowance. See [usage-limit fallback](#when-a-participant-hits-a-usage-limit) for eligible continuation or a provisional plan. |
| Codex is missing the required `view_image` control | Keep required controls enforced and apply [routing rules](#choose-the-participants). If you choose repair, update or explicitly select a compatible binary. Version 0.146.0 lacks this control; 0.160.1 passed local checks. |
| A required CLI flag is missing | Treat that worker as unavailable and apply [routing rules](#choose-the-participants); updating the CLI is optional setup work when requested. |
| The installer finds a legacy skill | Follow [Update the skill](#update-the-skill) to move the old `codex-claude-council` installation outside all skill directories, then rerun installation. |
| A different installation already exists | Follow [Update the skill](#update-the-skill). The installer protects existing files instead of overwriting them. |
| Uninstall refuses changed, unknown or linked files | Preserve your changes and use [manual removal](#manual-removal). The managed command does not force-delete an unrecognized installation. |
| The skill does not appear in chat | Confirm installation, then start a new chat or restart the app. Use the Codex `$C2C` or Claude `/C2C` prompt. |
| Terminal setup works, but the chat reports signed out | Check that the chat uses the same OS account, CLI, and config directory; a restricted host may not see its credential store. Credential environment variables may select another authentication source. Use the approved host execution path; do not copy credentials or change accounts/billing automatically. |
| A discussion times out or fails | Ask the AI to inspect `HANDOFF.md` and `status`, then follow [bounded recovery](#when-a-peer-call-takes-longer) on the same run. Saved activity can distinguish an unfinished response from no observed output; neither is a completed review. |

The installer does not install either provider CLI, create accounts, or sign in for you. Windows npm Codex installations are discovered through their native package binary. When multiple versions are installed, you can set `COUNCIL_CODEX_BIN` to the chosen executable for your terminal session; see [compatibility and recovery](../references/protocol.md#compatibility-and-recovery).

For a damaged or stale run lock, ask the AI to inspect the saved state and follow the [recovery procedure](../references/protocol.md#compatibility-and-recovery). Never delete a live lock or reset attempts to make a run continue.

## When a peer call takes longer

New C2C 2.1 runs keep waiting while recognized model activity advances. They do not apply a fixed call or total deadline by default. The inactivity guard is 10 minutes for standard work or 20 minutes for project planning. Some CLI versions emit little activity during computation; even with supported streaming events, silence cannot prove a hang. C2C preserves diagnostics without exposing raw reasoning or treating partial output as a valid review.

The coordinating AI keeps the runner in a supported background command session and waits for it there; a returned session ID is not a failed call. You do not need to leave the other AI's terminal open. Host process limits still apply. New tracked workers block a replacement after a coordinator crash until their direct process is confirmed stopped; uncertain cleanup preserves the checkpoint.

Advanced `prepare` options: `--idle-timeout-seconds 60..3600` adjusts the activity guard. `--timeout-seconds 10..900` and `--budget-seconds 10..3600` set hard call/total caps that activity cannot override. Use actual numbers, not these range expressions. `--timeout-policy fixed` restores the older standard 5-minute call/15-minute total or project 10-minute call/40-minute total defaults. Older pinned runs keep their original policy; an update does not change them.

The captured Codex 0.160.1 output had no intermediate activity; current-version behavior is unverified. If a worker stays silent until its final answer, the inactivity guard becomes its effective call deadline. For long Codex reviews, an authorized `--idle-timeout-seconds 3600` allows up to an hour of silence. It does not guarantee completion or change explicit hard caps.

`worker_identity_unavailable` means the host could not inspect an inert local child during preflight; no planning attempt was reserved. Use the host-approved execution path or keep a provisional plan. Native fallback discovery trusts local installations under the configured user/app directories, like PATH discovery; it is not a signature or directory-permission audit. Selection uses the first compatible stable fallback, not the highest version. Use `COUNCIL_CODEX_BIN` to select an approved exact binary.

Two recovery limits remain. Resume a run in its original host and OS process namespace. After a hard crash, a recovered worker record may be checked again on later commands; if its old PID is reused and that new process cannot be inspected, C2C can pause with `worker_cleanup_unconfirmed` even after a prior successful recovery. Preserve the checkpoint and never kill the unrelated process or edit the manifest to bypass the guard. The check can clear once that process exits. An unresolved `launch_pending` record with no PID still has no normal recovery path.

Registration waits for process inspection before delivering the prompt. A CLI-specific stdin-wait conflict is unverified: watch ordinary authorized work for a worker exiting with “missing input” or “no stdin data,” as well as registration/argument/schema failures. Preserve diagnostics, stop unchanged retries, and use the retained managed rollback for a confirmed release regression. Do not weaken process checks or spend extra credits to manufacture a passing canary. See the [release coverage limits](../CHANGELOG.md).

An explicit call cap raises the default idle allowance to at least that cap unless you also choose an idle setting. A total cap without a call cap has a recovery tradeoff: a crash can conservatively consume all remaining reserved time. C2C warns about this at preparation; it does not claim that time was measured or refund it from file timestamps.

For an existing incomplete run, ask:

```text
Use C2C to inspect and resume this run. Preserve successful stages.
If the inactivity guard or an existing time allowance was too small,
adjust this same run within the recovery rules. Keep my model settings
and explicit caps; do not repeat completed stages.
```

C2C checks the cause, cleanup state and remaining stages first. When your existing request covers recovery, it can increase a coordinator-selected guard or existing numeric allowance without another approval prompt. It records the change and preserves used attempts, completed stages and reviewed artifacts. It cannot remove a cap or change an existing run's fixed/activity policy. Your time, attempt and spending restrictions still apply. Login repair can require your participation in the native sign-in flow.

Advanced users can check a pending call without repeating the project assessment/history or making a model call:

```sh
node scripts/council.mjs progress --run "/absolute/path/to/run" --compact
```

Use `status` instead of `progress` for full budget and stage details before recovery or resumption.

The [technical recovery command](../references/protocol.md#budgets-and-bounded-recovery) takes absolute values: at most 60 minutes for an activity guard, 15 minutes for an existing call cap, 60 minutes for an existing cumulative cap, and six attempts. It makes no worker call or change to a running timer. Interrupted uncapped runtime stays unknown with its known lower bound. Preserve that uncertainty and any finite whole-task cap; never start over solely to escape a timeout.

## When a participant hits a usage limit

Stop calls to the blocked route. Before any calls, an unavailable other provider can lead to an eligible same-provider pair under [participant selection](#choose-the-participants). For a prepared or partial exchange, follow the [usage-limit recovery protocol](../references/protocol.md#no-paid-limit-recovery): preserve actual reports, participant identities and all consumed allowance. A new folder cannot reset a task's limits. Models from one provider may share the exhausted allowance; availability cannot be inferred from a different model name.

If no eligible continuation fits the remaining authority and limits, the available chat completes a **provisional plan with structured self-critique**, or saves a checkpoint if it has no allowance. It retains actual contributions, relevant security and acceptance checks, and unresolved risks. Reversible assumptions include validation checks; material decisions remain gates. Missing review stays explicit. “Wait for both participants” or “require both reviews” takes precedence. No credits, upgrades, account changes or alternative billing are part of recovery.

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
