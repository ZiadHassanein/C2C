# C2C release notes

C2C is a Codex and Claude Code skill for collaborative planning and mutual plan review. Invoke it with `$C2C` in Codex or `/C2C` in Claude Code. [Install and get started](README.md#install).

## 0.8.0 — Clearer plans and a choice of participants

- Plans lead with review status, a recommendation, prioritized decisions, and a concrete next action. MVP boundaries, milestone dependencies, exit gates, and test status stay readable; technical depth moves into the same plan's appendix.
- Explicitly requested Codex-only or Claude-only discussion uses a separate peer call with a different full model ID. Codex–Claude remains the default. The current chat stays unchanged; peer model choice requires user selection or explicit delegation.
- Same-provider runs require distinct declared coordinator and requested peer IDs. Those records are not model attestation: runtime identity may be unreported or affected by provider policy. Updates distinguish the participants by role and model information.
- Critiques challenge assumptions, alternatives, and plausible failure cases with evidence. They require neither agreement nor manufactured disagreement; unresolved findings remain visible.
- New runs record pairing in version 4 state. Existing version 1–3 runs retain their original contracts. Security review, independent stage boundaries, and two-/three-call workflows remain in place.
- All **149 automated tests** passed locally, including both same-provider routes and reported-model mismatch cases. Three offline instruction scenarios checked routing and plan presentation. No live provider calls were made for this update.

The [v0.7 PDF guide](docs/C2C-LinkedIn-Guide.pdf) and [token benchmark](docs/BENCHMARKS.md) document that release; their measurements are not new v0.8.0 measurements. See the [current setup](docs/SETUP.md#choose-the-participants) and [plan presentation guide](references/plan-presentation.md).

## 0.7.0 — Less repeated planning context

- Shorter entry instructions and focused review prose reduce repetition while retaining the selected evidence, full findings, security review, and verification stages.
- Peer packets omit local bookkeeping such as byte counts and hashes; sealed local records retain it.
- Agents can reuse reports already returned by the runner and request compact JSON output without dropping fields.
- Two offline fixtures measured **8.19% fewer peer-input tokens** for a small feature and **10.93% fewer** for a production roadmap. The entry skill measured **12.18% fewer tokens**, separately. These are input-text proxies, not total billing savings or proof of equal model quality. [Method, numbers, and limits](docs/BENCHMARKS.md).
- All **135 automated tests** passed locally; the [release commit's CI](https://github.com/ZiadHassanein/codex-claude-council/actions/runs/37445356743) passed on Windows and Ubuntu with Node 18, 22, and 24. No live provider calls were made for this update.

Model settings and review depth stay unchanged: focused review uses two successful peer calls; independent planning uses three. Failed attempts also consume the run's attempt allowance.

## 0.6.0 — Follow the planning discussion

- Concise chat updates show submitted proposals, challenges, and coordinator responses between completed stages.
- Generated `DISCUSSION.md` links arguments and decisions to the saved evidence, including unresolved disagreements and post-verification edits.
- Ask for quiet output when you only need the final plan. Discussion rendering adds no model calls.

The discussion shows recorded contributions and decisions; it does not display private reasoning or fabricate a live conversation.

## 0.5.0 — CLI compatibility and recovery

- Discover npm-installed Codex on Windows and check CLI capabilities before a paid attempt.
- Route calls to the other provider explicitly; handle linked skill folders.
- Improve recovery, lock validation, attempt accounting, selected-context handling, secret checks, and line-ending-compatible installation.
- Generate `HANDOFF.md` to make resuming an interrupted run easier.

## 0.4.0 — Short invocation in both apps

The installed skill identifier is `C2C`, with `$C2C` and `/C2C` entry points. The GitHub repository remains `codex-claude-council`. [Upgrade instructions](docs/SETUP.md#update-the-skill).

## 0.3.0 — Understand the project before planning

- Assess existing behavior, deployment evidence, readiness gaps, and planning direction before starting peer work.
- Clarify material requirements and record unknowns instead of silently assuming production status or readiness.
- Scale from focused feature review to project roadmaps with milestone gates.

## 0.2.0 — Security and implementation handoff

Every plan includes a scoped security review and proposed verification checks. Failure diagnostics persist, and an optional implementation brief can hand off a chosen milestone. Proposed tests remain distinct from executed results.

Task sizing and model recommendations remain advisory. Review completion is not a security certification or permission to deploy.
