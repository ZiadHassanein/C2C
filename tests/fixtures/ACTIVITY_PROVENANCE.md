# Activity stream fixture provenance

These fixtures are redacted from saved, successful real CLI invocations. Tests replay them offline; no provider call or account access is needed.

| Fixture | Captured CLI | What its shape establishes |
|---|---|---|
| `activity-claude-2.1.294.jsonl` | Claude Code 2.1.294 | Representative stream-json events: initialization, message/block boundaries, increasing `thinking_tokens` counters, empty thinking deltas, structured-output JSON deltas, assistant output and result. |
| `activity-codex-0.160.1.jsonl` | Codex CLI 0.160.1 | A historical JSONL invocation containing lifecycle markers, a diagnostic item and a final `agent_message` item. This capture contains no intermediate reasoning or text deltas. |

The Claude selection retains representative events in their original order. The Codex fixture retains the captured event sequence. Event types, subtypes, block indexes, identifier relationships, empty versus nonempty content and selected advancing counters are preserved. All identifiers are replaced with consistent synthetic labels. Nonempty model text, structured report content and diagnostic messages are replaced; signatures, account information, paths, usage totals and unrelated metadata are omitted. The fixture JSON is not the original report and must not be used to validate its content.

The tests establish classifier recognition and replay rejection for these captured shapes. The historical Codex fixture proves recognition of its final message only; it does not demonstrate mid-generation activity, current-version compatibility or a successful live activity-mode Codex run. Synthetic tests cover additional documented shapes and failure cases separately. Never describe fixture replay as a new live exchange, a timing benchmark or a billing guarantee.
