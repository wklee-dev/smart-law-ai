-- =====================================================================
-- 대한민국 전자관보 품목분류 고시 크롤러 - 데이터베이스 스키마
-- 데이터베이스: D:\SQLiteDB\smart_law_ai.db
-- 기존 DB 내 테이블과 구분을 위해 모든 테이블에 TB_GWANBO_* 접두어 사용
-- =====================================================================

-- 1. 고시 마스터 테이블 (전자관보 고시 본문 및 메타정보)
CREATE TABLE IF NOT EXISTS TB_GWANBO_NOTICE (
    notice_id          TEXT PRIMARY KEY,                  -- 고유 ID (예: GWB_20260914_I0000000000000001788828932098000)
    toc_id             TEXT,                              -- 목차 일련번호 (cntnt_seq_no 다운로드 키)
    content_id         TEXT,                              -- 본문(전자관보) 일련번호
    category_name      TEXT,                              -- 구분명 (고시)
    category_order     INTEGER,                           -- 구분 순서코드 (10: 고시)
    reg_date           TEXT,                              -- 발행일 (YYYYMMDD)
    ofctt_num          INTEGER,                           -- 관보 호수
    title              TEXT,                              -- 고시 제목
    organ_nm           TEXT,                              -- 발행기관명 (예: 관세청)
    organ_code         TEXT,                              -- 기관코드
    laword_nm          TEXT,                              -- 관련법령명 (예: 관세법)
    laword_seq_no      TEXT,                              -- 법령 일련번호
    viewer_url         TEXT,                              -- 웹 뷰어 전체 URL
    pdf_file_name      TEXT,                              -- 저장된 PDF 파일명
    pdf_file_path      TEXT,                              -- 저장된 PDF 전체 경로
    pdf_file_size      INTEGER,                           -- PDF 파일 크기(bytes)
    page_count         INTEGER,                           -- PDF 총 페이지 수
    body_text          TEXT,                              -- PDF에서 추출한 본문 전문 텍스트
    search_keyword     TEXT,                              -- 수집에 사용된 검색어
    collect_page       INTEGER,                           -- 수집된 검색결과 페이지 번호
    crawl_dt           TEXT,                              -- 최초 수집일시 (YYYY-MM-DD HH:MM:SS)
    updated_dt         TEXT                               -- 최종 갱신일시
);

-- 2. 물품별 변경 내역 테이블 (본문에서 파싱된 변경 대상 물품 항목)
CREATE TABLE IF NOT EXISTS TB_GWANBO_ITEM (
    item_id            INTEGER PRIMARY KEY AUTOINCREMENT, -- 물품 일련번호(PK)
    notice_id          TEXT,                              -- 고시 ID (FK)
    item_no            INTEGER,                           -- 연번 (예: 682)
    item_name          TEXT,                              -- 품명 (예: Glass wool 제품)
    prev_doc_no        TEXT,                              -- 종전 공문 번호
    prev_hs_code       TEXT,                              -- 변경전 HS 품목번호
    new_hs_code        TEXT,                              -- 변경후 HS 품목번호
    change_reason      TEXT,                              -- 변경 사유
    goods_desc         TEXT,                              -- 물품 설명
    effective_date     TEXT,                              -- 적용일 규정
    FOREIGN KEY(notice_id) REFERENCES TB_GWANBO_NOTICE(notice_id)
);

-- 3. 크롤링 실행 로그 테이블 (작업 이력 관리)
CREATE TABLE IF NOT EXISTS TB_GWANBO_CRAWL_LOG (
    log_id             INTEGER PRIMARY KEY AUTOINCREMENT, -- 로그 일련번호(PK)
    start_dt           TEXT,                              -- 수집 시작일시
    end_dt             TEXT,                              -- 수집 종료일시
    keyword            TEXT,                              -- 실제 사용된 검색어
    fallback_used      INTEGER,                           -- 폴백 검색 사용 여부 (0: 1차, 1: 2차)
    target_category    TEXT,                              -- 대상 구분 (고시)
    total_count        INTEGER,                           -- 검색된 총 건수
    collected_count    INTEGER,                           -- 정상 수집 건수
    error_count        INTEGER,                           -- 오류 건수
    pages_processed    INTEGER,                           -- 처리 페이지 수
    status             TEXT,                              -- 실행 상태 (SUCCESS / PARTIAL / EMPTY)
    message            TEXT                               -- 요약 메시지
);

-- 4. 조회 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS IDX_GWANBO_REGDATE ON TB_GWANBO_NOTICE(reg_date);
CREATE INDEX IF NOT EXISTS IDX_GWANBO_KEYWORD ON TB_GWANBO_NOTICE(search_keyword);
CREATE INDEX IF NOT EXISTS IDX_GWANBO_ITEM_FK ON TB_GWANBO_ITEM(notice_id);
