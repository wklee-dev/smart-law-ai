# -*- coding: utf-8 -*-
"""Parser for the decision-case list page.

URL  : /mUser/dem/demList.do?semok={code}&pageNumber={n}
DOM  : ul.result-wrap > li.result-box
         + .result-tit  : tax label (.label-tax) / decision label (.label-decision)
         |                a[href*=demView.do] (title)
         + .result-txt  : a[href*=demView.do] (summary)
                          .info .date (decision date) / .info .case-num (claim no.)
"""
from __future__ import annotations

import re
from html import unescape

from bs4 import BeautifulSoup

from .util import clean_text, norm_date

_RE_DEM_NO = re.compile(r"dem_no=(\d+)")
_RE_SEMOK = re.compile(r"semok=(\d+)")
_RE_TOTAL = re.compile(r"([\d,]+)")
_RE_PAGE = re.compile(r"1\s*/\s*([\d,]+)")


def _to_int(s) -> int:
    digits = re.sub(r"[^\d]", "", str(s or ""))
    return int(digits) if digits else 0


def _text_wo_label(el) -> str:
    """Return the value only, dropping the <span> label node."""
    if el is None:
        return ""
    span = el.find("span")
    if span:
        span.extract()
    return clean_text(el.get_text(" ", strip=True))


def parse_list_page(html: str, page_no: int = 1) -> dict:
    soup = BeautifulSoup(html, "lxml")
    items = []

    for li in soup.select("ul.result-wrap > li.result-box"):
        link = li.select_one('a[href*="demView.do"]')
        if link is None:
            continue
        href = unescape(link.get("href", ""))
        m_no = _RE_DEM_NO.search(href)
        if not m_no:
            continue
        m_semok = _RE_SEMOK.search(href)

        tax_el = li.select_one(".result-tit .label.label-tax")
        dec_el = li.select_one(".result-tit .label.label-decision")

        title_el = li.select_one('.result-tit a[href*="demView.do"]')
        summary_el = li.select_one('.result-txt a[href*="demView.do"]')

        info = li.select_one(".result-txt .info") or li.select_one(".info")
        date_el = info.select_one(".date") if info else None
        case_el = info.select_one(".case-num") if info else None

        items.append(
            {
                "dem_no": int(m_no.group(1)),
                "semok_code": m_semok.group(1) if m_semok else "",
                "semok_name": clean_text(tax_el.get_text()) if tax_el else "",
                "decision_type": clean_text(dec_el.get_text()) if dec_el else "",
                "title": clean_text(title_el.get_text()) if title_el else "",
                "list_summary": clean_text(summary_el.get_text()) if summary_el else "",
                "decision_date": norm_date(_text_wo_label(date_el)),
                "claim_no": _text_wo_label(case_el),
                "page_no": page_no,
            }
        )

    # Totals : <span class="result-total">12,500</span> / <span>1/1,250 pages</span>
    total_cnt = 0
    total_pages = 0
    tot_el = soup.select_one(".result-info .result-total")
    if tot_el is not None:
        total_cnt = _to_int(tot_el.get_text())
    if not total_cnt:
        m = _RE_TOTAL.search(html)
        if m:
            total_cnt = _to_int(m.group(1))
    info_el = soup.select_one(".result-info")
    if info_el is not None:
        m = _RE_PAGE.search(info_el.get_text(" ", strip=True))
        if m:
            total_pages = _to_int(m.group(1))
    if not total_pages:
        m = _RE_PAGE.search(html)
        if m:
            total_pages = _to_int(m.group(1))

    return {"total_cnt": total_cnt, "total_pages": total_pages, "items": items}