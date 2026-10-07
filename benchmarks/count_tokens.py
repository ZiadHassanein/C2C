"""Optional deterministic token proxies; never calls a model provider."""
from importlib.metadata import version
from pathlib import Path
import json
import hashlib
import sys

import tiktoken

if version("tiktoken") != "0.12.0":
    raise SystemExit("Use the pinned tiktoken==0.12.0 in requirements.txt for comparable counts.")
incremental = len(sys.argv) == 3 and sys.argv[1] == "--incremental"
if len(sys.argv) != 2 and not incremental:
    raise SystemExit("Usage: python benchmarks/count_tokens.py [--incremental] OUTPUT/metrics.json")
file = Path(sys.argv[2] if incremental else sys.argv[1]).resolve()
metrics = json.loads(file.read_text(encoding="utf-8"))
if incremental and metrics.get("measurement") != "optional_final_revision":
    raise ValueError("Incremental mode requires an optional_final_revision measurement")
encodings = {name: tiktoken.get_encoding(name) for name in ["o200k_base", "cl100k_base"]}
groups = {"workflow_totals": metrics["captures"]}
if "schema_captures" in metrics:
    groups["schema_totals"] = metrics["schema_captures"]
cell = lambda row: (row["scenario"], row["route"], row["case"], row["variant"])
completed_cells = [cell(row) for row in metrics["completed"]]
if len(completed_cells) != len(set(completed_cells)):
    raise ValueError("Duplicate completed workflow records")
for rows in groups.values():
    if {cell(row) for row in rows} != set(completed_cells):
        raise ValueError("Capture workflows differ from completed workflow records")
identities = lambda rows: [(cell(row), row["stage"]) for row in rows]
prompt_identities = identities(metrics["captures"])
for rows in groups.values():
    recorded = identities(rows)
    if len(recorded) != len(set(recorded)) or set(recorded) != set(prompt_identities):
        raise ValueError("Prompt and schema capture identities must match without duplicates")
for row in [row for rows in groups.values() for row in rows]:
    relative = Path(row["file"])
    prompt = (file.parent / relative).resolve()
    if relative.is_absolute() or not prompt.is_relative_to(file.parent):
        raise ValueError("Capture path must stay inside the benchmark output directory")
    raw = prompt.read_bytes()
    if len(raw) != row["bytes"] or hashlib.sha256(raw).hexdigest() != row["sha256"]:
        raise ValueError("Capture contents differ from their recorded metrics")
    text = raw.decode("utf-8")
    for name, encoding in encodings.items():
        row[name] = len(encoding.encode(text, disallowed_special=()))
for total_name, rows in ([] if incremental else groups.items()):
    totals = []
    for scenario, route, case in dict.fromkeys((r["scenario"], r["route"], r["case"]) for r in rows):
        entry = {"scenario": scenario, "route": route, "case": case}
        selected = {variant: [r for r in rows if r["scenario"] == scenario and r["route"] == route and r["case"] == case and r["variant"] == variant] for variant in ["baseline", "candidate"]}
        stages = {variant: [r["stage"] for r in selected[variant]] for variant in selected}
        if any(len(items) != len(set(items)) for items in stages.values()) or sorted(stages["baseline"]) != sorted(stages["candidate"]):
            raise ValueError("Each workflow needs matching unique stage captures")
        calls = {item["variant"]: item["calls"] for item in metrics["completed"] if item["scenario"] == scenario and item["route"] == route and item["case"] == case}
        if set(calls) != {"baseline", "candidate"} or calls["baseline"] != calls["candidate"]:
            raise ValueError("Do not compare different workflow call totals as savings")
        if any(len(selected[variant]) != calls[variant] for variant in selected):
            raise ValueError("Capture count differs from completed workflow calls")
        for completed in metrics["completed"]:
            if (completed["scenario"], completed["route"], completed["case"]) == (scenario, route, case) and "stages" in completed:
                if sorted(stages[completed["variant"]]) != sorted(completed["stages"]):
                    raise ValueError("Capture stages differ from completed workflow stages")
        for name in ["bytes", *encodings]:
            values = {variant: sum(r[name] for r in selected[variant]) for variant in selected}
            entry[name] = {**values, "saved": values["baseline"] - values["candidate"], "reduction_percent": round(100 * (values["baseline"] - values["candidate"]) / values["baseline"], 2)}
        entry["successful_calls_per_workflow"] = calls["baseline"]
        totals.append(entry)
    metrics[total_name] = totals
if incremental:
    if "schema_captures" not in metrics or len(metrics["captures"]) != len(completed_cells):
        raise ValueError("Incremental mode requires one prompt and schema per workflow")
    for row in metrics["captures"]:
        if row["stage"] != "verify-final" or row["variant"] != "candidate":
            raise ValueError("Only candidate verify-final captures belong in incremental mode")
    for completed in metrics["completed"]:
        stages = completed.get("stages", [])
        if stages.count("verify-final") != 1 or completed["calls"] != len(stages) or len(stages) != len(set(stages)):
            raise ValueError("Incomplete optional final-revision workflow record")
    schemas = {cell(row): row for row in metrics["schema_captures"]}
    metrics["incremental_totals"] = [
        {**{key: row[key] for key in ["scenario", "route", "case"]}, "additional_calls": 1,
         "prompt": {key: row[key] for key in ["bytes", *encodings]},
         "cli_schema": {key: schemas[cell(row)][key] for key in ["bytes", *encodings]}}
        for row in metrics["captures"]
    ]
metrics["tokenizer"] = "tiktoken 0.12.0"
metrics["token_counter_lf_sha256"] = hashlib.sha256(Path(__file__).read_text(encoding="utf-8").replace("\r\n", "\n").encode("utf-8")).hexdigest()
file.with_name("token-metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
print(json.dumps(metrics["incremental_totals"] if incremental else metrics["workflow_totals"] if len(groups) == 1 else {name: metrics[name] for name in groups}, indent=2))
