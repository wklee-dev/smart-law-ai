-- ==============================================================================
-- clip_question 마이그레이션 스크립트
-- 대상: D:\SQLiteDB\smart_law_ai.db (개별 clip_question.db 폐지)
--
-- 테이블 구성:
--   1. clip_question        - 질의회신 본문 (FTA/통관/심사/조사/공통 공통 구조)
--   2. clip_question_image  - 본문 내 이미지 BLOB 저장
--   3. clip_question_crawl_meta - 페이지별 크롤링 이력 관리
--      (통합 DB 공유 crawl_meta 와 분리 — 스키마 충돌 방지)
--
-- 적용 방법:
--   sqlite3 "D:\SQLiteDB\smart_law_ai.db" < clip_question_migration.sql
--
-- 비고:
--   - CREATE TABLE IF NOT EXISTS 사용 → 이미 존재하면 건너뜀
--   - 기존 테이블이 있어도 안전하게 실행 가능
-- ==============================================================================

BEGIN TRANSACTION;

-- ==============================================================================
-- 1. clip_question  (질의회신 본문)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS clip_question (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    -- 식별자
    seq_id              TEXT UNIQUE,        -- 게시물 고유 ID (예: 2023000003)

    -- 목록 정보
    gubun               TEXT,               -- 질의구분
                                            --   민원질의-개인 / 민원질의-업체
                                            --   내부질의-세관 / 내부질의-본청
                                            --   외부질의-기관
    category            TEXT,               -- 업무분야 (예: FTA > 한미FTA, 심사 > 징수)
    title               TEXT,               -- 제목
    receive_date        TEXT,               -- 접수일자 (YYYY-MM-DD)
    reply_date          TEXT,               -- 회신일자 (YYYY-MM-DD)
    reply_dept          TEXT,               -- 회신부서

    -- 상세 본문 필드 (카테고리 공통)
    question_summary    TEXT,               -- 질의요지
    law_target          TEXT,               -- 해석대상 법령/규칙
    law_basis           TEXT,               -- 관련법령 근거규정
    detail_content      TEXT,               -- 상세내용
    reply_content       TEXT,               -- 회신서내용

    -- 전체 본문 통합 (위 5개 필드를 하나로 합친 텍스트)
    content             TEXT,

    created_at          TEXT DEFAULT (datetime('now','localtime'))
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_clip_question_seq
    ON clip_question (seq_id);

CREATE INDEX IF NOT EXISTS idx_clip_question_gubun
    ON clip_question (gubun);

CREATE INDEX IF NOT EXISTS idx_clip_question_category
    ON clip_question (category);

CREATE INDEX IF NOT EXISTS idx_clip_question_receive_date
    ON clip_question (receive_date);

CREATE INDEX IF NOT EXISTS idx_clip_question_reply_date
    ON clip_question (reply_date);

-- ==============================================================================
-- 2. clip_question_image  (본문 내 이미지 BLOB 저장)
--    [기본원칙] 모든 크롤링에서 이미지는 테이블에 저장해서 읽어 올 수 있게 한다.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS clip_question_image (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    seq_id      TEXT    NOT NULL,           -- 게시물 고유 ID (clip_question.seq_id 참조)
    img_src     TEXT,                       -- 원본 이미지 src (URL 또는 상대경로)
    img_data    BLOB,                       -- 이미지 바이너리 데이터
    created_at  TEXT DEFAULT (datetime('now','localtime')),

    FOREIGN KEY (seq_id) REFERENCES clip_question (seq_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_clip_question_image_seq
    ON clip_question_image (seq_id);

-- ==============================================================================
-- 3. clip_question_crawl_meta  (페이지별 크롤링 이력)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS clip_question_crawl_meta (
    page_no     INTEGER NOT NULL,           -- 페이지 번호
    category    TEXT    NOT NULL,           -- 카테고리 코드 (all / 01~05)
    crawled_at  TEXT,                       -- 크롤링 시각 (ISO 8601)
    status      TEXT,                       -- SUCCESS / FAILED_LIST / EMPTY

    PRIMARY KEY (page_no, category)
);

CREATE INDEX IF NOT EXISTS idx_clip_q_crawl_meta_category
    ON clip_question_crawl_meta (category);

CREATE INDEX IF NOT EXISTS idx_clip_q_crawl_meta_status
    ON clip_question_crawl_meta (status);

COMMIT;

-- ==============================================================================
-- [참고] 카테고리 코드
-- ==============================================================================
--   all : 전체 (1,263건, 127페이지)
--   01  : FTA (64건, 7페이지)
--   02  : 통관 (305건, 31페이지)
--   03  : 심사 (871건, 88페이지)
--   04  : 조사 (18건, 2페이지)
--   05  : 공통 (5건, 1페이지)
--
-- [참고] 첨부파일 저장 경로
--   D:\SQLiteDB\ATTACH\CLIP_QUESTION\{seq_id}_{원본파일명}
-- ==============================================================================
