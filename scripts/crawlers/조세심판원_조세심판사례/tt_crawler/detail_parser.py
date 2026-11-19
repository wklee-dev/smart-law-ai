# -*- coding: utf-8 -*-
"""Parser for the decision detail page and the body viewer.

1) Detail page : /mUser/dem/demView.do?semok={code}&dem_no={no}&menuNm=demList&rdView=subject
   - .prec-tit .case-num b      -> document no (e.g. 2026... )
   - .prec-tit h2.tit           -> title (often empty -> fall back to list title)
   - .prec-info .label-tax      -> tax category label (source text)
   - .prec-info .label-decision -> decision type
   - .prec-info .date           -> decision date
   - fncDocDownload() -> fileDown.do?...&file_path=..&DEM_STR=.. -> attachment
   - iframe#xmlView src         -> body viewer URL (dem_no, db)

2) Body viewer : /mUser/common/xmlViewer.do?dem_no={no}&db=s
   - Flatten <div id="xmlData"> to text, then split into labelled sections.

NOTE: SECTION_LABELS below intentionally keep the source site's Korean section
      headers, because they are matching keys against the scraped document.
      They are source data, not UI text.
"""
from __future__ import annotations

import re
from html import unescape
from urllib.parse import parse_qs, unquote, urlparse

from bs4 import BeautifulSoup

from .util import clean_text, norm_date, norm_key, one_line

# Body section label -> matching keys (source site uses Korean headers)
SECTION_LABELS = [
    ("claim_no", ["\uccad\uad6c\ubc88\ud638", "\uccad\uad6c\ubc88"]),
    ("semok_name", ["\uc138\ubaa9"]),
    ("decision_type", ["\uacb0\uc815\uc720\ud615", "\uacb0\uc815\uad6c\ubd84"]),
    ("title", ["\uc81c\ubaa9"]),
    ("summary", ["\uacb0\uc815\uc694\uc9c0", "\uc694\uc9c0"]),
    ("related_law", ["\uad00\ub828\ubc95\ub839", "\uad00\uacc4\ubc95\ub839"]),
    ("ref_decision", ["\ucc38\uc870\uacb0\uc815"]),
    ("fol_decision", ["\ub530\ub978\uacb0\uc815"]),
    ("order_text", ["\uc8fc\ubb38"]),
    ("reason_text", ["\uc774\uc720"]),
]
_LABEL_LOOKUP = {}
for _k, _names in SECTION_LABELS:
    for _n in _names:
        _LABEL_LOOKUP[norm_key(_n)] = _k

# Sections stored as a single line (layout line-breaks merged into spaces)
SHORT_SECTIONS = (
    "claim_no",
    "semok_name",
    "decision_type",
    "title",
    "summary",
    "related_law",
    "ref_decision",
    "fol_decision",
    "order_text",
)

_RE_SEC = re.compile(r"^\[([^\[\]]{1,12})\]$")
_RE_FILE = re.compile(r"fileDown\.do\?([^\"'\s>]+)")
_RE_IFRAME = re.compile(r'id="xmlView"[^>]*src="([^"]+)"')


# --------------------------------------------------------------------------
# 1) Detail page metadata
# --------------------------------------------------------------------------
def parse_detail_meta(html: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    out = {
        "doc_no": "",
        "title": "",
        "semok_name": "",
        "decision_type": "",
        "decision_date": "",
        "viewer_url": "",
        "attachments": [],
    }

    b = soup.select_one(".prec-tit .case-num b") or soup.select_one(".prec-tit .case-num")
    if b:
        out["doc_no"] = clean_text(b.get_text())

    t = soup.select_one(".prec-tit h2.tit")
    if t:
        out["title"] = clean_text(t.get_text())

    tax = soup.select_one(".prec-info .label.label-tax") or soup.select_one(".label.label-tax")
    if tax:
        out["semok_name"] = clean_text(tax.get_text())

    dec = soup.select_one(".prec-info .label.label-decision") or soup.select_one(".label.label-decision")
    if dec:
        out["decision_type"] = clean_text(dec.get_text())

    d = soup.select_one(".prec-info .date")
    if d:
        span = d.find("span")
        if span:
            span.extract()
        out["decision_date"] = norm_date(d.get_text(" ", strip=True))

    # Body viewer iframe
    m = _RE_IFRAME.search(html)
    if m:
        out["viewer_url"] = unescape(m.group(1))
    else:
        ifr = soup.select_one('iframe[name="xmlView"], iframe#xmlView')
        if ifr is not None:
            out["viewer_url"] = unescape(ifr.get("src", ""))

    # Attachments (download button / list)
    out["attachments"] = parse_attachments(html)
    return out


def parse_attachments(html: str) -> list:
    """Extract attachment metadata from fileDown.do query strings."""
    found = {}
    for raw in _RE_FILE.findall(html):
        q = parse_qs(unescape(raw))
        fp = (q.get("file_path") or [""])[0]
        if not fp:
            continue
        dem_str = (q.get("DEM_STR") or q.get("dem_str") or [""])[0]
        flag = (q.get("flag") or [""])[0]
        file_name = unquote(fp.split("/")[-1])
        found[fp] = {
            "file_path": fp,
            "file_name": file_name,
            "file_ext": (file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""),
            "dem_str": dem_str,
            "flag": flag,
            "download_url": "/mUser/common/fileDown.do?flag=%s&file_path=%s&DEM_STR=%s"
            % (flag, fp, dem_str),
        }
    return list(found.values())


# --------------------------------------------------------------------------
# 2) Body viewer parsing
# --------------------------------------------------------------------------
def parse_body(viewer_html: str) -> dict:
    """Body viewer HTML -> per-section text."""
    soup = BeautifulSoup(viewer_html, "lxml")
    node = soup.select_one("#xmlData") or soup.body or soup
    raw_text = node.get_text("\n", strip=True)
    body_text = clean_text(raw_text)

    sections = {}
    cur = None
    buf = []

    def flush():
        if cur:
            sections[cur] = clean_text("\n".join(buf))

    for line in body_text.split("\n"):
        s = line.strip()
        if not s or set(s) <= {"-", "\u2015", "="}:
            continue
        m = _RE_SEC.match(s)
        key = None
        if m:
            key = _LABEL_LOOKUP.get(norm_key(m.group(1)))
        if key:
            flush()
            cur = key
            buf = []
            continue
        if cur:
            buf.append(s)
    flush()

    # Merge layout line-breaks for short sections
    for k in SHORT_SECTIONS:
        if k in sections:
            sections[k] = one_line(sections[k])

    sections["body_text"] = body_text
    sections.setdefault("claim_no", "")
    sections.setdefault("semok_name", "")
    sections.setdefault("decision_type", "")
    sections.setdefault("title", "")
    sections.setdefault("summary", "")
    sections.setdefault("related_law", "")
    sections.setdefault("ref_decision", "")
    sections.setdefault("fol_decision", "")
    sections.setdefault("order_text", "")
    sections.setdefault("reason_text", "")
    sections["viewer_html"] = viewer_html
    return sections


def parse_viewer_params(viewer_url: str) -> dict:
    """Viewer URL -> {dem_no, db}."""
    if not viewer_url:
        return {}
    q = parse_qs(urlparse(unescape(viewer_url)).query)
    return {
        "dem_no": (q.get("dem_no") or [""])[0],
        "db": (q.get("db") or ["s"])[0],
    }