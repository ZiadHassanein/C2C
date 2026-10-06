# Project notes and continuation guide

Last updated: 2026-10-06. This is the maintained project summary, not a transcript. Read it before rediscovering the design or repeating validation. Check the current source, Git state, and run manifests before relying on dated observations.

## Objective and current status

Public display name and skill identifier: **C2C**. Invoke it with `$C2C` in Codex or `/C2C` in Claude Code. Both installed folders are named `C2C`. The private package name and GitHub repository path remain `codex-claude-council`; they do not determine the chat command.

Build a reusable skill that lets Codex and Claude Code contribute independent proposals, critique each other, and produce one actionable plan with a decision record. The user requested Markdown notes to make later sessions faster and more accurate.

The user also requested task-size assessment and task-appropriate model recommendations, expressly as advice. The coordinator now records this in `TASK_ASSESSMENT.md`; it never turns a recommendation into a model/effort override or a new approval pause. Existing user choices and CLI defaults are preserved unless the user explicitly changes them. This is a skill-instruction update; runner behavior and report schemas are unchanged.

The user explicitly requested suitability for both small features and big-project planning. Instructions now choose focused feature review (2 successful peer calls), feature design (3), or a project roadmap (3 at project level), using the existing runner modes. Small tasks still get a real council when requested. Project plans include MVP boundaries, dependent milestones, acceptance gates and a concrete first milestone; later milestone councils are not started automatically. UI prompt wording now allows proportional planning instead of always requiring independent drafts.

- Version 0.4.0 makes `C2C` the actual skill identifier and installed folder name. The installer refuses selected legacy folders before writing any files; users move those folders to backups outside all skill directories before reinstalling. Planning behavior and the version 3 run format are unchanged.
- Version 0.3.0 requires a factual project assessment and clear direction before a new council. It separates deployment evidence from scoped readiness, supports bounded discovery, and freezes the assessment into every peer stage and the final result. Repository: [ZiadHassanein/codex-claude-council](https://github.com/ZiadHassanein/codex-claude-council).
- Version 0.2.0 introduced mandatory security reviews, persistent partial process logs, bounded cleanup, and an optional implementation handoff. These remain in version 0.3.0.
- The initial published implementation is commit `6343b8b4b3efa5dd96b02b048185d8c6889299fb`.
- The skill was installed in both products on the development machine; installation and authentication are machine-specific, not guarantees for another user.
- License: MIT. No npm dependencies. Node.js 18+; CI covers Node 22 and 24.
- Real CLI calls succeeded in both directions. New version 2 focused-review and project-planning cycles completed with real Claude. The focused feature has executed synthetic implementation tests; the project roadmap preserves an unresolved identity-policy finding. The older long Claude sample remains incomplete and exhausted; preserve its original evidence.

## Decisions and reasons

| Decision | Reason |
|---|---|
| The existing chat coordinates; only the peer CLI is launched | Preserves the user's working context and avoids requiring a second CLI login for the coordinator itself. |
| Skill instructions plus a Node runner | Instructions govern planning; code handles transport, state, validation, deadlines, and evidence. |
| Independent drafts and independent critiques | Reduces anchoring. A peer's draft packet excludes the coordinator draft; its critique packet excludes the coordinator critique. |
| One coordinator produces the final plan | Makes responsibility and finding dispositions clear without demanding consensus. |
| Explicitly selected, frozen UTF-8 context | Both participants work from identifiable evidence; the runner does not scan the repository or copy the whole chat. |
| Restricted peer invocation in a temporary directory | The coordinator supplies evidence and performs authorized actions; the peer cannot recursively launch councils or freely modify the project. Managed policies still apply. |
| JSON reports and Markdown plans/handoffs | Structured state supports validation; concise Markdown lets people and future agents resume efficiently. |
| One successful response per stage and bounded attempts/runtime | Prevents accidental loops and silently repeated paid calls. |
| Keep post-verification edits visible | A revised plan must not be represented as the exact version the peer reviewed. |
| Scope collaboration by task | Support substantial planning and requested reviews without making every small edit require two agents. |
| Scale planning depth to the task | Reuse review mode for a bounded candidate plan and plan mode for design exploration or a project roadmap; preserve explicit user requests and keep model choices advisory. |
| Model advice is separate from execution | Assess size, complexity, risk and uncertainty independently; recommend from verified current information without changing actual settings. |
| Assess context and direction before planning | Existing behavior, deployment evidence, readiness scope, goal, success criteria and next action guide proportional planning. Missing facts can justify bounded discovery; material user choices must be clarified before a paid exchange. |
| Separate deployment from readiness | Live use does not prove a system is ready or secure. Configurations and passing tests do not prove live use. Unknowns and evidence provenance remain visible even if the peer says a plan is ready. |
| Freeze neutral assessment context | Both agents receive the same facts and requirements at every stage without leaking a coordinator proposal. The runner validates structure and references, not the truth or sufficiency of the evidence. |
| Require a security review in version 2 and newer runs | Every plan has scoped security evidence, tests and explicit unknowns before peer verification. Completed legacy runs cannot acquire this claim retroactively. |
| Preserve submitted security findings and actual reviewed versions | Each submission is sealed; findings remain unchanged and are resolved through decisions. Post-verification changes remain visible. |
| Stream process diagnostics and bound cleanup | Preserve available output on timeouts/errors without claiming that forced pipe closure proves descendant termination. |
| Separate onboarding from technical reference | The README provides four installation steps, copyable chat prompts and a visual workflow; setup options and troubleshooting live in docs/SETUP.md. |
| Use self-contained graphics for public documentation | A coordinated SVG cover and workflow provide consistent typography and colors. Dedicated mobile variants preserve readability; captions and alternative text explain both planning modes. No image generator, vendor logo or external font is required. |

## File map

| File | Purpose |
|---|---|
| `SKILL.md` | Instructions used by either coordinator. |
| `references/protocol.md` | Commands, report schemas, finding decisions, and handoff format. |
| `references/project-assessment.md` | Evidence gathering, deployment/readiness distinctions, direction gates and assessment JSON. |
| `scripts/council.mjs` | Dependency-free runner and CLI adapters. |
| `scripts/assessment.mjs` | Strict assessment validation and readable Markdown context. |
| `scripts/process.mjs` | Bounded child process invocation, streaming logs and termination diagnostics. |
| `scripts/install.mjs` | Installs both product copies by default; does not overwrite different existing files. |
| `tests/council.test.mjs` | Automated state, transport, timeout, and installer tests. |
| `tests/process.test.mjs` | Real local subprocess tests for output, timeouts, aborts, descendants and failures. |
| `agents/openai.yaml` | Codex skill name and suggested invocation. |
| `.github/workflows/test.yml` | Windows/Ubuntu tests on Node 22/24. |
| `README.md` | User setup and usage. |
| `docs/SETUP.md` | Troubleshooting, selective installation, upgrades, uninstall and usage details. |
| `docs/assets/*.svg` | Responsive README cover and independent-planning workflow, with desktop and mobile variants. |

## Workflow and persisted evidence

The runner commands are `doctor`, `prepare`, `ask`, `status`, and `finish`. The coordinator writes the intermediate reports and final plan; the runner does not autonomously perform the entire discussion.

- **Before planning:** inspect relevant evidence and write the required assessment. `prepare --assessment FILE` rejects missing/malformed assessments or `needs_user_input` direction before creating the run. Unknown deployment and bounded discovery remain valid.
- Version 3 saves sealed `project-assessment.json` and `PROJECT_CONTEXT.md` alongside the assessment in `snapshot.json`. Status, every peer packet and completion preserve that initial assessment; later findings belong in the final plan and decisions. The assessment participates in source-drift, secret and context-size checks. Version 1/2 runs remain readable without retroactive assessment claims.
- **Plan mode:** coordinator draft → peer draft → coordinator critique → peer critique → synthesis → peer verification → finding dispositions → finish. Three successful peer calls.
- **Review mode:** supplied or newly authored coordinator plan and coordinator critique → peer critique → synthesis → peer verification → finding dispositions → finish. Two successful peer calls; this does not create two independent proposals.
- Coordinator findings use `C-D…` / `C-R…`; the runner assigns peer IDs `P-D…` / `P-R…` / `P-V…`.
- Every finding needs an accepted, rejected, or unresolved disposition and a substantive reason.
- Version 2 and newer runs require `security-review.json` before verification and finish. It uses the report schema with `C-S` findings, is included only in the verification packet, and participates in decisions and reviewed/final hashes. Submitted findings cannot be removed or rewritten, including across retries. Security verdict and limitations remain visible even with no findings.
- The optional coordinator-authored `IMPLEMENTATION_BRIEF.md` carries a selected milestone and actual/unknown check commands. It does not install or execute a delegate automatically.
- Defaults: 300 seconds per peer call, 900 seconds cumulative peer runtime, four model-launch attempts. Failed model calls count. Preflight checks do not. These are not billing/token caps.
- A run retains `snapshot.json`, `run.json`, schemas, report files, attempt inputs/logs, `final-plan.md`, and `decisions.json`. Successful completion also produces `completion.json` and `RESULT.md`.
- The coordinator maintains a concise `HANDOFF.md` in the run directory. It is a navigation summary, not the authority for stage success or permission to retry.
- The coordinator writes `TASK_ASSESSMENT.md` before the first peer call. It records task size, complexity/risk/uncertainty, confidence, model advice, evidence, actual unchanged selections, and reassessment triggers. It is not parsed by the runner or shared in independent peer packets. Advice-only requests do not launch a council.
- Resume by reading `HANDOFF.md` and running `status`, then inspect only the relevant evidence. Do not replay successful stages. Start a new run only when justified by changed task/evidence; do not reset a run to escape its budget.

## Validation actually performed

Observed on 2026-10-06:

| Check | Result and limit |
|---|---|
| Version 0.4.0 command identity | The complete eight-file package was discovered as exact `C2C` by Codex CLI 0.160.1 (`skills/list`, enabled, no load errors) and Claude Code 2.1.291 (initialize-only command list). Source and both installed copies match byte-for-byte; old discovery folders were backed up outside skill roots. These were discovery checks without model prompts, not paid skill executions or desktop autocomplete tests. |
| Version 0.4.0 automated validation | All 59 tests passed on Windows / Node 24, including legacy-directory preservation, all-target preflight, selected-provider isolation and exact installed name. README/setup checks passed 25 local links, anchors and assets. An initial run failed when the system drive ran out of space; the successful rerun used a separate temporary directory. |
| Earlier frontmatter validation | The lowercase identifier in versions through 0.3.0 passed the bundled validator. See the uppercase compatibility limit below for 0.4.0. |
| Version 0.3.0 public interface presentation | Display metadata, README, CLI/result headings and responsive SVGs use **C2C**. The package identifier and commands stay compatible. All 56 automated tests pass; source and installed metadata, 24 local documentation targets and four SVG assets passed validation. Desktop/mobile graphics were rendered and visually inspected. Both installed copies match all eight package files. |
| Version 0.3.0 automated suite | All 56 tests passed on Windows with Node 24. New cases cover deployment/readiness evidence, direction gates before output creation or peer launch, real calendar timestamps, new-build/discovery/non-software routes, all-stage frozen context, source drift, sealed artifact changes, retained production gaps, secrets/aggregate size, the CLI assessment argument, and eight-file installation. Legacy v1/v2 runs also resume without assessment artifacts. |
| Version 0.3.0 independent instruction evaluation | Six offline scenarios covered a production checkout feature with missing policy, a dashboard with deployment configuration but no live evidence, an unspecified empty app, a small mobile-text change, a community workshop without a defined topic, and readiness advice with a known admin-access gap. Assessments preserved unknowns and evidence provenance, allowed useful small-task planning, and identified essential questions. All six JSON records validated. No paid peer calls or project changes occurred in this evaluation. |
| Version 0.3.0 packaging and documentation | Both installed copies match all eight package files, pass metadata validation, load the assessment helper, and are recognized by the installer. README/setup local targets and command references passed checks; desktop/mobile workflow graphics were rendered and inspected. Independent contract review found no blocking inconsistency. |
| Simplified onboarding documentation | README and setup-guide local links, section anchors, code fences, command paths and readiness field names were checked. Independent review confirmed examples against the installer and runner. Official prerequisite setup links were checked. Runtime and installed skill files were unchanged; no paid council call was needed. |
| Public README presentation | SVGs were rasterized and inspected, and a local Markdown preview was checked at desktop and mobile widths with light and dark page backgrounds. Mobile source selection was confirmed. Independent review found no accuracy or onboarding regression. Runtime behavior and installed skill files remain unchanged. |
| Advisory instructions | An independent offline evaluation covered five scenarios: a small permission fix, a mechanical change across 200 files, an underspecified platform replacement, an unverified model catalogue, and new security scope. All preserved actual settings, avoided unsupported model names, and stopped after the requested advice. An early advice-only routing clarification resolved an ordering ambiguity. No new paid peer calls were made; runner and tests were unchanged. |
| Planning depth instructions | A separate independent offline evaluation routed six scenarios: focused small feature, explicit independent proposals, existing project roadmap, new whole-project plan, assessment only, and a small high-risk candidate review. Expected scopes and required stages were preserved without automatic model changes or milestone councils. No blocking routing ambiguity was found. Skill metadata, UI prompt and local Markdown targets passed checks; runtime and installer code were unchanged, and no live council was performed for this update. |
| Version 0.2.0 automated suite | All 47 tests passed locally on Windows, including real local subprocesses and fixtures. The earlier 24-test result belongs to the initial implementation. |
| Version 0.2.0 GitHub CI | [Run 37421963366](https://github.com/ZiadHassanein/codex-claude-council/actions/runs/37421963366) passed all four Windows/Ubuntu × Node 22/24 jobs at implementation commit `dfbc22ede56917498402e657a10fece7f6cab53d`. Both installed copies also matched the six package files and passed metadata/load checks. |
| Version 2 focused review | Two actual Claude calls completed the small-feature review and verification. The coordinator then added tests based on verification findings; final plan, security report and decision revisions are explicitly marked post-verification. |
| Version 2 project plan | All three actual Claude stages succeeded under default limits, including final verification using stream-json output. The coordinator addressed six verification findings with explicit post-verification revisions. Completion preserves the peer's needs_changes verdict and an unresolved C-S1 identity-policy gap; it does not claim implementation readiness or that those final edits received another peer review. The synthetic service was not implemented. |
| Synthetic feature checks | The local pure-filter fixture passed 12 tests. Three deliberate regression mutants were detected (early-return validation bypass, skipped sparse holes, raw-value error disclosure). This demonstrates the workflow's useful feedback on one bounded example, not general plan quality. |
| Updated reverse adapter | One actual Codex review call succeeded using synthetic coordinator records. This is transport validation, not a full Claude-led council. |
| Security/handoff instructions | Three additional offline scenarios covered a low-risk button change, missing tenant-authorization evidence and a handoff with unknown commands. No blocking routing ambiguity was found; no live task was executed by that evaluation. |
| Initial GitHub CI | [Run 37416553250](https://github.com/ZiadHassanein/codex-claude-council/actions/runs/37416553250) passed all four Windows/Ubuntu × Node 22/24 jobs at the initial implementation commit. |
| Real Claude draft | Passed in about 78 seconds using Claude Code 2.1.291. |
| Real Claude mutual critique | Passed in about 126 seconds. It supplied concrete transaction, rendering, backup, and offline-test improvements. |
| Real Claude final verification | Timed out at 180 seconds, then at the remaining approximately 155 seconds. The sample used a 540-second total budget and all four attempts; it remains incomplete. These were shorter limits than the default configuration. |
| Real Codex adapter | One successful draft call in about 12 seconds using Codex CLI 0.160.1. It correctly returned `insufficient_context` for an underspecified synthetic README task. This was adapter validation, not a full Claude-led council. |
| Normal-user authentication | Both CLIs were authenticated. A sandboxed Codex check falsely appeared signed out because that process could not access the normal credential store. Do not assume this historical login state persists. |

No model override was used for those live calls. Do not infer a precise model identity from CLI version or product name. No real application was built or browser-tested as part of the synthetic planning exercise.

## Reliability fixes already made

- Windows timeout cleanup handles a nonzero `taskkill` exit and falls back to terminating the owned direct child process.
- Partial stdout/stderr is bounded and written during execution, with failure/signal/cleanup metadata retained. Claude requests stream-json output so initialization/progress events can survive failed runs; legacy single-result envelopes remain parseable.
- Windows cleanup avoids PID-based termination after the direct parent has exited. Unconfirmed descendant cleanup is reported; process/tool restrictions are not an OS containment guarantee.
- Conservative obvious-secret detection checks the full outbound packet, not only initial context. It is not comprehensive secret detection.
- Security submissions survive retries and prelaunch orphan-file recovery; decision capacity supports the combined findings from all six possible reports.
- Empty peer drafts and malformed/error responses cannot become successful stage evidence.
- Evidence modified during a peer call invalidates the result.
- Verification hashes identify the exact plan and decision record submitted, including edits made during or after the call.
- Interrupted attempts are persisted and charged before budget checks; recovery does not charge them twice.
- Temporary-directory cleanup checks its target and reports a cleanup failure without overwriting the substantive invocation result.
- Installer preflight checks all destinations before copying and preserves existing different files.

## Known limits and sensible next work

1. The original long Claude verification timeout has no confirmed root cause. New focused-review and project-plan cycles completed under the default limits; this does not prove that all packets will finish. Use preserved/streamed diagnostics for future failures. Do not reopen the exhausted sample run.
2. The runner inherits provider defaults unless a peer model is explicitly requested. Codex peer runs ignore ordinary user configuration for isolation. Exact model selection and availability require current checks.
3. Limits bound calls and runtime, not money or tokens. The runner does not implement autonomous coding, continuous monitoring, or unrestricted agent messaging.
4. The initial CI passed with non-blocking warnings about the action runtime of `checkout@v4` and `setup-node@v4`; updating those actions is optional maintenance, not a failed test.
5. Source paths/content and local run logs can contain private project information. Keep live run records out of the public repository unless separately sanitized and authorized.
6. Project classification is the coordinator's evidence-based assessment, not an automated infrastructure audit. Runtime validation cannot verify truthful observations or adequate readiness scope. Artifact seals detect accidental changes; the local run manifest is trusted. Production use and workflow completion are never readiness certifications.

7. The exact uppercase identifier `C2C` is verified in the local Codex and Claude Code versions above. The generic [Agent Skills name specification](https://agentskills.io/specification#name-field) and bundled `quick_validate.py` require lowercase, so this package intentionally does not pass that name rule. Do not describe it as passing the generic validator or assume compatibility with other skill upload systems. Keep the requested command consistent in frontmatter, folder names, metadata and examples; check actual host discovery when those hosts change.

## Commands for continuing development

```sh
node scripts/council.mjs doctor
node --test tests/council.test.mjs
node --test tests/process.test.mjs
node scripts/council.mjs status --run /absolute/path/to/existing/run
git status --short
```

For documentation-only changes, validate affected skill instructions and links rather than making new paid model calls. Run the existing tests when runtime or installation behavior changes. Update this file when decisions, validation evidence, or limitations materially change; link to detailed evidence instead of copying complete transcripts.
