# -*- coding: utf-8 -*-
"""엑셀 일반법령리스트 → app/data/clip-general-law-list.json"""

from __future__ import annotations

import json
import re
from pathlib import Path

from openpyxl import load_workbook

DEFAULT_XLSX = Path(
    r"D:\Manus\관세법령정보포털_1.법령판례_2.일반법령_사용안함\관세법령정보포털_일반법령리스트v5.xlsx"
)
OUT = Path(__file__).resolve().parents[1] / "app" / "data" / "clip-general-law-list.json"

# 엑셀 메뉴구분 → 포털 slug
MENU_TO_SLUG = {
    "관세관련": "관세관련",
    "무역관련": "무역관련",
    "외국환관련": "외국환관련",
    "세관장확인": "세관장확인",
    "세관장확인관련": "세관장확인",
    "통합공고": "통합공고",
    "통합공고관련": "통합공고",
    "내국세관련": "내국세관련",
    "행정관련": "행정관련",
    "행정관리": "행정관련",
}


def pad_law_id(raw: object) -> str:
    s = re.sub(r"\D", "", str(raw or ""))
    return s.zfill(6) if s else ""


# 엑셀에 남은 폐지 법령 → 현행 후속 (Open API eflaw 수집용)
LAW_ID_SUCCESSORS: dict[str, dict[str, str]] = {
    "000057": {  # 개항질서법
        "lawId": "012248",
        "lawName": "선박의 입항 및 출항 등에 관한 법률(개항질서법 후속)",
        "lawNameShort": "선박입출항법",
    },
    "001745": {  # 항공법
        "lawId": "012524",
        "lawName": "항공안전법(항공법 후속)",
        "lawNameShort": "항공안전법",
    },
    "009603": {  # 국가균형발전 특별법
        "lawId": "014455",
        "lawName": "지방자치분권 및 균형성장에 관한 특별법(국가균형발전특별법 후속)",
        "lawNameShort": "지방분권균형성장법",
    },
}


# 엑셀에 법령ID가 비어 있을 때 법령명으로 보정 (국가법령정보 현행 법률)
LAW_ID_BY_NAME: dict[str, str] = {
    "개별소비세법": "001570",
    "교육세법": "001729",
    "교통·에너지·환경세법": "000623",
    "교통ㆍ에너지ㆍ환경세법": "000623",
    "국세기본법": "001586",
    "국세징수법": "001585",
    "농어촌특별세법": "001569",
    "부가가치세법": "001571",
    "상속세 및 증여세법": "001561",
    "조세특례제한법": "001584",
    "주세법": "001566",
    "지방세법": "001649",
}


def apply_successor(item: dict) -> dict:
    succ = LAW_ID_SUCCESSORS.get(item.get("lawId") or "")
    if not succ:
        return item
    return {**item, **succ}


def fill_law_id(name: str, lid: str) -> str:
    if lid:
        return lid
    # 약칭 괄호 제거 후 조회
    base = re.sub(r"\([^)]*\)\s*$", "", name).strip()
    return LAW_ID_BY_NAME.get(name) or LAW_ID_BY_NAME.get(base) or ""


def main() -> None:
    xlsx = Path(
        __import__("os").environ.get("CLIP_GENERAL_LAW_LIST_XLSX", str(DEFAULT_XLSX))
    )
    if not xlsx.exists():
        raise SystemExit(f"엑셀 없음: {xlsx}")

    # 읽기 — 빈 법령ID는 보정 후 엑셀에도 다시 기록
    wb_ro = load_workbook(xlsx, read_only=True, data_only=True)
    ws_ro = wb_ro[wb_ro.sheetnames[0]]
    rows = list(ws_ro.iter_rows(values_only=True))
    wb_ro.close()
    if not rows:
        raise SystemExit("빈 시트")

    items: list[dict] = []
    excel_id_updates: list[tuple[int, str]] = []  # (1-based row, lawId)
    for i, r in enumerate(rows[1:], start=1):
        menu, name, abbr, lid = (list(r) + [None] * 4)[:4]
        menu_s = str(menu or "").strip()
        name_s = str(name or "").strip()
        if not menu_s or not name_s:
            continue
        slug = MENU_TO_SLUG.get(menu_s)
        if not slug:
            print("WARN unknown menu", menu_s)
            continue
        raw_id = pad_law_id(lid)
        filled_id = fill_law_id(name_s, raw_id)
        if filled_id and filled_id != raw_id:
            excel_id_updates.append((i + 1, filled_id))  # +1 header
            print("fill lawId", name_s, "→", filled_id)
        items.append(
            apply_successor(
                {
                    "seq": i,
                    "menu": menu_s,
                    "categorySlug": slug,
                    "lawName": name_s,
                    "lawNameShort": str(abbr).strip() if abbr else "",
                    "lawId": filled_id,
                }
            )
        )

    if excel_id_updates:
        try:
            wb = load_workbook(xlsx)
            ws = wb[wb.sheetnames[0]]
            for row_idx, law_id in excel_id_updates:
                ws.cell(row=row_idx, column=4, value=law_id)
            wb.save(xlsx)
            print("updated excel lawId cells:", len(excel_id_updates), xlsx)
        except PermissionError:
            print(
                "WARN: 엑셀이 열려 있어 법령ID 셀을 저장하지 못했습니다.",
                "파일을 닫은 뒤 다시 실행하면 엑셀에도 반영됩니다.",
                xlsx,
            )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": str(xlsx),
        "importedAt": __import__("datetime")
        .datetime.now(__import__("datetime").timezone.utc)
        .strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(items),
        "items": items,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", OUT, "count", len(items))
    naese = [it for it in items if it["categorySlug"] == "내국세관련"]
    print("내국세관련", len(naese), "withId", sum(1 for it in naese if it["lawId"]))


if __name__ == "__main__":
    main()
