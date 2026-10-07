<picture>
  <source media="(max-width: 640px)" srcset="docs/assets/cover-mobile.svg">
  <img src="docs/assets/cover.svg" alt="C2C. Two perspectives. One clearer plan." width="1120">
</picture>

# C2C — Codex and Claude Code planning skill

**Turn a feature idea or project brief into a plan reviewed by Codex and Claude Code.** C2C checks the project, asks important questions, compares proposals, and records critiques, security considerations, tests, and a clear starting point for implementation.

Start in **Codex with `$C2C`** or **Claude Code with `/C2C`**. Use both providers, or explicitly choose different models within one provider.

**Use what is already available.** If a required CLI is missing or unusable, C2C continues with a clearly labeled provisional plan in your current chat. It does not require you to install, upgrade or sign in to another tool, and never invents its review.

[![Tests](https://github.com/ZiadHassanein/C2C/actions/workflows/test.yml/badge.svg)](https://github.com/ZiadHassanein/C2C/actions/workflows/test.yml)

**Windows · Linux · macOS** · **Node.js 18+** · **No npm dependencies** · [**MIT license**](LICENSE)

[Install](#install) · [First request](#use-it) · [Your plan](#what-you-receive) · [Workflow](#how-it-works) · [Update](#update) · [Help](#need-help)

## Install

### 1. Prepare your tools

[Node.js 18 or newer](https://nodejs.org/en/download) runs the installer and council scripts. C2C uses existing compatible, authenticated command-line tools (CLIs) for independent review. If you want to add one, these are the optional setup instructions:

| Tool | Official installation guide | Sign in if needed |
|---|---|---|
| Codex CLI | [Install Codex](https://learn.chatgpt.com/docs/codex/cli) | `codex login` |
| Claude Code CLI | [Install Claude Code](https://code.claude.com/docs/en/quickstart) | `claude auth login` |

**You do not need the other app or a second terminal open.** C2C starts background workers using saved CLI authentication. The skill installer does not install these tools or sign you in.

<details>
<summary>Can I use only one CLI?</summary>

Codex-only discussion needs Codex CLI; Claude-only discussion needs Claude Code CLI. For a Codex–Claude exchange, only the peer's CLI is needed when the current chat supplies the author's work. Automatic model selection may need a background author, which requires both CLIs. [Choose the participants](docs/SETUP.md#choose-the-participants).

If a required CLI is unavailable, the current chat still produces a provisional plan with security, proposed tests and an execution entry point. A missing CLI that the selected route does not use is ignored. An explicitly requested two-model discussion is separate from this single-chat fallback.

</details>

### 2. Install and check

Run in **PowerShell on Windows** or **Terminal on macOS/Linux**, with Git installed:

```sh
git clone https://github.com/ZiadHassanein/C2C.git
cd C2C
node scripts/install.mjs
node scripts/council.mjs doctor
```

This installs C2C for your current user in both apps. No `npm install` is needed. Without Git, [download the ZIP](https://github.com/ZiadHassanein/C2C/archive/refs/heads/main.zip), extract it, and run the two `node` commands from the folder containing `scripts`.

For the default setup with both CLIs, look for:

```json
{
  "codex_chat_ready": true,
  "claude_chat_ready": true
}
```

`doctor` checks CLI availability, compatibility and locally visible authentication without making a model request. A missing required tool leads to provisional planning; setup is optional. It cannot prove remaining quota or that the provider will accept your login. [Optional setup help](docs/SETUP.md#troubleshooting) · [Install for one app](docs/SETUP.md#install-for-one-app-only)

## Use it

**3. Open your project in Codex or Claude Code and start a new chat.** Paste one of these prompts into that chat—not the terminal:

### From Codex

```text
Use $C2C to plan a search filter for this app.
Check the project first, include security and acceptance tests,
and show me the plan before coding.
```

### From Claude Code

```text
/C2C Plan a search filter for this app with Codex.
Check the project first, include security and acceptance tests,
and show me the plan before coding.
```

Replace the feature with your task. C2C assesses the project, clarifies consequential unknowns, selects suitable workers within your limits, and runs the exchange. You do not fill in assessment files yourself.

<details>
<summary>Example: plan a whole project</summary>

```text
Use $C2C to plan an ecommerce website for selling cars.
Customers need browse/filter, photos, car details, and seller contact.
I need an admin dashboard to manage inventory.
Start with a sensible MVP, include security and testing,
and show me the milestones and first implementation step before coding.
```

In Claude Code, replace `Use $C2C` with `/C2C`.

</details>

<details>
<summary>Example: review an existing plan</summary>

```text
Use $C2C to review docs/plan.md against this project.
Challenge assumptions and proposed fixes with evidence.
Show the recommended changes, unresolved risks, and where to start.
```

Replace the path with your plan. In Claude Code, start with `/C2C`.

</details>

### With Codex only or Claude only

<details>
<summary>Use different models from one provider</summary>

```text
Use $C2C with Codex only to plan this feature.
Choose a planning model and a different coding-focused reviewer within my limits.
```

```text
/C2C Use Claude only to review this project plan.
Choose a planning author and a different coding-focused critic within my limits.
```

C2C researches current official model guidance for both providers on each new task. It honors exact model choices and does not change your chat model or global settings. Different model IDs do not guarantee independent judgment. [Model selection](references/model-selection.md).

</details>

For recommendations without worker calls, ask: **“Assess the task and recommend models; advice only.”**

## What you receive

**Open `final-plan.md` first.** For a prepared run, the chat links to its folder and these three main files:

| File | What to look for |
|---|---|
| **`final-plan.md`** | Recommendation, scope, technical decisions, implementation steps, security, proposed acceptance checks, and **Start here**. |
| **`DISCUSSION.md`** | Actual proposals, critiques, coordinator decisions, and unresolved questions. |
| **`RESULT.md`** | After completion: the review outcome and whether the delivered revision was reviewed. |

If a usage limit blocks preparation, the chat saves a standalone provisional plan instead.

A typical plan is organized like this; small features keep the same essentials concise:

```text
Review status and recommendation
Scope: MVP and deferred work
Key decisions and tradeoffs
Steps or milestones, dependencies and acceptance checks
Security, testing and unresolved risks
Start here: first task, location, prerequisites and success check
```

Project evidence, model choices and resumable progress remain in `PROJECT_CONTEXT.md`, `TASK_ASSESSMENT.md` and `HANDOFF.md`. Unknown paths become bounded discovery tasks. Planning completion does not authorize coding or establish production readiness. [Plan layout](references/plan-presentation.md).

## How it works

<picture>
  <source media="(max-width: 640px)" srcset="docs/assets/workflow-mobile.svg">
  <img src="docs/assets/workflow.svg" alt="Independent planning: assess the project, create separate proposals, critique each other's plan, synthesize with security and test checks, verify, and deliver decisions with unresolved questions." width="960">
</picture>

**Independent planning** compares separate proposals. **Focused review** starts from one candidate plan. Both include critique, synthesis, security review, and verification. The diagram shows the chat authoring its side; a selected background author can supply that work instead.

### Before planning

C2C checks what exists, whether the project is in production, what readiness evidence is available, and whether the goal and first useful action are clear. Missing evidence stays unknown. Small features get a focused assessment; project roadmaps get MVP boundaries and dependent milestones. [Assessment details](references/project-assessment.md).

### Follow the discussion

Open `DISCUSSION.md` to follow saved proposals, challenges, and responses. Chat stays focused on questions, blockers and the final brief. To receive chat summaries too, ask: “Show me the main disagreements and plan changes as you go.”

**Illustrative car-site discussion—not a recorded exchange:**

| Contribution | Decision |
|---|---|
| One proposal includes customer accounts and saved cars. | Candidate MVP scope. |
| The reviewer asks whether browsing and seller contact need accounts. | Challenges the additional launch work. |
| The coordinator keeps inventory administration authenticated and defers customer accounts. | Records the smaller scope and its reason. |

Actual participants can agree or disagree. C2C evaluates objections and their proposed remedies; it does not require agreement or invent arguments. Failed and missing reviews stay visible. The file contains report summaries, findings and recorded decisions, not private reasoning. [Discussion controls](docs/SETUP.md#follow-the-discussion).

## Features

| Capability | What it changes for your plan |
|---|---|
| **Current model research** | Selects suitable planning/review workers within your limits, with recorded reasons. |
| **Missing-evidence requests** | Lets reviewers ask for facts; scoped snapshots or explicit unavailable/rejected answers are recorded. |
| **Final-revision checks** | Checks consequential corrections once within the existing allowance, or marks the revision unreviewed. |
| **Usage-limit fallback** | Lets the available chat finish a provisional plan while identifying missing review. No automatic worker or billing switch. |
| **Saved progress** | Preserves completed stages and attempts so an interrupted exchange can resume within its allowance. |
| **Managed updates** | Protects local edits and retains backups for rollback and interrupted-update recovery. |

Worker calls use your provider account and usage limits. Only selected context is sent; exclude secrets and unrelated private material. Attempt/time ceilings are **not spending caps**. A completed exchange may retain unresolved issues or an explicitly unreviewed final revision; missing required stages leave it incomplete. [Usage, limits and privacy](docs/SETUP.md#usage-and-privacy).

## Update

From your existing Git clone:

```sh
git pull --ff-only
node scripts/install.mjs --update
```

Start a new chat afterward. The updater retains backups and prints a rollback command; changed installations are protected. [ZIP updates, one-app updates and recovery](docs/SETUP.md#update-the-skill).

## Need help?

| Problem | Next step |
|---|---|
| C2C does not appear | Start a new chat after installation; check [setup and discovery](docs/SETUP.md#troubleshooting). |
| CLI missing, incompatible or signed out | Follow the reported `doctor` guidance and [setup checks](docs/SETUP.md#check-your-setup). |
| A call times out | Ask C2C to inspect the saved run and [resume within its allowance](docs/SETUP.md#when-a-peer-call-takes-longer). |
| A provider hits its usage limit | Use the [provisional-plan fallback](docs/SETUP.md#when-a-participant-hits-a-usage-limit), or explicitly ask to wait for both participants. |

## Documentation

| Guide | Purpose |
|---|---|
| [Setup and troubleshooting](docs/SETUP.md) | Installation options, platform requirements, updates and recovery. |
| [FAQ](docs/FAQ.md) | Models, costs, security, discussion and planning behavior. |
| [Evaluation methods](docs/BENCHMARKS.md) | How to measure inputs, planning quality and resource use. |
| [Visual guide — historical v0.7 PDF](docs/C2C-LinkedIn-Guide.pdf) | Illustrated cross-provider setup; use this README for current features. |
| [Release notes](CHANGELOG.md) | Changes by version. |
| [Agent instructions](SKILL.md) · [Protocol](references/protocol.md) · [Project notes](PROJECT_NOTES.md) | Coordination rules, commands, schemas and development evidence. |

Runtime tests and synthetic input benchmarks do not prove better plans, lower total cost or faster responses. See the [evaluation methods](docs/BENCHMARKS.md) for how these can be assessed separately.

C2C does not buy credits or switch to paid billing when a provider limit blocks planning. It continues provisionally within available limits or saves a checkpoint. [Billing boundaries](docs/FAQ.md#will-c2c-buy-credits-or-require-paid-usage-after-a-limit).

---

Built for Codex and Claude Code. Distributed under the [MIT license](LICENSE).
