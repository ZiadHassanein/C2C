# C2C FAQ: Codex and Claude Code planning and review

C2C is an open-source skill for collaborative planning between Codex and Claude Code. Start with the [installation guide](../README.md#install), or follow the [visual PDF guide](C2C-LinkedIn-Guide.pdf).

## How do I make Codex and Claude Code work together?

Install C2C, install and authenticate the other provider's CLI, then start a new project chat. In Codex, ask `Use $C2C to plan…`. In Claude Code, use `/C2C Plan… with Codex.` Your existing chat coordinates the work and launches the peer through its CLI. See [copyable prompts](../README.md#use-it) and [connection troubleshooting](SETUP.md#troubleshooting).

## Do I need both command-line tools?

From Codex, you need the Claude Code CLI. From Claude Code, you need the Codex CLI. Install both to use C2C in either direction. C2C itself requires Node.js 18 or newer and has no npm dependencies. Its installer does not install the CLIs or sign you in.

## Does C2C really ask the other AI?

Yes. A requested council uses the other provider's CLI and saves its actual reports. In plan mode, the peer proposes an approach before seeing the coordinator's draft, then reviews the coordinator's proposal and verifies the synthesis. In focused review mode, both critique one candidate plan before peer verification. [The workflow](../README.md#how-it-works) uses three or two successful peer calls respectively. An assessment-only request makes no peer calls.

## Can I use it for small features and large projects?

Yes. A bounded feature can use focused review with implementation steps, edge cases, and acceptance checks. A project roadmap covers MVP boundaries, architecture, dependent milestones, and a concrete first milestone. Planning depth follows scope, risk, and uncertainty. Later milestones do not automatically start additional councils.

## What does it check before planning?

The coordinator inspects relevant project evidence, records production status separately from readiness, and clarifies the goal, scope, success criteria, and next action. Material product choices are asked about before a paid exchange. Missing technical evidence can become a bounded discovery task. A deployment file alone is not proof that a project is live or ready. See [project assessment](../references/project-assessment.md).

## Can I see the agents disagree and revise the plan?

Yes. The chat shows concise updates between completed stages, and `DISCUSSION.md` records attributed proposals, findings, and coordinator responses. Ask, “Show me the main disagreements and plan changes as you go.” These are submitted arguments and decisions, not private reasoning or a live token stream. Every finding receives an accepted, rejected, or unresolved disposition; agreement is not required. See [discussion examples](../README.md#follow-the-discussion).

## Does every plan include security and tests?

Every new council requires a scoped security review and proposed acceptance checks. The plan preserves missing evidence, unresolved risks, and the distinction between proposed tests and tests actually executed. Completing the discussion does not certify security, production readiness, or a working implementation. The current runner's automated test evidence is documented in [benchmarks and validation](BENCHMARKS.md#software-validation).

## Does it choose or change my model automatically?

It assesses task size, complexity, risk, and uncertainty, then gives model advice. Recommendations do not override your settings. For advice alone, ask: “Assess the task and recommend models. Keep my settings; advice only.” Model availability and actual selections depend on your provider and CLI configuration.

## Does C2C send my whole repository to another provider?

C2C sends explicitly selected, frozen context and relevant review artifacts. The peer does not receive the whole repository by default. Collaboration requires an explicit C2C or Codex–Claude exchange request. Review the selected material and exclude secrets or unrelated private information; the secret scan is incomplete. Local run files and logs may also contain private context. See [usage and privacy](SETUP.md#usage-and-privacy).

## How much does a planning exchange cost?

Peer calls use your provider account and its usage limits. Focused review needs two successful peer calls; independent planning needs three. Failed launches can consume attempts. Defaults allow four model-launch attempts, 300 seconds per call, and 900 seconds of cumulative peer runtime. These limits are not token or spending caps. C2C does not establish a fixed price per plan.

## How many tokens does the efficiency update save?

Two offline v0.7.0 fixtures measured peer-input reductions of **8.19%** for a small feature and **10.93%** for a project roadmap. Entry instructions were **12.18%** smaller. The measurements used fixed reports and no provider calls; they do not measure generated output, reasoning tokens, billing, cache hits, or equivalent model quality. The percentages describe separate measurements and must not be added. See the [complete benchmark method](BENCHMARKS.md).

## Can I resume later, and will C2C start coding?

Saved Markdown plans, a generated handoff, and structured run state support resuming from the current stage. The coordinator checks status and relevant evidence instead of replaying successful calls. Recovery still needs intact state; arbitrary disk damage is not recoverable by design. C2C produces a plan and can prepare an implementation brief for a selected milestone. Implementation and deployment need their own authorization and verification.

## Where should I start?

Use the [four-step quick start](../README.md#install), then ask for one focused feature. Read the [setup guide](SETUP.md) for upgrades or troubleshooting and the [technical protocol](../references/protocol.md) for commands, schemas, and saved evidence.
