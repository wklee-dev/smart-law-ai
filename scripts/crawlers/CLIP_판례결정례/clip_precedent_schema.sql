-- ==============================================================================
-- clip_precedent 크롤러 데이터베이스 스키마
-- DB: D:\SQLiteDB\smart_law_ai.db (통합)
-- 참고: 통합 DB의 crawl_meta 는 공유 스키마
--       (gubun, param, description, url, seq_id, crawled_at, status)
--       이며 CREATE IF NOT EXISTS 로는 기존 테이블을 변경하지 않음.
--       크롤러 update_meta() 가 공유 스키마를 우선 사용함.
-- ==============================================================================

BEGIN TRANSACTION;

-- 단독 DB용 폴백 (이미 smart_law_ai 공유 crawl_meta 가 있으면 이 DDL은 무시됨)
CREATE TABLE IF NOT EXISTS crawl_meta (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    gubun       TEXT,
    param       TEXT,
    url         TEXT,
    status      TEXT,
    message     TEXT,
    created_at  TEXT DEFAULT (datetime('now','localtime')),
    updated_at  TEXT DEFAULT (datetime('now','localtime'))
);

-- 판례/결정례 기본 정보 테이블 (목록 API에서 수집)
CREATE TABLE IF NOT EXISTS clip_precedent (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    gubun                   TEXT,                       -- 'clip_precedent'
    dsbd_incd_clsf_cd       TEXT,                       -- 심판유형코드 (0160: 과세전적부심사 등)
    dsbd_incd_clsf_cd_nm    TEXT,                       -- 심판유형명
    dsbd_incd_dtrm_ofc_cstm_sgn TEXT,                   -- 처분청코드
    dsbd_incd_dtrm_ofc_cstm_sgn_nm TEXT,                -- 처분청명
    dsbd_incd_no            TEXT,                       -- 상세 조회용 일련번호 (dtlDsbdIncdNo)
    dsbd_isue_lrcl_cd       TEXT,                       -- 쟁점분류코드
    dsbd_isue_lrcl_cd_nm    TEXT,                       -- 쟁점분류명
    dtrm_dt                 TEXT,                       -- 결정일자 (YYYYMMDD)
    incd_no                 TEXT,                       -- 사건번호
    wrdc_ttle               TEXT,                       -- 결정서제목
    created_at              TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_clip_precedent_incd_no ON clip_precedent (incd_no);
CREATE INDEX IF NOT EXISTS idx_clip_precedent_dsbd_incd_no ON clip_precedent (dsbd_incd_no);
CREATE INDEX IF NOT EXISTS idx_clip_precedent_gubun ON clip_precedent (gubun);

-- 판례/결정례 상세 본문 테이블 (상세 API에서 수집)
CREATE TABLE IF NOT EXISTS clip_precedent_detail (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    gubun                   TEXT,                       -- 'clip_precedent'
    dsbd_incd_no            TEXT,                       -- 상세 조회용 일련번호 (FK)
    incd_no                 TEXT,                       -- 사건번호
    dtrm_type               TEXT,                       -- 결정유형
    order_text              TEXT,                       -- 주문
    claim_reason            TEXT,                       -- 청구경위
    claimant_arg            TEXT,                       -- 청구인주장
    agency_arg              TEXT,                       -- 처분청주장
    issue                   TEXT,                       -- 쟁점사항
    judgement               TEXT,                       -- 심리 및 판단
    conclusion              TEXT,                       -- 결론
    created_at              TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_clip_precedent_detail_dsbd_incd_no ON clip_precedent_detail (dsbd_incd_no);
CREATE INDEX IF NOT EXISTS idx_clip_precedent_detail_incd_no ON clip_precedent_detail (incd_no);

-- 판례/결정례 전심사건내역
CREATE TABLE IF NOT EXISTS clip_precedent_history (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    gubun                   TEXT,                       -- 'clip_precedent'
    dsbd_incd_no            TEXT,                       -- 상세 조회용 일련번호 (FK)
    hist_incd_no            TEXT,                       -- 전심사건번호
    created_at              TEXT DEFAULT (datetime('now','localtime'))
);

-- 판례/결정례 관련법령
CREATE TABLE IF NOT EXISTS clip_precedent_law (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    gubun                   TEXT,                       -- 'clip_precedent'
    dsbd_incd_no            TEXT,                       -- 상세 조회용 일련번호 (FK)
    law_name                TEXT,                       -- 관련법령
    law_content             TEXT,                       -- 관련법령 내용
    created_at              TEXT DEFAULT (datetime('now','localtime'))
);

-- 판례/결정례 관련HS
CREATE TABLE IF NOT EXISTS clip_precedent_hs (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    gubun                   TEXT,                       -- 'clip_precedent'
    dsbd_incd_no            TEXT,                       -- 상세 조회용 일련번호 (FK)
    hs_code                 TEXT,                       -- HS코드명
    kor_name                TEXT,                       -- 품명 국문
    eng_name                TEXT,                       -- 품명 영문
    created_at              TEXT DEFAULT (datetime('now','localtime'))
);

-- 첨부파일 관리 테이블
CREATE TABLE IF NOT EXISTS clip_precedent_attachment (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    gubun                   TEXT,
    dsbd_incd_no            TEXT,
    incd_no                 TEXT,
    attch_file_id           TEXT,
    file_name               TEXT,
    file_type               TEXT,
    local_path              TEXT,
    download_url            TEXT,
    downloaded              INTEGER DEFAULT 0,
    created_at              TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_clip_precedent_attachment_dsbd ON clip_precedent_attachment (dsbd_incd_no);

-- 이미지 관리 테이블 (본문 내 이미지 BLOB 저장)
CREATE TABLE IF NOT EXISTS clip_precedent_image (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    gubun                   TEXT,
    dsbd_incd_no            TEXT,
    incd_no                 TEXT,
    img_order               INTEGER DEFAULT 1,
    mime_type               TEXT,
    file_ext                TEXT,
    image_data              BLOB,
    download_url            TEXT,
    created_at              TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_clip_precedent_image_dsbd ON clip_precedent_image (dsbd_incd_no);

COMMIT;
