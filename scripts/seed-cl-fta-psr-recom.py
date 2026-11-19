# -*- coding: utf-8 -*-
"""Seed cl_fta_general (원산지결정기준 안내) + cl_fta_recom (협정관세추천 대상품목).

원본 CL HS 화면(칠레 등) 구성에 맞춘 시드. 기존 행은 fta_cd+sect+gubun / PK로 교체.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

DB = Path(r"D:/SQLiteDB/smart_law_ai.db")
NOW = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
YR = "2026"


def ensure_schema(c: sqlite3.Connection) -> None:
    c.execute(
        """CREATE TABLE IF NOT EXISTS cl_fta_recom (
            fta_cd     TEXT NOT NULL,
            item_nm    TEXT NOT NULL,
            seq_no     INTEGER NOT NULL,
            hsk_cd     TEXT NOT NULL,
            hsk_disp   TEXT,
            hsk_nm     TEXT,
            qty_txt    TEXT,
            agency     TEXT,
            base_yr    TEXT,
            crawl_dt   TEXT,
            PRIMARY KEY (fta_cd, item_nm, seq_no)
        )"""
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS ix_fta_recom_fta ON cl_fta_recom (fta_cd)"
    )


# 한-칠레 FTA 원산지결정기준 안내문 (원본 화면 구성)
FCL_PSR_GUIDE = [
    (
        "1. 참조문서",
        "FTA특례법 시행규칙 [별표 1] 칠레와의 협정에 따른 원산지결정기준",
    ),
    (
        "2. 원산지 결정에 관한 일반적 기준",
        """가. 완전생산물품의 원산지결정
대한민국 또는 칠레(역내국)에서 전부 생산한 다음의 물품에 대해서는 역내국을 그 물품의 원산지로 한다.
(1) 역내국에서 추출한 광물
(2) 역내국에서 재배하고 수확한 식물성 생산품
(3) 역내국에서 출생·사육한 살아있는 동물
(4) 역내국에서 사육한 동물로부터 얻은 물품
(5) 역내국에서 수렵·어로로 얻은 물품
(6) 역내국의 선박에 의하여 역내국 밖의 바다에서 잡은 어획물 및 그 밖의 물품
(7) 역내국의 공장선에서 (6)의 물품을 가공하여 얻은 물품
(8) 역내국의 영해 밖의 해저 또는 하층토에서 추출한 물품 (해당 역내국이 개발권을 가진 경우)
(9) 역내국에서 제조공정 또는 가공과정에서 발생한 웨이스트·스크랩
(10) 우주공간에서 채취한 물품으로서 역내국에서 등록된 우주선에 의하여 채취된 것

나. 2개국 이상에 걸쳐 생산된 물품의 원산지결정
(1) 2개국 이상에 걸쳐 생산된 물품은 품목별 원산지결정기준에 따라 원산지를 결정한다.
(2) 부가가치기준을 적용하는 경우
(가) 역내가치포함비율(BD)이 45% 이상인 경우 또는
(나) 역내가치포함비율(BU)이 30% 이상인 경우

다. 원산지 재료로만 생산된 물품에 대한 원산지 결정
원산지 재료만을 사용하여 역내국에서 생산된 물품은 그 역내국을 원산지로 한다.

라. 단순한 작업 또는 공정만을 거쳐 생산된 물품에 대한 원산지결정
(1) 단순한 작업 또는 공정만을 거쳐 생산된 물품은 원산지물품으로 인정하지 아니한다.
(2) 단순한 작업 또는 공정의 예
(가) 운송·저장을 위한 보존처리
(나) 건조·냉동·냉장
(다) 세척·선별·분류·절단
(라) 포장·재포장
(마) 마크·라벨의 부착
(바) 단순한 혼합
(사) 단순한 조립
(아) 상기 공정의 조합""",
    ),
    (
        "3. 원산지결정에 관한 보충적 기준",
        """가. 부속물·예비부분품·공구 및 최소허용범위
(1) 부속물·예비부분품·공구는 본품과 함께 원산지를 결정한다.
(2) 비원산지 재료의 가치가 물품 가격의 일정 비율 이하인 경우 원산지 요건을 충족한 것으로 본다(최소허용범위).

나. 소매 판매를 위한 포장물품 및 용기
소매 판매용 포장재·용기는 원산지 결정 시 본품과 일체로 본다.

다. 수송용 포장물품 및 용기
수송용 포장재·용기는 원산지 결정에서 고려하지 아니한다.

라. 품목별 원산지결정기준 적용원칙
(1) 세번변경기준은 비원산지 재료의 HSK 변경 여부를 기준으로 한다.
(2) 류·호·소호의 변경은 해당 기준에 따른다.
(3) 제1류~제24류 등은 순중량 기준으로 적용할 수 있다.

마. 직접운송원칙
(1) 원산지물품은 협정 당사국 간 직접 운송되어야 한다.
(2) 제3국을 경유하는 경우 세관 통제 하에 있고 가공·개조가 없을 것 등 협정에서 정한 요건을 충족해야 한다.

바. 회계분리 및 기장방법
(1) 대체가능재료는 FIFO·LIFO 등 인정된 재고관리방법에 따라 원산지를 결정할 수 있다.
(2) 기장방법은 해당 역내국에서 일반적으로 인정되는 회계원칙에 따른다.""",
    ),
    (
        "4. 품목별 원산지결정기준 적용원칙",
        "품목별 원산지결정기준은 HSK 검색으로 류(HS2)를 조회하면 표시됩니다. (FTA특례법 시행규칙 별표 1)",
    ),
    (
        "5. 직접운송원칙 (협정 제4.12조)",
        """(1) 원산지물품이 당사국 간 직접 운송된 경우에 한정하여 특혜관세를 적용한다.
(2) 제3국 경유 시 환적·일시보관만 이루어지고 세관 감독 하에 있을 것.""",
    ),
    (
        "6. 특혜기준 및 기재방법",
        """원산지증명서 특혜기준 부호
A : 완전생산기준에 의한 원산지물품
B : 품목별 원산지결정기준(세번변경·부가가치 등)을 충족한 물품
C : 원산지재료만으로 생산된 물품
D : 세번변경을 충족하지 못하나 부가가치기준을 충족한 물품""",
    ),
]


# 칠레 협정관세추천 대상품목 (원본 화면 일부 — HSK/품명/물량)
# hsk_nm 은 cl_fta_hsk 조인으로 보강
FCL_RECOM = [
    # item_nm, seq, hsk_cd, hsk_disp, qty
    ("쇠고기", 1, "0201201000", "0201.20-1000", "200톤"),
    ("쇠고기", 2, "0201209000", "0201.20-9000", "200톤"),
    ("쇠고기", 3, "0202201000", "0202.20-1000", "200톤"),
    ("쇠고기", 4, "0202209000", "0202.20-9000", "200톤"),
    ("닭고기", 1, "0207141010", "0207.14-1010", "2,000톤"),
    ("닭고기", 2, "0207141020", "0207.14-1020", "2,000톤"),
    ("닭고기", 3, "0207141030", "0207.14-1030", "2,000톤"),
    ("닭고기", 4, "0207141090", "0207.14-1090", "2,000톤"),
    ("닭고기", 5, "0207142010", "0207.14-2010", "2,000톤"),
    ("닭고기", 6, "0207142090", "0207.14-2090", "2,000톤"),
    ("닭고기", 7, "1602321010", "1602.32-1010", "2,000톤"),
    ("닭고기", 8, "1602321090", "1602.32-1090", "2,000톤"),
    ("닭고기", 9, "1602329000", "1602.32-9000", "2,000톤"),
    ("유장", 1, "0404101011", "0404.10-1011", "1,000톤"),
    ("유장", 2, "0404101091", "0404.10-1091", "1,000톤"),
    ("유장", 3, "0404102011", "0404.10-2011", "1,000톤"),
    ("유장", 4, "0404102091", "0404.10-2091", "1,000톤"),
]


def main() -> None:
    c = sqlite3.connect(str(DB), timeout=120)
    c.execute("PRAGMA busy_timeout=120000")
    ensure_schema(c)

    # PSR guide → cl_fta_general
    for gubun, content in FCL_PSR_GUIDE:
        c.execute(
            """INSERT OR REPLACE INTO cl_fta_general
               (fta_cd, sect, gubun, content, base_yr, crawl_dt)
               VALUES (?,?,?,?,?,?)""",
            ("FCL", "원산지결정기준", gubun, content, YR, NOW),
        )

    # 품명 보강
    hsk_nm = {}
    for row in c.execute("SELECT hsk_cd, hsk_nm FROM cl_fta_hsk"):
        hsk_nm[row[0]] = row[1] or ""

    agency = "한국농수산식품유통공사"
    c.execute("DELETE FROM cl_fta_recom WHERE fta_cd='FCL'")
    for item_nm, seq, hsk_cd, hsk_disp, qty in FCL_RECOM:
        c.execute(
            """INSERT INTO cl_fta_recom
               (fta_cd, item_nm, seq_no, hsk_cd, hsk_disp, hsk_nm, qty_txt, agency, base_yr, crawl_dt)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                "FCL",
                item_nm,
                seq,
                hsk_cd,
                hsk_disp,
                hsk_nm.get(hsk_cd, ""),
                qty,
                agency,
                YR,
                NOW,
            ),
        )

    c.commit()
    n_g = c.execute(
        "SELECT COUNT(*) FROM cl_fta_general WHERE fta_cd='FCL' AND sect='원산지결정기준'"
    ).fetchone()[0]
    n_r = c.execute("SELECT COUNT(*) FROM cl_fta_recom WHERE fta_cd='FCL'").fetchone()[0]
    c.close()
    print(f"OK guide={n_g} recom={n_r}")


if __name__ == "__main__":
    main()
