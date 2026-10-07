"""Reproducible instruction-size proxies; never calls a model provider.

Uses the optional, pinned tiktoken dependency in requirements.txt. Encoding
initialization may download public assets unless TIKTOKEN_CACHE_DIR is populated.
The output contains relative instruction names and declared commit IDs, not local
source paths. Source directories are read only; an existing output is refused.
"""

import argparse
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import re


FILES = (
    "SKILL.md",
    "references/model-selection.md",
    "references/plan-presentation.md",
    "references/project-assessment.md",
    "references/protocol.md",
)
ENCODINGS = ("o200k_base", "cl100k_base")
MEASURES = ("utf8_bytes", "words", "characters", *ENCODINGS)
TOKENIZER_VERSION = "0.12.0"


def normalized_text(raw):
    """Decode strictly; normalize CRLF and lone CR to LF, preserving other text."""
    return raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def commit_id(value):
    if not re.fullmatch(r"[0-9a-fA-F]{40}|[0-9a-fA-F]{64}", value):
        raise argparse.ArgumentTypeError("Use a full Git commit ID, not a path or moving ref")
    return value.lower()


def measure(text, encodings):
    return {
        "utf8_bytes": len(text.encode("utf-8")),
        "words": len(text.split()),
        "characters": len(text),
        **{
            name: len(encoding.encode(text, disallowed_special=()))
            for name, encoding in encodings.items()
        },
    }


def source_file(root, relative):
    path = (root / relative).resolve(strict=True)
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError(f"Source file must remain inside its snapshot: {relative}")
    return path.read_bytes()


def snapshot(root, source_ref, encodings):
    package_raw = source_file(root, "package.json")
    package = json.loads(normalized_text(package_raw))
    if not isinstance(package.get("version"), str) or not re.fullmatch(
        r"[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?", package["version"]
    ):
        raise ValueError("package.json must contain a version string")
    rows = []
    texts = []
    for relative in FILES:
        raw = source_file(root, relative)
        text = normalized_text(raw)
        texts.append(text)
        rows.append({
            "file": relative,
            "raw_utf8_bytes": len(raw),
            "raw_sha256": sha256(raw),
            "lf_sha256": sha256(text.encode("utf-8")),
            **measure(text, encodings),
        })
    concatenated = "\n\n".join(texts)
    return {
        "version": package["version"],
        "declared_source_commit": source_ref,
        "package_json_lf_sha256": sha256(normalized_text(package_raw).encode("utf-8")),
        "files": rows,
        "sum_of_separately_measured_files": {
            key: sum(row[key] for row in rows) for key in MEASURES
        },
        "concatenated_files": {
            "lf_sha256": sha256(concatenated.encode("utf-8")),
            **measure(concatenated, encodings),
        },
    }


def comparison(baseline, candidate):
    result = {}
    for key in MEASURES:
        before, after = baseline[key], candidate[key]
        delta = after - before
        result[key] = {
            "baseline": before,
            "candidate": after,
            "delta": delta,
            "percent_change": round(100 * delta / before, 4) if before else None,
        }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True, help="Baseline snapshot directory")
    parser.add_argument("--candidate", type=Path, required=True, help="Candidate snapshot directory")
    parser.add_argument("--baseline-ref", type=commit_id, required=True, help="Declared baseline commit ID")
    parser.add_argument("--candidate-ref", type=commit_id, required=True, help="Declared candidate commit ID")
    parser.add_argument("--output", type=Path, required=True, help="New JSON file outside both snapshots")
    args = parser.parse_args()
    baseline_root = args.baseline.resolve(strict=True)
    candidate_root = args.candidate.resolve(strict=True)
    if not baseline_root.is_dir() or not candidate_root.is_dir():
        parser.error("Both source snapshots must be directories")
    output = args.output.resolve()
    if output.is_relative_to(baseline_root) or output.is_relative_to(candidate_root):
        parser.error("Output must be outside both source snapshots")
    if args.output.exists() or args.output.is_symlink():
        parser.error("Refusing to overwrite an existing output")
    if version("tiktoken") != TOKENIZER_VERSION:
        parser.error(f"Use tiktoken=={TOKENIZER_VERSION} from benchmarks/requirements.txt")
    import tiktoken

    encodings = {name: tiktoken.get_encoding(name) for name in ENCODINGS}
    baseline = snapshot(baseline_root, args.baseline_ref, encodings)
    candidate = snapshot(candidate_root, args.candidate_ref, encodings)
    result = {
        "schema_version": 1,
        "measurement": "instruction_text_token_proxies",
        "provider_calls": 0,
        "tokenizer": {"name": "tiktoken", "version": TOKENIZER_VERSION, "encodings": list(ENCODINGS)},
        "counter_lf_sha256": sha256(normalized_text(Path(__file__).read_bytes()).encode("utf-8")),
        "method": {
            "files_in_order": list(FILES),
            "decoding": "Strict UTF-8; BOM, if present, is preserved",
            "normalization": "CRLF and lone CR become LF; no other text changes",
            "words": "Python str.split(): whitespace-delimited words",
            "special_tokens": "All source text encoded as ordinary text (disallowed_special=())",
            "deltas": "candidate minus baseline; positive values mean larger candidate text",
            "sum_of_separately_measured_files": "Each complete file measured separately, then summed",
            "concatenated_files": "Normalized files joined in files_in_order with exactly two LF characters; no wrappers",
            "source_refs": "Caller-declared commit IDs; per-file hashes identify the measured content",
        },
        "baseline": baseline,
        "candidate": candidate,
        "comparison": {
            "files": [
                {"file": before["file"], **comparison(before, after)}
                for before, after in zip(baseline["files"], candidate["files"])
            ],
            **{
                key: comparison(baseline[key], candidate[key])
                for key in ("sum_of_separately_measured_files", "concatenated_files")
            },
        },
        "limitations": [
            "These are deterministic instruction-text proxies, not billed Codex or Claude tokens.",
            "Reference loading is task-dependent; the summed full-load total and concatenation are hypothetical, not actual progressive-loading usage.",
            "Counts exclude coordinator chat, research, worker packets, provider envelopes, generated output and reasoning tokens.",
            "These counts establish neither whole-session savings, cache hits, cost, response speed nor planning quality.",
        ],
    }
    serialized = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(serialized)
    print(json.dumps({
        "baseline_version": baseline["version"],
        "candidate_version": candidate["version"],
        "comparison": result["comparison"],
    }, indent=2))


if __name__ == "__main__":
    main()
