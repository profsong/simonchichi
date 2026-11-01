#!/usr/bin/env python3
"""Build sourced Korean-meaning overlays; never modify the source PDF wordbook.

python tools/enrich_wordbook_meanings.py --fetch --draft
python tools/merge_wordbook_editorial.py
python tools/enrich_wordbook_meanings.py
python tools/enrich_wordbook_meanings.py --check

The optional --fetch downloads three pinned, licensed bulk dictionaries into
artifacts/lexicon. Normal builds use cached sources and checked-in editorial
rows. No runtime network request, automatic approval, or invented PDF glosses.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import struct
import tarfile
from urllib.parse import quote
from urllib.request import Request, urlopen
import zipfile

from merge_wordbook_editorial import consolidate

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "artifacts/lexicon"
BASE = ROOT / "content_src/wordbooks/suneung-2000.json"
OVERLAY = ROOT / "content_src/wordbooks/definitions/suneung-2000.json"
EDITORIAL = ROOT / "content_src/wordbooks/definitions/editorial"
SOURCES = [
    {
        "id": "kowiktionary-2026-10-01", "filename": "ko-wiktionary-English.jsonl",
        "url": "https://kaikki.org/kowiktionary/%EC%98%81%EC%96%B4/kaikki.org-dictionary-%EC%98%81%EC%96%B4.jsonl",
        "sha256": "1d264d2a8619c563c808d11200b8fdeed13cc7f49bdfb9eefe7e7996dea91c5a",
        "license": "CC-BY-SA-4.0", "credit": "Korean Wiktionary contributors; Kaikki/wiktextract by Tatu Ylonen and contributors",
        "version": "Wikimedia dump 2026-10-01; Kaikki extraction 2026-10-30",
        "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    },
    {
        "id": "koreader-en-ko-v1.2.0", "filename": "en-ko-v1.2.0.zip",
        "url": "https://github.com/DanielGregorini/koreader-dicts/releases/download/v1.2.0/en-ko.zip",
        "sha256": "219eacf3f57e93da993a9ba438d3c3eaf3fa3b94de745847fe74826cb776ccf1",
        "license": "CC-BY-SA-4.0", "credit": "English Wiktionary contributors; Kaikki/wiktextract; Daniel Gregorini koreader-dicts; Princeton WordNet",
        "version": "koreader-dicts v1.2.0; en-ko dictionary 2026-09-11",
        "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    },
    {
        "id": "princeton-wordnet-3.0", "filename": "wordnet.tar.gz",
        "url": "https://wordnetcode.princeton.edu/3.0/WordNet-3.0.tar.gz",
        "sha256": "640db279c949a88f61f851dd54ebbb22d003f8b90b85267042ef85a3781d3a52",
        "license": "WordNet-3.0", "credit": "Princeton University, WordNet 3.0, copyright 2006",
        "version": "WordNet 3.0", "licenseUrl": "https://wordnet.princeton.edu/license-and-commercial-use",
    },
]
POS = {"n.": "noun", "v.": "verb", "adj.": "adjective", "adv.": "adverb", "prep.": "preposition", "conj.": "conjunction", "pron.": "pronoun", "interj.": "interjection"}
KO_POS = {"명사": "noun", "동사": "verb", "형용사": "adjective", "부사": "adverb", "전치사": "preposition", "접속사": "conjunction", "대명사": "pronoun", "감탄사": "interjection", "수사": "numeral"}
EXTRACTOR_POS = {"adj": "adjective", "adv": "adverb", "prep": "preposition", "conj": "conjunction", "pron": "pronoun", "intj": "interjection", "name": "proper noun"}
HANGUL = re.compile(r"[가-힣]")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def clean_gloss(value: str) -> str:
    value = unescape(value)
    # Remove only parenthetical English/Hanja explanations; retain Korean qualifiers.
    value = re.sub(r"\([^()]*\)", lambda m: m[0] if HANGUL.search(m[0]) else "", value)
    value = re.sub(r"〔[^〔〕]*〕", lambda m: m[0] if HANGUL.search(m[0]) else "", value)
    return re.sub(r"\s+", " ", value).strip(" .;,·")


class TranslationParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pos = ""
        self.tag = None
        self.text = ""
        self.senses = []

    def handle_starttag(self, tag, attrs):
        if tag in ("i", "b"):
            self.tag, self.text = tag, ""

    def handle_data(self, data):
        if self.tag:
            self.text += data

    def handle_endtag(self, tag):
        if tag != self.tag:
            return
        text = clean_gloss(self.text)
        if tag == "i" and self.text.strip() in POS:
            self.pos = POS[self.text.strip()]
        elif tag == "b" and HANGUL.search(text):
            self.senses.append({"pos": self.pos, "gloss": text})
        self.tag = None


def load_sources(fetch: bool):
    CACHE.mkdir(parents=True, exist_ok=True)
    for source in SOURCES:
        path = CACHE / source["filename"]
        if fetch and not path.exists():
            request = Request(source["url"], headers={"User-Agent": "Simonchichi-local-dictionary-import/1.0"})
            with urlopen(request, timeout=90) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != source["sha256"]:
                raise ValueError(f"Source changed; manually review and pin its new version: {source['id']}")
            path.write_bytes(data)
        if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError(f"Missing or changed cache {path}; run --fetch or restore the pinned file.")

    ko = defaultdict(list)
    for line in (CACHE / SOURCES[0]["filename"]).read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        ko[row["word"]].append(row)
    translations = {}
    with zipfile.ZipFile(CACHE / SOURCES[1]["filename"]) as archive:
        index = archive.read("en-ko/en-ko.idx")
        body = gzip.decompress(archive.read("en-ko/en-ko.dict.dz"))
        at = 0
        while at < len(index):
            end = index.index(0, at)
            word = index[at:end].decode("utf-8")
            offset, size = struct.unpack(">II", index[end + 1:end + 9])
            parser = TranslationParser()
            parser.feed(body[offset:offset + size].decode("utf-8"))
            translations[word] = parser.senses
            at = end + 9
        licenses = CACHE / "licenses"
        licenses.mkdir(exist_ok=True)
        for name in ("LICENSE", "ATTRIBUTION"):
            (licenses / f"koreader-en-ko-{name}.txt").write_bytes(archive.read(f"en-ko/{name}"))
    wordnet_pos = defaultdict(list)
    with tarfile.open(CACHE / SOURCES[2]["filename"]) as archive:
        (licenses / "WordNet-3.0-LICENSE.txt").write_bytes(archive.extractfile("WordNet-3.0/LICENSE").read())
        for suffix, pos in (("noun", "noun"), ("verb", "verb"), ("adj", "adjective"), ("adv", "adverb")):
            for line in archive.extractfile(f"WordNet-3.0/dict/index.{suffix}").read().decode("utf-8").splitlines():
                if line and not line[0].isspace():
                    wordnet_pos[line.split()[0]].append(pos)
    write_json(CACHE / "sources-manifest.json", {"sources": SOURCES, "lookupMethod": "Local exact-headword lookup of pinned bulk datasets; not 2,000 live webpage visits."})
    notice = ["시몬치치 추가 단어 뜻 출처 / Added dictionary meanings", "", "원문 PDF에는 뜻이 없습니다. 아래 공개 사전에서 선택한 뜻과 영어 정의를 바탕으로 편집한 한국어 뜻을 별도로 제공합니다.", "추가 뜻은 독립 교육 검수 전 draft이며, 원문 PDF의 내용 또는 승인된 문제로 간주하지 않습니다.", "", "Wiktionary-derived Korean gloss selections are adapted under CC BY-SA 4.0. Changes: selected senses, whitespace/punctuation cleanup, Korean display, source references. No dictionary examples are copied.", ""]
    for source in SOURCES:
        notice += [source["id"], source["credit"], source["version"], source["url"], source["license"], source["licenseUrl"], ""]
    (licenses / "DICTIONARY-ATTRIBUTION.txt").write_text("\n".join(notice), encoding="utf-8", newline="\n")
    return ko, translations, wordnet_pos


def select_bulk(entry, ko, translations, wordnet_pos):
    word = entry["headword"]
    lookup = "criterion" if word == "criteria" else word
    senses = []
    for row in ko.get(lookup, []):
        row_pos = row.get("pos", "unknown")
        poses = [EXTRACTOR_POS.get(row_pos, row_pos)] if row_pos != "unknown" else []
        if not poses:
            poses = [pos for label, pos in KO_POS.items() if any(category.get("name") == f"영어 {label}" for category in row.get("categories", []))]
        for sense in row.get("senses", []):
            if any(tag in sense.get("tags", []) for tag in ("archaic", "obsolete", "offensive", "vulgar", "derogatory")):
                continue
            for gloss in sense.get("glosses", []):
                cleaned = clean_gloss(gloss)
                if HANGUL.search(cleaned):
                    senses.append({"pos": " / ".join(poses), "gloss": cleaned, "rawGloss": gloss, "senseId": sense.get("id")})
    source = SOURCES[0]
    url = "https://ko.wiktionary.org/wiki/" + quote(lookup, safe="") + "#영어"
    if not senses:
        source = SOURCES[1]
        senses = translations.get(word, [])
        lookup = word
        url = "https://en.wiktionary.org/wiki/" + quote(word, safe="") + "#English"
    if not senses:
        return None, None
    selected = []
    seen = set()
    per_pos = Counter()
    for sense in senses:
        if sense["gloss"] not in seen and per_pos[sense["pos"]] < 3 and len(selected) < 6:
            selected.append(sense)
            seen.add(sense["gloss"])
            per_pos[sense["pos"]] += 1
    meaning = "; ".join(sense["gloss"] for sense in selected)
    poses = list(dict.fromkeys(pos for sense in selected for pos in sense["pos"].split(" / ") if pos))
    provenance = [{"sourceId": source["id"], "url": url, "license": source["license"], "method": "bulk-dictionary-selection", "notes": "공개 사전 일괄 자료의 뜻을 선택·정리했습니다. PDF 원문 뜻이 아닙니다." + (" 참조 뜻 ID: " + ", ".join(sense["senseId"] for sense in selected if sense.get("senseId")) if source == SOURCES[0] else "") }]
    if lookup != word:
        provenance[0]["lookupHeadword"] = lookup
        provenance[0]["notes"] += " criteria는 criterion의 복수형입니다."
    if not poses and word.lower() in wordnet_pos:
        poses = wordnet_pos[word.lower()]
        provenance.append({"sourceId": "princeton-wordnet-3.0", "url": "https://wordnetweb.princeton.edu/perl/webwn?s=" + quote(word.lower()), "license": "WordNet-3.0", "method": "bulk-dictionary-selection", "notes": "한국어 사전 추출에 품사가 없어 WordNet의 해당 표제어 품사만 보완했습니다."})
    overlay = {"entryId": entry["id"], "headword": word, "koreanMeaning": meaning, "definitionProvenance": provenance}
    if poses:
        overlay["partOfSpeech"] = " / ".join(poses)
    candidate = {**overlay, "sourceLocation": entry["source"], "selectedSenses": selected, "allCandidateSenses": senses}
    return overlay, candidate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--draft", action="store_true", help="Write partial candidates only under artifacts, never the runtime overlay.")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    ko, translations, wordnet_pos = load_sources(args.fetch)
    book = read_json(BASE)
    generated, candidates, missing = {}, [], []
    for entry in book["entries"]:
        row, candidate = select_bulk(entry, ko, translations, wordnet_pos)
        if row:
            generated[entry["id"]] = row
            candidates.append(candidate)
        else:
            missing.append({"entryId": entry["id"], "headword": entry["headword"]})
    write_json(CACHE / "bulk-source-candidates.json", candidates)
    write_json(CACHE / "bulk-overlay-draft.json", list(generated.values()))
    write_json(CACHE / "bulk-missing.json", missing)
    editorial_count = 0
    if not args.draft:
        reviewed_path = EDITORIAL / "reviewed-meanings.json"
        reviewed, conflict_count = consolidate()
        if read_json(reviewed_path) != reviewed:
            raise ValueError("Reviewed editorial output is stale; run tools/merge_wordbook_editorial.py first.")
        used_editorial = set()
        expected = {entry["id"]: entry for entry in book["entries"]}
        for path in sorted(EDITORIAL.glob("*.json")):
            for row in read_json(path):
                key = row["entryId"]
                if key not in expected or row["headword"] != expected[key]["headword"] or key in used_editorial:
                    raise ValueError(f"Unknown, mismatched or duplicate editorial row: {path}: {key}")
                used_editorial.add(key)
                for source in row.get("definitionProvenance", []):
                    if source["sourceId"] == "wordnet-3.0":
                        source["sourceId"] = "princeton-wordnet-3.0"
                generated[key] = row
                editorial_count += 1
        absent = [entry["id"] for entry in book["entries"] if entry["id"] not in generated]
        if absent:
            raise ValueError(f"Final overlay requires all {len(book['entries'])} rows; missing {len(absent)}: {absent}")
    entries = [generated[entry["id"]] for entry in book["entries"] if entry["id"] in generated]
    for row in entries:
        if not HANGUL.search(row["koreanMeaning"]) or (not args.draft and not row.get("partOfSpeech")) or not row.get("definitionProvenance"):
            raise ValueError(f"Missing Hangul gloss, POS, or provenance: {row['entryId']}")
        row["uncertainties"] = list(dict.fromkeys([*row.get("uncertainties", []), "pending-independent-review"]))
    overlay = {"schemaVersion": 1, "wordbookId": book["id"], "sourceSha256": book["source"]["sha256"], "version": "1.1.0", "entries": entries}
    if not args.draft:
        if args.check:
            if read_json(OVERLAY) != overlay:
                raise ValueError("Overlay differs; rebuild and review changed source/editorial data.")
        else:
            write_json(OVERLAY, overlay)
        direct_sources = sorted({source["url"] for row in entries for source in row["definitionProvenance"] if source["sourceId"].startswith(("en-wiktionary", "enwiktionary"))})
        notice = CACHE / "licenses/DICTIONARY-ATTRIBUTION.txt"
        with notice.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write("\nDirect English Wiktionary definitions / usage / POS references\nEnglish Wiktionary contributors — CC-BY-SA-4.0\nhttps://creativecommons.org/licenses/by-sa/4.0/\nEditorial Korean translations and usage notes are adaptations; original PDF cells remain blank.\n" + "\n".join(direct_sources) + "\n")
    report = {"status": "draft" if args.draft else "verified" if args.check else "complete", "sourcePdfSha256": book["source"]["sha256"], "sourceBookSha256": hashlib.sha256(BASE.read_bytes()).hexdigest(), "rawSourceRows": len(book["entries"]), "bulkCovered": len(candidates), "bulkMissing": len(missing), "editorialRows": editorial_count, "enrichedRows": len(entries), "sourceCounts": dict(Counter(row["definitionProvenance"][0]["sourceId"] for row in entries)), "allProvenanceSourceCounts": dict(Counter(source_id for row in entries for source_id in {source["sourceId"] for source in row["definitionProvenance"]})), "methodRowCounts": dict(Counter(method for row in entries for method in {source["method"] for source in row["definitionProvenance"]})), "reviewStatus": "draft (not approved)", "sourcePdfMeaningsChanged": False, "lookupMethod": "Bulk dictionary extraction + separately attributed editorial translations; not individual live webpage lookups", "sources": SOURCES}
    if not args.draft:
        report.update({"overlaySha256": hashlib.sha256(OVERLAY.read_bytes()).hexdigest(), "explicitlyResolvedConflicts": conflict_count, "bulkRowsWithEditorialCorrections": editorial_count - len(missing), "nonblankHangulRows": sum(bool(HANGUL.search(row["koreanMeaning"])) for row in entries), "rowsWithPos": sum(bool(row.get("partOfSpeech")) for row in entries), "rowsWithProvenance": sum(bool(row["definitionProvenance"]) for row in entries)})
    write_json(CACHE / "enrichment-report.json", report)
    print(json.dumps({key: report[key] for key in ("status", "bulkCovered", "bulkMissing", "editorialRows", "enrichedRows", "sourceCounts")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
