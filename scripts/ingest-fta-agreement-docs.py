# -*- coding: utf-8 -*-
"""
조약/협정 첨부파일 → 텍스트 추출 → smart_law_ai.db 협정서 테이블 적재.

대상 분야: FTA협정 · 양자조약 · 다자조약 · 세관상호지원협정
테이블(이름 유지 — smart_law_hanjoo 호환):
  clip_fta_agreement_doc      첨부별 본문(추출 텍스트)
  clip_fta_agreement_country  국가별 참조 인덱스

부가:
  clip_treaty_attachments 의 디스크 파일과 relative_path / download_status 동기화
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sqlite3
import zipfile
import zlib
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

try:
    import pymupdf
except ImportError:
    import fitz as pymupdf  # type: ignore

try:
    import olefile
except ImportError:
    olefile = None  # type: ignore

DEFAULT_DB = Path(r"D:/SQLiteDB/smart_law_ai.db")
ATTACH_ROOT_NAME = "attachments/조약협정"
ALL_CATEGORIES = (
    "FTA협정",
    "양자조약",
    "다자조약",
    "세관상호지원협정",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def detect_lang(file_name: str) -> str:
    n = file_name.lower()
    if "영문" in file_name or "_en" in n or "english" in n:
        return "EN"
    if "국문" in file_name or "_ko" in n or "korean" in n:
        return "KO"
    return "UNKNOWN"


def split_countries(countries: str) -> list[str]:
    """국가명 분리. '중미 5개국(코스타리카,엘사바도르,…)' 는 한 항목 + 괄호 안 개별 국가."""
    raw = (countries or "").replace("`", "").strip()
    if not raw:
        return []
    out: list[str] = []
    # 괄호 블록을 잠시 보호
    blocks: list[str] = []

    def _protect(m: re.Match[str]) -> str:
        blocks.append(m.group(0))
        return f"__B{len(blocks) - 1}__"

    protected = re.sub(r"\([^)]*\)", _protect, raw)
    for part in re.split(r"[,，/]", protected):
        s = part.strip()
        if not s:
            continue
        m = re.fullmatch(r"__B(\d+)__", s)
        if m:
            continue
        # 복원
        for i, b in enumerate(blocks):
            s = s.replace(f"__B{i}__", b)
        out.append(s)
        # 괄호 안 국가도 링크용으로 추가
        inner = re.search(r"\(([^)]*)\)", s)
        if inner:
            for sub in re.split(r"[,，/]", inner.group(1)):
                sub = sub.strip()
                if sub and sub not in out:
                    out.append(sub)
    return out


def country_key(label: str) -> str:
    s = re.sub(r"\s+", "", label.strip())
    s2 = re.sub(r"\([^)]*\)", "", s).strip()
    return s2 or s


def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS clip_fta_agreement_doc (
          doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
          trty_srno TEXT NOT NULL,
          attachment_id TEXT NOT NULL UNIQUE,
          countries TEXT,
          primary_country TEXT,
          treaty_number TEXT,
          treaty_name TEXT,
          effective_date TEXT,
          lang TEXT,
          file_name TEXT,
          relative_path TEXT,
          file_ext TEXT,
          page_count INTEGER,
          content_text TEXT,
          content_chars INTEGER,
          content_sha256 TEXT,
          extract_status TEXT NOT NULL,
          extract_error TEXT,
          source_url TEXT,
          extracted_at TEXT,
          updated_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_fta_doc_trty
          ON clip_fta_agreement_doc(trty_srno);
        CREATE INDEX IF NOT EXISTS idx_fta_doc_country
          ON clip_fta_agreement_doc(primary_country);
        CREATE INDEX IF NOT EXISTS idx_fta_doc_lang
          ON clip_fta_agreement_doc(lang);
        CREATE INDEX IF NOT EXISTS idx_fta_doc_status
          ON clip_fta_agreement_doc(extract_status);

        CREATE TABLE IF NOT EXISTS clip_fta_agreement_country (
          country_key TEXT NOT NULL,
          country_label TEXT NOT NULL,
          trty_srno TEXT NOT NULL,
          doc_id INTEGER NOT NULL,
          treaty_number TEXT,
          treaty_name TEXT,
          lang TEXT,
          is_primary INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (country_key, doc_id),
          FOREIGN KEY (doc_id) REFERENCES clip_fta_agreement_doc(doc_id)
        );
        CREATE INDEX IF NOT EXISTS idx_fta_cty_trty
          ON clip_fta_agreement_country(trty_srno);
        CREATE INDEX IF NOT EXISTS idx_fta_cty_key
          ON clip_fta_agreement_country(country_key);
        """
    )
    cols = {
        c[1]
        for c in conn.execute("PRAGMA table_info(clip_fta_agreement_doc)").fetchall()
    }
    if "category_name" not in cols:
        conn.execute(
            "ALTER TABLE clip_fta_agreement_doc ADD COLUMN category_name TEXT"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_fta_doc_cat "
            "ON clip_fta_agreement_doc(category_name)"
        )
        conn.commit()


def sync_attachment_paths(conn: sqlite3.Connection, db_path: Path) -> int:
    """디스크에 있는 첨부 → clip_treaty_attachments.relative_path / downloaded."""
    attach_root = db_path.parent / "attachments" / "조약협정"
    if not attach_root.exists():
        print("첨부 루트 없음:", attach_root)
        return 0

    # attachment_id 로 파일 인덱스
    by_id: dict[str, Path] = {}
    for p in attach_root.rglob("*"):
        if not p.is_file() or p.suffix.lower() == ".part":
            continue
        # {attachment_id}__{filename} or just match folder
        name = p.name
        if "__" in name:
            aid = name.split("__", 1)[0]
            by_id[aid] = p
        else:
            # folder is trty_srno; try stem
            pass

    updated = 0
    rows = conn.execute(
        "SELECT attachment_id, trty_srno, file_name, relative_path, download_status "
        "FROM clip_treaty_attachments"
    ).fetchall()
    for aid, trty, fname, rel, status in rows:
        p = by_id.get(aid)
        if p is None:
            # fallback: trty_srno/aid*
            folder = attach_root / str(trty)
            if folder.is_dir():
                hits = list(folder.glob(f"{aid}*"))
                if hits:
                    p = hits[0]
        if p is None or not p.is_file():
            continue
        rel_new = str(p.relative_to(db_path.parent)).replace("\\", "/")
        size = p.stat().st_size
        conn.execute(
            """
            UPDATE clip_treaty_attachments
            SET relative_path = ?,
                file_size_bytes = ?,
                download_status = 'downloaded',
                last_error = NULL,
                downloaded_at = COALESCE(downloaded_at, ?),
                updated_at = ?
            WHERE attachment_id = ?
            """,
            (rel_new, size, utc_now(), utc_now(), aid),
        )
        updated += 1
    conn.commit()
    return updated


def _join_spans(spans: list[dict]) -> str:
    parts: list[str] = []
    prev_x1: float | None = None
    for s in sorted(spans, key=lambda x: x["bbox"][0]):
        t = s.get("text") or ""
        if not t:
            continue
        x0, _, x1, _ = s["bbox"]
        if prev_x1 is not None and x0 - prev_x1 > 3.0:
            left = parts[-1][-1] if parts and parts[-1] else ""
            right = t[0]
            if left.isascii() and right.isascii() and left.isalnum() and right.isalnum():
                parts.append(" ")
            elif x0 - prev_x1 > 12:
                parts.append(" ")
        parts.append(t)
        prev_x1 = x1
    return "".join(parts)


def _heal_date_tokens(run: list[str]) -> str:
    labels = [
        x
        for x in run
        if not re.fullmatch(r"\d+", x) and not re.fullmatch(r"\[\s*\d+\s*\]", x)
    ]
    nums = [x for x in run if re.fullmatch(r"\d+", x)]
    brackets = [x for x in run if re.fullmatch(r"\[\s*\d+\s*\]", x)]
    lab = "".join(labels)
    if "년" in lab and "월" in lab and "일" in lab and len(nums) >= 3:
        y, m, d = nums[0], nums[1], nums[2]
        rest = ""
        if "제" in lab and "회" in lab:
            n = brackets[0] if brackets else (nums[3] if len(nums) > 3 else "")
            rest = f" 제{n}회" if n else ""
        return f"{y}년 {m}월 {d}일{rest}".strip()
    if all(len(x) <= 2 for x in run):
        return "".join(run)
    return " ".join(run)


def _collapse_short_runs(lines: list[str]) -> list[str]:
    """PDF가 세로로 쪼갠 '년/월/일/제/회' 등을 한 줄로 복원."""
    out: list[str] = []
    i = 0
    while i < len(lines):
        t = lines[i].strip()
        if not t:
            out.append("")
            i += 1
            continue
        if len(t) <= 4:
            run = [t]
            j = i + 1
            while j < len(lines):
                u = lines[j].strip()
                if not u or len(u) > 4:
                    break
                run.append(u)
                j += 1
            if len(run) >= 3:
                out.append(_heal_date_tokens(run))
                i = j
                continue
        out.append(t)
        i += 1
    return out


def _extract_page_lines(page) -> list[str]:
    """동일 Y의 span을 한 줄로 모아 읽기 순서를 복원."""
    d = page.get_text("dict", sort=True)
    items: list[tuple[float, float, str]] = []
    for block in d.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            text = _join_spans(line.get("spans") or []).strip()
            if not text:
                continue
            items.append((line["bbox"][1], line["bbox"][0], text))
    if not items:
        return []
    items.sort(key=lambda t: (round(t[0] / 3.0) * 3.0, t[1]))
    lines: list[str] = []
    cur_y: float | None = None
    cur_parts: list[tuple[float, str]] = []

    def flush() -> None:
        nonlocal cur_parts
        if not cur_parts:
            return
        cur_parts.sort(key=lambda p: p[0])
        buf: list[str] = []
        for i, (x, t) in enumerate(cur_parts):
            if i > 0:
                gap = x - cur_parts[i - 1][0]
                if gap > 40:
                    buf.append("  ")
                elif (
                    gap > 8
                    and buf
                    and buf[-1]
                    and buf[-1][-1].isascii()
                    and t[:1].isascii()
                ):
                    buf.append(" ")
            buf.append(t)
        lines.append("".join(buf))
        cur_parts = []

    for y, x, text in items:
        ykey = round(y / 3.0) * 3.0
        if cur_y is None or abs(ykey - cur_y) > 2.5:
            flush()
            cur_y = ykey
        cur_parts.append((x, text))
    flush()
    return _collapse_short_runs(lines)


def _soften_glued_text(s: str) -> str:
    """한·영·숫자 붙음, '가.국문' 형태를 가볍게 띄움."""
    s = re.sub(r"([가-힣])\.([가-힣A-Za-z])", r"\1. \2", s)
    s = re.sub(r"([가-힣])([A-Za-z])", r"\1 \2", s)
    s = re.sub(r"([A-Za-z])([가-힣])", r"\1 \2", s)
    s = re.sub(r"([가-힣])(\d)", r"\1 \2", s)
    s = re.sub(r"(\d)([가-힣])", r"\1 \2", s)
    s = re.sub(r"[ \t]{2,}", "  ", s)
    return s


def extract_pdf_text(path: Path) -> tuple[str, int]:
    doc = pymupdf.open(str(path))
    try:
        parts: list[str] = []
        for page in doc:
            lines = _extract_page_lines(page)
            if lines:
                parts.append("\n".join(lines))
        text = "\n\n".join(parts)
        text = _soften_glued_text(text)
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        return text, doc.page_count
    finally:
        doc.close()


def _utf16_visible(data: bytes) -> str:
    s = data.decode("utf-16-le", errors="ignore")
    out: list[str] = []
    for ch in s:
        o = ord(ch)
        if ch in "\n\r":
            out.append("\n")
        elif ch == "\t":
            out.append(" ")
        elif (
            0x20 <= o <= 0x7E
            or 0xAC00 <= o <= 0xD7A3
            or 0x3131 <= o <= 0x318E
            or o
            in (
                0x3000,
                0x201C,
                0x201D,
                0x2018,
                0x2019,
                0x00B7,
                0x2022,
            )
        ):
            out.append(ch)
        elif ch in "·•○●※【】〔〕<>()[]{}.,;:%/-~'\"“”‘’":
            out.append(ch)
    text = "".join(out)
    text = re.sub(r"[^\S\n]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _clean_hwp_noise(text: str, lang: str) -> str:
    if lang == "EN":
        # 영문 HWP에 섞인 한글 잔여 바이트 제거
        text = re.sub(r"[가-힣]+", "", text)
    text = re.sub(r"[\ue000-\uf8ff]", "", text)
    text = re.sub(r"[^\S\n]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_hwpx_text(path: Path) -> str:
    texts: list[str] = []
    with zipfile.ZipFile(path) as z:
        names = sorted(
            n for n in z.namelist() if "section" in n.lower() and n.endswith(".xml")
        )
        for n in names:
            root = ET.fromstring(z.read(n))
            for el in root.iter():
                if el.text and re.search(r"[가-힣A-Za-z0-9]", el.text):
                    texts.append(el.text.strip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(texts)).strip()


def _hwp_is_compressed(ole: "olefile.OleFileIO") -> bool:
    try:
        hdr = ole.openstream("FileHeader").read()
        return bool(hdr[36] & 1) if len(hdr) > 36 else True
    except Exception:
        return True


def _hwp_decompress_section(data: bytes, compressed: bool) -> bytes:
    if not compressed:
        return data
    for wbits in (-15, 15):
        for off in (0, 1, 2, 4):
            try:
                return zlib.decompress(data[off:], wbits)
            except Exception:
                continue
    return data


def _hwp_para_text_from_section(raw: bytes) -> list[str]:
    """BodyText 섹션에서 HWPTAG_PARA_TEXT(0x43) 만 추출."""
    import struct

    texts: list[str] = []
    i = 0
    n = len(raw)
    while i + 4 <= n:
        header = struct.unpack_from("<I", raw, i)[0]
        tag = header & 0x3FF
        size = (header >> 20) & 0xFFF
        hdr_len = 4
        if size == 0xFFF:
            if i + 8 > n:
                break
            size = struct.unpack_from("<I", raw, i + 4)[0]
            hdr_len = 8
        start = i + hdr_len
        end = start + size
        if end > n or size < 0:
            break
        if tag == 0x43 and size >= 2:  # PARA_TEXT
            try:
                s = raw[start:end].decode("utf-16-le", errors="ignore")
            except Exception:
                s = ""
            # 인라인 컨트롤·비표시 문자 정리
            s = "".join(
                ch if (ch in "\n\r\t" or (ord(ch) >= 0x20 and ord(ch) != 0x7F)) else " "
                for ch in s
            )
            s = s.replace("\r", "\n").strip()
            if s:
                texts.append(s)
        i = end
    return texts


def extract_hwp_text(path: Path, lang: str = "UNKNOWN") -> str:
    """HWP5(OLE) / HWPX 텍스트 추출. olefile 필요."""
    if path.suffix.lower() == ".hwpx":
        return _clean_hwp_noise(extract_hwpx_text(path), lang)
    if olefile is None:
        raise RuntimeError("olefile 미설치 — pip install olefile")
    if not olefile.isOleFile(str(path)):
        raise RuntimeError("OLE HWP 형식이 아님")
    ole = olefile.OleFileIO(str(path))
    chunks: list[str] = []
    try:
        compressed = _hwp_is_compressed(ole)
        entries = [e for e in ole.listdir() if e and e[0] == "BodyText"]
        entries.sort(
            key=lambda e: int(re.sub(r"\D", "", e[1] or "0") or "0")
            if len(e) > 1
            else 0
        )
        for entry in entries:
            data = ole.openstream(entry).read()
            raw = _hwp_decompress_section(data, compressed)
            paras = _hwp_para_text_from_section(raw)
            if paras:
                chunks.extend(paras)
            else:
                # 레코드 파싱 실패 시 가시문자 폴백
                t = _utf16_visible(raw)
                if t:
                    chunks.append(t)
    finally:
        ole.close()
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(chunks)).strip()
    return _clean_hwp_noise(text, lang)


def extract_attachment_text(
    path: Path, ext: str, lang: str
) -> tuple[str, int | None, str]:
    """returns (text, page_count_or_none, status_if_empty_reason)."""
    ext = ext.lower()
    if ext == ".pdf":
        text, pages = extract_pdf_text(path)
        if len(text) < 40:
            return text, pages, "empty_text"
        return text, pages, "ok"
    if ext in (".hwp", ".hwpx"):
        text = extract_hwp_text(path, lang=lang)
        if len(text) < 40:
            return text, None, "empty_text"
        return text, None, "ok"
    return "", None, "skipped_non_pdf"


def rebuild_country_index(conn: sqlite3.Connection) -> int:
    conn.execute("DELETE FROM clip_fta_agreement_country")
    n = 0
    for doc_id, trty, countries, tno, tname, lang in conn.execute(
        """
        SELECT doc_id, trty_srno, countries, treaty_number, treaty_name, lang
        FROM clip_fta_agreement_doc
        """
    ):
        primary = split_countries(countries or "")
        for i, label in enumerate(primary):
            conn.execute(
                """
                INSERT OR REPLACE INTO clip_fta_agreement_country (
                  country_key, country_label, trty_srno, doc_id,
                  treaty_number, treaty_name, lang, is_primary
                ) VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    country_key(label),
                    label,
                    trty,
                    doc_id,
                    tno,
                    tname,
                    lang,
                    1 if i == 0 else 0,
                ),
            )
            n += 1
    conn.commit()
    return n


def ingest_fta(
    conn: sqlite3.Connection,
    db_path: Path,
    *,
    force: bool = False,
    categories: list[str] | None = None,
    only_ext: set[str] | None = None,
) -> dict:
    attach_root = db_path.parent
    cats = categories or list(ALL_CATEGORIES)
    stats = {
        "candidates": 0,
        "ok": 0,
        "skipped_non_pdf": 0,
        "error": 0,
        "unchanged": 0,
        "empty_text": 0,
        "categories": ",".join(cats),
    }

    placeholders = ",".join("?" * len(cats))
    rows = conn.execute(
        f"""
        SELECT t.trty_srno, t.treaty_name, t.countries, t.treaty_number,
               t.effective_date, t.source_url, t.category_name,
               a.attachment_id, a.file_name, a.relative_path, a.download_status
        FROM clip_treaties t
        JOIN clip_treaty_attachments a ON a.trty_srno = t.trty_srno
        WHERE TRIM(IFNULL(t.category_name,'')) IN ({placeholders})
        ORDER BY t.category_name, t.countries, t.treaty_number, a.file_name
        """,
        cats,
    ).fetchall()

    for (
        trty,
        tname,
        countries,
        tno,
        ef,
        src,
        category_name,
        aid,
        fname,
        rel,
        status,
    ) in rows:
        lang = detect_lang(fname or "")
        ext = Path(fname or "").suffix.lower()
        if only_ext and ext not in only_ext:
            continue
        stats["candidates"] += 1
        primary = split_countries(countries or "")
        primary_country = primary[0] if primary else ""

        abs_path: Path | None = None
        if rel:
            abs_path = (attach_root / rel.replace("\\", "/")).resolve()
            if not abs_path.exists():
                abs_path = None
        if abs_path is None:
            # try discover
            guess_dir = attach_root / "attachments" / "조약협정" / str(trty)
            if guess_dir.is_dir():
                hits = list(guess_dir.glob(f"{aid}*"))
                if hits:
                    abs_path = hits[0]
                    rel = str(abs_path.relative_to(attach_root)).replace("\\", "/")

        if abs_path is None or not abs_path.exists():
            conn.execute(
                """
                INSERT INTO clip_fta_agreement_doc (
                  trty_srno, attachment_id, countries, primary_country,
                  treaty_number, treaty_name, effective_date, lang, file_name,
                  relative_path, file_ext, page_count, content_text, content_chars,
                  content_sha256, extract_status, extract_error, source_url,
                  extracted_at, updated_at, category_name
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(attachment_id) DO UPDATE SET
                  category_name=excluded.category_name,
                  extract_status='missing_file',
                  extract_error='파일 없음',
                  updated_at=excluded.updated_at
                """,
                (
                    trty,
                    aid,
                    countries,
                    primary_country,
                    tno,
                    tname,
                    ef,
                    lang,
                    fname,
                    rel,
                    ext,
                    None,
                    None,
                    0,
                    None,
                    "missing_file",
                    "파일 없음",
                    src,
                    utc_now(),
                    utc_now(),
                    category_name,
                ),
            )
            stats["error"] += 1
            continue

        if not force:
            prev = conn.execute(
                "SELECT content_sha256, extract_status FROM clip_fta_agreement_doc "
                "WHERE attachment_id=?",
                (aid,),
            ).fetchone()
            # 이미 ok 인 PDF/HWP 는 스킵 (미추출 HWP·신규만 처리)
            if prev and prev[1] == "ok" and not force:
                stats["unchanged"] += 1
                continue
        else:
            prev = None

        try:
            if ext not in (".pdf", ".hwp", ".hwpx"):
                status_ex = "skipped_non_pdf"
                err_ex = f"지원하지 않는 형식({ext})"
                text, pages = "", None
                stats["skipped_non_pdf"] += 1
            else:
                text, pages, status_ex = extract_attachment_text(abs_path, ext, lang)
                err_ex = None
                if status_ex == "empty_text":
                    err_ex = "텍스트 추출 결과 부족(스캔/손상/바이너리)"
                    stats["empty_text"] += 1
                elif status_ex == "ok":
                    stats["ok"] += 1
                else:
                    stats["skipped_non_pdf"] += 1
                    err_ex = status_ex

            sha = hashlib.sha256(text.encode("utf-8")).hexdigest() if text else ""
            if (
                prev
                and prev[0] == sha
                and prev[1] == status_ex
                and not force
            ):
                stats["unchanged"] += 1
                continue

            conn.execute(
                """
                INSERT INTO clip_fta_agreement_doc (
                  trty_srno, attachment_id, countries, primary_country,
                  treaty_number, treaty_name, effective_date, lang, file_name,
                  relative_path, file_ext, page_count, content_text, content_chars,
                  content_sha256, extract_status, extract_error, source_url,
                  extracted_at, updated_at, category_name
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(attachment_id) DO UPDATE SET
                  trty_srno=excluded.trty_srno,
                  countries=excluded.countries,
                  primary_country=excluded.primary_country,
                  treaty_number=excluded.treaty_number,
                  treaty_name=excluded.treaty_name,
                  effective_date=excluded.effective_date,
                  lang=excluded.lang,
                  file_name=excluded.file_name,
                  relative_path=excluded.relative_path,
                  file_ext=excluded.file_ext,
                  page_count=excluded.page_count,
                  content_text=excluded.content_text,
                  content_chars=excluded.content_chars,
                  content_sha256=excluded.content_sha256,
                  extract_status=excluded.extract_status,
                  extract_error=excluded.extract_error,
                  source_url=excluded.source_url,
                  extracted_at=excluded.extracted_at,
                  updated_at=excluded.updated_at,
                  category_name=excluded.category_name
                """,
                (
                    trty,
                    aid,
                    countries,
                    primary_country,
                    tno,
                    tname,
                    ef,
                    lang,
                    fname,
                    rel,
                    ext,
                    pages,
                    text,
                    len(text),
                    sha,
                    status_ex,
                    err_ex,
                    src,
                    utc_now(),
                    utc_now(),
                    category_name,
                ),
            )
            print(
                f"{status_ex.upper()} [{category_name}] {trty} {primary_country} "
                f"{lang} chars={len(text)} {fname}"
            )
        except Exception as e:
            conn.execute(
                """
                INSERT INTO clip_fta_agreement_doc (
                  trty_srno, attachment_id, countries, primary_country,
                  treaty_number, treaty_name, effective_date, lang, file_name,
                  relative_path, file_ext, page_count, content_text, content_chars,
                  content_sha256, extract_status, extract_error, source_url,
                  extracted_at, updated_at, category_name
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(attachment_id) DO UPDATE SET
                  category_name=excluded.category_name,
                  extract_status='error',
                  extract_error=excluded.extract_error,
                  updated_at=excluded.updated_at
                """,
                (
                    trty,
                    aid,
                    countries,
                    primary_country,
                    tno,
                    tname,
                    ef,
                    lang,
                    fname,
                    rel,
                    ext,
                    None,
                    None,
                    0,
                    None,
                    "error",
                    str(e)[:500],
                    src,
                    utc_now(),
                    utc_now(),
                    category_name,
                ),
            )
            stats["error"] += 1
            print("ERR", category_name, aid, fname, e)

    conn.commit()
    print("rebuild country index …")
    stats["country_links"] = rebuild_country_index(conn)
    return stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--skip-sync", action="store_true")
    ap.add_argument(
        "--categories",
        default="all",
        help="all 또는 쉼표구분: FTA협정,양자조약,다자조약,세관상호지원협정",
    )
    ap.add_argument(
        "--only-ext",
        default="",
        help="쉼표구분 확장자만 처리 예: .hwp,.hwpx",
    )
    args = ap.parse_args()
    if not args.db.exists():
        raise SystemExit(f"DB 없음: {args.db}")

    if args.categories.strip().lower() == "all":
        cats = list(ALL_CATEGORIES)
    else:
        cats = [c.strip() for c in args.categories.split(",") if c.strip()]
    only_ext = {
        e.strip().lower() if e.strip().startswith(".") else f".{e.strip().lower()}"
        for e in args.only_ext.split(",")
        if e.strip()
    } or None

    conn = sqlite3.connect(str(args.db))
    conn.execute("PRAGMA journal_mode=WAL")
    ensure_tables(conn)

    if not args.skip_sync:
        n = sync_attachment_paths(conn, args.db)
        print("synced attachments", n)

    # FTA 는 이미 ok 면 유지, 나머지·미추출만 처리 (force 시 전체)
    stats = ingest_fta(
        conn, args.db, force=args.force, categories=cats, only_ext=only_ext
    )
    print("ingest", stats)

    summary = conn.execute(
        """
        SELECT COALESCE(category_name,'(null)'), extract_status, COUNT(*),
               COALESCE(SUM(content_chars),0)
        FROM clip_fta_agreement_doc
        GROUP BY 1,2 ORDER BY 1,2
        """
    ).fetchall()
    print("by category/status:")
    for r in summary:
        print(" ", r)
    print(
        "total docs",
        conn.execute("SELECT COUNT(*) FROM clip_fta_agreement_doc").fetchone()[0],
    )
    print(
        "countries",
        conn.execute(
            "SELECT COUNT(DISTINCT country_key) FROM clip_fta_agreement_country"
        ).fetchone()[0],
    )
    conn.close()


if __name__ == "__main__":
    main()
