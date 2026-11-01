#!/usr/bin/env python3
"""Consolidate preserved reviewer inputs with explicit, hash-bound resolutions.

Run before enrich_wordbook_meanings.py. Any overlapping reviewer row requires a
written resolution; changed inputs invalidate the reviewed conflict manifest.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
EDITORIAL = ROOT / "content_src/wordbooks/definitions/editorial"
INPUTS = EDITORIAL / "review-inputs"
RESOLUTIONS = INPUTS / "conflict-resolutions.json"
OUTPUT = EDITORIAL / "reviewed-meanings.json"


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_pos(value):
    return " / ".join(dict.fromkeys(part.strip() for part in re.split(r"[;,/]", value) if part.strip()))


def consolidate():
    manifest = read(RESOLUTIONS)
    grouped = defaultdict(list)
    for name, expected_hash in manifest["inputSha256"].items():
        path = INPUTS / name
        if path.parent != INPUTS or hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
            raise ValueError(f"Reviewed input changed: {name}; review conflicts before updating the manifest")
        seen = set()
        for row in read(path):
            if row["entryId"] in seen:
                raise ValueError(f"Duplicate row in {name}: {row['entryId']}")
            seen.add(row["entryId"])
            grouped[row["entryId"]].append((name, row))
    conflicts = {key for key, values in grouped.items() if len(values) > 1}
    resolutions = {row["entryId"]: row for row in manifest["resolutions"]}
    if len(resolutions) != len(manifest["resolutions"]) or conflicts != set(resolutions):
        raise ValueError("Every conflict, and only a conflict, must have one explicit resolution")
    output = []
    for key, inputs in sorted(grouped.items()):
        result = deepcopy(inputs[0][1])
        if any(row["headword"] != result["headword"] for _, row in inputs):
            raise ValueError(f"Headword mismatch for {key}")
        if key in resolutions:
            resolution = resolutions[key]
            if resolution["headword"] != result["headword"] or not resolution["reason"].strip():
                raise ValueError(f"Missing explicit conflict decision: {key}")
            if set(resolution["reviewedInputs"]) != {name for name, _ in inputs}:
                raise ValueError(f"Conflict decision does not cover its inputs: {key}")
            result["koreanMeaning"] = resolution["koreanMeaning"]
            result["partOfSpeech"] = resolution["partOfSpeech"]
        result["partOfSpeech"] = normalize_pos(result["partOfSpeech"])
        provenance = {}
        uncertainties = []
        for _, row in inputs:
            uncertainties.extend(row.get("uncertainties", []))
            for original in row["definitionProvenance"]:
                source = deepcopy(original)
                if source["sourceId"] == "wordnet-3.0":
                    source["sourceId"] = "princeton-wordnet-3.0"
                # Retain distinct lookup aliases and methods; merge only the
                # same credited source, retaining both reviewers' evidence.
                identity = tuple(source.get(k, "") for k in ("sourceId", "url", "license", "method", "lookupHeadword"))
                if identity in provenance:
                    notes = provenance[identity].get("notes", "")
                    if source.get("notes") and source["notes"] not in notes:
                        provenance[identity]["notes"] = notes + "\n" + source["notes"]
                else:
                    provenance[identity] = source
        result["definitionProvenance"] = list(provenance.values())
        result["uncertainties"] = list(dict.fromkeys([*uncertainties, "pending-independent-review"]))
        output.append(result)
    return output, len(conflicts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rows, conflicts = consolidate()
    serialized = json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf-8") != serialized:
            raise ValueError("Editorial output differs; regenerate after reviewing its inputs")
    else:
        OUTPUT.write_text(serialized, encoding="utf-8", newline="\n")
    print(json.dumps({"editorialRows": len(rows), "explicitlyResolvedConflicts": conflicts, "status": "verified" if args.check else "merged"}))


if __name__ == "__main__":
    main()
