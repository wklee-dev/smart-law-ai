"""Latest-law categories and K-column-only OR keyword search."""

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote
from openpyxl import load_workbook

CATEGORIES = {
    "promulgated": (
        "공포법령",
        121,
        7,
        dict(
            p2="1,2,3",
            p4="110401,110402,110403,110404,110405,110406,110407",
            p9="1,2,4",
            fsort="21,11,31",
        ),
    ),
    "effective": ("시행법령", 123, 8, dict(p2="3", p18="0", fsort="41,10,21,31")),
    "scheduled": (
        "시행예정법령",
        125,
        9,
        dict(p2="2", p18="0", p9="1,2,4", fsort="41,10,21,31"),
    ),
    "repealed": (
        "폐지법령",
        127,
        10,
        dict(p4="110404,110407,110410", p7="0", p9="1,2,3,4", fsort="41,21,10,31"),
    ),
    "temporary": (
        "한시법령",
        129,
        11,
        dict(p6="110101", p2="2,3", p9="2,3,4", fsort="71,21,11,31"),
    ),
    "temporary_articles": (
        "한시조문",
        131,
        13,
        dict(p7="901101", p4="1", p2="2,3", fsort="71,21,11,31"),
    ),
    "unconstitutional": (
        "위헌조문",
        133,
        15,
        dict(p7="901102", p4="1", p2="2,3", fsort="71,21,11,31"),
    ),
}
LABEL_TO_NAME = {value[0]: name for name, value in CATEGORIES.items()}


def normalized(value):
    return re.sub(
        r"[\s·ㆍ・ᆞ‧]", "", unicodedata.normalize("NFKC", str(value or ""))
    ).casefold()


def parse_date(value):
    value = str(value or "").strip()
    if "미정" in value or value.startswith("9999"):
        return "미정"
    match = re.search(r"(\d{4})\D*(\d{1,2})\D*(\d{1,2})", value)
    if not match:
        return ""
    from datetime import date

    try:
        return date(*map(int, match.groups())).isoformat()
    except ValueError:
        return ""


def item_key(item):
    fields = [
        item.get(key, "")
        for key in (
            "category",
            "source_id",
            "effective_raw",
            "article_code",
            "expire_date",
        )
    ]
    return hashlib.sha256(json.dumps(fields, ensure_ascii=False).encode()).hexdigest()[
        :32
    ]


@dataclass(frozen=True)
class KeywordRule:
    gubun: str
    title: str


def load_rules(path):
    """K is the only search/selection source. A is used only as metadata ID.

    Columns D/E/F are deliberately not read or used for eligibility. One whole
    nonempty K cell is one keyword: it is not split into words or comma terms.
    """
    workbook = load_workbook(Path(path), read_only=True, data_only=True)
    try:
        if "개별키워드" not in workbook.sheetnames:
            raise ValueError("엑셀에 개별키워드 시트가 없습니다.")
        rows = workbook["개별키워드"].iter_rows(values_only=True)
        header = next(rows)
        if len(header) < 11 or str(header[10]).strip() != "최종확인용_법규명":
            raise ValueError("엑셀 K열 최종확인용_법규명 형식을 확인하세요.")
        rules = []
        for row in rows:
            if len(row) < 11 or not normalized(row[10]):
                continue
            try:
                identifier = str(int(row[0]))
            except (TypeError, ValueError) as exc:
                raise ValueError("엑셀 A열 gubun 번호가 정수가 아닙니다.") from exc
            title = str(row[10]).strip()
            if '"' in title:
                raise ValueError(
                    "K열 검색어에 큰따옴표가 있습니다. 검색 문자열 표현을 확인하세요."
                )
            rules.append(KeywordRule(identifier, title))
        if not rules:
            raise ValueError("엑셀 K열에 검색어가 없습니다.")
        return rules
    finally:
        workbook.close()


def selected_rules(rules, gubuns=None):
    if gubuns is None:
        return rules
    allowed = {str(number) for number in gubuns}
    missing = allowed - {rule.gubun for rule in rules}
    if missing:
        raise ValueError("엑셀에 없는 gubun 번호: " + ",".join(sorted(missing)))
    return [rule for rule in rules if rule.gubun in allowed]


def search_plans(rules, max_encoded_bytes=4000):
    """Query one whole K cell at a time, unioning all matching results (OR).

    The site's quoted multi-OR syntax can return an HTTP-200 empty result for
    three or more terms. Never depend on that syntax. Keep K-cell phrases whole
    and preserve all matching gubun metadata when duplicate results are merged.
    """
    if max_encoded_bytes < 1:
        raise ValueError("검색어 URL 길이 제한은 양수여야 합니다.")
    unique = {}
    for rule in rules:
        unique.setdefault(normalized(rule.title), rule.title)
    plans = []
    for title in unique.values():
        term = '"' + title + '"'
        if len(quote(term, safe="").encode("ascii")) > max_encoded_bytes:
            raise ValueError("K열 검색어 한 개가 허용 URL 길이를 초과합니다: " + title)
        plans.append(term)
    return plans


def match_item(item, rules):
    title = normalized(item["title"])
    hits = [rule for rule in rules if normalized(rule.title) in title]
    if not hits:
        return None
    indices = sorted({int(rule.gubun) for rule in hits})
    return dict(
        item,
        gubun=json.dumps(indices, ensure_ascii=False),
        matched_keywords=json.dumps(
            sorted({rule.title for rule in hits}), ensure_ascii=False
        ),
        match_status="or_match",
    )


def in_date_range(item, start, end, include_unknown=True):
    category = LABEL_TO_NAME[item["category"]]
    field = (
        "expire_date"
        if category in ("temporary", "temporary_articles", "unconstitutional")
        else "effective_date"
    )
    value = item.get(field, "")
    return include_unknown if value in ("미정", "") else start <= value <= end
