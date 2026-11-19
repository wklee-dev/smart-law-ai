# -*- coding: utf-8 -*-
"""[별표] 품목분류를 변경한 물품 PDF → smart_law_ai.db (llc_hs_change_notice*)

표 유형(본문 기준):
  B5  변경전HS|변경후HS|품명|물품설명|변경사유
  B4  변경전HS|변경후HS|물품설명|변경사유
  A4  공문번호|변경전|변경후|변경이유   (연번11 등)
  A3  공문번호|변경전|변경후
  A5  구분|관련공문번호|변경전|변경후|변경이유
  C   라벨형(ㅇ 물품설명 / 변경전HS …) ± 번호|품명|종전공문 표
  DEL 삭제고시
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

try:
    import pymupdf
except ImportError:  # pragma: no cover
    import fitz as pymupdf  # type: ignore

DEFAULT_PDF = Path(
    r"D:/Manus/국가법령정보 공동활용/"
    r"[별표] 품목분류를 변경한 물품(수출입물품 등에 대한 품목분류 변경고시).pdf"
)
DEFAULT_DB = Path(r"D:/SQLiteDB/smart_law_ai.db")

NOTICE_RE = re.compile(
    r"(?:제|기존고시번호제?)?\s*(\d{4})\s*[-–]\s*(\d+)\s*호",
    re.I,
)
DATE_IN_PARENS_RE = re.compile(
    r"\(([’'`]?\d{2,4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\.?\)",
)
HEAD_RE = re.compile(
    r"(?m)^(\d{1,3})\.\s*(.+?(?:품목분류\s*변경고시|에\s*대한\s*품목분류변경고시|품목분류)\s*)$"
)


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def clean_ws(s: str) -> str:
    s = (s or "").replace("\u00a0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def reflow_pdf_text(s: str) -> str:
    """PDF가 단어마다 끊은 줄바꿈을 이어 붙임. ㉮㉯·불릿(-) 줄은 유지."""
    text = clean_ws(s)
    if not text:
        return ""
    out: list[str] = []
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        if buf:
            out.append(re.sub(r"[ \t]+", " ", " ".join(buf)).strip())
            buf = []

    for ln in text.splitlines():
        t = ln.strip()
        if not t:
            flush()
            if out and out[-1] != "":
                out.append("")
            continue
        if re.match(r"^[㉮-㉻\-–•·①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]", t):
            flush()
            out.append(t)
            continue
        buf.append(t)
    flush()
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()


def cell_text(c: object) -> str:
    if c is None:
        return ""
    return clean_ws(heal_hs_breaks(str(c).replace("\r", "\n")))


def norm_header(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


def normalize_hs(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) < 6:
        return clean_ws(raw or "")
    head = f"{digits[:4]}.{digits[4:6]}"
    if len(digits) >= 10:
        return f"{head}-{digits[6:10]}"
    if len(digits) > 6:
        return f"{head}-{digits[6:]}"
    return head


def heal_hs_breaks(text: str) -> str:
    """표 셀 줄바꿈 복원: 9026.20-900\\n0 → 9026.20-9000"""
    t = text or ""
    t = re.sub(
        r"(\d{4}\s*\.\s*\d{2}\s*[-–]\s*\d{1,3})\s*\n\s*(\d)\b",
        r"\1\2",
        t,
    )
    t = re.sub(r"(\d{4})\s*\.\s*(\d{2})\s*[-–]\s*(\d{4})", r"\1.\2-\3", t)
    return t


def extract_hs_list(text: str) -> list[str]:
    out: list[str] = []
    text = heal_hs_breaks(text or "")
    # '제8515.19-0000호' 처럼 앞뒤 한글이 있어도 잡히도록 \b 미사용
    for m in re.finditer(r"(\d{4}\.\d{2}(?:-\d{1,4})?)", text):
        hs = normalize_hs(m.group(1))
        digits = re.sub(r"\D", "", hs)
        if len(digits) < 8:
            continue
        head = int(digits[:4])
        if 1990 <= head <= 2035 and len(digits) <= 6:
            continue
        if hs not in out:
            out.append(hs)
    return out


def parse_notice_date(frag: str) -> str:
    frag = (frag or "").strip().replace("’", "'").replace("`", "'")
    m = re.search(r"(\d{2,4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})", frag)
    if not m:
        return ""
    y, mo, d = m.group(1), int(m.group(2)), int(m.group(3))
    yi = int(y)
    if yi < 100:
        yi += 2000 if yi <= 70 else 1900
    return f"{yi:04d}-{mo:02d}-{d:02d}"


def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS llc_hs_change_notice;
        DROP TABLE IF EXISTS llc_hs_change_notice_meta;
        CREATE TABLE llc_hs_change_notice (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          seq_no INTEGER NOT NULL UNIQUE,
          notice_no TEXT,
          notice_no_label TEXT,
          notice_date TEXT,
          item_name TEXT,
          title TEXT,
          intro_text TEXT,
          layout_type TEXT,
          hs_before TEXT,
          hs_after TEXT,
          product_overview TEXT,
          change_reason TEXT,
          prior_documents TEXT,
          application_note TEXT,
          table_headers_json TEXT,
          table_rows_json TEXT,
          prior_rows_json TEXT,
          text_items_json TEXT,
          source_pdf_page INTEGER,
          source_file TEXT,
          raw_text TEXT,
          created_at TEXT,
          updated_at TEXT
        );
        CREATE INDEX idx_llc_hs_chg_notice_no ON llc_hs_change_notice(notice_no);
        CREATE INDEX idx_llc_hs_chg_date ON llc_hs_change_notice(notice_date);
        CREATE INDEX idx_llc_hs_chg_layout ON llc_hs_change_notice(layout_type);
        CREATE TABLE llc_hs_change_notice_meta (
          key TEXT PRIMARY KEY,
          value TEXT
        );
        """
    )


def extract_toc(doc: pymupdf.Document) -> list[dict]:
    buf_lines: list[str] = []
    for i in range(min(25, doc.page_count)):
        for ln in doc[i].get_text().splitlines():
            s = ln.strip()
            if not s:
                continue
            if s in (
                "연번",
                "고시번호(시행일)",
                "품",
                "명",
                "비고",
                "[별표] 품목분류를변경한물품",
                "품명",
            ):
                continue
            buf_lines.append(s)
    text = "\n".join(buf_lines)
    text = re.sub(r"(\d{4})\s*[-–]\s*(\d+)\s*호", r"\1-\2호", text)
    pat = re.compile(
        r"(?ms)^(\d+)\s+(\d{4}-\d+호)\s*\(([^)]+)\)\s*(.+?)\s+(\d+)\s*(?=\n\d+\s+\d{4}-|\Z)"
    )
    rows: list[dict] = []
    for m in pat.finditer(text + "\n"):
        label = m.group(2).strip()
        nm = re.match(r"(\d{4}-\d+)호", label)
        rows.append(
            {
                "seq_no": int(m.group(1)),
                "notice_no": nm.group(1) if nm else label,
                "notice_no_label": label,
                "notice_date": parse_notice_date(m.group(3)),
                "item_name": clean_ws(m.group(4).replace("\n", " ")),
                "source_pdf_page": int(m.group(5)),
            }
        )
    return rows


def is_section_header(seq: int, title_line: str, peek: str) -> bool:
    if seq < 1 or seq > 999:
        return False
    blob = f"{title_line}\n{peek[:100]}"
    return "품목분류" in blob or "변경고시" in blob


def find_sections(doc: pymupdf.Document) -> list[dict]:
    """Return [{seq, start_page0, title, char_start}] over pages 27..end."""
    parts: list[str] = []
    page_starts: list[tuple[int, int]] = []
    offset = 0
    for i in range(26, doc.page_count):
        t = doc[i].get_text()
        page_starts.append((offset, i))
        parts.append(t)
        offset += len(t) + 1
    full = "\n".join(parts)

    cand = list(re.finditer(r"(?m)^(\d{1,3})\.\s*(.+)$", full))
    heads: list[re.Match[str]] = []
    seen: set[int] = set()
    for m in cand:
        seq = int(m.group(1))
        if seq in seen:
            continue
        title = m.group(2).strip()
        peek = full[m.end() : m.end() + 220]
        if not is_section_header(seq, title, peek):
            continue
        if heads and seq + 5 < int(heads[-1].group(1)):
            continue
        seen.add(seq)
        heads.append(m)

    sections: list[dict] = []
    for idx, m in enumerate(heads):
        seq = int(m.group(1))
        title = m.group(2).strip()
        peek_lines = full[m.end() : m.end() + 80].splitlines()
        if peek_lines and "변경고시" in peek_lines[0] and "변경고시" not in title:
            title = f"{title} {peek_lines[0].strip()}"
        end = heads[idx + 1].start() if idx + 1 < len(heads) else len(full)
        body = full[m.start() : end]
        page0 = 26
        for off, p in page_starts:
            if off <= m.start():
                page0 = p
            else:
                break
        end_page0 = page0
        for off, p in page_starts:
            if off < end:
                end_page0 = p
            else:
                break
        sections.append(
            {
                "seq_no": seq,
                "title": clean_ws(title),
                "raw_text": clean_ws(body),
                "start_page0": page0,
                "end_page0": end_page0,
            }
        )
    return sections


def classify_header(header: list[str]) -> str | None:
    h = [norm_header(c) for c in header]
    joined = "|".join(h)
    if "공문번호" in joined and "변경전" in joined:
        if "구분" in joined or "관련공문" in joined:
            return "A5"
        if "변경이유" in joined or "변경사유" in joined:
            return "A4"
        return "A3"
    if "변경전HS" in joined or "변경전HS품목번호" in joined:
        if "품명" in joined and ("물품설명" in joined or "물품설명" in "".join(h)):
            return "B5"
        if "변경전물품설명" in joined:
            return "B5_ALT"
        if "물품설명" in joined or "물품설명" in "".join(h) or "물품설명" in "".join(
            norm_header(x) for x in header
        ):
            return "B4"
        if any("물품" in x for x in h) and any("사유" in x or "이유" in x for x in h):
            return "B4"
        return "B4"
    if joined.startswith("번호") and ("품명" in joined or "종전공문" in joined):
        return "PRIOR"
    return None


def extract_tables_on_pages(
    doc: pymupdf.Document, start0: int, end0: int
) -> list[tuple[str, list[str], list[list[str]]]]:
    """Return list of (layout, headers, rows)."""
    out: list[tuple[str, list[str], list[list[str]]]] = []
    for i in range(start0, min(end0 + 1, doc.page_count)):
        tabs = doc[i].find_tables()
        if not tabs:
            continue
        for t in tabs.tables:
            data = t.extract()
            if not data or len(data) < 1:
                continue
            headers = [cell_text(c) for c in data[0]]
            layout = classify_header(headers)
            if not layout:
                continue
            # skip junk 1-row fake tables
            if layout == "PRIOR" and t.row_count < 2:
                continue
            if layout not in ("PRIOR",) and t.col_count < 3:
                continue
            rows = [[cell_text(c) for c in r] for r in data[1:]]
            # drop empty rows
            rows = [r for r in rows if any(x.strip() for x in r)]
            out.append((layout, headers, rows))
    return out


CIRCLED_MARKS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
CIRCLED_RE = re.compile(r"([" + CIRCLED_MARKS + r"])\s*")


def _grab_field(block: str, labels: list[str], stop: list[str]) -> str:
    stop_alt = "|".join(stop) if stop else r"(?!)"
    for lab in labels:
        pat = (
            r"[ㅇ○]?\s*"
            + lab
            + r"\s*[:：]?\s*(.+?)(?=[ㅇ○]\s*(?:"
            + stop_alt
            + r")|(?:["
            + CIRCLED_MARKS
            + r"])|\(시행일\)|\(적용일\)|\(부칙\)|\Z)"
        )
        m = re.search(pat, block, re.S | re.I)
        if m:
            return clean_ws(m.group(1))
    return ""


def _parse_one_labeled_block(block: str, mark: str = "") -> dict:
    """한 품목 텍스트 블록 → 필드 dict."""
    block = block.replace("○", "ㅇ").replace("●", "ㅇ")
    stops = [
        "품명",
        "종전공문",
        "결정분류",
        "물품설명",
        "변경전",
        "변경후",
        "변경사유",
        "변경이유",
        "품명및종전공문",
    ]
    # ①품명: xxx  or  ㅇ품명: xxx
    item = _grab_field(block, ["품명"], [s for s in stops if s != "품명"])
    if not item:
        m = re.match(
            r"^(?:[" + CIRCLED_MARKS + r"])?\s*품명\s*[:：]\s*(.+)$",
            block.strip().split("\n")[0],
            re.I,
        )
        if m:
            item = clean_ws(m.group(1))
    prior = _grab_field(
        block,
        ["종전공문", "결정분류", "품명및종전공문"],
        [s for s in stops if s not in ("종전공문", "결정분류", "품명및종전공문")],
    )
    overview = _grab_field(
        block, ["물품설명"], [s for s in stops if s != "물품설명"]
    )
    hs_b_raw = _grab_field(
        block,
        [r"변경전\s*HS\s*품목번호", r"변경전HS\s*품목번호", r"변경전\s*HS"],
        ["변경후", "변경사유", "변경이유"],
    )
    hs_a_raw = _grab_field(
        block,
        [r"변경후\s*HS\s*품목번호", r"변경후HS\s*품목번호", r"변경후\s*HS"],
        ["변경사유", "변경이유", "품명", "종전공문", "물품설명"],
    )
    reason = _grab_field(
        block,
        ["변경사유", "변경이유"],
        ["품명", "종전공문", "물품설명", "변경전", "변경후"],
    )
    hb = extract_hs_list(hs_b_raw)
    ha = extract_hs_list(hs_a_raw)
    return {
        "mark": mark,
        "item_name": clean_ws(item.replace("\n", " ")),
        "prior_doc": reflow_pdf_text(prior),
        "overview": reflow_pdf_text(overview),
        "hs_before": "; ".join(hb) if hb else clean_ws(hs_b_raw),
        "hs_after": "; ".join(ha) if ha else clean_ws(hs_a_raw),
        "change_reason": reflow_pdf_text(reason),
        "hs_before_list": hb,
        "hs_after_list": ha,
    }


def parse_labeled(body: str) -> dict:
    """C-type 텍스트형. ①②③ 다중 품목 + 공유 변경사유 지원."""
    spaced = clean_ws(body)
    spaced_n = spaced.replace("○", "ㅇ").replace("●", "ㅇ")

    # 시행일 이전까지만 (변경사유는 항목 분할 후에 처리 — 중간의 사유가 뒤 항목을 지우지 않도록)
    body_cut = re.split(
        r"\(시행일\)|\(적용일\)|\(부칙\)", spaced_n, maxsplit=1
    )[0]

    parts = CIRCLED_RE.split(body_cut)
    # split → ['pre', '①', 'rest1', '②', 'rest2', ...]
    items: list[dict] = []
    if len(parts) >= 3:
        i = 1
        while i + 1 < len(parts):
            mark = parts[i]
            chunk = parts[i + 1]
            # 다음 항목 시작 전까지만 (분할로 이미 분리됨)
            # 청크 끝의 공유 변경사유는 항목 사유로 잡히므로, 마지막 항목만 유지
            it = _parse_one_labeled_block(chunk, mark=mark)
            if it["item_name"] or it["hs_before"] or it["overview"]:
                items.append(it)
            i += 2

    # 공통 변경사유: 마지막 ① 이후에 나온 ○변경사유 (또는 단일 블록의 사유)
    shared_reason = ""
    if items:
        last_mark = items[-1].get("mark") or ""
        if last_mark:
            pos = body_cut.rfind(last_mark)
            tail = body_cut[pos:] if pos >= 0 else body_cut
        else:
            tail = body_cut
        rm = re.search(
            r"[ㅇ○]\s*변경사유\s*[:：]?\s*(.+)$",
            tail,
            re.S | re.I,
        )
        if rm:
            shared_reason = clean_ws(rm.group(1))
        # 마지막 항목에만 붙어 있던 사유를 공유로 승격, 이전 항목 사유는 비움
        if shared_reason:
            for it in items[:-1]:
                # 앞 항목에 잘못 붙은 장문 사유 제거(보통 비어 있음)
                if it.get("change_reason") and len(it["change_reason"]) > 80:
                    if it["change_reason"][:40] == shared_reason[:40]:
                        it["change_reason"] = ""
            items[-1]["change_reason"] = shared_reason
    else:
        rm = re.search(
            r"[ㅇ○]\s*변경사유\s*[:：]?\s*(.+)$",
            body_cut,
            re.S | re.I,
        )
        if rm:
            shared_reason = clean_ws(rm.group(1))

    if not items:
        # 단일 ○품명 블록
        it = _parse_one_labeled_block(body_cut, mark="")
        if it["item_name"] or it["hs_before"] or it["overview"] or it["hs_after"]:
            items.append(it)
        if not shared_reason and items:
            shared_reason = items[0].get("change_reason") or ""

    if not items:
        # 최후: 전체에서 HS만이라도
        codes = extract_hs_list(spaced_n)
        items.append(
            {
                "mark": "",
                "item_name": "",
                "prior_doc": "",
                "overview": "",
                "hs_before": codes[0] if codes else "",
                "hs_after": codes[1] if len(codes) > 1 else "",
                "change_reason": shared_reason,
                "hs_before_list": codes[:1],
                "hs_after_list": codes[1:2],
            }
        )

    # 항목별 사유 없고 공유 사유만 있으면 채움
    for it in items:
        if not it.get("change_reason") and shared_reason:
            it["change_reason"] = shared_reason

    all_hb: list[str] = []
    all_ha: list[str] = []
    overviews: list[str] = []
    priors: list[str] = []
    for it in items:
        for x in it.get("hs_before_list") or []:
            if x not in all_hb:
                all_hb.append(x)
        for x in it.get("hs_after_list") or []:
            if x not in all_ha:
                all_ha.append(x)
        if it.get("overview"):
            overviews.append(it["overview"])
        if it.get("prior_doc"):
            priors.append(it["prior_doc"])

    # 검색/목록용 대표 품명
    names = [it["item_name"] for it in items if it.get("item_name")]
    item_name = names[0] if names else ""
    if len(names) > 1:
        item_name = f"{names[0]} 등{len(names)}건"

    # 표형 UI 대체용 행 (다중 행)
    headers = [
        "구분",
        "품명",
        "종전공문",
        "물품설명",
        "변경전 HS품목번호",
        "변경후 HS품목번호",
    ]
    rows = []
    for it in items:
        rows.append(
            [
                it.get("mark") or "",
                it.get("item_name") or "",
                it.get("prior_doc") or "",
                it.get("overview") or "",
                it.get("hs_before") or "",
                it.get("hs_after") or "",
            ]
        )

    return {
        "layout_type": "C",
        "item_name": item_name,
        "hs_before": "; ".join(all_hb),
        "hs_after": "; ".join(all_ha),
        "product_overview": "\n\n".join(overviews),
        "change_reason": shared_reason
        or next((it.get("change_reason") or "" for it in items), ""),
        "prior_documents": "\n".join(priors),
        "table_headers": headers,
        "table_rows": rows,
        "text_items": items,  # UI용 원본 구조
    }


def map_table_fields(
    layout: str, headers: list[str], rows: list[list[str]]
) -> dict:
    """Flatten first data rows into search fields + keep full table."""
    hs_before: list[str] = []
    hs_after: list[str] = []
    overviews: list[str] = []
    reasons: list[str] = []
    priors: list[str] = []
    item_from_table = ""

    for row in rows:
        # pad
        while len(row) < len(headers):
            row.append("")
        if layout == "B5":
            # 변경전, 변경후, 품명, 물품설명, 변경사유
            hs_before.extend(extract_hs_list(row[0]))
            hs_after.extend(extract_hs_list(row[1]))
            if not item_from_table:
                item_from_table = clean_ws(row[2].split("\n")[0])
            if row[3].strip():
                overviews.append(row[3])
            if row[4].strip():
                reasons.append(row[4])
            # prior refs often inside col0
            if re.search(r"평가분류|품목분류|분석관|검사분류", row[0]):
                priors.append(row[0])
        elif layout == "B4":
            hs_before.extend(extract_hs_list(row[0]))
            # col0 may include descriptive subtext under HS
            extras = re.sub(
                r"\d{4}\.\d{2}(?:-\d{1,4})?", "", row[0]
            )
            extras = clean_ws(extras)
            if extras and len(extras) > 8:
                priors.append(row[0])  # keep full before cell for display
            hs_after.extend(extract_hs_list(row[1]))
            if row[2].strip():
                overviews.append(row[2])
            if len(row) > 3 and row[3].strip():
                reasons.append(row[3])
        elif layout in ("A4", "A3"):
            # 공문번호 | 변경전 | 변경후 | [변경이유]
            priors.append(row[0])
            hs_before.extend(extract_hs_list(row[1]))
            hs_after.extend(extract_hs_list(row[2]))
            if layout == "A4" and len(row) > 3 and row[3].strip():
                reasons.append(row[3])
        elif layout == "A5":
            # 구분 | 관련공문 | 변경전 | 변경후 | 변경이유
            if not item_from_table:
                item_from_table = clean_ws(row[0].replace("\n", " "))
            priors.append(row[1])
            hs_before.extend(extract_hs_list(row[2]))
            hs_after.extend(extract_hs_list(row[3]))
            if len(row) > 4 and row[4].strip():
                reasons.append(row[4])
        elif layout == "B5_ALT":
            # 품명|변경전HS|변경전물품설명|변경후HS|변경사유
            if not item_from_table:
                item_from_table = clean_ws(row[0].split("\n")[0])
            hs_before.extend(extract_hs_list(row[1]))
            if row[2].strip():
                overviews.append(row[2])
            hs_after.extend(extract_hs_list(row[3]))
            if len(row) > 4 and row[4].strip():
                reasons.append(row[4])

    def uniq(xs: list[str]) -> list[str]:
        o: list[str] = []
        for x in xs:
            if x and x not in o:
                o.append(x)
        return o

    hb, ha = uniq(hs_before), uniq(hs_after)
    return {
        "layout_type": layout,
        "item_name": item_from_table,
        "hs_before": "; ".join(hb),
        "hs_after": "; ".join(ha),
        "product_overview": "\n\n".join(overviews),
        "change_reason": "\n\n".join(reasons),
        "prior_documents": "\n\n".join(priors),
        "table_headers": headers,
        "table_rows": rows,
    }


def parse_meta_from_body(body: str) -> dict:
    notice_no = ""
    notice_label = ""
    nm = NOTICE_RE.search(body)
    if nm:
        notice_no = f"{nm.group(1)}-{int(nm.group(2))}"
        notice_label = f"{notice_no}호"
    notice_date = ""
    dm = DATE_IN_PARENS_RE.search(body)
    if dm:
        notice_date = parse_notice_date(
            f"{dm.group(1)}.{dm.group(2)}.{dm.group(3)}"
        )
    else:
        dm2 = re.search(
            r"\(\s*((?:\d\s*){2,4})\s*\.\s*((?:\d\s*){1,2})\s*\.\s*((?:\d\s*){1,2})\s*\)",
            body,
        )
        if dm2:
            y = re.sub(r"\s+", "", dm2.group(1))
            mo = re.sub(r"\s+", "", dm2.group(2))
            d = re.sub(r"\s+", "", dm2.group(3))
            notice_date = parse_notice_date(f"{y}.{mo}.{d}")

    intro = ""
    im = re.search(
        r"((?:관세법)[^\n]{0,80}(?:변경고시합니다|고시합니다)\.?)",
        clean_ws(body),
    )
    if im:
        intro = clean_ws(im.group(1))

    app = ""
    am = re.search(
        r"(\((?:시행일|적용일|부칙)\)[\s\S]+?)(?=\n\d{1,3}\.\s|\Z)",
        body,
    )
    if am:
        app = clean_ws(am.group(1))

    return {
        "notice_no": notice_no,
        "notice_no_label": notice_label,
        "notice_date": notice_date,
        "intro_text": intro,
        "application_note": app,
    }


def parse_section(doc: pymupdf.Document, sec: dict) -> dict:
    body = sec["raw_text"]
    meta = parse_meta_from_body(body)
    tables = extract_tables_on_pages(doc, sec["start_page0"], sec["end_page0"])

    main = None
    prior_headers: list[str] = []
    prior_rows: list[list[str]] = []
    for layout, headers, rows in tables:
        if layout == "PRIOR":
            if not prior_rows:
                prior_headers = headers
                prior_rows = rows
            else:
                prior_rows.extend(rows)
            continue
        if main is None and layout in (
            "B5",
            "B4",
            "A4",
            "A3",
            "A5",
            "B5_ALT",
        ):
            main = map_table_fields(layout, headers, rows)

    deleted = bool(re.search(r"<삭제", body[:500]))
    labeled_hit = bool(
        re.search(
            r"[ㅇ○]\s*물품설명|[ㅇ○]\s*변경전|[①②③④⑤⑥⑦⑧⑨⑩]\s*품명|"
            r"[ㅇ○]\s*품명\s*[:：]|변경전\s*HS\s*품목번호\s*[:：]",
            body,
        )
    )

    if main is None:
        if deleted:
            main = {
                "layout_type": "DEL",
                "item_name": "",
                "hs_before": "",
                "hs_after": "",
                "product_overview": "",
                "change_reason": "",
                "prior_documents": clean_ws(
                    re.search(r"<삭제[\s\S]{0,400}>?", body).group(0)
                    if re.search(r"<삭제", body)
                    else ""
                ),
                "table_headers": ["비고"],
                "table_rows": [
                    [
                        clean_ws(
                            re.search(r"<삭제[\s\S]{0,400}>?", body).group(0)
                            if re.search(r"<삭제", body)
                            else "삭제된 고시"
                        )
                    ]
                ],
            }
        elif labeled_hit:
            main = parse_labeled(body)
        else:
            # last resort: HS codes + raw middle
            codes = extract_hs_list(body)
            main = {
                "layout_type": "RAW",
                "item_name": "",
                "hs_before": codes[0] if codes else "",
                "hs_after": codes[1] if len(codes) > 1 else "",
                "product_overview": "",
                "change_reason": "",
                "prior_documents": "",
                "table_headers": ["변경전 HS품목번호", "변경후 HS품목번호", "물품설명", "변경사유"],
                "table_rows": [
                    [
                        codes[0] if codes else "",
                        codes[1] if len(codes) > 1 else "",
                        "",
                        "",
                    ]
                ],
            }

    # attach prior list table
    if prior_rows:
        main["prior_rows"] = prior_rows
        main["prior_headers"] = prior_headers or ["번호", "품명", "종전공문"]
        # also flatten prior docs text
        lines = []
        for r in prior_rows:
            lines.append(" | ".join(x for x in r if x.strip()))
        extra = "\n".join(lines)
        if extra:
            main["prior_documents"] = clean_ws(
                (main.get("prior_documents") or "") + "\n" + extra
            )
        if main.get("layout_type") == "C":
            main["layout_type"] = "C_PRIOR"

    # title → item name fallback
    item = main.get("item_name") or ""
    if not item:
        t = sec["title"]
        t = re.sub(r"\s*품목분류\s*변경고시\s*$", "", t)
        t = re.sub(r"\s*에\s*대한\s*품목분류변경고시\s*$", "", t)
        t = re.sub(r"\s*품목분류\s*$", "", t)
        item = clean_ws(t)
        main["item_name"] = item

    return {
        **meta,
        **main,
        "seq_no": sec["seq_no"],
        "title": sec["title"],
        "source_pdf_page": sec["start_page0"] + 1,
        "raw_text": body,
        "prior_headers": main.get("prior_headers") or [],
        "prior_rows": main.get("prior_rows") or [],
        "table_headers": main.get("table_headers") or [],
        "table_rows": main.get("table_rows") or [],
        "text_items": main.get("text_items") or [],
    }


def merge_rows(toc: list[dict], parsed: list[dict], source_file: str) -> list[dict]:
    now = utc_now()
    by_seq = {r["seq_no"]: dict(r) for r in toc}
    for p in parsed:
        seq = p["seq_no"]
        base = by_seq.get(seq, {"seq_no": seq})
        # TOC keeps notice/item when present
        for k in (
            "notice_no",
            "notice_no_label",
            "notice_date",
            "item_name",
            "title",
            "intro_text",
            "layout_type",
            "hs_before",
            "hs_after",
            "product_overview",
            "change_reason",
            "prior_documents",
            "application_note",
            "table_headers",
            "table_rows",
            "prior_headers",
            "prior_rows",
            "text_items",
            "source_pdf_page",
            "raw_text",
        ):
            v = p.get(k)
            if v is None or v == "" or v == []:
                continue
            if k in ("notice_no", "notice_no_label", "notice_date", "item_name") and base.get(k):
                continue
            base[k] = v
        by_seq[seq] = base

    rows = []
    for seq in sorted(by_seq):
        r = by_seq[seq]
        # strip internal list fields from text_items for JSON size
        text_items = []
        for it in r.get("text_items") or []:
            text_items.append(
                {
                    "mark": it.get("mark") or "",
                    "item_name": it.get("item_name") or "",
                    "prior_doc": it.get("prior_doc") or "",
                    "overview": it.get("overview") or "",
                    "hs_before": it.get("hs_before") or "",
                    "hs_after": it.get("hs_after") or "",
                    "change_reason": it.get("change_reason") or "",
                }
            )
        rows.append(
            {
                "seq_no": seq,
                "notice_no": r.get("notice_no") or "",
                "notice_no_label": r.get("notice_no_label") or "",
                "notice_date": r.get("notice_date") or "",
                "item_name": r.get("item_name") or "",
                "title": r.get("title") or "",
                "intro_text": r.get("intro_text") or "",
                "layout_type": r.get("layout_type") or "",
                "hs_before": r.get("hs_before") or "",
                "hs_after": r.get("hs_after") or "",
                "product_overview": r.get("product_overview") or "",
                "change_reason": r.get("change_reason") or "",
                "prior_documents": r.get("prior_documents") or "",
                "application_note": r.get("application_note") or "",
                "table_headers_json": json.dumps(
                    r.get("table_headers") or [], ensure_ascii=False
                ),
                "table_rows_json": json.dumps(
                    r.get("table_rows") or [], ensure_ascii=False
                ),
                "prior_rows_json": json.dumps(
                    {
                        "headers": r.get("prior_headers") or [],
                        "rows": r.get("prior_rows") or [],
                    },
                    ensure_ascii=False,
                ),
                "text_items_json": json.dumps(text_items, ensure_ascii=False),
                "source_pdf_page": r.get("source_pdf_page"),
                "source_file": source_file,
                "raw_text": r.get("raw_text") or "",
                "created_at": now,
                "updated_at": now,
            }
        )
    return rows


def write_db(conn: sqlite3.Connection, rows: list[dict], meta: dict[str, str]) -> None:
    ensure_tables(conn)
    conn.executemany(
        """
        INSERT INTO llc_hs_change_notice (
          seq_no, notice_no, notice_no_label, notice_date, item_name, title,
          intro_text, layout_type, hs_before, hs_after, product_overview,
          change_reason, prior_documents, application_note,
          table_headers_json, table_rows_json, prior_rows_json, text_items_json,
          source_pdf_page, source_file, raw_text, created_at, updated_at
        ) VALUES (
          :seq_no, :notice_no, :notice_no_label, :notice_date, :item_name, :title,
          :intro_text, :layout_type, :hs_before, :hs_after, :product_overview,
          :change_reason, :prior_documents, :application_note,
          :table_headers_json, :table_rows_json, :prior_rows_json, :text_items_json,
          :source_pdf_page, :source_file, :raw_text, :created_at, :updated_at
        )
        """,
        rows,
    )
    for k, v in meta.items():
        conn.execute(
            "INSERT INTO llc_hs_change_notice_meta(key, value) VALUES (?, ?)",
            (k, v),
        )
    conn.commit()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = ap.parse_args()
    if not args.pdf.exists():
        parent = Path(r"D:/Manus/국가법령정보 공동활용")
        found = list(parent.glob("*품목분류*변경고시*.pdf")) or list(
            parent.glob("*품목분류*.pdf")
        )
        if not found:
            raise SystemExit(f"PDF 없음: {args.pdf}")
        args.pdf = found[0]

    print("PDF:", args.pdf)
    print("DB:", args.db)
    doc = pymupdf.open(args.pdf)
    toc = extract_toc(doc)
    print(f"TOC rows: {len(toc)}")
    sections = find_sections(doc)
    print(f"Sections: {len(sections)}")
    parsed = [parse_section(doc, s) for s in sections]
    from collections import Counter

    print("layouts", Counter(p.get("layout_type") for p in parsed))
    with_ov = sum(1 for p in parsed if p.get("product_overview"))
    with_rs = sum(1 for p in parsed if p.get("change_reason"))
    print(f"with overview={with_ov} reason={with_rs}")

    # spot checks
    for s in (1, 8, 11, 15, 18, 19, 37, 685):
        p = next((x for x in parsed if x["seq_no"] == s), None)
        if not p:
            print("missing", s)
            continue
        n_items = len(p.get("text_items") or [])
        print(
            f"seq{s}",
            p.get("layout_type"),
            "items",
            n_items,
            "hs",
            p.get("hs_before"),
            "->",
            p.get("hs_after"),
            "ov",
            len(p.get("product_overview") or ""),
            "rs",
            len(p.get("change_reason") or ""),
        )

    rows = merge_rows(toc, parsed, args.pdf.name)
    print(f"Merged: {len(rows)}")
    conn = sqlite3.connect(str(args.db))
    try:
        write_db(
            conn,
            rows,
            {
                "source_pdf": str(args.pdf),
                "imported_at_utc": utc_now(),
                "row_count": str(len(rows)),
                "importer": "import-llc-hs-change-notice-pdf.py",
                "note": "table-aware import (B5/B4/A4/A5/C)",
            },
        )
    finally:
        conn.close()
    print("OK")


if __name__ == "__main__":
    main()
