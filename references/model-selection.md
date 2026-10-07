# Research and select worker models

Apply this policy to **each new planning task**. The current chat coordinates the work; worker selection never silently changes that chat or global configuration. Honor exact user selections, advice-only requests, provider preferences, and resource limits.

## Research once per task

Search current official guidance for **both OpenAI and Claude**, using concise task-fit terms without private project details. Open the relevant pages; snippets and remembered rankings are insufficient. Establish the date and current full model IDs, planning/coding suitability, constraints, and available reasoning settings. Reuse this evidence through the same run and retries. A new task needs a fresh search.

Start with [OpenAI model selection](https://developers.openai.com/api/docs/guides/model-selection), [Codex models](https://learn.chatgpt.com/docs/models), [OpenAI coding guidance](https://developers.openai.com/api/docs/guides/code-generation), [Claude selection](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model), [Claude catalog](https://platform.claude.com/docs/en/models/overview), and [Claude Code configuration](https://code.claude.com/docs/en/model-config). No model family is a permanent winner. A coding suffix does not prove superiority; general-purpose models can lead both roles.

Write a compact matrix in `TASK_ASSESSMENT.md`: provider, strongest suitable planning candidate, coding/review candidate, task-fit reason, exact IDs, dated sources, and access/limit evidence. Keep research out of peer packets. If fresh research is unavailable, record the gap; never describe cached guidance as freshly verified. Do not launch a newly inferred pair from stale rankings. Preserve useful discovery and identify the missing source/access evidence; explicit user-selected models or already verified choices within this task remain usable within their limits.

## Filter before choosing

Match scope, ambiguity, risk, context, quality, latency, and usage constraints. Check read-only local metadata for the actual worker route. [Codex `model/list`](https://learn.chatgpt.com/docs/app-server) supplies catalog/capability evidence; catalogs are not unconditional entitlement proof. Claude's picker and managed policy can limit or substitute choices. API model access does not establish subscription CLI access. Do not read credentials or make paid selection probes.

Use canonical versioned IDs. Modern Claude dateless IDs can be fixed snapshots; older short IDs can be aliases. Resolve identity using [versioning guidance](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions). Different effort levels, aliases, or context variants of one model do not establish distinct participants.

Exclude models outside the known authorized billing scope. In particular, [Claude Fable in non-interactive mode](https://code.claude.com/docs/en/model-config#fable-and-usage-credits) may bill additional usage credits without a consent prompt. Runtime/attempt ceilings are not spending caps. Do not enable credits, change accounts, or assume a CLI will request permission.

## Assign real roles

- **Cross provider:** select the best task-fit planning worker available within limits from each provider. Both evaluate feasibility, security, and tests.
- **Same provider:** select a planning author and a distinct coding-focused critic. The critic challenges implementation details, failure cases, security, and verification. If the strongest planner and coder overlap, disclose that and select the strongest adequate distinct alternative; do not falsely call it the absolute best coder. If no adequate distinct option exists, surface that constraint.
- Automatic worker selection within the requested limits is authorized. Exact choices and advice-only instructions override it. Do not repeat permission questions for eligible choices; resolve only genuinely missing facts or authority.

Use `--author-model` for a background planning author from the coordinator's provider and `--peer-model` for the other participant. Reuse the host as author only when trustworthy metadata exactly matches the selected planner. Otherwise launch the selected background author; do not guess or unnecessarily ask for the chat's identity. Keep role, requested identity, and reported identity distinct.

The host-author route needs two successful calls for review or three for plan. A background author needs three for review or five for plan, including the author's critique. Background-author plan mode defaults to six attempts unless explicitly capped. Announce the chosen route and limits before execution. Separate real reports supply the arguments; neither forced agreement nor invented objections improves review.
