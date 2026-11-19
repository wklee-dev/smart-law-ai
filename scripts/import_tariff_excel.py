# -*- coding: utf-8 -*-
"""
관세율표 엑셀 → D:\\SQLiteDB\\smart_law_ai.db 적재

예:
  python scripts/import_tariff_excel.py
  python scripts/import_tariff_excel.py --countries US,EU,JP,CN,VN,ID,TH,MY
  python scripts/import_tariff_excel.py --excel-dir "D:/Manus/관세율/관세율표_엑셀" --db "D:/SQLiteDB/smart_law_ai.db"
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

try:
    import openpyxl
except ImportError:
    import subprocess
    import sys

    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
    import openpyxl

DEFAULT_EXCEL_DIR = Path(r"D:\Manus\관세율\관세율표_엑셀")
DEFAULT_DB = Path(r"D:\SQLiteDB\smart_law_ai.db")
COUNTRIES_JSON = Path(r"D:\SQLiteDB\countries.json")

# 파일명·엑셀 국가코드 → UI/DB 코드
NAME_TO_CODE: dict[str, str] = {
    "한국": "KR",
    "미국": "US",
    "EU": "EU",
    "유럽연합": "EU",
    "일본": "JP",
    "중국": "CN",
    "베트남": "VN",
    "인도": "IN",
    "인도네시아": "ID",
    "태국": "TH",
    "말레이시아": "MY",
    "영국": "GB",
    "대만": "TW",
    "호주": "AU",
    "캐나다": "CA",
    "멕시코": "MX",
    "필리핀": "PH",
    "싱가포르": "SG",
    "캄보디아": "KH",
    "라오스": "LA",
    "미얀마": "MM",
    "브루나이": "BN",
    "뉴질랜드": "NZ",
    "칠레": "CL",
    "페루": "PE",
    "콜롬비아": "CO",
    "코스타리카": "CR",
    "파나마": "PA",
    "니카라과": "NI",
    "온두라스": "HN",
    "엘살바도르": "SV",
    "브라질": "BR",
    "아르헨티나": "AR",
    "러시아": "RU",
    "스위스": "CH",
    "노르웨이": "NO",
    "아이슬란드": "IS",
    "이스라엘": "IL",
    "터키": "TR",
    "튀르키예": "TR",
    "남아프리카공화국": "ZA",
    "아랍에미리트": "AE",
    "아랍에메리트": "AE",
    "사우디아라비아": "SA",
    "몽골": "MN",
    "방글라데시": "BD",
    "우즈베키스탄": "UZ",
    "인도네시아": "ID",
}

EXCEL_CODE_TO_UI: dict[str, str] = {
    "KOR": "KR",
    "KR": "KR",
    "USA": "US",
    "US": "US",
    "CHN": "CN",
    "CN": "CN",
    "JPN": "JP",
    "JP": "JP",
    "EEC": "EU",
    "EU": "EU",
    "VNM": "VN",
    "VN": "VN",
    "IDN": "ID",
    "ID": "ID",
    "THA": "TH",
    "TH": "TH",
    "MYS": "MY",
    "MY": "MY",
    "IND": "IN",
    "IN": "IN",
    "GBR": "GB",
    "UK": "GB",
    "TWN": "TW",
    "AUS": "AU",
    "CAN": "CA",
    "MEX": "MX",
    "PHL": "PH",
    "SGP": "SG",
    "KHM": "KH",
    "LAO": "LA",
    "MMR": "MM",
    "BRN": "BN",
    "NZL": "NZ",
    "CHL": "CL",
    "PER": "PE",
    "COL": "CO",
    "CRI": "CR",
    "PAN": "PA",
    "NIC": "NI",
    "HND": "HN",
    "SLV": "SV",
    "BRA": "BR",
    "RUS": "RU",
    "CHE": "CH",
    "NOR": "NO",
    "ISL": "IS",
    "ISR": "IL",
    "TUR": "TR",
    "ZAF": "ZA",
    "ARE": "AE",
    "SAU": "SA",
    "MNG": "MN",
    "BGD": "BD",
    "UZB": "UZ",
}

CODE_TO_NAME: dict[str, str] = {
    "KR": "한국",
    "US": "미국",
    "EU": "유럽연합",
    "JP": "일본",
    "CN": "중국",
    "VN": "베트남",
    "IN": "인도",
    "ID": "인도네시아",
    "TH": "태국",
    "MY": "말레이시아",
    "GB": "영국",
    "TW": "대만",
    "AU": "호주",
    "CA": "캐나다",
    "MX": "멕시코",
    "PH": "필리핀",
    "SG": "싱가포르",
    "KH": "캄보디아",
    "LA": "라오스",
    "MM": "미얀마",
    "BN": "브루나이",
    "NZ": "뉴질랜드",
    "CL": "칠레",
    "PE": "페루",
    "CO": "콜롬비아",
    "CR": "코스타리카",
    "PA": "파나마",
    "NI": "니카라과",
    "HN": "온두라스",
    "SV": "엘살바도르",
    "BR": "브라질",
    "RU": "러시아",
    "CH": "스위스",
    "NO": "노르웨이",
    "IS": "아이슬란드",
    "IL": "이스라엘",
    "TR": "튀르키예",
    "ZA": "남아프리카공화국",
    "AE": "아랍에미리트",
    "SA": "사우디아라비아",
    "MN": "몽골",
    "BD": "방글라데시",
    "UZ": "우즈베키스탄",
}

# HS 류 → 부 (KR 2026 기준)
CHAPTER_TO_SECTION: dict[str, str] = {
    "01": "01",
    "02": "01",
    "03": "01",
    "04": "01",
    "05": "01",
    "06": "02",
    "07": "02",
    "08": "02",
    "09": "02",
    "10": "02",
    "11": "02",
    "12": "02",
    "13": "02",
    "14": "02",
    "15": "03",
    "16": "04",
    "17": "04",
    "18": "04",
    "19": "04",
    "20": "04",
    "21": "04",
    "22": "04",
    "23": "04",
    "24": "04",
    "25": "05",
    "26": "05",
    "27": "05",
    "28": "06",
    "29": "06",
    "30": "06",
    "31": "06",
    "32": "06",
    "33": "06",
    "34": "06",
    "35": "06",
    "36": "06",
    "37": "06",
    "38": "06",
    "39": "07",
    "40": "07",
    "41": "08",
    "42": "08",
    "43": "08",
    "44": "09",
    "45": "09",
    "46": "09",
    "47": "10",
    "48": "10",
    "49": "10",
    "50": "11",
    "51": "11",
    "52": "11",
    "53": "11",
    "54": "11",
    "55": "11",
    "56": "11",
    "57": "11",
    "58": "11",
    "59": "11",
    "60": "11",
    "61": "11",
    "62": "11",
    "63": "11",
    "64": "12",
    "65": "12",
    "66": "12",
    "67": "12",
    "68": "13",
    "69": "13",
    "70": "13",
    "71": "14",
    "72": "15",
    "73": "15",
    "74": "15",
    "75": "15",
    "76": "15",
    "77": "15",
    "78": "15",
    "79": "15",
    "80": "15",
    "81": "15",
    "82": "15",
    "83": "15",
    "84": "16",
    "85": "16",
    "86": "17",
    "87": "17",
    "88": "17",
    "89": "17",
    "90": "18",
    "91": "18",
    "92": "18",
    "93": "19",
    "94": "20",
    "95": "20",
    "96": "20",
    "97": "21",
    "98": "22",
    "99": "22",
}

SECTION_NAMES_KO: dict[str, str] = {
    "01": "제01부 살아 있는 동물과 동물성 생산품",
    "02": "제02부 식물성 생산품",
    "03": "제03부 동물성ㆍ식물성ㆍ미생물성 지방과 기름 및 이들의 분해생산물, 조제한 식용 지방과 동물성ㆍ식물성 왁스",
    "04": "제04부 조제 식료품, 음료ㆍ주류ㆍ식초, 담배ㆍ제조한 담배 대용물",
    "05": "제05부 광물성 생산품",
    "06": "제06부 화학공업이나 연관공업의 생산품",
    "07": "제07부 플라스틱과 그 제품, 고무와 그 제품",
    "08": "제08부 원피ㆍ가죽ㆍ모피와 이들의 제품, 마구, 여행용구ㆍ핸드백과 이와 유사한 용기, 동물 거트(gut)의 제품",
    "09": "제09부 목재와 그 제품, 목탄, 코르크와 그 제품, 짚ㆍ에스파르토나 그 밖의 조물 재료의 제품",
    "10": "제10부 목재나 그 밖의 섬유질 셀룰로오스재료의 펄프, 회수한 종이ㆍ판지, 종이ㆍ판지와 이들의 제품",
    "11": "제11부 방직용 섬유와 방직용 섬유의 제품",
    "12": "제12부 신발류ㆍ모자류ㆍ산류ㆍ지팡이ㆍ시트스틱ㆍ채찍과 이들의 부분품",
    "13": "제13부 돌ㆍ플라스터ㆍ시멘트ㆍ석면ㆍ운모나 이와 유사한 재료의 제품, 도자제품, 유리와 유리제품",
    "14": "제14부 천연진주ㆍ양식진주ㆍ귀석ㆍ반귀석ㆍ귀금속ㆍ귀금속을 입힌 금속과 이들의 제품",
    "15": "제15부 비금속(卑金屬)과 그 제품",
    "16": "제16부 기계류ㆍ전기기기와 이들의 부분품",
    "17": "제17부 차량ㆍ항공기ㆍ선박과 수송기기 관련품",
    "18": "제18부 광학기기ㆍ사진용 기기ㆍ영화용 기기ㆍ측정기기ㆍ검사기기ㆍ정밀기기ㆍ의료용 기기, 시계, 악기",
    "19": "제19부 무기ㆍ총포탄과 이들의 부분품과 부속품",
    "20": "제20부 잡품",
    "21": "제21부 예술품ㆍ수집품ㆍ골동품",
    "22": "제22부 특별한 품목분류 규정",
}

META_COLS = {"순번", "년도", "국가코드", "세번", "영문품명", "한글품명", "원문품명", "단위"}
SKIP_RATE_HINTS = ("단위",)


@dataclass
class FileCandidate:
    path: Path
    year: int
    country_code: str
    country_name: str
    score: int


def load_country_names() -> dict[str, str]:
    names = dict(CODE_TO_NAME)
    if COUNTRIES_JSON.exists():
        try:
            data = json.loads(COUNTRIES_JSON.read_text(encoding="utf-8"))
            for c in data.get("countries", []):
                code = str(c.get("code", "")).strip().upper()
                name = str(c.get("name", "")).strip()
                if code and name:
                    names[code] = name
        except Exception:
            pass
    return names


def parse_filename(path: Path) -> tuple[int | None, str | None, int]:
    """Returns (year, country_code, priority_score). Higher score wins."""
    name = path.stem
    m = re.match(
        r"^(?P<year>\d{4})년(?:(?P<month>\d{1,2})월)?_(?P<body>.+?)(?:_관세율표.*)?$",
        name,
    )
    if not m:
        return None, None, -1
    year = int(m.group("year"))
    month = int(m.group("month")) if m.group("month") else 0
    body = m.group("body")
    # strip rev suffix from body for country parse
    body_clean = re.sub(r"_?[Rr]ev\d+$", "", body).strip("_")
    # body may be like "미국" or "EU"
    country_code = None
    for k, code in sorted(NAME_TO_CODE.items(), key=lambda x: -len(x[0])):
        if body_clean == k or body_clean.startswith(k):
            country_code = code
            break
    if not country_code:
        # try excel-style codes in body
        up = body_clean.upper()
        country_code = EXCEL_CODE_TO_UI.get(up)

    # scoring: prefer plain yearly file > monthly > rev
    score = year * 10000
    if month == 0 and not re.search(r"[Rr]ev\d+", name):
        score += 9000
    elif month > 0:
        score += 1000 + month
    rev_m = re.search(r"[Rr]ev\s*(\d+)", name)
    if rev_m:
        score += int(rev_m.group(1))
    return year, country_code, score


def digits_only(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def parse_period_value(v: object | None) -> int | None:
    """엑셀 '년도' 셀 → YYYY 또는 YYYYMM (미국 B2=202508 등)."""
    if v is None:
        return None
    d = digits_only(str(v).strip())
    if len(d) >= 6:
        y, m = int(d[:4]), int(d[4:6])
        if 1990 <= y <= 2100 and 1 <= m <= 12:
            return y * 100 + m
    if len(d) >= 4:
        y = int(d[:4])
        if 1990 <= y <= 2100:
            return y
    return None


def parse_year_cell(v: str, fallback: int) -> int:
    p = parse_period_value(v)
    return p if p is not None else fallback


def read_excel_b2_period(path: Path) -> int | None:
    """첫 데이터 행 B2(년도 열)에서 기간 키를 읽습니다. Uni-PASS 연월과 동일."""
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        try:
            ws = wb[wb.sheetnames[0]]
            # header row1, first data B2
            cell = None
            for i, row in enumerate(ws.iter_rows(min_row=1, max_row=2, min_col=2, max_col=2, values_only=True)):
                if i == 1:
                    cell = row[0] if row else None
            return parse_period_value(cell)
        finally:
            wb.close()
    except Exception as e:
        print(f"[warn-b2] {path.name}: {e}")
        return None


def calendar_year(period: int) -> int:
    if period >= 100_001:
        return period // 100
    return period


def period_matches_filter(period: int, only_years: set[int]) -> bool:
    if period in only_years:
        return True
    return calendar_year(period) in only_years


def normalize_country(excel_code: str, filename_code: str | None) -> str | None:
    raw = (excel_code or "").strip().upper()
    if raw in EXCEL_CODE_TO_UI:
        return EXCEL_CODE_TO_UI[raw]
    if filename_code:
        return filename_code
    return None


def pick_basic_rate_header(headers: list[str]) -> str | None:
    prefs = [
        "기본세율",
        "Rate of Duty 1 General",
        "ERGA OMNES",
        "Normal Import",
        "MFN",
        "최혜국",
    ]
    for p in prefs:
        for h in headers:
            if h and p.lower() in h.lower():
                return h
    # first rate-like column
    for h in headers:
        if not h or h in META_COLS:
            continue
        if any(x in h for x in ("세율", "Duty", "Rate", "FTA", "WTO", "MFN")):
            return h
    return None


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")


def make_uuid(*parts: str) -> str:
    base = "|".join(parts)
    return str(uuid.UUID(hashlib.md5(base.encode("utf-8")).hexdigest()))


def delete_country_year(conn: sqlite3.Connection, year: int, code: str) -> None:
    if code == "KR":
        raise RuntimeError("KR 데이터는 엑셀 적재로 덮어쓰지 않습니다.")
    for table in (
        "tariff_item_detail",
        "tariff_item",
        "tariff_heading",
        "tariff_chapter",
        "tariff_section",
    ):
        conn.execute(
            f'DELETE FROM "{table}" WHERE year=? AND UPPER(TRIM(country_code))=?',
            (year, code),
        )


def import_file(
    conn: sqlite3.Connection,
    cand: FileCandidate,
    dry_run: bool = False,
) -> dict:
    wb = openpyxl.load_workbook(cand.path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    headers: list[str] = []
    rows_raw: list[dict[str, str]] = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        vals = [("" if v is None else str(v).replace("\n", " ").strip()) for v in row]
        if i == 0:
            headers = [h if h else f"__empty_{idx}" for idx, h in enumerate(vals)]
            continue
        if not any(vals):
            continue
        # pad
        while len(vals) < len(headers):
            vals.append("")
        rec = {headers[j]: vals[j] for j in range(len(headers))}
        rows_raw.append(rec)
    wb.close()

    if not rows_raw:
        return {"file": cand.path.name, "ok": False, "error": "empty"}

    basic_h = pick_basic_rate_header(headers)
    rate_headers = [
        h
        for h in headers
        if h
        and h not in META_COLS
        and not h.startswith("__empty_")
        and h
        not in {
            "단위",
        }
    ]

    items: dict[str, dict] = {}
    details: list[tuple] = []
    chapters: dict[str, dict] = {}
    headings: dict[str, dict] = {}
    sections: dict[str, dict] = {}

    year = cand.year
    code = cand.country_code
    cname = cand.country_name
    crawled = now_iso()

    for rec in rows_raw:
        hs_raw = (rec.get("세번") or "").strip()
        hs = digits_only(hs_raw)
        if not hs:
            continue
        # year override from cell if sensible
        y_cell = parse_year_cell(rec.get("년도") or "", year)
        if y_cell != year and len(digits_only(rec.get("년도") or "")) >= 4:
            # keep filename year as source of truth for grouping
            pass

        ko = (rec.get("한글품명") or "").strip()
        en = (rec.get("영문품명") or "").strip()
        if not ko and rec.get("원문품명"):
            ko = (rec.get("원문품명") or "").strip()

        chapter = hs[:2].zfill(2) if len(hs) >= 2 else hs.zfill(2)
        heading = hs[:4].zfill(4) if len(hs) >= 4 else hs.zfill(4)
        section = CHAPTER_TO_SECTION.get(chapter, "22")
        section_name = SECTION_NAMES_KO.get(section, f"제{section}부")

        basic = (rec.get(basic_h) or "").strip() if basic_h else ""
        is_complete = 1 if (len(hs) > 4 or bool(basic)) else 0
        # 4-digit pure heading rows without rate → incomplete header
        if len(hs) <= 4 and not basic:
            is_complete = 0

        hs6 = hs[:6] if len(hs) >= 6 else hs

        # keep longer names if duplicate hs
        prev = items.get(hs)
        if prev and len(prev.get("item_name") or "") >= len(ko) and not basic:
            pass
        else:
            items[hs] = {
                "hs_code": hs,
                "hs_code_6": hs6,
                "heading_code": heading,
                "chapter_code": chapter,
                "section_code": section,
                "item_name": ko,
                "item_name_en": en,
                "basic_rate": basic,
                "is_complete": is_complete,
            }

        chapters[chapter] = {
            "chapter_code": chapter,
            "chapter_name": f"제{int(chapter)}류" if chapter.isdigit() else chapter,
            "chapter_name_en": "",
            "section_code": section,
            "section_name": section_name,
        }
        # upgrade chapter name from short hs==chapter rows
        if len(hs) == 2 and ko:
            chapters[chapter]["chapter_name"] = ko
            chapters[chapter]["chapter_name_en"] = en
        if len(hs) >= 4:
            hprev = headings.get(heading)
            if not hprev or (len(hs) == 4 and ko):
                headings[heading] = {
                    "heading_code": heading,
                    "heading_name": ko if len(hs) == 4 else (hprev or {}).get("heading_name", ko),
                    "heading_name_en": en if len(hs) == 4 else (hprev or {}).get("heading_name_en", en),
                    "chapter_code": chapter,
                    "section_code": section,
                }
            elif len(hs) == 4:
                headings[heading]["heading_name"] = ko or headings[heading]["heading_name"]
                headings[heading]["heading_name_en"] = en or headings[heading]["heading_name_en"]
        sections[section] = {
            "section_code": section,
            "section_name": section_name,
        }

        for rh in rate_headers:
            val = (rec.get(rh) or "").strip()
            if not val:
                continue
            details.append(
                (
                    make_uuid(str(year), code, hs, rh, val),
                    year,
                    code,
                    cname,
                    hs,
                    rh[:120],
                    val[:500],
                    rh[:200],
                    crawled,
                )
            )

    stats = {
        "file": cand.path.name,
        "year": year,
        "country_code": code,
        "country_name": cname,
        "items": len(items),
        "details": len(details),
        "chapters": len(chapters),
        "headings": len(headings),
        "sections": len(sections),
        "dry_run": dry_run,
    }
    if dry_run:
        return {**stats, "ok": True}

    delete_country_year(conn, year, code)

    for sec in sections.values():
        conn.execute(
            """
            INSERT OR REPLACE INTO tariff_section
            (record_uuid, year, country_code, country_name, section_code, section_name, crawled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                make_uuid(str(year), code, "sec", sec["section_code"]),
                year,
                code,
                cname,
                sec["section_code"],
                sec["section_name"],
                crawled,
            ),
        )

    for ch in chapters.values():
        conn.execute(
            """
            INSERT OR REPLACE INTO tariff_chapter
            (record_uuid, year, country_code, country_name, section_code, section_name,
             chapter_code, chapter_name, chapter_name_en, crawled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                make_uuid(str(year), code, "ch", ch["chapter_code"]),
                year,
                code,
                cname,
                ch["section_code"],
                ch["section_name"],
                ch["chapter_code"],
                ch["chapter_name"],
                ch["chapter_name_en"],
                crawled,
            ),
        )

    for hd in headings.values():
        conn.execute(
            """
            INSERT OR REPLACE INTO tariff_heading
            (record_uuid, year, country_code, country_name, section_code, chapter_code,
             heading_code, heading_name, heading_name_en, crawled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                make_uuid(str(year), code, "hd", hd["heading_code"]),
                year,
                code,
                cname,
                hd["section_code"],
                hd["chapter_code"],
                hd["heading_code"],
                hd["heading_name"],
                hd["heading_name_en"],
                crawled,
            ),
        )

    for it in items.values():
        conn.execute(
            """
            INSERT OR REPLACE INTO tariff_item
            (record_uuid, year, country_code, country_name, section_code, chapter_code,
             heading_code, hs_code, hs_code_6, item_name, item_name_en, basic_rate,
             elastic_rate, is_complete, crawled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                make_uuid(str(year), code, "it", it["hs_code"]),
                year,
                code,
                cname,
                it["section_code"],
                it["chapter_code"],
                it["heading_code"],
                it["hs_code"],
                it["hs_code_6"],
                it["item_name"],
                it["item_name_en"],
                it["basic_rate"],
                "",
                it["is_complete"],
                crawled,
            ),
        )

    if details:
        conn.executemany(
            """
            INSERT OR REPLACE INTO tariff_item_detail
            (record_uuid, year, country_code, country_name, hs_code, rate_code, rate_value, rate_name, crawled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            details,
        )

    # crawl_log optional
    try:
        conn.execute(
            """
            INSERT INTO crawl_log
            (year, country_code, country_name, status, started_at, finished_at, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                year,
                code,
                cname,
                "excel_import_ok",
                crawled,
                crawled,
                f"items={len(items)} details={len(details)} file={cand.path.name}",
            ),
        )
    except Exception:
        pass

    conn.commit()
    return {**stats, "ok": True}


def select_candidates(
    excel_dir: Path,
    only_countries: set[str] | None,
    only_years: set[int] | None,
) -> list[FileCandidate]:
    names = load_country_names()
    best: dict[tuple[int, str], FileCandidate] = {}
    for path in sorted(excel_dir.glob("*.xlsx")):
        if path.name.startswith("~$"):
            continue
        year_from_name, code, score = parse_filename(path)
        if year_from_name is None or not code:
            print(f"[skip-name] {path.name}")
            continue
        if code == "KR":
            print(f"[skip-kr] {path.name}")
            continue
        if only_countries and code not in only_countries:
            continue

        # B2 '년도'가 있으면 기간 키로 사용 (미국 YYYYMM → Uni-PASS 연월)
        b2 = read_excel_b2_period(path)
        period = b2 if b2 is not None else year_from_name
        if only_years and not period_matches_filter(period, only_years):
            continue

        key = (period, code)
        cand = FileCandidate(
            path=path,
            year=period,
            country_code=code,
            country_name=names.get(code, CODE_TO_NAME.get(code, code)),
            score=score,
        )
        prev = best.get(key)
        if not prev or cand.score > prev.score:
            best[key] = cand
    return sorted(best.values(), key=lambda c: (c.country_code, c.year))


def purge_country(conn: sqlite3.Connection, code: str) -> None:
    if code == "KR":
        raise RuntimeError("KR 데이터는 삭제하지 않습니다.")
    for table in (
        "tariff_item_detail",
        "tariff_item",
        "tariff_heading",
        "tariff_chapter",
        "tariff_section",
    ):
        conn.execute(
            f'DELETE FROM "{table}" WHERE UPPER(TRIM(country_code))=?',
            (code.upper(),),
        )
    conn.commit()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--excel-dir", type=Path, default=DEFAULT_EXCEL_DIR)
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--countries", type=str, default="", help="comma UI codes e.g. US,EU,JP")
    ap.add_argument("--years", type=str, default="", help="comma years/periods e.g. 2026,202512")
    ap.add_argument(
        "--purge-country",
        action="store_true",
        help="import 전 --countries 지정 국가 데이터 전부 삭제(연도→연월 재적재용)",
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    only_c = {x.strip().upper() for x in args.countries.split(",") if x.strip()} or None
    only_y = {int(x.strip()) for x in args.years.split(",") if x.strip()} or None

    cands = select_candidates(args.excel_dir, only_c, only_y)
    if args.limit > 0:
        cands = cands[: args.limit]
    print(f"candidates={len(cands)} dry_run={args.dry_run}")
    for c in cands:
        print(f"  - {c.year} {c.country_code} ({c.country_name}) <= {c.path.name} score={c.score}")

    conn = sqlite3.connect(str(args.db))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    results = []
    try:
        if args.purge_country:
            if not only_c:
                raise SystemExit("--purge-country 는 --countries 와 함께 사용하세요.")
            if args.dry_run:
                print(f"[dry-run] would purge countries={sorted(only_c)}")
            else:
                for code in sorted(only_c):
                    print(f"purging country {code} ...", flush=True)
                    purge_country(conn, code)
        for i, cand in enumerate(cands, 1):
            print(f"[{i}/{len(cands)}] importing {cand.path.name} ...", flush=True)
            try:
                r = import_file(conn, cand, dry_run=args.dry_run)
                print(
                    f"    ok items={r.get('items')} details={r.get('details')} "
                    f"ch={r.get('chapters')} hd={r.get('headings')}",
                    flush=True,
                )
                results.append(r)
            except Exception as e:
                print(f"    FAIL {e}", flush=True)
                results.append({"file": cand.path.name, "ok": False, "error": str(e)})
                conn.rollback()
    finally:
        conn.close()

    out = Path("scripts/_tmp_tariff_import_result.json")
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    ok_n = sum(1 for r in results if r.get("ok"))
    print(f"done ok={ok_n}/{len(results)} -> {out}")


if __name__ == "__main__":
    main()
