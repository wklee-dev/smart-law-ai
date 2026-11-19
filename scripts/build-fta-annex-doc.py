# -*- coding: utf-8 -*-
"""FTA 협정 화면용 별표 본문(fta_annex_doc) 생성.

출처(모두 자체 DB · 공식 원문):
  - FTA특례법 시행규칙 별표 (latest_law_attachments, law_id=010172 최신 공포본)
      psr_guide  : 협정별 원산지결정기준
      cert_items : 원산지증명서에 기재할 사항
    별표 HWP 가 '자세한 내용은 … 다운로드' 안내본이면 그 안의 law.go.kr 원문 HWP 를 받아 사용
  - 협정관세 추천 고시 별표 (admin_rule_annex / admin_rule_attachment)
      recom      : 추천대상물품·물량

  python scripts/build-fta-annex-doc.py
"""
from __future__ import annotations

import json
import re
import sqlite3
import struct
import urllib.request
import zlib
from datetime import datetime
from pathlib import Path

import olefile

DB = Path(r"D:/SQLiteDB/smart_law_ai.db")
ATTACH_ROOT = Path(r"D:/SQLiteDB/ATTACH")
ORIGINAL_DIR = ATTACH_ROOT / "최신법령_별표원문"
RULE_LAW_ID = "010172"  # FTA특례법 시행규칙
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

# 협정코드 → 별표 제목 키워드 (시행규칙 별표 제목 기준)
FTA_KEYWORDS: dict[str, tuple[str, ...]] = {
    "FCL": ("칠레와",),
    "FSG": ("싱가포르와",),
    "FEF": ("유럽자유무역연합",),
    "FAS": ("아세안회원국",),
    "FIN": ("인도와",),
    "FEU": ("유럽연합당사자",),
    "FGB": ("영국과",),
    "FPE": ("페루와",),
    "FUS": ("미합중국과",),
    "FTR": ("튀르키예와",),
    "FAU": ("호주와",),
    "FCA": ("캐나다와",),
    "FCO": ("콜롬비아와",),
    "FCN": ("중국과",),
    "FVN": ("베트남과",),
    "FNZ": ("뉴질랜드와",),
    "FCE": ("중미 공화국",),
    "FRC": ("역내포괄적경제동반자협정",),
    "FIL": ("이스라엘과",),
    "FKH": ("캄보디아와",),
    "FID": ("인도네시아와",),
    "FPH": ("필리핀과",),
    "FAE": ("아랍에미리트와",),
}

# 협정관세 추천 고시 → 협정코드
RECOM_RULES: dict[str, str] = {
    "대한민국정부와 칠레공화국 정부간의 자유무역협정에 따른 농축산물관세율할당물량 협정관세 추천 및 수입관리요령": "FCL",
    "대한민국과 유럽자유무역연합회원국 간의 자유무역협정에 따른 스위스연방 기타 치즈 관세율할당물량 추천 및 수입관리요령": "FEF",
    "대한민국과 유럽연합 및 그 회원국간의 자유무역협정에 따른 농축산물 관세율할당물량 추천 및 수입관리 요령": "FEU",
    "대한민국과 미합중국 간의 자유무역협정에 따른 농축산물 관세율 할당물량 추천 및 수입관리요령": "FUS",
}

DDL = """
CREATE TABLE IF NOT EXISTS fta_annex_doc (
    doc_key      TEXT PRIMARY KEY,
    fta_cd       TEXT NOT NULL,
    kind         TEXT NOT NULL,
    label        TEXT NOT NULL,
    source       TEXT NOT NULL,
    source_ref   TEXT NOT NULL,
    source_url   TEXT,
    blocks_json  TEXT NOT NULL,
    text_len     INTEGER NOT NULL,
    sort_no      INTEGER NOT NULL DEFAULT 0,
    extracted_at TEXT NOT NULL
)
"""

# ---------------------------------------------------------------- HWP 5.0

TAG_PARA_HEADER = 66
TAG_PARA_TEXT = 67
TAG_CTRL_HEADER = 71
TAG_LIST_HEADER = 72
TAG_TABLE = 77
# 확장 컨트롤 문자(뒤 7 WCHAR 포함 16바이트)
EXT_CTRL = {1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23}
INLINE_CTRL = {4, 5, 6, 7, 8, 9, 19, 20}


def read_records(path: Path) -> list[tuple[int, int, bytes]]:
    ole = olefile.OleFileIO(str(path))
    try:
        compressed = ole.openstream("FileHeader").read()[36] & 1
        secs = sorted(
            (e for e in ole.listdir() if e[0] == "BodyText"),
            key=lambda e: int(e[1][7:]),
        )
        recs: list[tuple[int, int, bytes]] = []
        for s in secs:
            data = ole.openstream(s).read()
            if compressed:
                data = zlib.decompress(data, -15)
            i = 0
            while i + 4 <= len(data):
                h = struct.unpack_from("<I", data, i)[0]
                tag, lvl, size = h & 0x3FF, (h >> 10) & 0x3FF, (h >> 20) & 0xFFF
                i += 4
                if size == 0xFFF:
                    size = struct.unpack_from("<I", data, i)[0]
                    i += 4
                recs.append((tag, lvl, data[i : i + size]))
                i += size
        return recs
    finally:
        ole.close()


def para_text(b: bytes) -> str:
    out: list[str] = []
    j = 0
    while j + 1 < len(b):
        ch = struct.unpack_from("<H", b, j)[0]
        if ch < 32:
            if ch in EXT_CTRL or ch in INLINE_CTRL:
                if ch == 9:
                    out.append(" ")
                j += 16
                continue
            if ch in (10, 13):
                out.append("\n")
            j += 2
            continue
        out.append(chr(ch))
        j += 2
    return "".join(out).replace("\u00a0", " ").rstrip()


class HwpDoc:
    def __init__(self, recs: list[tuple[int, int, bytes]]):
        self.r = recs

    def blocks(self) -> list[dict]:
        out, _ = self._paras(0, 0, len(self.r))
        return out

    def _paras(self, i: int, lvl: int, end: int) -> tuple[list[dict], int]:
        """lvl 단계 PARA_HEADER 연속을 블록으로. (blocks, next_index)"""
        blocks: list[dict] = []
        while i < end:
            tag, rl, _ = self.r[i]
            if rl < lvl or (tag == TAG_LIST_HEADER and rl == lvl):
                break
            if tag != TAG_PARA_HEADER or rl != lvl:
                i += 1
                continue
            i += 1
            text = ""
            tables: list[dict] = []
            while i < end and self.r[i][1] > lvl:
                t, l2, d = self.r[i]
                if t == TAG_PARA_TEXT and l2 == lvl + 1:
                    text += para_text(d)
                    i += 1
                elif t == TAG_CTRL_HEADER and l2 == lvl + 1 and d[:4][::-1] == b"tbl ":
                    tbl, i = self._table(i + 1, lvl + 1, end)
                    if tbl:
                        tables.append(tbl)
                else:
                    i += 1
            if text.strip():
                blocks.append({"t": "p", "text": text.strip()})
            for tbl in tables:
                rows = tbl["rows"]
                # 테두리용 1×1 표는 내용만 남김
                if len(rows) == 1 and len(rows[0]) == 1:
                    blocks.extend(rows[0][0]["blocks"])
                else:
                    blocks.append(tbl)
        return blocks, i

    def _table(self, i: int, lvl: int, end: int) -> tuple[dict | None, int]:
        """CTRL_HEADER(tbl) 다음부터. 셀 LIST_HEADER 는 lvl+1 단계."""
        cells: list[dict] = []
        while i < end and self.r[i][1] > lvl:
            tag, rl, d = self.r[i]
            if tag == TAG_LIST_HEADER and rl == lvl + 1 and len(d) >= 16:
                col, row, cspan, rspan = struct.unpack_from("<HHHH", d, 8)
                paras, i = self._paras(i + 1, lvl + 1, end)
                cells.append(
                    {"row": row, "col": col, "cs": max(1, cspan), "rs": max(1, rspan), "blocks": paras}
                )
            else:
                i += 1
        if not cells:
            return None, i
        rows: dict[int, list[dict]] = {}
        for c in cells:
            rows.setdefault(c["row"], []).append(c)
        grid = [
            [
                {"cs": c["cs"], "rs": c["rs"], "blocks": c["blocks"]}
                for c in sorted(rows[r], key=lambda x: x["col"])
            ]
            for r in sorted(rows)
        ]
        return {"t": "table", "rows": grid}, i


def cell_text(b: dict) -> str:
    if b["t"] == "p":
        return b["text"]
    return "\n".join(
        " | ".join("\n".join(cell_text(x) for x in c["blocks"]) for c in row)
        for row in b["rows"]
    )


ITEM_RULES_HEAD = re.compile(r"^\s*(\d+|[가-하])\.\s*품목별\s*원산지\s*결정\s*기준")


def first_text(blocks: list[dict]) -> str:
    for b in blocks:
        if b["t"] == "p":
            return b["text"]
    return ""


def cut_at_item_rules(blocks: list[dict]) -> tuple[list[dict], bool]:
    """'N. 품목별 원산지결정기준' 제목부터 뒤(화면의 류별 표와 중복)를 잘라냄."""
    out: list[dict] = []
    for b in blocks:
        if b["t"] == "p":
            if ITEM_RULES_HEAD.match(b["text"]):
                return out, True
            out.append(b)
            continue
        rows: list[list[dict]] = []
        for row in b["rows"]:
            if row and ITEM_RULES_HEAD.match(first_text(row[0]["blocks"])):
                if rows:
                    out.append({"t": "table", "rows": rows})
                return out, True
            new_row = []
            cut = False
            for cell in row:
                inner, cut_inner = cut_at_item_rules(cell["blocks"])
                new_row.append({**cell, "blocks": inner})
                cut = cut or cut_inner
            rows.append(new_row)
            if cut:
                out.append({"t": "table", "rows": rows})
                return out, True
        out.append({"t": "table", "rows": rows})
    return out, False


def blocks_text_len(blocks: list[dict]) -> int:
    return sum(len(cell_text(b)) for b in blocks)


STUB_RE = re.compile(r"자세한\s*내용은")
# 하이퍼링크 컨트롤 안에는 'http\://' 로 이스케이프되어 들어 있음
ORIGINAL_URL_RE = re.compile(r"www\.law\.go\.kr/BYL/grtFile/[A-Za-z0-9_]+\.hwp")


def extract_hwp(path: Path) -> list[dict]:
    return HwpDoc(read_records(path)).blocks()


def resolve_original(path: Path) -> tuple[list[dict], str]:
    """안내본이면 law.go.kr 원문을 받아 대체. (blocks, source_url)"""
    blocks = extract_hwp(path)
    flat = "\n".join(cell_text(b) for b in blocks)
    if not (STUB_RE.search(flat) and len(flat) < 600):
        return blocks, ""
    raw = "".join(
        d[k:].decode("utf-16-le", "ignore")
        for _, _, d in read_records(path)
        for k in (0, 1)
    )
    m = ORIGINAL_URL_RE.search(raw)
    if not m:
        return [], ""
    url = "http://" + m.group(0)
    ORIGINAL_DIR.mkdir(parents=True, exist_ok=True)
    dest = ORIGINAL_DIR / url.rsplit("/", 1)[-1]
    if not dest.is_file():
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            dest.write_bytes(r.read())
    return extract_hwp(dest), url


# ---------------------------------------------------------------- 수집

def fta_for_label(label: str) -> str | None:
    hits = [cd for cd, kws in FTA_KEYWORDS.items() if any(k in label for k in kws)]
    # '인도와' / '인도네시아와' 처럼 겹치는 경우 긴 키워드 우선
    if len(hits) > 1:
        hits.sort(key=lambda cd: -max(len(k) for k in FTA_KEYWORDS[cd]))
    return hits[0] if hits else None


def law_annexes(con: sqlite3.Connection):
    pm = con.execute(
        "SELECT MAX(pmgt_dt_tp_no) FROM latest_law_attachments WHERE law_id=?",
        (RULE_LAW_ID,),
    ).fetchone()[0]
    rows = con.execute(
        """SELECT attachment_id, attachment_label, saved_relative_path
             FROM latest_law_attachments
            WHERE law_id=? AND pmgt_dt_tp_no=? AND attachment_kind='hwp'
              AND status='downloaded'
            ORDER BY saved_relative_path""",
        (RULE_LAW_ID, pm),
    ).fetchall()
    for att_id, label, rel in rows:
        label = label.replace("&lt;", "<").replace("&gt;", ">")
        if "원산지결정기준" in label.replace(" ", ""):
            kind = "psr_guide"
        elif "기재할 사항" in label:
            kind = "cert_items"
        else:
            continue
        fta = fta_for_label(label)
        if fta:
            yield fta, kind, label, att_id, ATTACH_ROOT / rel


def recom_annexes(con: sqlite3.Connection):
    for law_name, fta in RECOM_RULES.items():
        rows = con.execute(
            """SELECT a.annex_title, t.id, t.local_path
                 FROM admin_rule_annex a
                 JOIN admin_rule_attachment t
                   ON t.byl_seq = a.byl_seq AND t.attachment_role = 'annex_hwp'
                WHERE a.law_name = ? AND a.annex_title LIKE '[별표%'
                  AND t.downloaded = 1
                ORDER BY a.byl_seq""",
            (law_name,),
        ).fetchall()
        for title, att_id, local in rows:
            yield fta, "recom", title, str(att_id), Path(local), law_name


def main() -> None:
    con = sqlite3.connect(str(DB))
    con.execute(DDL)
    con.execute("DELETE FROM fta_annex_doc")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    n = empty = 0

    def save(fta, kind, label, source, ref, url, blocks, sort_no):
        nonlocal n, empty
        tl = blocks_text_len(blocks)
        if tl == 0:
            empty += 1
            print(f"  [빈 본문] {fta} {label[:50]}")
            return
        con.execute(
            """INSERT OR REPLACE INTO fta_annex_doc
               (doc_key, fta_cd, kind, label, source, source_ref, source_url,
                blocks_json, text_len, sort_no, extracted_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (f"{source}:{ref}", fta, kind, label, source, ref, url,
             json.dumps(blocks, ensure_ascii=False), tl, sort_no, now),
        )
        n += 1

    for sort_no, (fta, kind, label, att_id, path) in enumerate(law_annexes(con)):
        try:
            blocks, url = resolve_original(path)
        except Exception as e:  # noqa: BLE001
            print(f"  [오류] {label[:50]}: {e}")
            continue
        if kind == "psr_guide":
            blocks, cut = cut_at_item_rules(blocks)
            if not cut:
                print(f"  [품목별 제목 없음·전문 저장] {fta} {label[:40]}")
        save(fta, kind, label, "law", att_id, url, blocks, sort_no)

    for sort_no, (fta, kind, label, att_id, path, law_name) in enumerate(recom_annexes(con)):
        try:
            blocks = extract_hwp(path)
        except Exception as e:  # noqa: BLE001
            print(f"  [오류] {label[:50]}: {e}")
            continue
        save(fta, kind, f"{law_name} {label}", "admrul", att_id, "", blocks, sort_no)

    con.commit()
    for row in con.execute(
        "SELECT kind, COUNT(*), COUNT(DISTINCT fta_cd) FROM fta_annex_doc GROUP BY kind"
    ):
        print("  ", row)
    con.close()
    print(f"완료 fta_annex_doc {n}건 (빈 본문 {empty})")


if __name__ == "__main__":
    main()
