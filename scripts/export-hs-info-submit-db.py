# -*- coding: utf-8 -*-
"""속견표·HS해설서·관세율표·품목분류 국내사례 → 별도 제출용 SQLite + 메타."""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_SRC = Path(r"D:/SQLiteDB/smart_law_ai.db")
DEFAULT_OUT_DIR = Path(r"D:/Manus/HS정보_제출패키지")
DEFAULT_DB_NAME = "hs_info_submit.db"

# 속견표 UI(hs-chapter-short-labels.ts)와 동일
HS_CHAPTER_SHORT_LABELS: dict[str, str] = {
    "01": "산동물",
    "02": "육과식용설육",
    "03": "어패류",
    "04": "낙농품·조란·천연",
    "05": "기타 동물성 생산품",
    "06": "산수목·꽃",
    "07": "채소",
    "08": "과실·견과류",
    "09": "커피·향신료",
    "10": "곡물",
    "11": "밀가루·전분",
    "12": "채유용종자·인삼",
    "13": "식물성엑스",
    "14": "기타식물성 생산품",
    "15": "동식물성유지",
    "16": "육·어류 조제품",
    "17": "당류 설탕과자",
    "18": "코코아초코렛",
    "19": "곡물·곡분의 주제품과빵류",
    "20": "채소·과실의 조제품",
    "21": "기타의 조제식료품",
    "22": "음료·주류·식초",
    "23": "조제사료",
    "24": "담배",
    "25": "토석류·소금",
    "26": "광·슬랙·회",
    "27": "광물성 연료 에너지",
    "28": "무기화합물",
    "29": "유기화합물",
    "30": "의료용품",
    "31": "비료",
    "32": "염료·안료, 페인트·잉크",
    "33": "향료 화장품",
    "34": "비누, 계면활성제, 왁스",
    "35": "카세인 알부민 변성전분 효소",
    "36": "화약류·성냥",
    "37": "필름인화지 사진용재료",
    "38": "각종 화학공업 생산품",
    "39": "플라스틱과 그 제품",
    "40": "고무와 그 제품",
    "41": "원피가죽",
    "42": "가죽제품",
    "43": "모피·모피제품",
    "44": "목재·목탄",
    "45": "코르크와 그 제품",
    "46": "조물재료의 제품",
    "47": "펄프",
    "48": "지와 판지",
    "49": "서적·신문 인쇄물",
    "50": "견·견사 견직물",
    "51": "양모·수모",
    "52": "면·면사 면직물",
    "53": "마류의사와직물",
    "54": "인조 필라멘트 섬유",
    "55": "인조스테이플 섬유",
    "56": "워딩부직포",
    "57": "양탄자",
    "58": "특수·직물",
    "59": "침투 도포한 직물",
    "60": "편물",
    "61": "의류(편물제)",
    "62": "의류(편물제외)",
    "63": "기타 섬유제품,넝마",
    "64": "신발류",
    "65": "모자류",
    "66": "우산·지팡이",
    "67": "조제 우모 인조제품",
    "68": "석·시멘트 석면제품",
    "69": "도자 제품",
    "70": "유리",
    "71": "귀석·반귀석,귀금속",
    "72": "철강",
    "73": "철강제품",
    "74": "동과그제품",
    "75": "니켈과 그 제품",
    "76": "알루미늄과 그 제품",
    "77": "(유보)",
    "78": "연과 그 제품",
    "79": "아연과 그 제품",
    "80": "주석과 그 제품",
    "81": "기타의 비금속",
    "82": "비금속제공구·스푼·포크",
    "83": "각종 비금속 제품",
    "84": "보일러 기계류",
    "85": "전기기기 TV·VTR",
    "86": "철도차량",
    "87": "일반차량",
    "88": "항공기",
    "89": "선박",
    "90": "광학/의료 측정·검사",
    "91": "시계",
    "92": "악기",
    "93": "무기",
    "94": "가구류 조명기구",
    "95": "완구·운동용품",
    "96": "잡품",
    "97": "예술품 골동품",
}

COPY_FULL = [
    "hs_manual_meta",
    "hs_manual_content",
    "hs_manual_gnpr",
    "classification_cases",
]

# 관세율표: 구조 + 한국 세번 (세율상세·이미지는 용량으로 제외)
COPY_TARIFF_STRUCT = [
    "tariff_section",
    "tariff_chapter",
    "tariff_heading",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def copy_table_simple(dst: sqlite3.Connection, name: str, where: str = "") -> int:
    create = dst.execute(
        "SELECT sql FROM src.sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()
    if not create or not create[0]:
        raise SystemExit(f"소스에 테이블 없음: {name}")
    ddl = create[0]
    dst.execute(f"DROP TABLE IF EXISTS main.{name}")
    dst.execute(ddl)
    q = f"INSERT INTO main.{name} SELECT * FROM src.{name}"
    if where:
        q += f" WHERE {where}"
    cur = dst.execute(q)
    return cur.rowcount if cur.rowcount is not None and cur.rowcount >= 0 else int(
        dst.execute(f"SELECT COUNT(*) FROM main.{name}").fetchone()[0]
    )


def ensure_quick_reference(dst: sqlite3.Connection) -> int:
    dst.executescript(
        """
        DROP TABLE IF EXISTS hs_quick_reference;
        CREATE TABLE hs_quick_reference (
          chapter_code TEXT PRIMARY KEY,
          short_label TEXT NOT NULL,
          grid_row INTEGER NOT NULL,
          grid_col INTEGER NOT NULL,
          note TEXT
        );
        """
    )
    rows = []
    for code, label in HS_CHAPTER_SHORT_LABELS.items():
        n = int(code)
        rows.append((code, label, (n // 10) * 10, n % 10, "Uni-PASS 속견표 류 약칭"))
    dst.executemany(
        "INSERT INTO hs_quick_reference(chapter_code, short_label, grid_row, grid_col, note) VALUES (?,?,?,?,?)",
        rows,
    )
    return len(rows)


def write_meta(dst: sqlite3.Connection, meta: dict[str, str]) -> None:
    dst.execute("DROP TABLE IF EXISTS package_meta")
    dst.execute(
        "CREATE TABLE package_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    )
    dst.executemany(
        "INSERT INTO package_meta(key, value) VALUES (?, ?)",
        list(meta.items()),
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    ap.add_argument("--db-name", default=DEFAULT_DB_NAME)
    ap.add_argument(
        "--tariff-country",
        default="KR",
        help="관세율표 세번 데이터 국가코드 (기본 KR). all 이면 전체",
    )
    ap.add_argument(
        "--no-tariff",
        action="store_true",
        help="관세율표 테이블(tariff_*) 제외",
    )
    args = ap.parse_args()
    if not args.src.exists():
        raise SystemExit(f"소스 DB 없음: {args.src}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    out = args.out_dir / args.db_name
    if out.exists():
        out.unlink()

    print("SRC", args.src)
    print("OUT", out)

    dst = sqlite3.connect(str(out))
    dst.execute("PRAGMA journal_mode=OFF")
    dst.execute("PRAGMA synchronous=OFF")
    dst.execute("ATTACH DATABASE ? AS src", (str(args.src),))

    counts: dict[str, int] = {}

    print("속견표 hs_quick_reference …")
    counts["hs_quick_reference"] = ensure_quick_reference(dst)

    for name in COPY_FULL:
        print(f"copy {name} …")
        counts[name] = copy_table_simple(dst, name)

    excluded = [
        "case_images (이미지 BLOB, 원본 DB 약 317MB)",
    ]
    tariff_filter = ""
    menus = "속견표, HS해설서, 품목분류 국내사례"
    pkg_name = "HS정보 제출용 SQLite (속견표·HS해설서·국내사례)"

    if args.no_tariff:
        excluded.insert(
            0,
            "관세율표 전체 (tariff_section, tariff_chapter, tariff_heading, tariff_item 등)",
        )
        tariff_filter = "excluded (--no-tariff)"
    else:
        menus = "속견표, HS해설서, 관세율표, 품목분류 국내사례"
        pkg_name = "HS정보 제출용 SQLite (속견표·HS해설서·관세율표·국내사례)"
        for name in COPY_TARIFF_STRUCT:
            print(f"copy {name} …")
            counts[name] = copy_table_simple(dst, name)

        print("copy tariff_item …")
        if args.tariff_country.lower() == "all":
            counts["tariff_item"] = copy_table_simple(dst, "tariff_item")
            tariff_filter = "all countries"
        else:
            counts["tariff_item"] = copy_table_simple(
                dst, "tariff_item", f"country_code = '{args.tariff_country}'"
            )
            tariff_filter = f"country_code={args.tariff_country}"
        excluded.extend(
            [
                "tariff_item_detail (세율상세, 수백만 건)",
                "tariff_req_condition / tariff_req_strategic 등 부가 테이블",
            ]
        )

    write_meta(
        dst,
        {
            "package_name": pkg_name,
            "package_version": "V1.1" if args.no_tariff else "V1.0",
            "source_db": str(args.src),
            "exported_at_utc": utc_now(),
            "tariff_item_filter": tariff_filter,
            "excluded": json.dumps(excluded, ensure_ascii=False),
            "row_counts": json.dumps(counts, ensure_ascii=False),
            "ui_menus": menus,
        },
    )

    dst.commit()
    dst.execute("DETACH DATABASE src")
    dst.execute("VACUUM")
    dst.close()

    size_mb = out.stat().st_size / 1024 / 1024
    print("counts", counts)
    print(f"OK {out} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
