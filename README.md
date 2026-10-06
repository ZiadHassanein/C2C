<picture>
  <source media="(max-width: 640px)" srcset="docs/assets/cover-mobile.svg">
  <img src="docs/assets/cover.svg" alt="C2C. Two perspectives. One clearer plan." width="1120">
</picture>

# C2C

A shared skill for planning and review with **Codex and Claude Code**. Start with the project's current state and a clear direction. Then bring both perspectives together into an actionable plan, a security review, and a record of the decisions.

[![Tests](https://github.com/ZiadHassanein/codex-claude-council/actions/workflows/test.yml/badge.svg)](https://github.com/ZiadHassanein/codex-claude-council/actions/workflows/test.yml)

**Node.js 18+** · **No npm dependencies** · [**MIT license**](LICENSE)

[Quick start](#install) · [Usage](#use-it) · [Before planning](#before-planning) · [Workflow](#how-it-works) · [Documentation](#documentation)

## Install

### 1. Prepare your tools

Install [Node.js 18 or newer](https://nodejs.org/en/download) and the **other provider's command-line tool (CLI)**. Use its official setup guide, then sign in if needed:

| Your starting app | Required CLI | Sign-in command |
|---|---|---|
| Codex | [Claude Code](https://code.claude.com/docs/en/quickstart) | `claude auth login` |
| Claude Code | [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) | `codex login` |

Install both CLIs to use the skill in both directions. The skill installer does not install these prerequisites or sign you in.

### 2. Download and install

With Git installed, run these commands in **PowerShell on Windows** or **Terminal on macOS/Linux**:

```sh
git clone https://github.com/ZiadHassanein/codex-claude-council.git
cd codex-claude-council
node scripts/install.mjs
```

Alternatively, [download the ZIP](https://github.com/ZiadHassanein/codex-claude-council/archive/refs/heads/main.zip), extract it, open a terminal in the folder containing `scripts`, and run `node scripts/install.mjs`.

The installer adds the skill to both apps for your current user. No `npm install` is needed. [Install for only one app →](docs/SETUP.md#install-for-one-app-only)

### 3. Check the connection

In the same terminal, run:

```sh
node scripts/council.mjs doctor
```

Look for the readiness value matching your starting app:

| Starting from Codex | Starting from Claude Code |
|---|---|
| `"codex_chat_ready": true` | `"claude_chat_ready": true` |

Only your chosen direction needs to be ready. This checks setup and sign-in without sending a planning request. [Troubleshoot a failed check →](docs/SETUP.md#troubleshooting)

### 4. Start a project chat

Open your project in Codex or Claude Code and start a **new chat** to discover the skill. Paste a request below into that chat.

## Use it

### From Codex

```text
Use $codex-claude-council to plan a search filter for this app.
Keep it focused, with security considerations and acceptance tests.
```

### From Claude Code

```text
/codex-claude-council Plan a search filter for this app with Codex.
Keep it focused, with security considerations and acceptance tests.
```

Replace the example with your task. Include relevant files, constraints, and success criteria. Your current chat coordinates the exchange and saves the results.

The skill assesses your project first. You do not need to fill in a form or write the assessment files yourself.

| Planning need | What to ask for |
|---|---|
| **Small feature** | Concise implementation steps, edge cases, and acceptance checks. |
| **Design decision** | Independent proposals, a comparison of approaches, and mutual review. |
| **Whole project** | MVP scope, architecture, milestone dependencies, and a detailed first milestone. |
| **Existing plan** | Review of a named plan file, with proposed changes and reasons. |

**Model advice stays advisory.** Recommendations do not change your settings. For advice without a peer discussion, add: “Assess the task and recommend models. Keep my settings; advice only.”

## Before planning

The coordinator inspects relevant project evidence and establishes a useful path before either agent proposes a solution.

| Question | What gets recorded |
|---|---|
| **What exists today?** | Current behavior, affected components, architecture constraints, and relevant checks. |
| **Is it in production?** | Production, non-production, or unknown, with evidence. Non-software work is marked not applicable. |
| **What is known about readiness?** | Checks for a stated scope, gaps, and unknowns—separate from whether the project is live. |
| **Where are we going?** | Goal, scope, success criteria, dependencies, and the first concrete action. |

A deployment file or passing tests alone cannot establish production use or readiness. Missing evidence stays visible. Essential goal questions are clarified first; technical unknowns can lead to a bounded discovery plan. Small features get a focused assessment, while larger projects get broader context and milestone gates.

The route can be a new build, an extension, hardening, discovery, or non-software planning. Changes to live systems carry the relevant compatibility, data, rollout, and recovery requirements into the plan. The skill records what the evidence supports; it does not certify a project as production-ready.

## How it works

<picture>
  <source media="(max-width: 640px)" srcset="docs/assets/workflow-mobile.svg">
  <img src="docs/assets/workflow.svg" alt="Independent plan mode: assess project state and clarify direction, separate Codex and Claude proposals, mutual critique, coordinator synthesis with security and test checks, peer verification, then a final plan with decisions and open questions." width="960">
</picture>

**Independent planning** follows the six stages above and uses **3 successful peer calls**. **Focused review** starts with one candidate plan, followed by independent critiques, synthesis, and peer verification; it uses **2 successful peer calls**. Both include a security review.

The final decision record explains which findings were accepted, rejected, or left unresolved. Edits made after peer verification are marked clearly. Agreement is not required to finish.

## What you receive

The chat links to the run folder. These are the main files to read:

| File | Purpose |
|---|---|
| **`PROJECT_CONTEXT.md`** | Initial project evidence, deployment status, readiness gaps, and planning direction. |
| **`final-plan.md`** | Scope, chosen approach, ordered steps, and acceptance checks. |
| **`RESULT.md`** | After completion: review outcome, remaining issues, and changes since verification. |
| **`TASK_ASSESSMENT.md`** | Task size, risk, uncertainty, and model recommendations. |
| **`HANDOFF.md`** | Current progress, evidence links, and the next action. |

The run also retains detailed decisions and the security review. An optional `IMPLEMENTATION_BRIEF.md` hands off one selected milestone.

> **Review completion describes the planning exchange.** The result distinguishes proposed checks from executed results and preserves unresolved issues. Security review records risks and unknowns. Implementation and deployment require their own authorization and verification.

## Documentation

| Guide | Start here when you need to… |
|---|---|
| [Setup and troubleshooting](docs/SETUP.md) | Install, update, uninstall, or resolve a failed check. |
| [Agent instructions](SKILL.md) | Understand how either AI coordinates a discussion. |
| [Project assessment](references/project-assessment.md) | Understand deployment evidence, readiness, and the direction check. |
| [Technical protocol](references/protocol.md) | Inspect commands, schemas, and saved evidence. |
| [Development and validation](PROJECT_NOTES.md) | Review design decisions and dated test results. |

Peer calls use your provider account and its usage limits. Only selected context is sent to the other provider; exclude secrets and unrelated private data. Runtime limits are not spending caps. [Usage and privacy details →](docs/SETUP.md#usage-and-privacy)

---

Built for Codex and Claude Code. Distributed under the [MIT license](LICENSE).
