# -*- coding: utf-8 -*-
"""cl_fta_psr 의 [참조] 링크(fta/id)를 cl_fta_psr_ref 에 백필.

1) CLHS 세션쿠키(CIEL_FTA_crawl/cookie_manual.txt 등)로 {fta}1.asp 파싱
2) 쿠키 실패 시: 류([참조] 있는 행) 수 == dtl 고유 id 수 이면 순서 zip
"""
from __future__ import annotations

import os
import re
import sqlite3
import time
import urllib.error
import urllib.request
from pathlib import Path

DB = Path(r"D:/SQLiteDB/smart_law_ai.db")
YEAR = "2026"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

COOKIE_CANDIDATES = [
    Path(r"D:/Crawling/CIEL_FTA_crawl/cookie_manual.txt"),
    Path(r"D:/Crawling/CIEL_FTA_crawl/cookie/cl_session.txt"),
]

DDL = """
CREATE TABLE IF NOT EXISTS cl_fta_psr_ref (
    fta_cd     TEXT NOT NULL,
    hs2        TEXT NOT NULL,
    ref_fta    TEXT NOT NULL,
    psr_id     TEXT NOT NULL,
    seq_no     INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (fta_cd, hs2, ref_fta, psr_id)
)
"""


def load_cookie() -> str:
    env = os.environ.get("CLHS_COOKIE", "").strip()
    if env:
        return env
    for p in COOKIE_CANDIDATES:
        if not p.is_file():
            continue
        lines = [
            ln.strip()
            for ln in p.read_text(encoding="utf-8", errors="replace").splitlines()
            if ln.strip() and not ln.strip().startswith("#")
        ]
        if not lines:
            continue
        raw = lines[0]
        if raw.lower().startswith("cookie:"):
            raw = raw.split(":", 1)[1].strip()
        # LWPCookieJar dump → skip
        if raw.startswith("#LWP") or "Set-Cookie3" in raw:
            continue
        return raw
    return ""


def fetch(url: str, cookie: str) -> str:
    headers = {"User-Agent": UA}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    for enc in ("utf-8", "euc-kr", "cp949"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def is_login_page(html: str) -> bool:
    head = html[:4000].lower()
    return (
        "login.asp" in head
        or len(html) < 200
        or "로그인이 필요" in html
    )


def parse_refs_from_table(html: str) -> list[tuple[str, str, str]]:
    """return [(hs2, ref_fta, psr_id), ...] from table1 rows."""
    m = re.search(r'id="table1"(.*?)</table>', html, flags=re.S | re.I)
    if not m:
        # fallback: any psrdetail on page + strHS context
        refs = re.findall(
            r"psrdetail\.asp\?fta=([A-Z0-9]+)&(?:amp;)?id=(\d+)", html, flags=re.I
        )
        return [("", f.upper(), i) for f, i in refs]

    out: list[tuple[str, str, str]] = []
    for tr in re.findall(r"<tr.*?</tr>", m.group(1), flags=re.S | re.I):
        cells = re.findall(r"<td.*?</td>", tr, flags=re.S | re.I)
        if not cells:
            continue
        hs_m = re.search(r">\s*(\d{2})\s*<", cells[0])
        if not hs_m:
            text0 = re.sub(r"<[^>]+>", "", cells[0]).strip()
            if not re.fullmatch(r"\d{2}", text0):
                continue
            hs2 = text0
        else:
            hs2 = hs_m.group(1)
        for f, i in re.findall(
            r"psrdetail\.asp\?fta=([A-Z0-9]+)&(?:amp;)?id=(\d+)", tr, flags=re.I
        ):
            out.append((hs2, f.upper(), i))
    return out


def save_refs(
    con: sqlite3.Connection,
    fta_cd: str,
    hs2: str,
    refs: list[tuple[str, str]],
) -> None:
    con.execute(
        "DELETE FROM cl_fta_psr_ref WHERE fta_cd=? AND hs2=?", (fta_cd, hs2)
    )
    for seq, (ref_fta, psr_id) in enumerate(refs, start=1):
        con.execute(
            """INSERT OR REPLACE INTO cl_fta_psr_ref
               (fta_cd, hs2, ref_fta, psr_id, seq_no)
               VALUES (?,?,?,?,?)""",
            (fta_cd, hs2, ref_fta, psr_id, seq),
        )


def backfill_via_http(con: sqlite3.Connection, cookie: str) -> tuple[int, int, int]:
    rows = con.execute(
        """SELECT fta_cd, hs2 FROM cl_fta_psr
            WHERE IFNULL(psr_txt,'') LIKE '%참조%'
            ORDER BY fta_cd, hs2"""
    ).fetchall()
    print(f"[HTTP] 대상 {len(rows)}건 cookie={'Y' if cookie else 'N'}")
    ok = fail = skip = 0
    for i, (fta_cd, hs2) in enumerate(rows, 1):
        exists = con.execute(
            "SELECT 1 FROM cl_fta_psr_ref WHERE fta_cd=? AND hs2=? LIMIT 1",
            (fta_cd, hs2),
        ).fetchone()
        if exists:
            skip += 1
            continue
        url = f"https://www.clhs.co.kr/Y{YEAR}/duty/{fta_cd}1.asp?strHS={hs2}"
        try:
            html = fetch(url, cookie)
            if is_login_page(html):
                fail += 1
                print(f"  [{i}] {fta_cd}/{hs2} LOGIN")
                if i <= 3:
                    print("로그인 필요 — HTTP 백필 중단, zip 폴백으로 전환")
                    break
                continue
            parsed = parse_refs_from_table(html)
            refs = [(rf, pid) for h, rf, pid in parsed if not h or h == hs2]
            if not refs and parsed:
                refs = [(rf, pid) for _, rf, pid in parsed]
            if not refs:
                fail += 1
                print(f"  [{i}] {fta_cd}/{hs2} refs=0")
            else:
                save_refs(con, fta_cd, hs2, refs)
                ok += 1
                if i <= 5 or i % 50 == 0:
                    print(f"  [{i}] {fta_cd}/{hs2} -> {refs}")
            con.commit()
            time.sleep(0.12)
        except Exception as e:  # noqa: BLE001
            fail += 1
            print(f"  [{i}] {fta_cd}/{hs2} ERR {e}")
            if isinstance(e, urllib.error.HTTPError) and e.code in (401, 403):
                break
    return ok, skip, fail


def backfill_via_zip(con: sqlite3.Connection) -> int:
    """류([참조]) 수 == dtl 고유 id 수 인 협정만 순서 zip."""
    ftas = [
        r[0]
        for r in con.execute(
            "SELECT DISTINCT fta_cd FROM cl_fta_psr ORDER BY 1"
        ).fetchall()
    ]
    n = 0
    for fta in ftas:
        hs2s = [
            r[0]
            for r in con.execute(
                """SELECT hs2 FROM cl_fta_psr
                    WHERE fta_cd=? AND IFNULL(psr_txt,'') LIKE '%참조%'
                    ORDER BY hs2""",
                (fta,),
            ).fetchall()
        ]
        ref_fta = f"{fta}1"
        ids = [
            r[0]
            for r in con.execute(
                """SELECT DISTINCT psr_id FROM cl_fta_psr_dtl
                    WHERE fta_cd=? ORDER BY CAST(psr_id AS INT)""",
                (ref_fta,),
            ).fetchall()
        ]
        if not hs2s or len(hs2s) != len(ids):
            print(f"[ZIP] {fta}: skip ref={len(hs2s)} dtl={len(ids)}")
            continue
        for hs2, psr_id in zip(hs2s, ids):
            exists = con.execute(
                "SELECT 1 FROM cl_fta_psr_ref WHERE fta_cd=? AND hs2=? LIMIT 1",
                (fta, hs2),
            ).fetchone()
            if exists:
                continue
            save_refs(con, fta, hs2, [(ref_fta, psr_id)])
            n += 1
        con.commit()
        print(f"[ZIP] {fta}: mapped {len(hs2s)} (new {n})")
    return n


def main() -> None:
    con = sqlite3.connect(str(DB))
    con.execute(DDL)
    cookie = load_cookie()
    ok, skip, fail = backfill_via_http(con, cookie)
    print(f"[HTTP] ok={ok} skip={skip} fail={fail}")
    zip_n = backfill_via_zip(con)
    print(f"[ZIP] new={zip_n}")
    total = con.execute("SELECT COUNT(*) FROM cl_fta_psr_ref").fetchone()[0]
    print(f"완료 ref_rows={total}")
    print(
        "FCL/21",
        con.execute(
            "SELECT * FROM cl_fta_psr_ref WHERE fta_cd='FCL' AND hs2='21'"
        ).fetchall(),
    )
    con.close()


if __name__ == "__main__":
    main()
