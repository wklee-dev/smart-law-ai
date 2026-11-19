"""
국가법령정보 OPEN API 크롤링 프로젝트 - DB 초기화 스크립트
- 대상 DB : D:/SQLiteDB/smart_law_ai.db
- 생성 테이블 : 12개 (openlaw_ 접두사)
- 실행 방법 : python db_init.py
"""

import sqlite3
import os

# DB 경로 (불변)
DB_PATH = 'D:\\SQLiteDB\\smart_law_ai.db'
if os.name == 'posix':
    DB_PATH = '/home/ubuntu/openlaw/smart_law_ai.db'


def init_db():
    # Windows 경로 디렉토리 생성 (Linux 환경 제외)
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # ──────────────────────────────────────────────
    # 1. 현행법령(시행일) 목록  openlaw_efyd_list
    # ──────────────────────────────────────────────
    cursor.execute("DROP TABLE IF EXISTS openlaw_efyd_list")
    cursor.execute('''
    CREATE TABLE openlaw_efyd_list (
        law_seq         INTEGER PRIMARY KEY,   -- 법령일련번호
        history_code    TEXT,                  -- 현행연혁코드
        law_nm          TEXT,                  -- 법령명한글
        law_abbr        TEXT,                  -- 법령약칭명
        law_id          INTEGER,               -- 법령ID
        promul_dt       INTEGER,               -- 공포일자 (YYYYMMDD)
        promul_no       INTEGER,               -- 공포번호
        enact_type      TEXT,                  -- 제개정구분명
        dept_cd         TEXT,                  -- 소관부처코드
        dept_nm         TEXT,                  -- 소관부처명
        law_type        TEXT,                  -- 법령구분명
        joint_ord_yn    TEXT,                  -- 공동부령구분
        promul_no_joint TEXT,                  -- 공동부령 공포번호
        enforce_dt      INTEGER,               -- 시행일자 (YYYYMMDD)
        self_law_yn     TEXT,                  -- 자법타법여부
        law_link        TEXT,                  -- 법령상세링크
        crawled_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # ──────────────────────────────────────────────
    # 2. 현행법령(시행일) 본문  openlaw_efyd_info
    # ──────────────────────────────────────────────
    cursor.execute("DROP TABLE IF EXISTS openlaw_efyd_info")
    cursor.execute('''
    CREATE TABLE openlaw_efyd_info (
        law_id          INTEGER,               -- 법령ID
        enforce_dt      INTEGER,               -- 시행일자 (YYYYMMDD)
        promul_dt       INTEGER,               -- 공포일자
        promul_no       INTEGER,               -- 공포번호
        lang            TEXT,                  -- 언어구분
        law_type        TEXT,                  -- 법령구분명
        law_type_cd     TEXT,                  -- 법령구분코드
        law_nm_ko       TEXT,                  -- 법령명한글
        law_nm_cn       TEXT,                  -- 법령명한자
        law_abbr        TEXT,                  -- 법령약칭명
        title_change_yn TEXT,                  -- 제명변경여부
        ko_law_yn       TEXT,                  -- 한글법령여부
        chapter_seq     INTEGER,               -- 편장절관조 일련번호
        dept_cd         INTEGER,               -- 소관부처코드
        dept_nm         TEXT,                  -- 소관부처명
        phone           TEXT,                  -- 전화번호
        enact_type      TEXT,                  -- 제개정구분명
        annex_edit_yn   TEXT,                  -- 별표편집여부
        promul_law_yn   TEXT,                  -- 공포법령여부
        contact_dept    TEXT,                  -- 담당부서
        contact_phone   TEXT,                  -- 담당부서전화번호
        joint_ord_type  TEXT,                  -- 공동부령구분
        crawled_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (law_id, enforce_dt)
    )
    ''')

    # ──────────────────────────────────────────────
    # 3. 현행법령(공포일) 목록  openlaw_nw_list
    # ──────────────────────────────────────────────
    cursor.execute("DROP TABLE IF EXISTS openlaw_nw_list")
    cursor.execute('''
    CREATE TABLE openlaw_nw_list (
        law_seq         INTEGER PRIMARY KEY,   -- 법령일련번호
        history_code    TEXT,                  -- 현행연혁코드
        law_nm          TEXT,                  -- 법령명한글
        law_abbr        TEXT,                  -- 법령약칭명
        law_id          INTEGER,               -- 법령ID
        promul_dt       INTEGER,               -- 공포일자 (YYYYMMDD)
        promul_no       INTEGER,               -- 공포번호
        enact_type      TEXT,                  -- 제개정구분명
        dept_cd         TEXT,                  -- 소관부처코드
        dept_nm         TEXT,                  -- 소관부처명
        law_type        TEXT,                  -- 법령구분명
        joint_ord_yn    TEXT,                  -- 공동부령구분
        promul_no_joint TEXT,                  -- 공동부령 공포번호
        enforce_dt      INTEGER,               -- 시행일자 (YYYYMMDD)
        self_law_yn     TEXT,                  -- 자법타법여부
        law_link        TEXT,                  -- 법령상세링크
        crawled_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # ──────────────────────────────────────────────
    # 4. 현행법령(공포일) 본문  openlaw_nw_info
    # ──────────────────────────────────────────────
    cursor.execute("DROP TABLE IF EXISTS openlaw_nw_info")
    cursor.execute('''
    CREATE TABLE openlaw_nw_info (
        law_id          INTEGER,               -- 법령ID
        promul_dt       INTEGER,               -- 공포일자 (YYYYMMDD)
        enforce_dt      INTEGER,               -- 시행일자
        promul_no       INTEGER,               -- 공포번호
        lang            TEXT,                  -- 언어구분
        law_type        TEXT,                  -- 법령구분명
        law_type_cd     TEXT,                  -- 법령구분코드
        law_nm_ko       TEXT,                  -- 법령명한글
        law_nm_cn       TEXT,                  -- 법령명한자
        law_abbr        TEXT,                  -- 법령약칭명
        title_change_yn TEXT,                  -- 제명변경여부
        ko_law_yn       TEXT,                  -- 한글법령여부
        chapter_seq     INTEGER,               -- 편장절관조 일련번호
        dept_cd         INTEGER,               -- 소관부처코드
        dept_nm         TEXT,                  -- 소관부처명
        phone           TEXT,                  -- 전화번호
        enact_type      TEXT,                  -- 제개정구분명
        annex_edit_yn   TEXT,                  -- 별표편집여부
        promul_law_yn   TEXT,                  -- 공포법령여부
        contact_dept    TEXT,                  -- 담당부서
        contact_phone   TEXT,                  -- 담당부서전화번호
        joint_ord_type  TEXT,                  -- 공동부령구분
        crawled_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (law_id, promul_dt)
    )
    ''')

    # ──────────────────────────────────────────────
    # 5. 법령 연혁 목록  openlaw_hst_list
    # ──────────────────────────────────────────────
    cursor.execute("DROP TABLE IF EXISTS openlaw_hst_list")
    cursor.execute('''
    CREATE TABLE openlaw_hst_list (
        law_seq         INTEGER PRIMARY KEY,   -- 법령일련번호
        law_id          INTEGER,               -- 법령ID
        history_code    TEXT,                  -- 현행연혁코드
        law_nm          TEXT,                  -- 법령명한글
        promul_dt       INTEGER,               -- 공포일자 (YYYYMMDD)
        promul_no       INTEGER,               -- 공포번호
        enact_type      TEXT,                  -- 제개정구분명
        dept_nm         TEXT,                  -- 소관부처명
        law_type        TEXT,                  -- 법령구분명
        enforce_dt      INTEGER,               -- 시행일자 (YYYYMMDD)
        law_link        TEXT,                  -- 법령상세링크
        crawled_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # ──────────────────────────────────────────────
    # 6. 법령 연혁 본문  openlaw_hst_info
    # ──────────────────────────────────────────────
    cursor.execute("DROP TABLE IF EXISTS openlaw_hst_info")
    cursor.execute('''
    CREATE TABLE openlaw_hst_info (
        law_id          INTEGER,               -- 법령ID
        promul_dt       INTEGER,               -- 공포일자 (YYYYMMDD)
        law_seq         INTEGER,               -- 법령일련번호
        enforce_dt      INTEGER,               -- 시행일자
        promul_no       INTEGER,               -- 공포번호
        lang            TEXT,                  -- 언어구분
        law_type        TEXT,                  -- 법령구분명
        law_type_cd     TEXT,                  -- 법령구분코드
        law_nm_ko       TEXT,                  -- 법령명한글
        law_nm_cn       TEXT,                  -- 법령명한자
        law_abbr        TEXT,                  -- 법령약칭명
        title_change_yn TEXT,                  -- 제명변경여부
        ko_law_yn       TEXT,                  -- 한글법령여부
        chapter_seq     INTEGER,               -- 편장절관조 일련번호
        dept_cd         INTEGER,               -- 소관부처코드
        dept_nm         TEXT,                  -- 소관부처명
        phone           TEXT,                  -- 전화번호
        enact_type      TEXT,                  -- 제개정구분명
        annex_edit_yn   TEXT,                  -- 별표편집여부
        promul_law_yn   TEXT,                  -- 공포법령여부
        contact_dept    TEXT,                  -- 담당부서
        contact_phone   TEXT,                  -- 담당부서전화번호
        joint_ord_type  TEXT,                  -- 공동부령구분
        crawled_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (law_id, promul_dt)
    )
    ''')

    # ──────────────────────────────────────────────
    # 7. 조항호목(시행일)  openlaw_efyd_jo
    # ──────────────────────────────────────────────
    cursor.execute("DROP TABLE IF EXISTS openlaw_efyd_jo")
    cursor.execute('''
    CREATE TABLE openlaw_efyd_jo (
        law_id          INTEGER,               -- 법령ID
        enforce_dt      INTEGER,               -- 시행일자 (YYYYMMDD)
        jo_no           TEXT,                  -- 조문번호
        jo_yn           TEXT,                  -- 조문여부
        jo_title        TEXT,                  -- 조문제목
        jo_enforce_dt   INTEGER,               -- 조문시행일자
        jo_content      TEXT,                  -- 조문내용
        hang            TEXT,                  -- 항
        ho              TEXT,                  -- 호
        mok             TEXT,                  -- 목
        crawled_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (law_id, enforce_dt, jo_no)
    )
    ''')

    # ──────────────────────────────────────────────
    # 8. 조항호목(공포일)  openlaw_nw_jo
    # ──────────────────────────────────────────────
    cursor.execute("DROP TABLE IF EXISTS openlaw_nw_jo")
    cursor.execute('''
    CREATE TABLE openlaw_nw_jo (
        law_id          INTEGER,               -- 법령ID
        promul_dt       INTEGER,               -- 공포일자 (YYYYMMDD)
        jo_no           TEXT,                  -- 조문번호
        jo_yn           TEXT,                  -- 조문여부
        jo_title        TEXT,                  -- 조문제목
        jo_enforce_dt   INTEGER,               -- 조문시행일자
        jo_content      TEXT,                  -- 조문내용
        hang            TEXT,                  -- 항
        ho              TEXT,                  -- 호
        mok             TEXT,                  -- 목
        crawled_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (law_id, promul_dt, jo_no)
    )
    ''')

    # ──────────────────────────────────────────────
    # 9. 행정규칙 목록  openlaw_admrul_list
    # ──────────────────────────────────────────────
    cursor.execute("DROP TABLE IF EXISTS openlaw_admrul_list")
    cursor.execute('''
    CREATE TABLE openlaw_admrul_list (
        admrul_seq      INTEGER PRIMARY KEY,   -- 행정규칙일련번호
        admrul_nm       TEXT,                  -- 행정규칙명
        issue_dt        INTEGER,               -- 발령일자 (YYYYMMDD)
        issue_no        TEXT,                  -- 발령번호
        enact_type      TEXT,                  -- 제개정구분명
        dept_nm         TEXT,                  -- 소관부처명
        admrul_type     TEXT,                  -- 행정규칙종류명
        enforce_dt      INTEGER,               -- 시행일자 (YYYYMMDD)
        admrul_link     TEXT,                  -- 행정규칙상세링크
        crawled_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # ──────────────────────────────────────────────
    # 10. 행정규칙 본문  openlaw_admrul_info
    # ──────────────────────────────────────────────
    cursor.execute("DROP TABLE IF EXISTS openlaw_admrul_info")
    cursor.execute('''
    CREATE TABLE openlaw_admrul_info (
        admrul_seq      INTEGER,               -- 행정규칙일련번호
        jo_no           TEXT,                  -- 조문번호
        jo_yn           TEXT,                  -- 조문여부
        jo_title        TEXT,                  -- 조문제목
        jo_enforce_dt   INTEGER,               -- 조문시행일자
        jo_content      TEXT,                  -- 조문내용
        hang            TEXT,                  -- 항
        ho              TEXT,                  -- 호
        mok             TEXT,                  -- 목
        crawled_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (admrul_seq, jo_no)
    )
    ''')

    # ──────────────────────────────────────────────
    # 11. 행정규칙 신구법 비교 목록  openlaw_admrul_oldnew_list
    # ──────────────────────────────────────────────
    cursor.execute("DROP TABLE IF EXISTS openlaw_admrul_oldnew_list")
    cursor.execute('''
    CREATE TABLE openlaw_admrul_oldnew_list (
        oldnew_seq      INTEGER PRIMARY KEY,   -- 신구법비교 일련번호
        admrul_nm       TEXT,                  -- 행정규칙명
        old_issue_dt    INTEGER,               -- 구 발령일자 (YYYYMMDD)
        old_issue_no    TEXT,                  -- 구 발령번호
        new_issue_dt    INTEGER,               -- 신 발령일자 (YYYYMMDD)
        new_issue_no    TEXT,                  -- 신 발령번호
        dept_nm         TEXT,                  -- 소관부처명
        crawled_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # ──────────────────────────────────────────────
    # 12. 행정규칙 신구법 비교 본문  openlaw_admrul_oldnew_info
    # ──────────────────────────────────────────────
    cursor.execute("DROP TABLE IF EXISTS openlaw_admrul_oldnew_info")
    cursor.execute('''
    CREATE TABLE openlaw_admrul_oldnew_info (
        admrul_seq      INTEGER,               -- 행정규칙일련번호
        enforce_dt      INTEGER,               -- 시행일자 (YYYYMMDD)
        jo_no           TEXT,                  -- 조문번호
        old_jo_content  TEXT,                  -- 구 조문내용
        new_jo_content  TEXT,                  -- 신 조문내용
        crawled_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (admrul_seq, enforce_dt, jo_no)
    )
    ''')

    conn.commit()
    conn.close()
    print("=" * 50)
    print("DB 초기화 완료")
    print(f"DB 경로 : {DB_PATH}")
    print("생성 테이블 목록 (12개):")
    tables = [
        "  1.  openlaw_efyd_list          현행법령(시행일) 목록",
        "  2.  openlaw_efyd_info          현행법령(시행일) 본문",
        "  3.  openlaw_nw_list            현행법령(공포일) 목록",
        "  4.  openlaw_nw_info            현행법령(공포일) 본문",
        "  5.  openlaw_hst_list           법령 연혁 목록",
        "  6.  openlaw_hst_info           법령 연혁 본문",
        "  7.  openlaw_efyd_jo            조항호목(시행일)",
        "  8.  openlaw_nw_jo              조항호목(공포일)",
        "  9.  openlaw_admrul_list        행정규칙 목록",
        " 10.  openlaw_admrul_info        행정규칙 본문",
        " 11.  openlaw_admrul_oldnew_list 행정규칙 신구법 비교 목록",
        " 12.  openlaw_admrul_oldnew_info 행정규칙 신구법 비교 본문",
    ]
    for t in tables:
        print(t)
    print("=" * 50)


if __name__ == '__main__':
    init_db()
