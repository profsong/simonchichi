#!/usr/bin/env python3
"""Import the supplied two-column, 50-day word-test PDF without inventing content.

Requires pypdf and Poppler's pdftotext on PATH (or --pdftotext PATH).
The importer uses word coordinates, then independently checks pypdf's reading
order. It preserves source rows, including duplicate headwords, and refuses to
write the wordbook if rows are missing, malformed, or disagree between readers.
Run --check to compare the deterministic output with the checked-in editable JSON.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import unicodedata
import xml.etree.ElementTree as ET

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
NS = {"x": "http://www.w3.org/1999/xhtml"}
EXPECTED_PAGES = 25
EXPECTED_DAYS = 50
ROWS_PER_DAY = 40
HEADWORD = re.compile(r"[A-Za-z]+(?:[-' ][A-Za-z]+)*")
POS = re.compile(r"^(.*?)(?:\s+)(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|interj\.)$")


@dataclass(frozen=True)
class Word:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def x(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def y(self) -> float:
        return (self.y0 + self.y1) / 2


def normalized(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).replace("\u00ad", "").split())


def cell_text(words: list[Word], headword: bool = False) -> tuple[str, bool]:
    """Keep genuine hyphens; join wrapped English fragments but flag for review."""
    lines: list[list[Word]] = []
    for word in sorted(words, key=lambda item: (item.y, item.x)):
        if not lines or abs(word.y - lines[-1][0].y) > 2.5:
            lines.append([word])
        else:
            lines[-1].append(word)
    texts = [normalized(" ".join(word.text for word in sorted(line, key=lambda w: w.x))) for line in lines]
    wrapped = len(texts) > 1
    joiner = "" if headword and wrapped and all(re.fullmatch(r"[A-Za-z-]+", line) for line in texts) else " "
    return normalized(joiner.join(texts)), wrapped


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def extract(source: Path, command: str) -> tuple[dict, dict]:
    result = subprocess.run(
        [command, "-bbox-layout", "-enc", "UTF-8", str(source), "-"],
        capture_output=True, check=True,
    )
    pages = ET.fromstring(result.stdout).findall(".//x:page", NS)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    diagnostics: dict = {
        "layoutErrors": [], "missingRows": [], "malformedRows": [],
        "unassignedText": [], "wrappedHeadwords": [], "duplicateHeadwords": [],
        "pageRowCounts": [], "dayRowCounts": [],
    }
    if len(pages) != EXPECTED_PAGES:
        diagnostics["layoutErrors"].append(f"Expected {EXPECTED_PAGES} pages; found {len(pages)}.")
    entries: list[dict] = []
    for page_number, page in enumerate(pages, 1):
        width = float(page.attrib["width"])
        words = [Word("".join(node.itertext()), *(float(node.attrib[key]) for key in ("xMin", "yMin", "xMax", "yMax"))) for node in page.findall(".//x:word", NS)]
        page_start = len(entries)
        for column in (1, 2):
            column_words = [word for word in words if (word.x < width / 2) == (column == 1)]
            days = [int(match.group(1)) for word in column_words if (match := re.fullmatch(r"Day\s*(\d+)", word.text))]
            day = (page_number - 1) * 2 + column
            refs = {"page": page_number, "day": day, "column": column}
            headers = {text: [word for word in column_words if word.text == text] for text in ("No", "영단어", "뜻")}
            if days != [day] or any(len(group) != 1 for group in headers.values()):
                diagnostics["layoutErrors"].append({**refs, "days": days, "headers": {key: len(value) for key, value in headers.items()}})
                continue
            no, english, meaning = (headers[key][0] for key in ("No", "영단어", "뜻"))
            number_edge = no.x1 + 5
            meaning_edge = (english.x + meaning.x) / 2
            anchors = sorted([word for word in column_words if word.y > no.y and word.x < number_edge and re.fullmatch(r"\d+", word.text)], key=lambda word: word.y)
            actual_rows = [int(word.text) for word in anchors]
            if actual_rows != list(range(1, ROWS_PER_DAY + 1)):
                diagnostics["missingRows"].append({**refs, "actualRows": actual_rows, "missing": sorted(set(range(1, 41)) - set(actual_rows))})
            diagnostics["dayRowCounts"].append({**refs, "count": len(anchors)})
            assigned: set[Word] = set()
            for index, anchor in enumerate(anchors):
                row = int(anchor.text)
                top = (anchors[index - 1].y + anchor.y) / 2 if index else (no.y + anchor.y) / 2
                bottom = (anchor.y + anchors[index + 1].y) / 2 if index + 1 < len(anchors) else anchor.y + (anchor.y - anchors[index - 1].y) / 2
                cells = [word for word in column_words if top <= word.y < bottom and word.x >= number_edge]
                assigned.update([anchor, *cells])
                headword, wrapped = cell_text([word for word in cells if word.x < meaning_edge], headword=True)
                korean, _ = cell_text([word for word in cells if word.x >= meaning_edge])
                part_of_speech = None
                if pos := POS.fullmatch(headword):
                    headword, part_of_speech = pos.groups()
                source_ref = {**refs, "row": row, "originalText": normalized(" ".join(word.text for word in sorted([anchor, *cells], key=lambda item: (item.y, item.x))))}
                if not HEADWORD.fullmatch(headword):
                    diagnostics["malformedRows"].append({**refs, "row": row, "headword": headword})
                flags = ([] if korean else ["missing-meaning"]) + ([] if part_of_speech else ["missing-pos"])
                if wrapped:
                    flags.append("wrapped-headword-review")
                    diagnostics["wrappedHeadwords"].append({**refs, "row": row, "headword": headword})
                entry = {
                    "id": f"suneung-2000-row-{len(entries) + 1:04d}",
                    "headword": headword,
                    "koreanMeaning": korean,
                    "reviewStatus": "draft",
                    "source": source_ref,
                    "uncertainties": flags,
                }
                if part_of_speech:
                    entry["partOfSpeech"] = part_of_speech
                if not korean and not part_of_speech:
                    entry["notes"] = "원본은 뜻을 직접 적는 시험지이며 한국어 뜻과 품사 정보가 없습니다."
                entries.append(entry)
            for word in column_words:
                if word.y > no.y + 3 and word not in assigned:
                    diagnostics["unassignedText"].append({**refs, "text": word.text, "x": round(word.x, 2), "y": round(word.y, 2)})
        diagnostics["pageRowCounts"].append({"page": page_number, "count": len(entries) - page_start})

    # A separate reader checks the entire reading order, independently of coordinates.
    reference_rows: list[tuple] = []
    reader = PdfReader(source)
    for page_number, page in enumerate(reader.pages, 1):
        day = None
        for line in (page.extract_text() or "").splitlines():
            if match := re.search(r"Day\s*(\d+)", line):
                day = int(match.group(1))
            if match := re.fullmatch(r"(\d+)\s+(.+)", normalized(line)):
                reference_rows.append((page_number, day, int(match.group(1)), normalized(match.group(2))))
    coordinate_rows = [(item["source"]["page"], item["source"]["day"], item["source"]["row"], item["headword"]) for item in entries]
    mismatches = [{"index": index + 1, "coordinates": coordinate_rows[index] if index < len(coordinate_rows) else None, "textReader": reference_rows[index] if index < len(reference_rows) else None} for index in range(max(len(coordinate_rows), len(reference_rows))) if index >= len(coordinate_rows) or index >= len(reference_rows) or coordinate_rows[index] != reference_rows[index]]
    groups: dict[str, list] = defaultdict(list)
    for item in entries:
        groups[normalized(item["headword"]).casefold()].append(item)
    diagnostics["duplicateHeadwords"] = [{"headword": key, "entryIds": [item["id"] for item in group]} for key, group in sorted(groups.items()) if len(group) > 1]
    if len(entries) != EXPECTED_DAYS * ROWS_PER_DAY:
        diagnostics["layoutErrors"].append(f"Expected 2000 entries; found {len(entries)}.")
    flags = Counter(flag for item in entries for flag in item["uncertainties"])
    diagnostics["crossCheck"] = {"engine": "pypdf", "rowCount": len(reference_rows), "matchedRows": len(coordinate_rows) - len(mismatches), "mismatches": mismatches}
    failed = any(diagnostics[key] for key in ("layoutErrors", "missingRows", "malformedRows", "unassignedText")) or bool(mismatches)
    source_info = {"kind": "pdf", "filename": source.name, "sha256": digest, "pageCount": len(pages), "license": "사용자 제공 PDF · 배포 권한 미확인"}
    book = {
        "schemaVersion": 1, "id": "suneung-2000", "version": "1.0.0", "title": "수능 단어 2000", "priority": 100,
        "descriptionKo": "사용자가 제공한 50일 × 40단어 목록입니다. 원문에는 영단어만 있으며 뜻과 품사는 비어 있습니다.",
        "source": source_info, "entries": entries,
    }
    report = {
        "status": "failed" if failed else "passed",
        "source": source_info,
        "extraction": {"primary": "Poppler pdftotext -bbox-layout", "independentCheck": "pypdf", "order": "page ascending, left day before right day, row 1–40", "normalization": "NFC; trim/collapse whitespace; remove soft hyphens; preserve visible hyphens and original letter case; flag wrapped headwords"},
        "counts": {"pages": len(pages), "days": len(diagnostics["dayRowCounts"]), "rawRows": len(entries), "uniqueHeadwords": len(groups), "duplicateRows": len(entries) - len(groups), "draftRows": len(entries), "missingMeaning": flags["missing-meaning"], "missingPartOfSpeech": flags["missing-pos"], "wrappedHeadwords": flags["wrapped-headword-review"], "skippedRows": 0},
        "representativePages": [1, 13, 25],
        "limitations": ["원문 뜻 칸이 공란이며 품사가 없습니다. 빈 뜻을 복원하거나 생성하지 않았습니다.", "영어 원문 추출을 검증했지만 교육적 정확성·배포 권한 검수는 하지 않았습니다.", "누락된 뜻/품사와 모든 draft 상태를 유지합니다. 예문·정답·문항을 생성하지 않습니다."],
        "diagnostics": diagnostics,
    }
    return book, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "reference/수능단어2000.pdf")
    parser.add_argument("--output", type=Path, default=ROOT / "content_src/wordbooks/suneung-2000.json")
    parser.add_argument("--report", type=Path, default=ROOT / "artifacts/wordbooks/suneung-2000-extraction.json")
    parser.add_argument("--pdftotext", default=shutil.which("pdftotext"))
    parser.add_argument("--check", action="store_true", help="Verify output without changing the editable wordbook.")
    args = parser.parse_args()
    if not args.pdftotext:
        parser.error("Poppler pdftotext is required; put it on PATH or pass --pdftotext.")
    book, report = extract(args.source.resolve(), args.pdftotext)
    if report["status"] != "passed":
        write_json(args.report, report)
        print(f"Extraction failed; editable output unchanged. See {args.report}", file=sys.stderr)
        return 1
    rendered = json.dumps(book, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf-8") != rendered:
            print(f"Generated output differs: {args.output}", file=sys.stderr)
            return 1
    else:
        write_json(args.output, book)
    write_json(args.report, report)
    print(json.dumps({"status": "verified" if args.check else "imported", **report["counts"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
