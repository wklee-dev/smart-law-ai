# -*- coding: utf-8 -*-
"""Extract 항목명(국문) from NCOM API Guide docx → JSON keyed by internal grid key."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
GUIDE_DIRS = [
    Path(r"D:/HJCustoms/프로젝트/01.진행중/19.HanjooGatewayAPI/Guide"),
    Path(r"D:/CursorProject/HanjooGatewayAPI/docs"),
]
OUT_IMPORT = ROOT / "app/lib/cas-ncom-import-guide-labels.json"
OUT_EXPORT = ROOT / "app/lib/cas-ncom-export-guide-labels.json"


def find_guide_docx(name_contains: str, version: str) -> Path:
    """가이드 docx — Guide 폴더 우선, docs 폴더 fallback."""
    for base in GUIDE_DIRS:
        if not base.exists():
            continue
        matches = [
            p
            for p in base.glob("*.docx")
            if name_contains in p.name and version in p.name
        ]
        if matches:
            return sorted(matches, key=lambda p: p.name)[-1]
    raise FileNotFoundError(
        f"Guide not found: *{name_contains}* {version} in {GUIDE_DIRS}",
    )

HANGUL_RE = re.compile(r"[\uac00-\ud7a3]")


def is_korean_label(label: str) -> bool:
    if not label.strip():
        return False
    if TYPE_RE.match(label.strip()):
        return False
    if re.match(r"^[A-Za-z0-9_]+$", label.strip()) and label.isascii():
        return False
    return HANGUL_RE.search(label) is not None
XML_NAME_RE = re.compile(r"^(?:hanjoo|ehanjoo)[A-Za-z0-9]+$")

TYPE_RE = re.compile(
    r"^(VARCHAR|CHAR|FLOAT|TEXT|INT|INTEGER|DECIMAL|NUMERIC|DOUBLE|DATE)"
    r"(\([^)]*\))?$|^(문자열|정수|객체)$|^(0\.\.[0-9n]+|\d+\.\.[0-9n]+)$",
    re.I,
)


def extract_docx_text(path: Path) -> str:
    with ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    text = re.sub(r"</w:p>", "\n", xml)
    text = re.sub(r"<w:tab[^>]*/>", "\t", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    return text


def normalize_import_xml(name: str) -> str:
    n = name.strip()
    lower = n.lower()
    if lower.startswith("hanjooPum".lower()) and len(n) > len("hanjooPum"):
        return "impum" + n[len("hanjooPum") :]
    if lower.startswith("hanjooLan".lower()):
        rest = n[len("hanjooLan") :]
        return "imlan" + rest if rest else "impoLan"
    if lower.startswith("hanjoo".lower()):
        return "impo" + n[len("hanjoo") :]
    return n


def normalize_export_xml(name: str) -> str:
    n = name.strip()
    lower = n.lower()
    if lower.startswith("ehanjooPum".lower()) and len(n) > len("ehanjooPum"):
        return "expum" + n[len("ehanjooPum") :]
    if lower.startswith("ehanjooLan".lower()):
        rest = n[len("ehanjooLan") :]
        return "exlan" + rest if rest else "expoLan"
    if lower.startswith("ehanjoo".lower()):
        return "expo" + n[len("ehanjoo") :]
    return n


def parse_section_fields(lines: list[str]) -> dict[str, str]:
    """xml element name → Korean label (only when 국문 is present)."""
    out: dict[str, str] = {}
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line or not XML_NAME_RE.match(line):
            continue
        xml_name = line
        if i >= len(lines):
            break
        korean = lines[i].strip()
        i += 1
        if not is_korean_label(korean):
            continue
        # skip if korean looks like description continuation after type - shouldn't happen
        out[xml_name] = korean
    return out


def extract_guide_labels(text: str, *, export: bool) -> dict[str, str]:
    normalize = normalize_export_xml if export else normalize_import_xml
    prefix = "ehanjoo" if export else "hanjoo"
    sections = ["5.1.1", "5.1.2", "5.1.3"]
    merged_xml: dict[str, str] = {}

    for sec in sections:
        start = text.find(sec)
        if start < 0:
            continue
        end = len(text)
        for other in sections:
            if other <= sec:
                continue
            pos = text.find(other, start + len(sec))
            if pos > start:
                end = min(end, pos)
        # stop at next major section
        for stop in ["5.2", "6. ", "6.", "※"]:
            pos = text.find(stop, start + len(sec))
            if pos > start:
                end = min(end, pos)

        chunk = text[start:end]
        lines = chunk.splitlines()
        # drop section title / table header
        try:
            hdr = next(
                j
                for j, ln in enumerate(lines)
                if "항목명(영문/XML)" in ln or "항목명(국문)" in ln
            )
            lines = lines[hdr + 5 :]  # skip header row (5 cols)
        except StopIteration:
            lines = lines[1:]

        merged_xml.update(parse_section_fields(lines))

    keyed: dict[str, str] = {}
    for xml_name, label in merged_xml.items():
        if not xml_name.startswith(prefix):
            continue
        key = normalize(xml_name)
        keyed[key] = label
    return keyed


def main() -> None:
    import_docx = find_guide_docx("수입실적조회", "V1.7")
    export_docx = find_guide_docx("수출실적조회", "V1.6")
    print(f"import guide: {import_docx}")
    print(f"export guide: {export_docx}")

    imp_text = extract_docx_text(import_docx)
    exp_text = extract_docx_text(export_docx)

    import_labels = extract_guide_labels(imp_text, export=False)
    export_labels = extract_guide_labels(exp_text, export=True)

    OUT_IMPORT.write_text(
        json.dumps(import_labels, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    OUT_EXPORT.write_text(
        json.dumps(export_labels, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"  source import: {import_docx}")
    print(f"  source export: {export_docx}")

    print(f"wrote {OUT_IMPORT} ({len(import_labels)} fields)")
    print(f"wrote {OUT_EXPORT} ({len(export_labels)} fields)")


if __name__ == "__main__":
    main()
