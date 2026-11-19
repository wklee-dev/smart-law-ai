"""
국가법령정보 OPEN API 12종 크롤러 (V3)
- 대상 DB: openlaw_* 테이블 12개 (db_init.py 스키마)
- 환경변수: .env.local 의 LAW_API_OC, LAW_*SERVICE_URL, LAW_DB_PATH
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from urllib.parse import urlparse, urlunparse

import requests

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore

# ──────────────────────────────────────────────
# 12개 API 매핑 (설계서 3.1~3.8, 3.27~3.30)
# ──────────────────────────────────────────────
OPENLAW_APIS: list[dict[str, str]] = [
    {"no": "1", "table": "openlaw_efyd_list", "endpoint": "search", "target": "eflaw", "label": "현행법령(시행일) 목록"},
    {"no": "2", "table": "openlaw_efyd_info", "endpoint": "service", "target": "eflaw", "label": "현행법령(시행일) 본문"},
    {"no": "3", "table": "openlaw_nw_list", "endpoint": "search", "target": "law", "label": "현행법령(공포일) 목록"},
    {"no": "4", "table": "openlaw_nw_info", "endpoint": "service", "target": "law", "label": "현행법령(공포일) 본문"},
    {"no": "5", "table": "openlaw_hst_list", "endpoint": "search", "target": "lsHistory", "label": "법령 연혁 목록"},
    {"no": "6", "table": "openlaw_hst_info", "endpoint": "service", "target": "law", "label": "법령 연혁 본문"},
    # eflawjosub/lawjosub 는 조문키·번호만 오고 조문내용·항호목이 비는 경우가 많아
    # 본문(eflaw/law) 조문단위에서 조·항·호·목을 함께 적재한다.
    {"no": "7", "table": "openlaw_efyd_jo", "endpoint": "service", "target": "eflaw", "label": "조항호목(시행일)"},
    {"no": "8", "table": "openlaw_nw_jo", "endpoint": "service", "target": "law", "label": "조항호목(공포일)"},
    {"no": "9", "table": "openlaw_admrul_list", "endpoint": "search", "target": "admrul", "label": "행정규칙 목록"},
    {"no": "10", "table": "openlaw_admrul_info", "endpoint": "service", "target": "admrul", "label": "행정규칙 본문"},
    {"no": "11", "table": "openlaw_admrul_oldnew_list", "endpoint": "search", "target": "admrulOldAndNew", "label": "행정규칙 신구법 비교 목록"},
    {"no": "12", "table": "openlaw_admrul_oldnew_info", "endpoint": "service", "target": "admrulOldAndNew", "label": "행정규칙 신구법 비교 본문"},
]

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(SCRIPT_DIR, "LOG")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, f"{datetime.now().strftime('%Y%m%d')}_국가법령정보공동활용.log")


def _load_env_files() -> None:
    if load_dotenv is None:
        return
    project_root = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
    for name in (".env.local", ".env"):
        path = os.path.join(project_root, name)
        if os.path.isfile(path):
            load_dotenv(path, override=False)


_load_env_files()

DEFAULT_DB_PATH = r"D:\SQLiteDB\smart_law_ai.db"
if os.name == "posix":
    DEFAULT_DB_PATH = "/home/ubuntu/openlaw/smart_law_ai.db"

DB_PATH = os.environ.get("LAW_DB_PATH", "").strip() or os.environ.get(
    "SMART_LAW_SQLITE_DB_PATH", ""
).strip() or DEFAULT_DB_PATH

API_KEY = (
    os.environ.get("LAW_API_OC", "").strip()
    or os.environ.get("OPEN_API_KEY", "").strip()
    or "hanjoo_api"
)

BASE_URL_SEARCH = os.environ.get(
    "LAW_XMLSERVICE_URL", "http://www.law.go.kr/DRF/lawSearch.do"
).strip()
BASE_URL_SERVICE = os.environ.get(
    "LAW_JSONSERVICE_URL", "http://www.law.go.kr/DRF/lawService.do"
).strip()


def _normalize_api_url(url: str, fallback_path: str) -> str:
    raw = (url or "").strip()
    if not raw:
        raw = f"http://www.law.go.kr/DRF/{fallback_path}"
    parsed = urlparse(raw)
    host = parsed.hostname or "www.law.go.kr"
    if host == "law.go.kr":
        host = "www.law.go.kr"
    scheme = parsed.scheme or "https"
    if scheme == "http":
        scheme = "https"
    path = parsed.path or f"/DRF/{fallback_path}"
    if "lawService.do" in path and fallback_path == "lawSearch.do":
        path = "/DRF/lawSearch.do"
    if "lawSearch.do" in path and fallback_path == "lawService.do":
        path = "/DRF/lawService.do"
    return urlunparse((scheme, host, path, "", "", ""))


BASE_URL_SEARCH = _normalize_api_url(BASE_URL_SEARCH, "lawSearch.do")
BASE_URL_SERVICE = _normalize_api_url(BASE_URL_SERVICE, "lawService.do")


def log(msg: str) -> None:
    time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_msg = f"[{time_str}] {msg}"
    print(log_msg)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(log_msg + "\n")


def get_db_connection() -> sqlite3.Connection:
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    return sqlite3.connect(DB_PATH)


def pad_law_id(raw: str | int) -> str:
    digits = re.sub(r"\D", "", str(raw))
    if not digits:
        return "000000"
    return str(int(digits)).zfill(6)


def safe_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    digits = re.sub(r"\D", "", text)
    if not digits:
        return default
    try:
        return int(digits)
    except ValueError:
        return default


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def dig_str(obj: Any, *keys: str, default: str = "") -> str:
    cur = obj
    for key in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(key)
    if cur is None:
        return default
    if isinstance(cur, dict):
        return str(cur.get("content", cur.get("text", default)) or default).strip()
    return str(cur).strip()


def fetch_api_json(endpoint: str, params: dict[str, Any]) -> dict[str, Any] | None:
    base = BASE_URL_SEARCH if endpoint == "search" else BASE_URL_SERVICE
    req_params = {"OC": API_KEY, "type": "JSON", **params}
    try:
        response = requests.get(base, params=req_params, timeout=60)
        response.raise_for_status()
        text = response.text.strip()
        if not text or text.startswith("<!DOCTYPE") or text.startswith("<html"):
            log(f"API HTML/empty 응답: {base} target={params.get('target')}")
            return None
        data = response.json()
        if not isinstance(data, dict):
            log(f"API JSON 형식 오류: target={params.get('target')}")
            return None
        return data
    except Exception as exc:
        log(f"API Request Failed: {base} {req_params} - {exc}")
        return None


def search_law_items(target: str, query: str, display: int = 100) -> list[dict[str, Any]]:
    data = fetch_api_json("search", {"target": target, "query": query, "display": display})
    if not data:
        return []
    root = data.get("LawSearch") or data.get("lsHistory") or {}
    items = as_list(root.get("law"))
    return [item for item in items if isinstance(item, dict)]


def search_admrul_items(query: str, display: int = 100) -> list[dict[str, Any]]:
    data = fetch_api_json("search", {"target": "admrul", "query": query, "display": display})
    if not data:
        return []
    root = data.get("AdmRulSearch") or {}
    items = as_list(root.get("admrul"))
    return [item for item in items if isinstance(item, dict)]


def search_admrul_oldnew_items(query: str, display: int = 100) -> list[dict[str, Any]]:
    data = fetch_api_json(
        "search", {"target": "admrulOldAndNew", "query": query, "display": display}
    )
    if not data:
        return []
    root = data.get("OldAndNewLawSearch") or {}
    items = as_list(root.get("oldAndNew"))
    return [item for item in items if isinstance(item, dict)]


def fetch_law_service(target: str, **kwargs: Any) -> dict[str, Any] | None:
    params: dict[str, Any] = {"target": target, **kwargs}
    data = fetch_api_json("service", params)
    if not data:
        return None
    if "법령" in data:
        return data["법령"]
    return data


def parse_law_list_row(item: dict[str, Any]) -> tuple[Any, ...]:
    return (
        safe_int(item.get("법령일련번호")),
        str(item.get("현행연혁코드", "") or ""),
        str(item.get("법령명한글", "") or ""),
        str(item.get("법령약칭명", "") or ""),
        safe_int(item.get("법령ID")),
        safe_int(item.get("공포일자")),
        safe_int(item.get("공포번호")),
        str(item.get("제개정구분명", "") or ""),
        str(item.get("소관부처코드", "") or ""),
        str(item.get("소관부처명", "") or ""),
        str(item.get("법령구분명", "") or ""),
        str(item.get("공동부령정보", "") or ""),
        str(item.get("공동부령정보", "") or ""),
        safe_int(item.get("시행일자")),
        str(item.get("자법타법여부", "") or ""),
        str(item.get("법령상세링크", "") or ""),
    )


def parse_hst_list_row(item: dict[str, Any]) -> tuple[Any, ...]:
    return (
        safe_int(item.get("법령일련번호")),
        safe_int(item.get("법령ID")),
        str(item.get("현행연혁코드", "") or ""),
        str(item.get("법령명한글", "") or ""),
        safe_int(item.get("공포일자")),
        safe_int(item.get("공포번호")),
        str(item.get("제개정구분명", "") or ""),
        str(item.get("소관부처명", "") or ""),
        str(item.get("법령구분명", "") or ""),
        safe_int(item.get("시행일자")),
        str(item.get("법령상세링크", "") or ""),
    )


def parse_basic_info(basic: dict[str, Any]) -> dict[str, Any]:
    dept = basic.get("소관부처")
    if isinstance(dept, dict):
        dept_cd = safe_int(dept.get("소관부처코드"))
        dept_nm = dig_str(dept, "content")
    else:
        dept_cd = 0
        dept_nm = str(dept or "")

    law_type = basic.get("법종구분")
    if isinstance(law_type, dict):
        law_type_nm = dig_str(law_type, "content")
        law_type_cd = str(law_type.get("법종구분코드", "") or "")
    else:
        law_type_nm = str(law_type or "")
        law_type_cd = ""

    joint = basic.get("공동부령정보")
    joint_type = ""
    if isinstance(joint, dict):
        joint_type = dig_str(joint, "공동부령구분")

    contact = basic.get("연락부서")
    contact_dept = dig_str(contact, "content") if isinstance(contact, dict) else str(contact or "")

    return {
        "law_id": safe_int(basic.get("법령ID")),
        "enforce_dt": safe_int(basic.get("시행일자")),
        "promul_dt": safe_int(basic.get("공포일자")),
        "promul_no": safe_int(basic.get("공포번호")),
        "lang": str(basic.get("언어", "") or ""),
        "law_type": law_type_nm,
        "law_type_cd": law_type_cd,
        "law_nm_ko": str(basic.get("법령명_한글", "") or ""),
        "law_nm_cn": str(basic.get("법령명_한자", "") or ""),
        "law_abbr": str(basic.get("법령명약칭", "") or ""),
        "title_change_yn": str(basic.get("제명변경여부", "") or ""),
        "ko_law_yn": str(basic.get("한글법령여부", "") or ""),
        "chapter_seq": safe_int(basic.get("편장절관 일련번호") or basic.get("편장절관일련번호")),
        "dept_cd": dept_cd,
        "dept_nm": dept_nm,
        "phone": str(basic.get("전화번호", "") or ""),
        "enact_type": str(basic.get("제개정구분", "") or ""),
        "annex_edit_yn": str(basic.get("별표편집여부", "") or ""),
        "promul_law_yn": str(basic.get("공포법령여부", "") or ""),
        "contact_dept": contact_dept,
        "contact_phone": str(basic.get("담당부서전화번호", "") or basic.get("전화번호", "") or ""),
        "joint_ord_type": joint_type,
        "law_seq": safe_int(basic.get("법령일련번호")),
    }


def format_jo_no(main: Any, branch: Any = 0) -> str:
    main_n = safe_int(main)
    branch_n = safe_int(branch)
    if branch_n:
        return f"{main_n}-{branch_n}"
    return str(main_n)


def flatten_text(value: Any) -> str:
    """OPEN API 조문내용 등 중첩 list/dict/str 을 읽기 가능한 한 줄 텍스트로 평탄화."""
    if value is None:
        return ""
    if isinstance(value, str):
        return re.sub(r"\s+", " ", value).strip()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return " ".join(part for part in (flatten_text(x) for x in value) if part).strip()
    if isinstance(value, dict):
        # 내용 필드가 있으면 그것만, 없으면 값 순회
        for key in ("조문내용", "항내용", "호내용", "목내용", "content", "text"):
            if key in value:
                return flatten_text(value.get(key))
        return " ".join(
            part for part in (flatten_text(v) for v in value.values()) if part
        ).strip()
    return str(value).strip()


def extract_hang_ho_mok(unit: dict[str, Any]) -> tuple[str, str, str, str]:
    """항·호·목 본문을 분리 저장하고, UI용 전체 본문(본문+항호목)을 반환."""
    jo_parts: list[str] = []
    hang_parts: list[str] = []
    ho_parts: list[str] = []
    mok_parts: list[str] = []

    head = flatten_text(unit.get("조문내용"))
    if head:
        jo_parts.append(head)

    for hang in as_list(unit.get("항")):
        if not isinstance(hang, dict):
            text = flatten_text(hang)
            if text:
                hang_parts.append(text)
                jo_parts.append(text)
            continue
        hang_text = flatten_text(hang.get("항내용"))
        if hang_text:
            hang_parts.append(hang_text)
            jo_parts.append(hang_text)
        for ho in as_list(hang.get("호")):
            if not isinstance(ho, dict):
                text = flatten_text(ho)
                if text:
                    ho_parts.append(text)
                    jo_parts.append(text)
                continue
            ho_text = flatten_text(ho.get("호내용"))
            if ho_text:
                ho_parts.append(ho_text)
                jo_parts.append(ho_text)
            for mok in as_list(ho.get("목")):
                if not isinstance(mok, dict):
                    text = flatten_text(mok)
                    if text:
                        mok_parts.append(text)
                        jo_parts.append(text)
                    continue
                mok_text = flatten_text(mok.get("목내용"))
                if mok_text:
                    mok_parts.append(mok_text)
                    jo_parts.append(mok_text)

    return (
        "\n".join(jo_parts).strip(),
        "\n".join(hang_parts).strip(),
        "\n".join(ho_parts).strip(),
        "\n".join(mok_parts).strip(),
    )


def extract_jo_units(law_body: dict[str, Any]) -> list[dict[str, Any]]:
    jo_root = law_body.get("조문") or {}
    units = as_list(jo_root.get("조문단위"))
    rows: list[dict[str, Any]] = []
    for unit in units:
        if not isinstance(unit, dict):
            continue
        jo_content, hang, ho, mok = extract_hang_ho_mok(unit)
        rows.append(
            {
                "jo_no": format_jo_no(unit.get("조문번호"), unit.get("조문가지번호")),
                "jo_yn": str(unit.get("조문여부", "") or ""),
                "jo_title": str(unit.get("조문제목", "") or ""),
                "jo_enforce_dt": safe_int(unit.get("조문시행일자")),
                "jo_content": jo_content,
                "hang": hang,
                "ho": ho,
                "mok": mok,
            }
        )
    return rows


def extract_admrul_jo_lines(lines: list[Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    article_re = re.compile(r"^제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\(([^)]+)\))?")
    for line in lines:
        text = str(line or "").strip()
        if not text:
            continue
        m = article_re.match(text)
        if not m:
            continue
        jo_no = format_jo_no(m.group(1), m.group(2) or 0)
        jo_title = (m.group(3) or "").strip()
        rows.append(
            {
                "jo_no": jo_no,
                "jo_yn": "Y",
                "jo_title": jo_title,
                "jo_enforce_dt": 0,
                "jo_content": text,
                "hang": "",
                "ho": "",
                "mok": "",
            }
        )
    return rows


@dataclass
class LawContext:
    law_id: str
    law_name: str = ""
    law_abbr: str = ""
    enforce_dt: int = 0
    promul_dt: int = 0
    current_mst: int = 0
    eflaw_rows: list[dict[str, Any]] = field(default_factory=list)
    nw_rows: list[dict[str, Any]] = field(default_factory=list)
    hst_rows: list[dict[str, Any]] = field(default_factory=list)
    admrul_rows: list[dict[str, Any]] = field(default_factory=list)
    oldnew_rows: list[dict[str, Any]] = field(default_factory=list)
    search_queries: list[str] = field(default_factory=list)


def resolve_law_context(law_id: str) -> LawContext:
    lid = pad_law_id(law_id)
    ctx = LawContext(law_id=lid)

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT law_short_name, api_name
            FROM gwanselaw_list
            WHERE TRIM(law_id) = TRIM(?)
            ORDER BY upload_order ASC
            LIMIT 1
            """,
            (lid,),
        )
        row = cur.fetchone()
        if row:
            short_name = str(row[0] or "").strip()
            api_name = str(row[1] or "").strip()
            if short_name:
                ctx.law_abbr = short_name
            if api_name:
                ctx.law_name = api_name
    finally:
        conn.close()

    body = fetch_law_service("eflaw", ID=lid)
    if body:
        basic = parse_basic_info(body.get("기본정보") or {})
        if not ctx.law_name:
            ctx.law_name = basic.get("law_nm_ko", "")
        if not ctx.law_abbr:
            ctx.law_abbr = basic.get("law_abbr", "")
        ctx.enforce_dt = basic.get("enforce_dt", 0)
        ctx.promul_dt = basic.get("promul_dt", 0)
        ctx.current_mst = basic.get("law_seq", 0)

    queries: list[str] = []
    for q in (ctx.law_name, ctx.law_abbr, lid):
        q = str(q or "").strip()
        if q and q not in queries:
            queries.append(q)
    if not queries:
        queries.append(lid)
    ctx.search_queries = queries
    return ctx


def filter_rows_by_law_id(rows: list[dict[str, Any]], law_id: str) -> list[dict[str, Any]]:
    lid = pad_law_id(law_id)
    matched = [r for r in rows if pad_law_id(r.get("법령ID", "")) == lid]
    return matched or rows


def crawl_efyd_list(ctx: LawContext) -> int:
    log(f"=== [1/12] 현행법령(시행일) 목록: {ctx.law_id} ===")
    rows: list[dict[str, Any]] = []
    for query in ctx.search_queries:
        rows.extend(search_law_items("eflaw", query))
    rows = filter_rows_by_law_id(rows, ctx.law_id)
    ctx.eflaw_rows = rows

    conn = get_db_connection()
    cur = conn.cursor()
    saved = 0
    for item in rows:
        cur.execute(
            """
            INSERT OR REPLACE INTO openlaw_efyd_list (
                law_seq, history_code, law_nm, law_abbr, law_id,
                promul_dt, promul_no, enact_type, dept_cd, dept_nm,
                law_type, joint_ord_yn, promul_no_joint, enforce_dt,
                self_law_yn, law_link
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            parse_law_list_row(item),
        )
        saved += 1
    conn.commit()
    conn.close()
    log(f"현행법령(시행일) 목록 저장: {saved}건")
    return saved


def save_law_info(table: str, pk_cols: tuple[str, ...], info: dict[str, Any]) -> None:
    conn = get_db_connection()
    cur = conn.cursor()
    cols = [
        "law_id",
        "enforce_dt",
        "promul_dt",
        "promul_no",
        "lang",
        "law_type",
        "law_type_cd",
        "law_nm_ko",
        "law_nm_cn",
        "law_abbr",
        "title_change_yn",
        "ko_law_yn",
        "chapter_seq",
        "dept_cd",
        "dept_nm",
        "phone",
        "enact_type",
        "annex_edit_yn",
        "promul_law_yn",
        "contact_dept",
        "contact_phone",
        "joint_ord_type",
    ]
    if table == "openlaw_nw_info":
        cols = [c for c in cols if c != "enforce_dt"] + ["enforce_dt"]
        order = [
            "law_id",
            "promul_dt",
            "enforce_dt",
            "promul_no",
            "lang",
            "law_type",
            "law_type_cd",
            "law_nm_ko",
            "law_nm_cn",
            "law_abbr",
            "title_change_yn",
            "ko_law_yn",
            "chapter_seq",
            "dept_cd",
            "dept_nm",
            "phone",
            "enact_type",
            "annex_edit_yn",
            "promul_law_yn",
            "contact_dept",
            "contact_phone",
            "joint_ord_type",
        ]
        values = tuple(info.get(c, 0 if c.endswith("_dt") or c in ("dept_cd", "chapter_seq", "promul_no") else "") for c in order)
        cur.execute(
            f"""
            INSERT OR REPLACE INTO {table} (
                law_id, promul_dt, enforce_dt, promul_no, lang, law_type, law_type_cd,
                law_nm_ko, law_nm_cn, law_abbr, title_change_yn, ko_law_yn, chapter_seq,
                dept_cd, dept_nm, phone, enact_type, annex_edit_yn, promul_law_yn,
                contact_dept, contact_phone, joint_ord_type
            ) VALUES ({",".join(["?"] * len(order))})
            """,
            values,
        )
    elif table == "openlaw_hst_info":
        order = [
            "law_id",
            "promul_dt",
            "law_seq",
            "enforce_dt",
            "promul_no",
            "lang",
            "law_type",
            "law_type_cd",
            "law_nm_ko",
            "law_nm_cn",
            "law_abbr",
            "title_change_yn",
            "ko_law_yn",
            "chapter_seq",
            "dept_cd",
            "dept_nm",
            "phone",
            "enact_type",
            "annex_edit_yn",
            "promul_law_yn",
            "contact_dept",
            "contact_phone",
            "joint_ord_type",
        ]
        values = tuple(info.get(c, 0 if c.endswith("_dt") or c in ("dept_cd", "chapter_seq", "promul_no", "law_seq") else "") for c in order)
        cur.execute(
            f"""
            INSERT OR REPLACE INTO {table} (
                law_id, promul_dt, law_seq, enforce_dt, promul_no, lang, law_type, law_type_cd,
                law_nm_ko, law_nm_cn, law_abbr, title_change_yn, ko_law_yn, chapter_seq,
                dept_cd, dept_nm, phone, enact_type, annex_edit_yn, promul_law_yn,
                contact_dept, contact_phone, joint_ord_type
            ) VALUES ({",".join(["?"] * len(order))})
            """,
            values,
        )
    else:
        values = tuple(info.get(c, 0 if c.endswith("_dt") or c in ("dept_cd", "chapter_seq", "promul_no") else "") for c in cols)
        cur.execute(
            f"""
            INSERT OR REPLACE INTO {table} (
                law_id, enforce_dt, promul_dt, promul_no, lang, law_type, law_type_cd,
                law_nm_ko, law_nm_cn, law_abbr, title_change_yn, ko_law_yn, chapter_seq,
                dept_cd, dept_nm, phone, enact_type, annex_edit_yn, promul_law_yn,
                contact_dept, contact_phone, joint_ord_type
            ) VALUES ({",".join(["?"] * len(cols))})
            """,
            values,
        )
    conn.commit()
    conn.close()
    _ = pk_cols


def crawl_efyd_info(ctx: LawContext) -> int:
    log(f"=== [2/12] 현행법령(시행일) 본문: {ctx.law_id} ===")
    body = fetch_law_service("eflaw", ID=ctx.law_id)
    if not body:
        log("현행법령(시행일) 본문 조회 실패")
        return 0
    info = parse_basic_info(body.get("기본정보") or {})
    save_law_info("openlaw_efyd_info", ("law_id", "enforce_dt"), info)
    ctx.enforce_dt = info.get("enforce_dt", ctx.enforce_dt)
    ctx.promul_dt = info.get("promul_dt", ctx.promul_dt)
    ctx.current_mst = info.get("law_seq", ctx.current_mst)
    log("현행법령(시행일) 본문 저장 완료")
    return 1


def crawl_nw_list(ctx: LawContext) -> int:
    log(f"=== [3/12] 현행법령(공포일) 목록: {ctx.law_id} ===")
    rows: list[dict[str, Any]] = []
    for query in ctx.search_queries:
        rows.extend(search_law_items("law", query))
    rows = filter_rows_by_law_id(rows, ctx.law_id)
    ctx.nw_rows = rows

    conn = get_db_connection()
    cur = conn.cursor()
    saved = 0
    for item in rows:
        cur.execute(
            """
            INSERT OR REPLACE INTO openlaw_nw_list (
                law_seq, history_code, law_nm, law_abbr, law_id,
                promul_dt, promul_no, enact_type, dept_cd, dept_nm,
                law_type, joint_ord_yn, promul_no_joint, enforce_dt,
                self_law_yn, law_link
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            parse_law_list_row(item),
        )
        saved += 1
    conn.commit()
    conn.close()
    log(f"현행법령(공포일) 목록 저장: {saved}건")
    return saved


def crawl_nw_info(ctx: LawContext) -> int:
    log(f"=== [4/12] 현행법령(공포일) 본문: {ctx.law_id} ===")
    body = fetch_law_service("law", ID=ctx.law_id)
    if not body:
        log("현행법령(공포일) 본문 조회 실패")
        return 0
    info = parse_basic_info(body.get("기본정보") or {})
    save_law_info("openlaw_nw_info", ("law_id", "promul_dt"), info)
    log("현행법령(공포일) 본문 저장 완료")
    return 1


def crawl_hst_list(ctx: LawContext) -> int:
    log(f"=== [5/12] 법령 연혁 목록: {ctx.law_id} ===")
    rows: list[dict[str, Any]] = []

    # lsHistory 검색 API는 HTML 응답이므로 eflaw 목록의 연혁 행을 사용
    if not ctx.eflaw_rows:
        for query in ctx.search_queries:
            ctx.eflaw_rows.extend(search_law_items("eflaw", query))
        ctx.eflaw_rows = filter_rows_by_law_id(ctx.eflaw_rows, ctx.law_id)

    for item in ctx.eflaw_rows:
        code = str(item.get("현행연혁코드", "") or "")
        if code in ("연혁", "현행", "시행예정"):
            rows.append(item)
    ctx.hst_rows = rows

    conn = get_db_connection()
    cur = conn.cursor()
    saved = 0
    for item in rows:
        cur.execute(
            """
            INSERT OR REPLACE INTO openlaw_hst_list (
                law_seq, law_id, history_code, law_nm, promul_dt, promul_no,
                enact_type, dept_nm, law_type, enforce_dt, law_link
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            parse_hst_list_row(item),
        )
        saved += 1
    conn.commit()
    conn.close()
    log(f"법령 연혁 목록 저장: {saved}건")
    return saved


def crawl_hst_info(ctx: LawContext) -> int:
    log(f"=== [6/12] 법령 연혁 본문: {ctx.law_id} ===")
    if not ctx.hst_rows:
        crawl_hst_list(ctx)

    saved = 0
    seen: set[tuple[int, int]] = set()
    for item in ctx.hst_rows:
        mst = safe_int(item.get("법령일련번호"))
        promul_dt = safe_int(item.get("공포일자"))
        key = (mst, promul_dt)
        if key in seen:
            continue
        seen.add(key)

        body = fetch_law_service("law", MST=mst, LD=promul_dt)
        if not body:
            log(f"연혁 본문 조회 실패 MST={mst} LD={promul_dt}")
            continue
        info = parse_basic_info(body.get("기본정보") or {})
        info["law_seq"] = mst
        save_law_info("openlaw_hst_info", ("law_id", "promul_dt"), info)
        saved += 1

    log(f"법령 연혁 본문 저장: {saved}건")
    return saved


def crawl_efyd_jo(ctx: LawContext) -> int:
    log(f"=== [7/12] 조항호목(시행일): {ctx.law_id} ===")
    # eflawjosub 는 조문 메타만 오는 경우가 많아 현행 본문(eflaw)에서 추출
    body = fetch_law_service("eflaw", ID=ctx.law_id)
    if not body:
        log("조항호목(시행일) 조회 실패")
        return 0

    enforce_dt = safe_int(dig_str(body.get("기본정보") or {}, "시행일자")) or ctx.enforce_dt
    rows = extract_jo_units(body)

    conn = get_db_connection()
    cur = conn.cursor()
    for row in rows:
        cur.execute(
            """
            INSERT OR REPLACE INTO openlaw_efyd_jo (
                law_id, enforce_dt, jo_no, jo_yn, jo_title,
                jo_enforce_dt, jo_content, hang, ho, mok
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                safe_int(ctx.law_id),
                enforce_dt,
                row["jo_no"],
                row["jo_yn"],
                row["jo_title"],
                row["jo_enforce_dt"],
                row["jo_content"],
                row["hang"],
                row["ho"],
                row["mok"],
            ),
        )
    conn.commit()
    conn.close()
    log(f"조항호목(시행일) 저장: {len(rows)}건")
    return len(rows)


def crawl_nw_jo(ctx: LawContext) -> int:
    log(f"=== [8/12] 조항호목(공포일): {ctx.law_id} ===")
    body = fetch_law_service("law", ID=ctx.law_id)
    if not body:
        log("조항호목(공포일) 본문 조회 실패")
        return 0

    promul_dt = safe_int(dig_str(body.get("기본정보") or {}, "공포일자")) or ctx.promul_dt
    rows = extract_jo_units(body)

    conn = get_db_connection()
    cur = conn.cursor()
    for row in rows:
        cur.execute(
            """
            INSERT OR REPLACE INTO openlaw_nw_jo (
                law_id, promul_dt, jo_no, jo_yn, jo_title,
                jo_enforce_dt, jo_content, hang, ho, mok
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                safe_int(ctx.law_id),
                promul_dt,
                row["jo_no"],
                row["jo_yn"],
                row["jo_title"],
                row["jo_enforce_dt"],
                row["jo_content"],
                row["hang"],
                row["ho"],
                row["mok"],
            ),
        )
    conn.commit()
    conn.close()
    log(f"조항호목(공포일) 저장: {len(rows)}건")
    return len(rows)


def related_search_queries(ctx: LawContext) -> list[str]:
    queries = list(ctx.search_queries)
    for name in (ctx.law_name, ctx.law_abbr):
        text = str(name or "").strip()
        if not text:
            continue
        if text.endswith("법") and len(text) > 1:
            stem = text[:-1]
            if stem not in queries:
                queries.append(stem)
        if text.endswith("령") and len(text) > 1:
            stem = text[:-1]
            if stem not in queries:
                queries.append(stem)
    return queries


def crawl_admrul_list(ctx: LawContext) -> int:
    log(f"=== [9/12] 행정규칙 목록: {ctx.law_id} ===")
    rows: list[dict[str, Any]] = []
    for query in related_search_queries(ctx):
        rows.extend(search_admrul_items(query))

    # 법령명과 연관된 행정규칙만 우선 저장 (결과 없으면 전체)
    name_key = (ctx.law_name or ctx.law_abbr or "").strip()
    if name_key:
        stems = [name_key]
        if name_key.endswith("법"):
            stems.append(name_key[:-1])
        filtered = [
            r
            for r in rows
            if any(
                stem in str(r.get("행정규칙명", "") or "")
                for stem in stems
                if stem
            )
        ]
        if filtered:
            rows = filtered
    deduped: dict[int, dict[str, Any]] = {}
    for item in rows:
        seq = safe_int(item.get("행정규칙일련번호"))
        if seq:
            deduped[seq] = item
    rows = list(deduped.values())
    ctx.admrul_rows = rows

        conn = get_db_connection()
    cur = conn.cursor()
    saved = 0
    for item in rows:
        cur.execute(
            """
            INSERT OR REPLACE INTO openlaw_admrul_list (
                admrul_seq, admrul_nm, issue_dt, issue_no, enact_type,
                dept_nm, admrul_type, enforce_dt, admrul_link
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                safe_int(item.get("행정규칙일련번호")),
                str(item.get("행정규칙명", "") or ""),
                safe_int(item.get("발령일자")),
                str(item.get("발령번호", "") or ""),
                str(item.get("제개정구분명", "") or ""),
                str(item.get("소관부처명", "") or ""),
                str(item.get("행정규칙종류", "") or ""),
                safe_int(item.get("시행일자")),
                str(item.get("행정규칙상세링크", "") or ""),
            ),
        )
        saved += 1
    conn.commit()
    conn.close()
    log(f"행정규칙 목록 저장: {saved}건")
    return saved


def crawl_admrul_info(ctx: LawContext) -> int:
    log(f"=== [10/12] 행정규칙 본문: {ctx.law_id} ===")
    if not ctx.admrul_rows:
        crawl_admrul_list(ctx)

    conn = get_db_connection()
    cur = conn.cursor()
    total = 0

    for item in ctx.admrul_rows:
        seq = safe_int(item.get("행정규칙일련번호"))
        if not seq:
            continue
        data = fetch_api_json("service", {"target": "admrul", "ID": seq})
        if not data:
            continue
        svc = data.get("AdmRulService") or {}
        jo_lines = as_list(svc.get("조문내용"))
        rows = extract_admrul_jo_lines(jo_lines)
        for row in rows:
            cur.execute(
                """
                INSERT OR REPLACE INTO openlaw_admrul_info (
                    admrul_seq, jo_no, jo_yn, jo_title, jo_enforce_dt,
                    jo_content, hang, ho, mok
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    seq,
                    row["jo_no"],
                    row["jo_yn"],
                    row["jo_title"],
                    row["jo_enforce_dt"],
                    row["jo_content"],
                    row["hang"],
                    row["ho"],
                    row["mok"],
                ),
            )
            total += 1
        
        conn.commit()
        conn.close()
    log(f"행정규칙 본문 저장: {total}건")
    return total


def crawl_admrul_oldnew_list(ctx: LawContext) -> int:
    log(f"=== [11/12] 행정규칙 신구법 비교 목록: {ctx.law_id} ===")
    rows: list[dict[str, Any]] = []
    for query in related_search_queries(ctx):
        rows.extend(search_admrul_oldnew_items(query))

    name_key = (ctx.law_name or ctx.law_abbr or "").strip()
    if name_key:
        stems = [name_key]
        if name_key.endswith("법"):
            stems.append(name_key[:-1])
        filtered = [
            r
            for r in rows
            if any(
                stem in str(r.get("신구법명", "") or "")
                for stem in stems
                if stem
            )
        ]
        if filtered:
            rows = filtered
    deduped: dict[int, dict[str, Any]] = {}
    for item in rows:
        seq = safe_int(item.get("신구법일련번호") or item.get("신구법ID"))
        if seq:
            deduped[seq] = item
    rows = list(deduped.values())
    ctx.oldnew_rows = rows

    conn = get_db_connection()
    cur = conn.cursor()
    saved = 0
    for item in rows:
        cur.execute(
            """
            INSERT OR REPLACE INTO openlaw_admrul_oldnew_list (
                oldnew_seq, admrul_nm, old_issue_dt, old_issue_no,
                new_issue_dt, new_issue_no, dept_nm
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                safe_int(item.get("신구법일련번호") or item.get("신구법ID")),
                str(item.get("신구법명", "") or ""),
                safe_int(item.get("발령일자")),
                str(item.get("발령번호", "") or ""),
                safe_int(item.get("시행일자")),
                str(item.get("발령번호", "") or ""),
                str(item.get("소관부처명", "") or ""),
            ),
        )
        saved += 1
    conn.commit()
    conn.close()
    log(f"행정규칙 신구법 비교 목록 저장: {saved}건")
    return saved


def crawl_admrul_oldnew_info(ctx: LawContext) -> int:
    log(f"=== [12/12] 행정규칙 신구법 비교 본문: {ctx.law_id} ===")
    if not ctx.oldnew_rows:
        crawl_admrul_oldnew_list(ctx)

    conn = get_db_connection()
    cur = conn.cursor()
    total = 0

    for item in ctx.oldnew_rows:
        seq = safe_int(item.get("신구법일련번호") or item.get("신구법ID"))
        enforce_dt = safe_int(item.get("시행일자"))
        if not seq:
            continue
        data = fetch_api_json("service", {"target": "admrulOldAndNew", "ID": seq})
        if not data:
            continue
        svc = data.get("AdmRulOldAndNewService") or {}
        old_items = {str(x.get("no", "")): str(x.get("content", "") or "") for x in as_list((svc.get("구조문목록") or {}).get("조문")) if isinstance(x, dict)}
        new_items = as_list((svc.get("신조문목록") or {}).get("조문"))

        for new_row in new_items:
            if not isinstance(new_row, dict):
                continue
            no = str(new_row.get("no", "") or "")
            cur.execute(
                """
                INSERT OR REPLACE INTO openlaw_admrul_oldnew_info (
                    admrul_seq, enforce_dt, jo_no, old_jo_content, new_jo_content
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    seq,
                    enforce_dt,
                    no,
                    old_items.get(no, ""),
                    str(new_row.get("content", "") or ""),
                ),
            )
            total += 1

    conn.commit()
    conn.close()
    log(f"행정규칙 신구법 비교 본문 저장: {total}건")
    return total


CRAWL_STEPS = [
    crawl_efyd_list,
    crawl_efyd_info,
    crawl_nw_list,
    crawl_nw_info,
    crawl_hst_list,
    crawl_hst_info,
    crawl_efyd_jo,
    crawl_nw_jo,
    crawl_admrul_list,
    crawl_admrul_info,
    crawl_admrul_oldnew_list,
    crawl_admrul_oldnew_info,
]


def emit_progress(payload: dict[str, Any]) -> None:
    """웹 UI 실시간 표시용. stdout 한 줄 JSON (OPENLAW_PROGRESS 접두)."""
    line = "OPENLAW_PROGRESS " + json.dumps(payload, ensure_ascii=False)
    print(line, flush=True)
    sys.stdout.flush()


def crawl_by_law_id(
    law_id: str,
    *,
    law_index: int = 1,
    law_total: int = 1,
) -> dict[str, int]:
    """특정 법령ID에 대해 12개 API를 순차 호출하고 DB에 적재."""
    lid = pad_law_id(law_id)
    log(f"=== 법령ID {lid} 크롤링 시작 (API {len(CRAWL_STEPS)}종) ===")
    log(f"DB={DB_PATH} OC={API_KEY[:4]}*** SEARCH={BASE_URL_SEARCH}")
    emit_progress(
        {
            "type": "law_start",
            "lawId": lid,
            "lawIndex": law_index,
            "lawTotal": law_total,
            "stepTotal": len(CRAWL_STEPS),
        }
    )

    ctx = resolve_law_context(lid)
    if not ctx.law_name:
        log(f"법령명 확인 실패 — 검색어: {ctx.search_queries}")

    results: dict[str, int] = {}
    for idx, step in enumerate(CRAWL_STEPS, start=1):
        api_meta = OPENLAW_APIS[idx - 1]
        endpoint = "lawSearch.do" if api_meta["endpoint"] == "search" else "lawService.do"
        emit_progress(
            {
                "type": "step_start",
                "lawId": lid,
                "lawIndex": law_index,
                "lawTotal": law_total,
                "step": idx,
                "stepTotal": len(CRAWL_STEPS),
                "label": api_meta["label"],
                "target": api_meta["target"],
                "endpoint": endpoint,
                "table": api_meta["table"],
            }
        )
        try:
            count = step(ctx)
            results[api_meta["table"]] = count
            emit_progress(
                {
                    "type": "step_done",
                    "lawId": lid,
                    "lawIndex": law_index,
                    "lawTotal": law_total,
                    "step": idx,
                    "stepTotal": len(CRAWL_STEPS),
                    "label": api_meta["label"],
                    "target": api_meta["target"],
                    "endpoint": endpoint,
                    "table": api_meta["table"],
                    "count": count,
                    "ok": True,
                }
            )
        except Exception as exc:
            log(f"[{idx}/12] {api_meta['label']} 오류: {exc}")
            results[api_meta["table"]] = 0
            emit_progress(
                {
                    "type": "step_done",
                    "lawId": lid,
                    "lawIndex": law_index,
                    "lawTotal": law_total,
                    "step": idx,
                    "stepTotal": len(CRAWL_STEPS),
                    "label": api_meta["label"],
                    "target": api_meta["target"],
                    "endpoint": endpoint,
                    "table": api_meta["table"],
                    "count": 0,
                    "ok": False,
                    "error": str(exc),
                }
            )

    log(f"=== 법령ID {lid} 크롤링 종료 ===")
    emit_progress(
        {
            "type": "law_done",
            "lawId": lid,
            "lawIndex": law_index,
            "lawTotal": law_total,
            "results": results,
        }
    )
    return results


def law_ids_with_openlaw_body(law_ids: list[str]) -> set[str]:
    """openlaw_efyd_info 적재 여부로 수집 성공 판정."""
    normalized = [pad_law_id(x) for x in law_ids if str(x).strip()]
    if not normalized:
        return set()
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        found: set[str] = set()
        for lid in normalized:
            cur.execute(
                "SELECT 1 FROM openlaw_efyd_info WHERE law_id = ? LIMIT 1",
                (safe_int(lid),),
            )
            if cur.fetchone():
                found.add(lid)
        return found
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="국가법령정보 OPEN API 12종 크롤러")
    parser.add_argument("--law_id", type=str, help="크롤링할 법령ID (예: 000591)")
    parser.add_argument(
        "--law-ids",
        type=str,
        help="크롤링할 법령ID 목록 (쉼표 또는 공백 구분, 웹 연동용)",
    )
    parser.add_argument("--list-apis", action="store_true", help="12개 API 매핑 출력")
    args = parser.parse_args()
    
    if args.list_apis:
        for api in OPENLAW_APIS:
            endpoint = "lawSearch.do" if api["endpoint"] == "search" else "lawService.do"
            print(
                f"{api['no']:>2}. {api['label']:<28} "
                f"target={api['target']:<18} {endpoint} → {api['table']}"
            )
        return

    law_ids: list[str] = []
    if args.law_id:
        law_ids.append(args.law_id)
    if args.law_ids:
        for part in re.split(r"[\s,]+", args.law_ids.strip()):
            if part:
                law_ids.append(part)

    if not law_ids:
        print("사용법: python law_crawler.py --law_id 000591")
        print("       python law_crawler.py --law-ids 000591,001556")
        print("       python law_crawler.py --list-apis")
        return

    # 중복 제거·정규화
    seen: set[str] = set()
    unique_ids: list[str] = []
    for raw in law_ids:
        lid = pad_law_id(raw)
        if lid not in seen:
            seen.add(lid)
            unique_ids.append(lid)

    emit_progress({"type": "run_start", "lawTotal": len(unique_ids), "stepTotal": 12})
    for i, law_id in enumerate(unique_ids, start=1):
        crawl_by_law_id(law_id, law_index=i, law_total=len(unique_ids))
    emit_progress({"type": "run_done", "lawTotal": len(unique_ids)})


if __name__ == "__main__":
    main()
