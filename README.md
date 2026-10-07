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
| **Mutual plan review** | Participants challenge assumptions and proposed fixes; decisions explain adopted or adapted remedies, tradeoffs, and unresolved findings. |
| **Choice of participants** | Pair Codex with Claude, or explicitly request different models within Codex or Claude Code. |
| **Clear plans** | Puts the recommendation, priority decisions, MVP, milestones, and next action before technical appendices. |
| **Discussion in Markdown** | Updates `DISCUSSION.md` with attributed proposals, challenges, and responses; keeps chat focused on decisions and blockers. |
| **Security and testing in every plan** | Requires a scoped security review and proposed acceptance checks, with gaps and unknowns preserved. |
| **Current model research** | Checks official guidance for both providers on each new task, then selects suitable workers within your limits. Your chat model stays unchanged. |
| **Saved context and progress** | Keeps Markdown plans and handoffs, structured evidence, bounded attempts, and recovery checkpoints. |
| **Proportional time and recovery** | Gives large plans more time, shows safe activity while waiting, and extends an existing run within audited ceilings when authorized. |
| **Less repeated context** | Removes repeated source paths and redundant prompt metadata; reuses reports and compact progress while retaining distinct evidence and review stages. |

See the [FAQ](docs/FAQ.md) for usage limits. The [v0.7 visual guide](docs/C2C-LinkedIn-Guide.pdf) covers cross-provider setup and historical measurements; use this README for the newer pairing options and plan format.

## Install

### 1. Prepare your tools

Install [Node.js 18 or newer](https://nodejs.org/en/download) and the **peer's command-line tool (CLI)**. For the default Codex–Claude pairing, use its official setup guide, then sign in if needed:

| Your starting app | Required CLI | Sign-in command |
|---|---|---|
| Codex | [Claude Code](https://code.claude.com/docs/en/quickstart) | `claude auth login` |
| Claude Code | [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) | `codex login` |

Install both CLIs for cross-provider planning with a background author, or to use the skill in both directions. The table covers a chat that supplies its own planning draft. Codex-only discussion needs Codex CLI; Claude-only discussion needs Claude Code CLI. **You do not need another app or terminal open.** C2C launches workers without windows and reuses saved CLI authentication. Keep working in your starting chat. The installer does not install these prerequisites or sign you in.

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

The peer's route must be ready. A background author also needs its own provider's CLI ready; cross-provider runs with both workers need both CLIs. See [setup checks](docs/SETUP.md#check-your-setup). Older CLIs may lack required controls; follow the reported guidance. This checks visible saved authentication without a model request; credentials may still expire or be rejected. [Troubleshoot a failed check →](docs/SETUP.md#troubleshooting)

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
Choose a planning model and a different coding-focused reviewer within my limits.
Challenge assumptions, show disagreements, and put decisions before technical details.
```

```text
/C2C Use Claude only to review this project plan.
Research current models and choose a planning author and a distinct coding critic.
Challenge the approach with evidence and give me a clear revised plan.
```

Same-provider discussion uses a planning author and a different coding-focused critic. C2C researches both providers for each new task and selects suitable available workers within your limits. If your chat exactly matches the selected planner, it can supply the author's work; otherwise a background author runs without changing your chat. Different models can share blind spots, and reported identity may remain incomplete. [Pairing details →](docs/SETUP.md#choose-the-participants)

The skill assesses your project first. You do not need to fill in a form or write the assessment files yourself.

| Planning need | What to ask for |
|---|---|
| **Small feature** | Concise implementation steps, edge cases, and acceptance checks. |
| **Design decision** | Independent proposals, a comparison of approaches, and mutual review. |
| **Whole project** | MVP scope, architecture, milestone dependencies, and a detailed first milestone. |
| **Existing plan** | Review of a named plan file, with proposed changes and reasons. |

**You control model selection.** C2C chooses workers within your limits, records its reasons, and honors exact model choices. Your chat and global settings stay unchanged. For recommendations without worker calls, add: “Assess the task and recommend models; advice only.” [Selection policy →](references/model-selection.md)

**Time follows the task.** Bounded work starts with up to 5 minutes per call, 15 cumulative worker minutes, and four attempts. Large/deep plans use up to 10 minutes per call, 40 cumulative minutes, and five attempts. Independent planning with a background author defaults to six attempts for its five calls. Explicit caps take precedence. A timeout preserves completed work for recovery in the same run. These are ceilings, not duration estimates or spending caps. [Progress and recovery →](docs/SETUP.md#when-a-peer-call-takes-longer)

**Less repetition by default.** The v0.10.0 offline comparison measured **2.00–3.54% smaller worker inputs** across four matching routes with ordinary inputs. Controlled repeated-file cases saved **12.21–16.04%**; that conditional range is not a normal-project expectation or additive saving. All task evidence and required review stages were preserved. These are input measurements, not proof of equal live-model quality, faster responses or total-session savings. [Reproducible results and limits →](docs/benchmarks/v0.10.0.md)

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

**Independent planning** follows the six stages above. **Focused review** starts with one candidate plan, followed by critiques, synthesis, and verification. Both include a security review. The illustration shows the host chat authoring its side; a selected background author supplies that work when needed.

| Author of the plan | Focused review | Independent planning |
|---|---|---|
| Current chat matches the selected planner | 2 successful worker calls | 3 successful worker calls |
| Selected background author | 3 successful worker calls | 5 successful worker calls, including the author's critique |

The same stages apply to explicitly selected same-provider pairs. The final decision record explains which findings were accepted, rejected, or left unresolved. Accepting a concern does not automatically adopt its suggested fix: the coordinator checks consequential remedies against failure cases and simpler alternatives. Verification scrutinizes accepted fixes as well as rejections, including the verifier's own advice, and records actual replies to material counterarguments. Edits made after verification remain clearly marked. Agreement is not required, and no disagreement quota is imposed.

## Follow the discussion

Open the linked **`DISCUSSION.md`** to follow what each agent proposed, what the other challenged, and how the coordinator responded. It updates at saved stages and after local decisions are refreshed. The discussion stays in the file by default; chat carries important questions, blockers, necessary progress, and a short final decision brief with links.

```text
Use $C2C to plan a website for selling cars.
Keep the discussion in Markdown and chat updates minimal.
Include security and testing, and show me the plan before coding.
```

In Claude Code, start the request with `/C2C`. Minimal chat is the default. If you prefer live chat summaries too, ask, “Show me the main disagreements and plan changes as you go.”

**Illustrative car-site example — not a recorded exchange:**

| Contribution | Point | Outcome |
|---|---|---|
| Codex proposes | Include customer accounts and saved cars in the MVP. | Candidate scope for review. |
| Claude challenges | Browsing and seller contact can work without customer accounts; protect inventory management with authenticated admin access. | Recommends a smaller launch scope. |
| Codex decides | Defer customer accounts; keep browse, filter, contact, and secured inventory management. | Revises the plan and records the reason. |

Actual exchanges can agree, disagree, or end with unresolved questions. `DISCUSSION.md` preserves submitted points, decisions, and evidence links. A pending or failed stage stays labeled; private reasoning and token streams are not displayed. Avoiding duplicate chat recaps targets unnecessary narration, with no measured token-saving percentage for this change. Review stages, evidence, security, and model choices stay intact. [Discussion controls →](docs/SETUP.md#follow-the-discussion)

## What you receive

The chat links to the run folder. These are the main files to read:

| File | Purpose |
|---|---|
| **`PROJECT_CONTEXT.md`** | Initial project evidence, deployment status, readiness gaps, and planning direction. |
| **`final-plan.md`** | A decision brief, MVP/deferred scope, milestones or steps, security/testing checks, and technical appendices when needed. |
| **`RESULT.md`** | After completion: review outcome, remaining issues, and changes since verification. |
| **`DISCUSSION.md`** | Generated account of proposals, challenges, decisions, and open questions as the exchange progresses. |
| **`TASK_ASSESSMENT.md`** | Task size, risk, dated model research, selected roles, and allowance provenance. |
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
