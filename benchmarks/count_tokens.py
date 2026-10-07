"""Optional deterministic token proxies; never calls a model provider."""
from importlib.metadata import version
from pathlib import Path
import json
import hashlib
import sys

import tiktoken

if version("tiktoken") != "0.12.0":
    raise SystemExit("Use the pinned tiktoken==0.12.0 in requirements.txt for comparable counts.")
if len(sys.argv) != 2:
    raise SystemExit("Usage: python benchmarks/count_tokens.py OUTPUT/metrics.json")
file = Path(sys.argv[1]).resolve()
metrics = json.loads(file.read_text(encoding="utf-8"))
encodings = {name: tiktoken.get_encoding(name) for name in ["o200k_base", "cl100k_base"]}
for row in metrics["captures"]:
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
totals = []
for scenario, route, case in dict.fromkeys((r["scenario"], r["route"], r["case"]) for r in metrics["captures"]):
    entry = {"scenario": scenario, "route": route, "case": case}
    for name in ["bytes", *encodings]:
        values = {
            variant: sum(r[name] for r in metrics["captures"] if r["scenario"] == scenario and r["route"] == route and r["case"] == case and r["variant"] == variant)
            for variant in ["baseline", "candidate"]
        }
        entry[name] = {**values, "saved": values["baseline"] - values["candidate"], "reduction_percent": round(100 * (values["baseline"] - values["candidate"]) / values["baseline"], 2)}
    calls = {item["variant"]: item["calls"] for item in metrics["completed"] if item["scenario"] == scenario and item["route"] == route and item["case"] == case}
    if calls["baseline"] != calls["candidate"]:
        raise ValueError("Do not compare different workflow call totals as savings")
    entry["successful_calls_per_workflow"] = calls["baseline"]
    totals.append(entry)
metrics.update(tokenizer="tiktoken 0.12.0", workflow_totals=totals)
file.with_name("token-metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
print(json.dumps(totals, indent=2))
