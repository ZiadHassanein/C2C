# Setup and help

[← Quick start](../README.md)

Use this page when you need help with installation, updating, or a failed setup check. For normal use, paste a request into your project chat and let the AI handle the runner.

## Check your setup

Open a terminal in the downloaded `codex-claude-council` folder and run:

```sh
node --version
node scripts/council.mjs version
node scripts/council.mjs doctor
```

Node must be 18 or newer. `doctor` checks CLI availability, required flags and feature controls, and sign-in. Read its readiness values even if the command itself finishes successfully:

- `codex_chat_ready: true`: a Codex chat can call Claude.
- `claude_chat_ready: true`: a Claude Code chat can call Codex.

A missing or signed-out CLI for the direction you are not using is okay. A successful real discussion is the final check that model access works.

## Troubleshooting

| What you see | What to do |
|---|---|
| `node` is not recognized or not found | Install [Node.js](https://nodejs.org/en/download), reopen your terminal, and try `node --version`. |
| `git` is not recognized or not found | Use the [ZIP download](https://github.com/ZiadHassanein/codex-claude-council/archive/refs/heads/main.zip), extract it, and open a terminal in the folder containing `scripts`. |
| Cannot find `scripts/install.mjs` | You are in the wrong folder. Open a terminal in the extracted or cloned repository folder, then rerun the command. |
| `doctor` cannot find `claude` or `codex` | Install the required CLI using the [Claude Code](https://code.claude.com/docs/en/quickstart) or [Codex](https://learn.chatgpt.com/docs/codex/cli) setup guide. Reopen the terminal and check again. |
| `doctor` reports signed out | For the required peer, run `claude auth login` or `codex login` in your terminal, then rerun `doctor`. |
| Codex is missing the required `view_image` control | Upgrade Codex or select a compatible binary using `COUNCIL_CODEX_BIN`. Version 0.146.0 lacks this control; 0.160.1 passed local checks. C2C blocks before spending an attempt. |
| A required CLI flag is missing | Update that CLI using its official setup guide, then rerun `doctor`. |
| The installer finds a legacy skill | Follow [Update the skill](#update-the-skill) to move the old `codex-claude-council` installation outside all skill directories, then rerun installation. |
| A different installation already exists | Follow [Update the skill](#update-the-skill). The installer protects existing files instead of overwriting them. |
| The skill does not appear in chat | Confirm installation, then start a new chat or restart the app. Use the Codex `$C2C` or Claude `/C2C` prompt. |
| Terminal setup works, but the chat reports signed out | The chat's restricted environment may not see the normal credential store. Use the host's approved execution path or follow its access prompt. Do not copy credential files. |
| A discussion times out or fails | Ask the AI to read the run's `HANDOFF.md`, check its status, and inspect the saved failure logs. A partial response is not a completed review; successful stages should not be repeated. |

The installer does not install either provider CLI, create accounts, or sign in for you. Windows npm Codex installations are discovered through their native package binary. When multiple versions are installed, you can set `COUNCIL_CODEX_BIN` to the chosen executable for your terminal session; see [compatibility and recovery](../references/protocol.md#compatibility-and-recovery).

For a damaged or stale run lock, ask the AI to inspect the saved state and follow the [recovery procedure](../references/protocol.md#compatibility-and-recovery). Never delete a live lock or reset attempts to make a run continue.

## Install for one app only

The default installer adds the skill to both apps. To choose one, run **one** of these instead:

```sh
node scripts/install.mjs --target codex
```

```sh
node scripts/install.mjs --target claude
```

This chooses where the **skill** is installed. A Codex chat still needs the Claude CLI; a Claude Code chat still needs the Codex CLI.

Default locations (`~` means your user folder):

| App | Skill folder |
|---|---|
| Codex | `~/.codex/skills/C2C` |
| Claude Code | `~/.claude/skills/C2C` |

If you already use `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, the installer uses that configured root. You do not need to set either variable for a normal installation.

## Update the skill

1. Get the latest repository files. For a Git clone, run `git pull` inside it; for a ZIP installation, download and extract the latest ZIP.
2. Move each older installed `C2C` folder (or `codex-claude-council` from an earlier release) to a backup location **outside all skill directories**, such as `~/skill-backups/`. Use distinct backup names for Codex and Claude. Moving the backup outside prevents duplicate skill discovery.
3. From the updated repository folder, run `node scripts/install.mjs` again. Use `--target codex` or `--target claude` if you only want one installation.
4. Run `node scripts/council.mjs doctor` and open a new chat.

The commands are now `$C2C` in Codex and `/C2C` in Claude Code. The repository folder can keep its original name.

Downloading updates alone does not update the installed copies. If their files already match (including harmless LF/CRLF differences), the installer reports `Already installed` and leaves them alone. Keep your backup until the new installation works.

## Uninstall

Remove only the `C2C` folder from the installed locations above, then start a new chat. Your separately saved plans and run folders remain available.

## Follow the discussion

Concise discussion updates are enabled by default. Ask “show the main disagreements and plan changes as you go” for emphasis, or “quiet mode” / “only the final plan” to limit chat updates. The AI handles the runner commands for you.

Updates identify each agent's submitted points, the coordinator's decisions, and unresolved questions after completed stages. A pending call is shown as waiting. C2C does not invent dialogue or stream private reasoning. Both planning modes keep their existing call limits.

Open the run's generated `DISCUSSION.md` to read the evidence-backed account. It stays local and is excluded from peer inputs. To refresh it after local report or decision edits, ask the AI to refresh the discussion. For manual inspection from the repository folder:

```sh
node scripts/council.mjs discussion --run "/absolute/path/to/run"
```

Replace the path with the run folder. Run this between stages to refresh the discussion and return its file path, then open that file. You can read the existing file while a peer call is pending. Refreshing does not make another model call or advance the planning stages.

## Usage and privacy

Before planning, the AI checks the relevant project context and makes the goal, scope, success criteria, and next step explicit. It writes the assessment files for you. It may ask a focused question when an essential requirement is missing; unknown deployment details alone do not prevent a useful plan. Read `PROJECT_CONTEXT.md` for the evidence and limits. For an assessment without a peer discussion, ask for “assessment only.”

The skill runs a short, bounded exchange through your existing provider accounts. Normal provider usage applies.

C2C reduces repeated instructions, report reads and review prose by default. The AI uses `--compact` for routine runner output; it preserves every JSON field while removing formatting whitespace. Manual commands remain formatted for readability unless you add that flag. This does not change models, review stages or limits; real token savings depend on the task and provider. See [token efficiency](../references/protocol.md#token-efficiency).

| Default limit | Value |
|---|---|
| Time per peer call | 5 minutes |
| Combined peer runtime per run | 15 minutes |
| Launch attempts, including failed calls | 4 |
| Successful calls for focused review | 2 |
| Successful calls for independent planning | 3 |

These are runtime and attempt limits, **not spending or token caps**. A timeout can leave a partial run. Resuming should preserve successful stages and remaining limits; starting over is not a way to reset a failed run's budget.

Your current chat selects the brief and relevant context to send to the other provider. The runner does not automatically copy your whole project or chat. Exclude secrets and unrelated private material. Its check for obvious secrets is limited and cannot detect everything.

The peer is instructed to use supplied evidence. Calls disable applicable shell, image, browser, connector and agent features, use a neutral working directory and request read-only permissions. Some CLI tools may remain present but subject to those permissions. These settings are not a substitute for the host sandbox or managed policy. The current chat gathers evidence and performs any work you have authorized.

Model recommendations are advice. The current chat's model stays unchanged; the peer uses its CLI default unless you explicitly choose another supported model. Codex peer calls ignore ordinary user configuration for isolation, so do not assume their default matches another Codex session.

Every new council plan includes a security review and relevant test checks. Unresolved findings and edits made after peer verification remain visible. Completing the discussion does not mean every issue is resolved or the implementation has been tested.

## For contributors

Read [PROJECT_NOTES.md](../PROJECT_NOTES.md) before changing the skill. The [protocol](../references/protocol.md) documents commands, schemas, and saved evidence; [SKILL.md](../SKILL.md) contains the AI's instructions.

For runtime or installer changes, run:

```sh
npm test
```

For documentation-only changes, check links and examples without starting paid planning calls.
