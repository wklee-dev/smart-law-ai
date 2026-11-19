"""
HS 해설 SQLite 점검: 경로 확인, 테이블 목록, hs_manual_gnpr(통칙) 적용연도별 건수.

사용법:
    python app/hs-commentary/inspect_hs_manual.py
    cd app/hs-commentary && python inspect_hs_manual.py
    python inspect_hs_manual.py --year 2026 --gnpr-preview 500
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from db_path import hs_manual_db_path  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="HS 해설 DB 점검")
    ap.add_argument(
        "--year",
        type=str,
        default=None,
        help="통칙(gnpr) 미리보기 시 해당 aply_year (미지정이면 각 연도별 건수만)",
    )
    ap.add_argument(
        "--gnpr-preview",
        type=int,
        default=0,
        metavar="N",
        help="지정 연도 통칙 국문 앞 N자 출력 (예: 2)",
    )
    args = ap.parse_args()

    path = hs_manual_db_path()
    print(f"[HS_MANUAL_DB_PATH] {path}")
    if not path.is_file():
        print("파일이 없습니다. 경로와 .env.local 을 확인하세요.", file=sys.stderr)
        return 1

    uri = path.resolve().as_uri() + "?mode=ro"
    con = sqlite3.connect(uri, uri=True)
    cur = con.cursor()

    tables = [
        row[0]
        for row in cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        ).fetchall()
    ]
    hs_tables = [t for t in tables if "hs_manual" in t or t == "hs_manual_meta"]
    print(f"[표 개수] {len(tables)} (전체)")
    if hs_tables:
        print("[hs 관련 표]", ", ".join(hs_tables[:30]) + ("…" if len(hs_tables) > 30 else ""))

    if "hs_manual_gnpr" in tables:
        rows = cur.execute(
            """SELECT aply_year, COUNT(*) AS n FROM hs_manual_gnpr
               GROUP BY aply_year ORDER BY CAST(aply_year AS INTEGER) DESC"""
        ).fetchall()
        print("[hs_manual_gnpr] 적용연도별 행 수")
        for yr, n in rows:
            print(f"  {yr}: {n}")
        yr = args.year
        if yr:
            langs = ["kor", "eng"]
            counts = dict(
                cur.execute(
                    "SELECT lang_code, COUNT(*) FROM hs_manual_gnpr WHERE aply_year = ? GROUP BY lang_code",
                    (yr,),
                ).fetchall()
            )
            print(f"[aply_year={yr}] 언어별: {counts}")
            if args.gnpr_preview > 0:
                for lang in langs:
                    one = cur.execute(
                        """SELECT gnpr_srno, substr(content_text, 1, ?) FROM hs_manual_gnpr
                           WHERE aply_year = ? AND lang_code = ? ORDER BY CAST(gnpr_srno AS INTEGER)
                           LIMIT 3""",
                        (args.gnpr_preview + 120, yr, lang),
                    ).fetchall()
                    print(f"  미리보기 ({lang})", one[:1] if one else "(없음)")
    else:
        print("(hs_manual_gnpr 표 없음 — 통칙은 이 DB에 포함되지 않았을 수 있습니다.)")

    meta_n = (
        cur.execute("SELECT COUNT(*) FROM hs_manual_meta").fetchone()[0]
        if "hs_manual_meta" in tables
        else 0
    )
    print(f"[hs_manual_meta] 행 수: {meta_n}")

    con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
