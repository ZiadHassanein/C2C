<picture>
  <source media="(max-width: 640px)" srcset="docs/assets/cover-mobile.svg">
  <img src="docs/assets/cover.svg" alt="C2C. Two perspectives. One clearer plan." width="1120">
</picture>

# C2C — Codex and Claude Code planning skill

**C2C is an open-source skill for Codex and Claude Code to plan and review together—or use different models from one provider.** Start from either app, assess the project, compare proposals, and resolve review findings into one actionable plan. Use it for a small feature, an existing plan, or a whole-project roadmap.

Invoke **`$C2C` in Codex** or **`/C2C` in Claude Code**. Your current chat coordinates a real exchange through the peer's CLI, including security considerations, acceptance tests, and a visible record of decisions. Codex–Claude is the default; Codex-only or Claude-only discussion is an explicit choice.

[![Tests](https://github.com/ZiadHassanein/codex-claude-council/actions/workflows/test.yml/badge.svg)](https://github.com/ZiadHassanein/codex-claude-council/actions/workflows/test.yml)

**Node.js 18+** · **No npm dependencies** · [**MIT license**](LICENSE)

[Quick start](#install) · [Usage](#use-it) · [Workflow](#how-it-works) · [FAQ](docs/FAQ.md) · [Benchmarks](docs/BENCHMARKS.md) · [Visual PDF guide](docs/C2C-LinkedIn-Guide.pdf)

## Features

| Feature | What it does |
|---|---|
| **Project assessment first** | Records project evidence, production status, scoped readiness, goals, and the first useful action. |
| **Planning scaled to the task** | Uses focused review for a small feature or independent proposals for a design decision and project roadmap. |
| **Mutual plan review** | Independent participants challenge assumptions and failure cases; the coordinator records accepted, rejected, and unresolved findings. |
| **Choice of participants** | Pair Codex with Claude, or explicitly request different models within Codex or Claude Code. |
| **Clear plans** | Puts the recommendation, priority decisions, MVP, milestones, and next action before technical appendices. |
| **Visible discussion** | Shows stage updates and saves attributed proposals, challenges, and responses in `DISCUSSION.md`. |
| **Security and testing in every plan** | Requires a scoped security review and proposed acceptance checks, with gaps and unknowns preserved. |
| **Task sizing and model advice** | Recommends planning depth and suitable models without changing your settings. |
| **Saved context and progress** | Keeps Markdown plans and handoffs, structured evidence, bounded attempts, and recovery checkpoints. |
| **Proportional time and recovery** | Gives large plans more time, shows safe activity while waiting, and extends an existing run within audited ceilings when authorized. |
| **Less repeated context** | Reuses reports and reduces prompt and output formatting overhead while retaining review stages and selected evidence. |

See the [FAQ](docs/FAQ.md) for usage limits. The [v0.7 visual guide](docs/C2C-LinkedIn-Guide.pdf) covers cross-provider setup and historical measurements; use this README for the newer pairing options and plan format.

## Install

### 1. Prepare your tools

Install [Node.js 18 or newer](https://nodejs.org/en/download) and the **peer's command-line tool (CLI)**. For the default Codex–Claude pairing, use its official setup guide, then sign in if needed:

| Your starting app | Required CLI | Sign-in command |
|---|---|---|
| Codex | [Claude Code](https://code.claude.com/docs/en/quickstart) | `claude auth login` |
| Claude Code | [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) | `codex login` |

Install both CLIs to use the skill in both directions. For Codex-only discussion, install and sign in to Codex CLI; for Claude-only discussion, use Claude Code CLI. **You do not need the peer app or its terminal open.** C2C launches it without a window and reuses saved CLI authentication. Keep working in your starting chat. The installer does not install these prerequisites or sign you in.

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

Only your chosen direction needs to be ready. For same-provider options, see [setup checks](docs/SETUP.md#check-your-setup). Older CLIs may lack required controls; follow the reported guidance. This checks setup and visible saved authentication without a model request; credentials may still expire or be rejected. [Troubleshoot a failed check →](docs/SETUP.md#troubleshooting)

### 4. Start a project chat

Open your project in Codex or Claude Code and start a **new chat** to discover the skill. Paste a request below into that chat.

## Use it

### From Codex

```text
Use $C2C to plan a search filter for this app.
Keep it focused, with security considerations and acceptance tests.
```

### From Claude Code

```text
/C2C Plan a search filter for this app with Codex.
Keep it focused, with security considerations and acceptance tests.
```

Replace the example with your task. Include relevant files, constraints, and success criteria. Your current chat coordinates the exchange and saves the results.

### With Codex only or Claude only

```text
Use $C2C with Codex only to plan this feature.
Recommend a different peer model; wait for my choice before calling it.
Challenge assumptions, show disagreements, and put decisions before technical details.
```

```text
/C2C Use Claude only to review this project plan.
Recommend a different peer model; wait for my choice before calling it.
Challenge the approach with evidence and give me a clear revised plan.
```

Same-provider discussion needs the current chat's full model ID and a different supported peer model ID. C2C resolves these from available evidence and your choice; it asks if a necessary ID or selection is missing. You can explicitly delegate choosing the peer model. The current chat stays unchanged. Separate calls provide independent contributions, but different models can share blind spots and the CLI may not report its actual model identity. [Pairing details →](docs/SETUP.md#choose-the-participants)

The skill assesses your project first. You do not need to fill in a form or write the assessment files yourself.

| Planning need | What to ask for |
|---|---|
| **Small feature** | Concise implementation steps, edge cases, and acceptance checks. |
| **Design decision** | Independent proposals, a comparison of approaches, and mutual review. |
| **Whole project** | MVP scope, architecture, milestone dependencies, and a detailed first milestone. |
| **Existing plan** | Review of a named plan file, with proposed changes and reasons. |

**Model advice stays advisory.** Recommendations do not change your settings. For advice without a peer discussion, add: “Assess the task and recommend models. Keep my settings; advice only.”

**Time follows the task.** Bounded work starts with up to 5 minutes per call, 15 cumulative peer minutes, and four attempts. Large/deep project plans use up to 10 minutes per call, 40 cumulative minutes, and five attempts. C2C states the allowance first and honors your explicit limits. If a call times out, it preserves completed work and can recover within the same run; it does not need a fresh start or an open peer terminal. These are ceilings, not duration estimates or spending caps. [Progress and recovery →](docs/SETUP.md#when-a-peer-call-takes-longer)

**Less repetition by default.** In two offline v0.7.0 fixtures, peer-input tokens fell **8.19%** for a small feature and **10.93%** for a project roadmap; entry instructions were **12.18%** smaller. These are separate input-text measurements, not total-session savings or proof of equal planning quality. Review stages and selected evidence were retained. [Benchmark method and limits →](docs/BENCHMARKS.md)

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

The same stages apply to explicitly selected same-provider pairs. The final decision record explains which findings were accepted, rejected, or left unresolved. Edits made after peer verification are marked clearly. Reviewers challenge consequential assumptions and plausible failure cases; they need evidence for objections, not a quota of disagreements. Agreement is not required to finish.

## Follow the discussion

The chat shows concise updates as planning progresses: what each agent proposed, what the other challenged, and how the coordinator changed the plan or kept an issue open. Arguments and decisions come from completed reports. While a peer is working, safe activity and time updates show that its response is still pending; received output is not treated as a completed review.

```text
Use $C2C to plan a website for selling cars.
Show me the main disagreements and plan changes as you go.
Include security and testing, and show me the plan before coding.
```

In Claude Code, start the request with `/C2C`. No extra setting is needed. For fewer updates, ask for “quiet mode” or “only the final plan.”

**Illustrative car-site example — not a recorded exchange:**

| Contribution | Point | Outcome |
|---|---|---|
| Codex proposes | Include customer accounts and saved cars in the MVP. | Candidate scope for review. |
| Claude challenges | Browsing and seller contact can work without customer accounts; protect inventory management with authenticated admin access. | Recommends a smaller launch scope. |
| Codex decides | Defer customer accounts; keep browse, filter, contact, and secured inventory management. | Revises the plan and records the reason. |

Actual exchanges can agree, disagree, or end with unresolved questions. `DISCUSSION.md` preserves the submitted points and decisions, with links to their evidence. Updates arrive between completed stages; private reasoning and token streams are not displayed. [Discussion controls →](docs/SETUP.md#follow-the-discussion)

## What you receive

The chat links to the run folder. These are the main files to read:

| File | Purpose |
|---|---|
| **`PROJECT_CONTEXT.md`** | Initial project evidence, deployment status, readiness gaps, and planning direction. |
| **`final-plan.md`** | A decision brief, MVP/deferred scope, milestones or steps, security/testing checks, and technical appendices when needed. |
| **`RESULT.md`** | After completion: review outcome, remaining issues, and changes since verification. |
| **`DISCUSSION.md`** | Generated account of proposals, challenges, decisions, and open questions as the exchange progresses. |
| **`TASK_ASSESSMENT.md`** | Task size, risk, uncertainty, and model recommendations. |
| **`HANDOFF.md`** | Generated progress, evidence links, and the next action. |

The run also retains detailed decisions and the security review. An optional `IMPLEMENTATION_BRIEF.md` hands off one selected milestone.

The plan starts with its real review status, recommendation, and priority decisions. Confirmed requirements stay separate from proposed choices. Larger plans use milestone dependencies and exit gates; technical depth follows the brief in the same document. If a peer call fails, the available work stays labeled as a draft. [Plan layout →](references/plan-presentation.md)

> **Review completion describes the planning exchange.** The result distinguishes proposed checks from executed results and preserves unresolved issues. Security review records risks and unknowns. Implementation and deployment require their own authorization and verification.

## Documentation

| Guide | Start here when you need to… |
|---|---|
| [Setup and troubleshooting](docs/SETUP.md) | Install, update, uninstall, or resolve a failed check. |
| [Frequently asked questions](docs/FAQ.md) | Understand collaboration, privacy, models, costs, and planning limits. |
| [Visual setup and usage guide (v0.7 PDF)](docs/C2C-LinkedIn-Guide.pdf) | Follow cross-provider setup, invocation examples, and historical measured results. |
| [Token benchmark and validation](docs/BENCHMARKS.md) | Check what was measured, retained, and not established. |
| [Release notes](CHANGELOG.md) | See what changed across recent C2C versions. |
| [Agent instructions](SKILL.md) | Understand how either AI coordinates a discussion. |
| [Project assessment](references/project-assessment.md) | Understand deployment evidence, readiness, and the direction check. |
| [Plan presentation](references/plan-presentation.md) | See how decisions, scope, milestones, checks, and technical detail are organized. |
| [Technical protocol](references/protocol.md) | Inspect commands, schemas, and saved evidence. |
| [Development and validation](PROJECT_NOTES.md) | Review design decisions and dated test results. |

Peer calls use your provider account and its usage limits. Only selected context is sent to the peer's provider; exclude secrets and unrelated private data. Runtime limits are not spending caps. [Usage and privacy details →](docs/SETUP.md#usage-and-privacy)

---

Built for Codex and Claude Code. Distributed under the [MIT license](LICENSE).
