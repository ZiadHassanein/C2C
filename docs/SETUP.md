# Setup and help

[← Quick start](../README.md)

Use this page when you need help with installation, updating, or a failed setup check. For normal use, paste a request into your project chat and let the AI handle the runner.

## Check your setup

Open a terminal in the downloaded `codex-claude-council` folder and run:

```sh
node --version
node scripts/council.mjs doctor
```

Node must be 18 or newer. `doctor` checks CLI availability, supported flags, and sign-in. Read its readiness values even if the command itself finishes successfully:

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
| A required CLI flag is missing | Update that CLI using its official setup guide, then rerun `doctor`. |
| A different installation already exists | Follow [Update the skill](#update-the-skill). The installer protects existing files instead of overwriting them. |
| The skill does not appear in chat | Confirm installation, then start a new chat or restart the app. Use the Codex `$codex-claude-council` or Claude `/codex-claude-council` prompt. |
| Terminal setup works, but the chat reports signed out | The chat's restricted environment may not see the normal credential store. Use the host's approved execution path or follow its access prompt. Do not copy credential files. |
| A discussion times out or fails | Ask the AI to read the run's `HANDOFF.md`, check its status, and inspect the saved failure logs. A partial response is not a completed review; successful stages should not be repeated. |

The installer does not install either provider CLI, create accounts, or sign in for you.

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
| Codex | `~/.codex/skills/codex-claude-council` |
| Claude Code | `~/.claude/skills/codex-claude-council` |

If you already use `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, the installer uses that configured root. You do not need to set either variable for a normal installation.

## Update the skill

1. Get the latest repository files. For a Git clone, run `git pull` inside it; for a ZIP installation, download and extract the latest ZIP.
2. Move each older installed `codex-claude-council` folder to a backup location **outside all skill directories**, such as `~/skill-backups/`. Use distinct backup names for Codex and Claude. Moving the backup outside prevents duplicate skill discovery.
3. From the updated repository folder, run `node scripts/install.mjs` again. Use `--target codex` or `--target claude` if you only want one installation.
4. Run `node scripts/council.mjs doctor` and open a new chat.

Downloading updates alone does not update the installed copies. If their files already match, the installer reports `Already installed` and leaves them alone. Keep your backup until the new installation works.

## Uninstall

Remove only the `codex-claude-council` folder from the installed locations above, then start a new chat. Your separately saved plans and run folders remain available.

## Usage and privacy

Before planning, the AI checks the relevant project context and makes the goal, scope, success criteria, and next step explicit. It writes the assessment files for you. It may ask a focused question when an essential requirement is missing; unknown deployment details alone do not prevent a useful plan. Read `PROJECT_CONTEXT.md` for the evidence and limits. For an assessment without a peer discussion, ask for “assessment only.”

The skill runs a short, bounded exchange through your existing provider accounts. Normal provider usage applies.

| Default limit | Value |
|---|---|
| Time per peer call | 5 minutes |
| Combined peer runtime per run | 15 minutes |
| Launch attempts, including failed calls | 4 |
| Successful calls for focused review | 2 |
| Successful calls for independent planning | 3 |

These are runtime and attempt limits, **not spending or token caps**. A timeout can leave a partial run. Resuming should preserve successful stages and remaining limits; starting over is not a way to reset a failed run's budget.

Your current chat selects the brief and relevant context to send to the other provider. The runner does not automatically copy your whole project or chat. Exclude secrets and unrelated private material. Its check for obvious secrets is limited and cannot detect everything.

The peer works with the supplied context and has project tools disabled. These restrictions are not an operating-system security boundary. The current chat gathers evidence and performs any work you have authorized.

Model recommendations are advice. The current chat's model stays unchanged; the peer uses its CLI default unless you explicitly choose another supported model. Codex peer calls ignore ordinary user configuration for isolation, so do not assume their default matches another Codex session.

Every new council plan includes a security review and relevant test checks. Unresolved findings and edits made after peer verification remain visible. Completing the discussion does not mean every issue is resolved or the implementation has been tested.

## For contributors

Read [PROJECT_NOTES.md](../PROJECT_NOTES.md) before changing the skill. The [protocol](../references/protocol.md) documents commands, schemas, and saved evidence; [SKILL.md](../SKILL.md) contains the AI's instructions.

For runtime or installer changes, run:

```sh
node --test tests/council.test.mjs tests/process.test.mjs
```

For documentation-only changes, check links and examples without starting paid planning calls.
