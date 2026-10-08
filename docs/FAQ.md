# C2C FAQ: Codex and Claude Code planning and review

C2C is an open-source skill for collaborative planning between Codex and Claude Code, or distinct models within one provider. Either app can start and coordinate the work. Start with the [installation guide](../README.md#install). The [v0.7 visual PDF guide](C2C-LinkedIn-Guide.pdf) covers historical cross-provider setup and usage.

## Can I install without cloning the repository?

Yes. With Node.js 18+ and npm/npx, run:

```sh
npx --yes https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.0.1.tar.gz install
```

It installs the skill for your current user in both apps. No Git, global package installation or npm account is needed. Start a new chat afterward. Add `--target codex` or `--target claude` for one app, or `--dry-run` to preview skill changes; npx may still download into its cache. For local/offline setup, use the [Git/ZIP instructions](SETUP.md#install-without-git). The helper does not install either provider CLI or sign you in.

## How do I make Codex and Claude Code work together?

Install C2C and start a new project chat. In Codex, ask `Use $C2C to plan…`. In Claude Code, use `/C2C Plan…`. The initiating chat coordinates; there is no permanent main provider. It prefers an eligible exchange with the other provider, then distinct models from its own provider if the other is unavailable before calls. If neither route qualifies, it delivers a provisional plan with structured self-critique. See [copyable prompts](../README.md#use-it) and [optional setup help](SETUP.md#troubleshooting).

## Do I need both command-line tools?

Only for an exchange that uses background workers from both providers. When your current chat supplies the author's work, only the other provider's CLI is required. Codex-only discussion needs Codex CLI; Claude-only discussion needs Claude Code CLI. Each also needs two eligible distinct models and authorized allowance. A missing unused CLI is ignored. Node.js 18 or newer runs the installer/council scripts, with no npm dependencies. The installer does not install CLIs or sign you in.

## Will I know when there is an update?

C2C 1.4+ checks when you start or resume it, reusing a daily cache, and gives a short chat notice. Say “Update C2C and keep this plan on its current version.” Prepared 1.4+ runs retain their original C2C code and instructions; start a fresh chat for new-version plans. There is no background service, automatic installation or extra model call. Older/provisional plans should finish or stop before updating. See [notification settings and update continuity](SETUP.md#update-notifications).

## Can I uninstall C2C easily?

Yes. Finish or stop active C2C runs, then run:

```sh
npx --yes https://github.com/ZiadHassanein/C2C/archive/refs/tags/v2.0.1.tar.gz uninstall
```

Unchanged managed skill folders move into recoverable backups; customized, unknown or linked files are protected. Missing folders are a no-op. Add `--dry-run` to preview or `--target codex` / `--target claude` to choose one app. Keep the printed rollback command and start a new chat afterward. Your apps, logins, settings, other skills and projects/plans saved elsewhere remain in place. Source downloads, npm cache and backups remain separate. See [offline removal, restoration and manual removal](SETUP.md#uninstall).

## What if one tool is not installed or ready?

C2C checks the existing setup before calls. If the other provider is missing or unusable, it automatically selects a planning author and distinct coding-focused critic from the current provider when that provider's CLI, exact models and allowance are eligible. It announces the selected roles and records actual responses. This works symmetrically from Codex or Claude Code.

If the current provider's CLI is also absent, no distinct eligible pair exists, or evidence required by your usage restrictions is missing, the chat produces a provisional plan with structured self-critique, security, proposed tests and a concrete execution entry point. Unknown live quota alone does not disqualify normal authorized subscription use. A self-critique is labeled as one chat's work and never presented as a second model's review. No installation, upgrade, login or configuration change is required. Missing tools, authentication failures and quota failures remain distinct. Explicit requirements for both providers, waiting, pinned choices or advice only take precedence. [Routing and recovery details](../references/protocol.md#planning-with-unavailable-tools).

## Must I keep Claude or Codex open while it works as the peer?

No. Only your coordinating chat needs to stay open. C2C starts the peer CLI non-interactively and reuses its saved authentication; no second app, panel, or terminal is needed. A rejected login makes that worker unavailable under the routing rules above. If you choose to repair it, native CLI login renewal may open a browser. A ready `doctor` result means authentication was visible locally, not that the provider accepted a fresh request. See [headless operation and login help](SETUP.md#do-i-need-another-terminal-open).

## Does C2C really ask the other AI?

Yes, when the selected workers are available and eligible: C2C launches them and saves actual reports. In plan mode, independent proposals precede mutual critique and verification of the synthesis. Focused review starts from one candidate. When the current chat is the selected author, required stages use three and two successful calls respectively; a background author raises these to five and three. The optional final-revision check adds at most one successful call within the same allowance. [Workflow and counts](../README.md#how-it-works). Assessment-only and standalone provisional planning make no worker calls; partial exchanges preserve the calls that actually occurred.

## Can Codex discuss a plan with another Codex model, or Claude with another Claude model?

Yes. This is selected automatically when the other provider is unavailable before calls and a same-provider pair is eligible. You can also ask `Use $C2C with Codex only` or `/C2C Use Claude only`. C2C researches current options and selects a planning author and a distinct coding-focused critic within your limits. If trustworthy metadata exactly identifies your chat as the selected planner, it can author directly; otherwise C2C launches the selected author in the background. Exact models, reserved selection and advice-only requests take precedence. See [copyable examples](../README.md#with-codex-only-or-claude-only) and [model identity limits](SETUP.md#choose-the-participants).

Different model IDs do not prove independent reasoning or guarantee that a provider honored a request. The runner records declared/requested identities, uses reported identity when available, and keeps unknowns visible. It does not switch the current chat or simulate a debate.

## Does one provider gain the other provider's abilities?

No. A Claude-only pair remains Claude models; a Codex-only pair remains Codex models. C2C gives them complementary questions: the planner connects outcomes, constraints and tradeoffs, while the critic traces implementation choices through evidence and failure cases. It cannot grant another model's capabilities or guarantee equivalent judgment. When only one eligible model remains, it uses a labeled self-critique instead of pretending a second model participated. [Planning perspectives](../references/protocol.md#single-provider-planning-perspectives).

The target is fewer material mistakes and clearer next steps for the resources used. Existing stages, review depth and call ceilings stay intact; reviews focus on changes and unresolved risks. More discussion is not a success metric. [How improvement is evaluated](BENCHMARKS.md#what-counts-as-improvement).

## Can I use it for small features and large projects?

Yes. A bounded feature can use focused review with implementation steps, edge cases, and acceptance checks. A project roadmap covers MVP boundaries, architecture, dependent milestones, and a concrete first milestone. Planning depth follows scope, risk, and uncertainty. Later milestones do not automatically start additional councils.

## What does it check before planning?

The coordinator inspects relevant project evidence, records production status separately from readiness, and clarifies the goal, scope, success criteria, and next action. Material product choices are asked about before a paid exchange. Missing technical evidence can become a bounded discovery task. A deployment file alone is not proof that a project is live or ready. See [project assessment](../references/project-assessment.md).

## Can I see the agents disagree and revise the plan?

Yes. Open the linked `DISCUSSION.md`: it records attributed proposals, findings, and coordinator responses as stages are saved. Chat stays minimal by default, surfacing important decisions and blockers instead of repeating each exchange. To also receive live chat summaries, ask, “Show me the main disagreements and plan changes as you go.” These are submitted arguments and decisions, not private reasoning or a live token stream. Every finding receives an accepted, rejected, or unresolved disposition; agreement is not required. See [discussion examples](../README.md#follow-the-discussion).

Reviewers challenge consequential assumptions with evidence, counterexamples and alternatives. The coordinator responds to findings and revises or defends the plan; the reviewer answers material counterarguments by finding ID during verification. These are the actual roles, even when a background worker authored the draft. Sound points may survive review. There is no required objection count, forced agreement or invented disagreement. Same-provider updates distinguish the roles and known/requested models.

## What if every finding is accepted?

Acceptance alone does not tell you whether the review was critical. The decision rationale must distinguish the concern from its suggested fix: adopt a sound remedy, adapt an overbroad one, or leave a material gap unresolved. Consequential fixes need an evidence-based failure check or alternative and a clear tradeoff. Verification challenges accepted fixes as well as rejections, including its own earlier recommendations. Actual peer replies appear in report summaries; the coordinator cannot invent them. If a later finding replaces an earlier resolution, the decision record links that correction instead of leaving contradictory decisions current. [Decision contract](../references/protocol.md#decision-record).

## How is the plan organized?

The plan leads with a link to its current review status, the goal, a recommendation, and priority decisions or blockers. Generated discussion/result records carry the changing review outcome so announcing completion does not require another review of an edited plan. It separates confirmed requirements from proposals and MVP scope from deferred work. Project roadmaps use milestone deliverables, dependencies, and exit gates; smaller features use concise steps. Security and test checks show whether they are proposed, executed, or blocked. Review changes and the next action stay visible; technical detail follows in the same plan's appendix. See the [presentation guide](../references/plan-presentation.md).

If a peer call fails, C2C presents an organized draft and identifies the missing review. It does not label that work jointly approved or treat a planned test as an executed one.

## How do I know where implementation starts?

The plan includes a **Start here** block: first work item, relevant project location and action, prerequisites, scope boundary, and an acceptance check. Unknown paths or commands become explicit discovery tasks. If you requested approval before coding, it shows both your next decision and where implementation would begin afterward.

The coordinator checks the plan's consistency before verification and again after corrections, including dependencies, finding dispositions, security and test status. This is an instruction-level check; the runner's `finish` command does not judge plan quality. An optional implementation brief reuses the same entry point. See the [execution entry point and delivery check](../references/plan-presentation.md#make-the-execution-entry-point-explicit).

## Does every plan include security and tests?

Every new council requires a scoped security review and proposed acceptance checks. The plan preserves missing evidence, unresolved risks, and the distinction between proposed tests and tests actually executed. Completing the discussion does not certify security, production readiness, or a working implementation. Current controller validation is recorded in [project notes](../PROJECT_NOTES.md); [evaluation methods](BENCHMARKS.md) distinguish software checks from planning outcomes.

## Does it choose or change my model automatically?

C2C checks tool availability first. For each new task using workers, it searches current official guidance for the selected providers, records planning/coding candidates, and selects suitable workers within your limits. A provisional-only plan records skipped selection instead of researching inaccessible workers. Your chat and global settings stay unchanged; exact choices and advice-only instructions override automatic selection. Same-provider discussion uses a planner plus a distinct coding critic; cross-provider planning chooses a planning model from each provider. Research is reused for the same run and retries. [Selection policy](../references/model-selection.md).

If the same model is strongest for planning and coding, C2C selects an adequate distinct critic and explains the tradeoff. A model appearing in a catalog does not prove account access or guarantee quality. It does not make paid selection probes or silently choose a model outside your authorized billing scope. For advice alone, ask: “Assess the task and recommend models; advice only.”

## Does C2C send my whole repository to another provider?

C2C sends explicitly selected, frozen context and relevant review artifacts. The peer does not receive the whole repository by default. Your explicit C2C or Codex–Claude exchange request authorizes the relevant context for that exchange. Before the first call, a local `preview` describes its provider, model, input labels, packet hash and limits without calling a model or changing the run. Review the material and exclude secrets or unrelated private information; the secret scan is incomplete. Host permissions still apply. See [usage and privacy](SETUP.md#usage-and-privacy).

## How much does a planning exchange cost?

Worker calls use your provider account and usage limits. With your chat as author, focused review needs two successful calls and independent planning needs three. A background author makes these three and five. Standard allowances are four attempts, 5 minutes per call, and 15 cumulative worker minutes; large/deep plans use five attempts, 10 minutes per call, and 40 cumulative minutes. Background-author plan mode defaults to six attempts unless explicitly capped. Failures also count. These are ceilings, not spending caps, duration estimates, or a fixed price per plan. C2C states its route and honors explicit limits.

Consequential changes after verification may use one additional successful revision check within that same allowance. An unchanged plan does not need it. If no allowance remains, C2C records an explicitly provisional revision instead of silently claiming it was reviewed. [Final-revision rules](../references/protocol.md#final-revision-check).

## Will C2C buy credits or require paid usage after a limit?

No. C2C must not buy credits, enable extra usage or auto-reload, raise spending limits, upgrade your plan, or switch to API/cloud billing to keep an exchange running. Asking it to continue does not authorize those actions. It stops the blocked route and checks only permitted continuation within existing allowance. If none qualifies, it delivers a provisional plan with self-critique; if the chat has no allowance, it saves a checkpoint. It does not ask you to pay to unblock the plan.

Provider billing remains separate. For ordinary authorized subscription use, unknown live usage metadata is not treated as an exhausted account or a reason for repeated billing questions. Existing credit/overage settings can permit charges without a quota error, so this is not a zero-charge guarantee. An explicit included-only/zero-extra-charge restriction needs applicable no-overflow evidence before calls; an API key never supplies spending permission by itself. Worker processes disable Claude's credit-only fast mode without changing your account settings, selected model or effort. See [billing policies](../references/protocol.md#no-paid-limit-recovery).

## Can the reviewer check missing repository facts?

It can request a specific missing fact or file. The coordinator supplies a scoped, scanned snapshot or records an unavailable/rejected answer; the worker never gains unrestricted repository access. Original context and every supplied revision remain recorded. This reduces omitted-evidence blind spots but still depends on the coordinator's selection and truthful provenance. [Evidence requests](../references/protocol.md#bounded-evidence-requests).

## Is better planning quality proven?

No. Runtime tests validate the controller, and offline benchmarks measure synthetic inputs. The [outcome harness](../evals/README.md) supports real plans, matched model pools and limits, randomized blind review, and separate quality/resource measurements. Missing or synthetic evidence cannot establish a comparison; even a complete small batch is descriptive, not proof of general superiority.

## Why did a signed-in Claude or Codex time out?

Authentication and response completion are separate. The peer may be generating output without having returned a valid report before the deadline. C2C shows safe activity and elapsed/remaining time, preserving diagnostics without displaying raw reasoning. Activity does not establish a successful review. Opening the other app or terminal does not extend a deadline.

C2C can increase a coordinator-selected allowance on the same run when your existing request covers bounded recovery, preserving successful stages and every used attempt. It does not ask for repeated approval just to adjust its own default; explicit user caps still require existing permission or your decision before an increase. Hard ceilings are 15 minutes per call, 60 cumulative peer minutes, and six attempts. No stage is skipped, no successful call is repeated, and no model or reasoning setting is lowered automatically. See [resuming a timed-out call](SETUP.md#when-a-peer-call-takes-longer).

## What happens when one AI hits its usage limit?

C2C stops calls to the blocked route. Before calls, it can select an eligible planner and distinct critic from the starting provider when the other provider is unavailable. After a run is prepared, [bounded recovery](../references/protocol.md#no-paid-limit-recovery) preserves participants, actual reports and consumed allowance. A different model name does not establish fresh quota; models may share a limit. No account or billing switch is allowed.

If no eligible continuation fits your remaining limits, the available chat completes a **provisional plan with structured self-critique**, using actual reports already received. It retains reversible assumptions and validation checks, security, proposed tests, unresolved risks and decisions that need you. Missing independent review stays explicit. If no chat allowance remains, it saves a checkpoint. Requests to “wait for both participants” or “require both reviews” take precedence. Timeouts and rejected logins remain distinct from quota failures; no missing worker response is invented.

If the active chat itself becomes unavailable, C2C cannot guarantee automatic takeover. You can ask an available chat to continue provisional planning from the saved plan, notes, and handoff; it preserves the original council's participant settings and unfinished stages. See [usage-limit fallback and resumption](SETUP.md#when-a-participant-hits-a-usage-limit).

## How does C2C manage token use?

C2C reuses saved reports and task research, removes repeated context paths, offers compact runner output, and keeps the discussion in Markdown. These controls avoid specific forms of repetition. They do not guarantee lower total usage: additional workers and review stages also consume tokens. Actual usage depends on the task, selected models, provider behavior, retries and outputs. C2C makes no quantified token-saving, cost or speed claim. See [measurement methods and limits](BENCHMARKS.md).

## Will the plan recommend a model for implementation and show savings?

Yes. The plan includes an advisory execution choice tied to the first work item, a justified alternative, source dates, availability gaps and conditions for reconsidering the choice. Roadmaps add different model recommendations only where the work warrants them. Official guidance establishes capabilities and rates; firsthand experiments and social reports add context with their limitations. The recommendation does not switch models, launch coding or enable paid usage.

It explains why the model suits the actual work before presenting a percentage: the relevant task facts, evidence for the choice, tradeoff against the alternative and acceptance check. It also explains where a supported saving comes from; lower prices do not demonstrate fewer retries or reasoning tokens.

An equal-token API price comparison can show a percentage when its baseline and assumptions are explicit. Actual task-token reduction needs comparable task measurements and quality results. Subscription allowance is separate; API prices or social anecdotes cannot establish a percentage for your account. Missing evidence is reported as unknown. [Full recommendation policy](../references/model-selection.md#recommend-models-for-execution).

## Can I resume later, and will C2C start coding?

Saved Markdown plans, a generated handoff, and structured run state support resuming from the current stage. The coordinator checks status and relevant evidence instead of replaying successful calls. Recovery still needs intact state; arbitrary disk damage is not recoverable by design. C2C produces a plan and can prepare an implementation brief for a selected milestone. Implementation and deployment need their own authorization and verification.

## Where should I start?

Use the [one-command quick start](../README.md#install), then ask for one focused feature. Read the [setup guide](SETUP.md) for upgrades or troubleshooting and the [technical protocol](../references/protocol.md) for commands, schemas, and saved evidence.
