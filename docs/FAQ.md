# C2C FAQ: Codex and Claude Code planning and review

C2C is an open-source skill for collaborative planning between Codex and Claude Code, or explicitly chosen different models within one provider. Start with the [installation guide](../README.md#install). The [v0.7 visual PDF guide](C2C-LinkedIn-Guide.pdf) covers cross-provider setup and historical benchmark evidence.

## How do I make Codex and Claude Code work together?

Install C2C, install and authenticate the other provider's CLI, then start a new project chat. In Codex, ask `Use $C2C to plan…`. In Claude Code, use `/C2C Plan… with Codex.` Your existing chat coordinates the work and launches the peer through its CLI. See [copyable prompts](../README.md#use-it) and [connection troubleshooting](SETUP.md#troubleshooting).

## Do I need both command-line tools?

Cross-provider planning with a selected background author needs both CLIs. When your current chat supplies the author's work, only the other provider's CLI is required. Codex-only discussion needs Codex CLI; Claude-only discussion needs Claude Code CLI. C2C requires Node.js 18 or newer and has no npm dependencies. Its installer does not install the CLIs or sign you in.

## Must I keep Claude or Codex open while it works as the peer?

No. Only your coordinating chat needs to stay open. C2C starts the peer CLI non-interactively and reuses its saved authentication; no second app, panel, or terminal is needed. Expired or rejected credentials require native CLI login renewal, which may open a browser. A ready `doctor` result means authentication was visible locally, not that the provider accepted a fresh request. See [headless operation and login help](SETUP.md#do-i-need-another-terminal-open).

## Does C2C really ask the other AI?

Yes. C2C launches the selected workers and saves actual reports. In plan mode, independent proposals precede mutual critique and verification of the synthesis. Focused review starts from one candidate. When the current chat is the selected author, required stages use three and two successful calls respectively; a background author raises these to five and three. The optional final-revision check adds at most one successful call within the same allowance. [Workflow and counts](../README.md#how-it-works). Assessment-only requests make no worker calls.

## Can Codex discuss a plan with another Codex model, or Claude with another Claude model?

Yes. Ask `Use $C2C with Codex only` or `/C2C Use Claude only`. C2C researches current options and selects a planning author and a distinct coding-focused critic within your limits. If trustworthy metadata exactly identifies your chat as the selected planner, it can author directly; otherwise C2C launches the selected author in the background. You can specify exact models or request advice only. See [copyable examples](../README.md#with-codex-only-or-claude-only) and [model identity limits](SETUP.md#choose-the-participants).

Different model IDs do not prove independent reasoning or guarantee that a provider honored a request. The runner records declared/requested identities, uses reported identity when available, and keeps unknowns visible. It does not switch the current chat or simulate a debate.

## Can I use it for small features and large projects?

Yes. A bounded feature can use focused review with implementation steps, edge cases, and acceptance checks. A project roadmap covers MVP boundaries, architecture, dependent milestones, and a concrete first milestone. Planning depth follows scope, risk, and uncertainty. Later milestones do not automatically start additional councils.

## What does it check before planning?

The coordinator inspects relevant project evidence, records production status separately from readiness, and clarifies the goal, scope, success criteria, and next action. Material product choices are asked about before a paid exchange. Missing technical evidence can become a bounded discovery task. A deployment file alone is not proof that a project is live or ready. See [project assessment](../references/project-assessment.md).

## Can I see the agents disagree and revise the plan?

Yes. Open the linked `DISCUSSION.md`: it records attributed proposals, findings, and coordinator responses as stages are saved. Chat stays minimal by default, surfacing important decisions and blockers instead of repeating each exchange. To also receive live chat summaries, ask, “Show me the main disagreements and plan changes as you go.” These are submitted arguments and decisions, not private reasoning or a live token stream. Every finding receives an accepted, rejected, or unresolved disposition; agreement is not required. See [discussion examples](../README.md#follow-the-discussion).

Reviewers are asked to challenge consequential assumptions with evidence, counterexamples, and alternatives. Sound points may survive review; there is no required objection count and no instruction to agree. Same-provider updates distinguish the roles and known/requested models.

## What if every finding is accepted?

Acceptance alone does not tell you whether the review was critical. The decision rationale must distinguish the concern from its suggested fix: adopt a sound remedy, adapt an overbroad one, or leave a material gap unresolved. Consequential fixes need an evidence-based failure check or alternative and a clear tradeoff. Verification challenges accepted fixes as well as rejections, including its own earlier recommendations. Actual peer replies appear in report summaries; the coordinator cannot invent them. If a later finding replaces an earlier resolution, the decision record links that correction instead of leaving contradictory decisions current. [Decision contract](../references/protocol.md#decision-record).

## How is the plan organized?

The user-facing plan leads with review status, the goal, a recommendation, and priority decisions or blockers. It separates confirmed requirements from proposals and MVP scope from deferred work. Project roadmaps use milestone deliverables, dependencies, and exit gates; smaller features use concise steps. Security and test checks show whether they are proposed, executed, or blocked. Review changes and the next action stay visible; technical detail follows in the same plan's appendix. See the [presentation guide](../references/plan-presentation.md).

If a peer call fails, C2C presents an organized draft and identifies the missing review. It does not label that work jointly approved or treat a planned test as an executed one.

## How do I know where implementation starts?

The plan includes a **Start here** block: first work item, relevant project location and action, prerequisites, scope boundary, and an acceptance check. Unknown paths or commands become explicit discovery tasks. If you requested approval before coding, it shows both your next decision and where implementation would begin afterward.

The coordinator checks the plan's consistency before verification and again after corrections, including dependencies, finding dispositions, security and test status. This is an instruction-level check; the runner's `finish` command does not judge plan quality. An optional implementation brief reuses the same entry point. See the [execution entry point and delivery check](../references/plan-presentation.md#make-the-execution-entry-point-explicit).

## Does every plan include security and tests?

Every new council requires a scoped security review and proposed acceptance checks. The plan preserves missing evidence, unresolved risks, and the distinction between proposed tests and tests actually executed. Completing the discussion does not certify security, production readiness, or a working implementation. Current controller validation is recorded in [project notes](../PROJECT_NOTES.md); [historical input measurements](BENCHMARKS.md) have separate limits.

## Does it choose or change my model automatically?

C2C searches current official guidance for **both providers on every new planning task**, records planning/coding candidates, and selects suitable workers within your limits. Your chat and global settings stay unchanged; exact model choices and advice-only instructions override automatic selection. Same-provider planning uses a planner plus a distinct coding critic. Cross-provider planning chooses a suitable planning model from each provider. Research is reused for the same run and retries. [Selection policy](../references/model-selection.md).

If the same model is strongest for planning and coding, C2C selects an adequate distinct critic and explains the tradeoff. A model appearing in a catalog does not prove account access or guarantee quality. It does not make paid selection probes or silently choose a model outside your authorized billing scope. For advice alone, ask: “Assess the task and recommend models; advice only.”

## Does C2C send my whole repository to another provider?

C2C sends explicitly selected, frozen context and relevant review artifacts. The peer does not receive the whole repository by default. Collaboration requires an explicit C2C or Codex–Claude exchange request. Review the selected material and exclude secrets or unrelated private information; the secret scan is incomplete. Local run files and logs may also contain private context. See [usage and privacy](SETUP.md#usage-and-privacy).

## How much does a planning exchange cost?

Worker calls use your provider account and usage limits. With your chat as author, focused review needs two successful calls and independent planning needs three. A background author makes these three and five. Standard allowances are four attempts, 5 minutes per call, and 15 cumulative worker minutes; large/deep plans use five attempts, 10 minutes per call, and 40 cumulative minutes. Background-author plan mode defaults to six attempts unless explicitly capped. Failures also count. These are ceilings, not spending caps, duration estimates, or a fixed price per plan. C2C states its route and honors explicit limits.

Consequential changes after verification may use one additional successful revision check within that same allowance. An unchanged plan does not need it. If no allowance remains, C2C records an explicitly provisional revision instead of silently claiming it was reviewed. [Final-revision rules](../references/protocol.md#final-revision-check).

## Can the reviewer check missing repository facts?

It can request a specific missing fact or file. The coordinator supplies a scoped, scanned snapshot or records an unavailable/rejected answer; the worker never gains unrestricted repository access. Original context and every supplied revision remain recorded. This reduces omitted-evidence blind spots but still depends on the coordinator's selection and truthful provenance. [Evidence requests](../references/protocol.md#bounded-evidence-requests).

## Is better planning quality proven?

No. Runtime tests validate the controller, and historical token benchmarks measure synthetic inputs. The [outcome harness](../evals/README.md) supports real plans, matched model pools and limits, randomized blind review, and separate quality/resource measurements. Missing or synthetic evidence cannot establish a comparison; even a complete small batch is descriptive, not proof of general superiority.

## Why did a signed-in Claude or Codex time out?

Authentication and response completion are separate. The peer may be generating output without having returned a valid report before the deadline. C2C shows safe activity and elapsed/remaining time, preserving diagnostics without displaying raw reasoning. Activity does not establish a successful review. Opening the other app or terminal does not extend a deadline.

C2C can increase a coordinator-selected allowance on the same run when your existing request covers bounded recovery, preserving successful stages and every used attempt. It does not ask for repeated approval just to adjust its own default; explicit user caps still require existing permission or your decision before an increase. Hard ceilings are 15 minutes per call, 60 cumulative peer minutes, and six attempts. No stage is skipped, no successful call is repeated, and no model or reasoning setting is lowered automatically. See [resuming a timed-out call](SETUP.md#when-a-peer-call-takes-longer).

## What happens when one AI hits its usage limit?

When a participant has a reported provider, account, or model usage block, the available chat completes a **provisional plan** by default, within your remaining limits. It uses actual reports already received, chooses reasonable reversible assumptions with validation checks, and retains security, testing, unresolved risks, and decisions that need you. Missing independent review stays explicit; a host self-check cannot replace it. Ask to “wait for both participants” or “require both reviews” if that is your preference.

C2C stops calls to the blocked route and does not try alternative workers, providers, accounts, or billing sources. Different models may share an allowance. Timeouts and rejected logins keep their own recovery paths; they are not assumed to be quota failures. Saved reports, failed attempts, and participant settings remain intact, and the council stays incomplete until its required real stages succeed. A block before preparation produces a standalone plan, without an invented run or discussion record.

If the active chat itself becomes unavailable, C2C cannot guarantee automatic takeover. You can ask an available chat to continue provisional planning from the saved plan, notes, and handoff; it preserves the original council's participant settings and unfinished stages. See [usage-limit fallback and resumption](SETUP.md#when-a-participant-hits-a-usage-limit).

## How many tokens does the efficiency update save?

Version 0.10.0 measured **2.00–3.54% smaller worker inputs** across four matching routes with ordinary inputs. Controlled repeated-path cases saved **12.21–16.04%**, which is not the expected saving for a normal project. The 24-workflow offline comparison preserved exact task evidence, required calls and final hashes. It does not measure generated output, reasoning tokens, billing, cache hits, live speed or equal model judgment. Extra background-author calls can increase total usage; percentages are not additive. See the [reproducible results](benchmarks/v0.10.0.md) and [historical measurements](BENCHMARKS.md).

## Can I resume later, and will C2C start coding?

Saved Markdown plans, a generated handoff, and structured run state support resuming from the current stage. The coordinator checks status and relevant evidence instead of replaying successful calls. Recovery still needs intact state; arbitrary disk damage is not recoverable by design. C2C produces a plan and can prepare an implementation brief for a selected milestone. Implementation and deployment need their own authorization and verification.

## Where should I start?

Use the [four-step quick start](../README.md#install), then ask for one focused feature. Read the [setup guide](SETUP.md) for upgrades or troubleshooting and the [technical protocol](../references/protocol.md) for commands, schemas, and saved evidence.
