#!/usr/bin/env python3
"""Audit all added meanings and cited WordNet lemmas without modifying content."""

from __future__ import annotations

import hashlib
import json
import re
import tarfile

from enrich_wordbook_meanings import BASE, CACHE, OVERLAY, SOURCES


def main():
    base = json.loads(BASE.read_text(encoding="utf-8"))
    overlay = json.loads(OVERLAY.read_text(encoding="utf-8"))
    rows = overlay["entries"]
    wordnet = next(source for source in SOURCES if source["id"] == "princeton-wordnet-3.0")
    archive_path = CACHE / wordnet["filename"]
    if hashlib.sha256(archive_path.read_bytes()).hexdigest() != wordnet["sha256"]:
        raise ValueError("The WordNet archive differs from the pinned source")
    synsets = {}
    with tarfile.open(archive_path) as archive:
        for suffix, pos in (("noun", "n"), ("verb", "v"), ("adj", "a"), ("adv", "r")):
            for line in archive.extractfile(f"WordNet-3.0/dict/data.{suffix}").read().decode().splitlines():
                if not line or line[0].isspace():
                    continue
                tokens = line.split("|")[0].split()
                synsets[tokens[0] + "-" + pos] = [tokens[4 + 2 * i].split("(")[0].lower() for i in range(int(tokens[3], 16))]
    issues, references = [], 0
    for row in rows:
        for source in row["definitionProvenance"]:
            if source["sourceId"] != "princeton-wordnet-3.0":
                continue
            word = source.get("lookupHeadword", row["headword"]).lower().replace(" ", "_")
            for key in sorted(set(re.findall(r"\b\d{8}-[nvasr]\b", source.get("notes", "")))):
                references += 1
                canonical = key[:-1] + ("a" if key[-1] == "s" else key[-1])
                if word not in synsets.get(canonical, []):
                    issues.append({"word": word, "synset": key, "actualLemmas": synsets.get(canonical)})
    checks = {
        "sourceHashMatches": overlay["sourceSha256"] == base["source"]["sha256"],
        "originalIdsOrderUnchanged": [row["id"] for row in base["entries"]] == [row["entryId"] for row in rows],
        "originalHeadwordsUnchanged": [row["headword"] for row in base["entries"]] == [row["headword"] for row in rows],
        "originalBlankMeaningsAndDraftPreserved": all(row["koreanMeaning"] == "" and row["reviewStatus"] == "draft" for row in base["entries"]),
        "all2000RowsUnique": len(rows) == len({row["entryId"] for row in rows}) == 2000,
        "allMeaningsPosProvenancePendingReview": all(re.search(r"[가-힣]", row["koreanMeaning"]) and row.get("partOfSpeech") and row["definitionProvenance"] and "pending-independent-review" in row.get("uncertainties", []) for row in rows),
        "wordNetLemmaReferencesMatch": not issues,
    }
    report = {
        "status": "passed" if all(checks.values()) else "failed",
        "rows": len(rows), "checks": checks,
        "sourceBookSha256": hashlib.sha256(BASE.read_bytes()).hexdigest(),
        "overlaySha256": hashlib.sha256(OVERLAY.read_bytes()).hexdigest(),
        "wordNetSynsetsChecked": references, "wordNetLemmaIssues": issues,
    }
    (CACHE / "final-data-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, ensure_ascii=False))
    if not all(checks.values()):
        raise ValueError("Meaning data audit failed; see artifacts/lexicon/final-data-audit.json")


if __name__ == "__main__":
    main()
