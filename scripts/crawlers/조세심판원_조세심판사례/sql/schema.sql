-- ============================================================================
--  Tax Tribunal decision-case collector - schema (NEW TABLES ONLY)
--  Schema version : 1.0
--  Prefix         : {{PREFIX}}   (default tb_tt_)
--  Target DB      : D:\SQLiteDB\smart_law_ai.db   (existing DB, reused as-is)
--
--  SAFETY RULES
--   1. Existing tables are never created, altered or dropped here.
--   2. Every DDL uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--   3. Table and column names use English abbreviations.
--   4. Long body text lives in a separate table (case_body) so the master
--      table stays fast to query.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Metadata (schema version / initialization time)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS {{PREFIX}}meta (
    meta_key    TEXT PRIMARY KEY,          -- metadata key
    meta_value  TEXT,                      -- metadata value
    updated_at  TEXT                       -- updated at (YYYY-MM-DD HH:MM:SS)
);

-- ---------------------------------------------------------------------------
-- 2. Tax category master
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS {{PREFIX}}semok (
    semok_code  TEXT PRIMARY KEY,          -- category code (11/12/20/40/50/90/95~99)
    semok_name  TEXT NOT NULL,             -- category name
    semok_group TEXT,                      -- group (National / Local)
    sort_order  INTEGER DEFAULT 0,         -- display order
    use_yn      TEXT DEFAULT 'Y',          -- enabled flag
    updated_at  TEXT                       -- updated at
);

-- ---------------------------------------------------------------------------
-- 3. Crawl target list (staging)  <- stage 1: collected from list pages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS {{PREFIX}}case_list (
    list_id       INTEGER PRIMARY KEY AUTOINCREMENT,  -- internal sequence
    dem_no        INTEGER NOT NULL,                   -- site key (dem_no), natural key
    semok_code    TEXT,                               -- category code
    semok_name    TEXT,                               -- category label (as shown on site)
    page_no       INTEGER,                            -- source list page number
    decision_date TEXT,                               -- decision date (YYYY-MM-DD)
    claim_no      TEXT,                               -- claim number
    decision_type TEXT,                               -- decision type
    title         TEXT,                               -- title (from list)
    list_summary  TEXT,                               -- summary (from list)
    detail_yn     TEXT DEFAULT 'N',                   -- detail collected (Y/N)
    detail_at     TEXT,                               -- detail collected at
    retry_cnt     INTEGER DEFAULT 0,                  -- detail retry count
    first_seen_at TEXT,                               -- first seen at
    last_seen_at  TEXT,                               -- last seen at
    UNIQUE(dem_no)
);
CREATE INDEX IF NOT EXISTS ix_{{PREFIX}}case_list_semok ON {{PREFIX}}case_list(semok_code);
CREATE INDEX IF NOT EXISTS ix_{{PREFIX}}case_list_done  ON {{PREFIX}}case_list(detail_yn);
CREATE INDEX IF NOT EXISTS ix_{{PREFIX}}case_list_date  ON {{PREFIX}}case_list(decision_date);

-- ---------------------------------------------------------------------------
-- 4. Category collection status (reconciliation with the site totals)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS {{PREFIX}}semok_stat (
    semok_code      TEXT PRIMARY KEY,      -- category code
    total_cnt       INTEGER DEFAULT 0,     -- total rows reported by the site
    total_pages     INTEGER DEFAULT 0,     -- total pages reported by the site
    last_checked_at TEXT                   -- last checked at
);

-- ---------------------------------------------------------------------------
-- 5. Decision case master            <- stage 2: detail page + body viewer
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS {{PREFIX}}case (
    case_id        INTEGER PRIMARY KEY AUTOINCREMENT, -- internal sequence
    dem_no         INTEGER NOT NULL,                  -- site key, natural key
    doc_no         TEXT,                              -- document number
    claim_no       TEXT,                              -- claim number (from body)
    semok_code     TEXT,                              -- category code
    semok_name     TEXT,                              -- category label
    decision_type  TEXT,                              -- decision type
    decision_date  TEXT,                              -- decision date (YYYY-MM-DD)
    title          TEXT,                              -- title
    summary        TEXT,                              -- decision summary
    related_law    TEXT,                              -- related statutes
    ref_decision   TEXT,                              -- referenced decision
    fol_decision   TEXT,                              -- followed decision
    order_text     TEXT,                              -- order
    reason_text    TEXT,                              -- full reasoning
    body_text      TEXT,                              -- full body text (search/index)
    source_url     TEXT,                              -- source URL
    attach_cnt     INTEGER DEFAULT 0,                 -- attachment count
    content_hash   TEXT,                              -- body SHA-1 (change detect)
    crawl_status   TEXT DEFAULT 'OK',                 -- OK / PARTIAL / FAIL
    first_crawled_at TEXT,                            -- first collected at
    last_crawled_at  TEXT,                            -- last collected at
    UNIQUE(dem_no)
);
CREATE INDEX IF NOT EXISTS ix_{{PREFIX}}case_semok  ON {{PREFIX}}case(semok_code);
CREATE INDEX IF NOT EXISTS ix_{{PREFIX}}case_date   ON {{PREFIX}}case(decision_date);
CREATE INDEX IF NOT EXISTS ix_{{PREFIX}}case_claim  ON {{PREFIX}}case(claim_no);
CREATE INDEX IF NOT EXISTS ix_{{PREFIX}}case_docno  ON {{PREFIX}}case(doc_no);
CREATE INDEX IF NOT EXISTS ix_{{PREFIX}}case_hash   ON {{PREFIX}}case(content_hash);

-- ---------------------------------------------------------------------------
-- 6. Decision body text (long text kept separate)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS {{PREFIX}}case_body (
    case_id      INTEGER PRIMARY KEY,      -- FK -> case.case_id
    dem_no       INTEGER,                  -- site key
    body_text    TEXT,                     -- full body text
    viewer_html  TEXT,                     -- raw viewer HTML (optional)
    text_len     INTEGER DEFAULT 0,        -- body length in characters
    extracted_at TEXT                      -- extracted at
);
CREATE INDEX IF NOT EXISTS ix_{{PREFIX}}case_body_dem ON {{PREFIX}}case_body(dem_no);

-- ---------------------------------------------------------------------------
-- 7. Attachment metadata (HWP / PDF)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS {{PREFIX}}attach (
    attach_id    INTEGER PRIMARY KEY AUTOINCREMENT, -- sequence
    dem_no       INTEGER NOT NULL,                  -- site key
    file_name    TEXT,                              -- file name
    file_path    TEXT,                              -- server file path
    file_ext     TEXT,                              -- extension (hwp/pdf/...)
    dem_str      TEXT,                              -- document number string
    download_url TEXT,                              -- download URL
    saved_path   TEXT,                              -- local saved path
    download_yn  TEXT DEFAULT 'N',                  -- downloaded flag
    reg_at       TEXT,                              -- registered at
    UNIQUE(dem_no, file_path)
);
CREATE INDEX IF NOT EXISTS ix_{{PREFIX}}attach_dem ON {{PREFIX}}attach(dem_no);

-- ---------------------------------------------------------------------------
-- 8. Crawl run log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS {{PREFIX}}crawl_log (
    log_id     INTEGER PRIMARY KEY AUTOINCREMENT, -- sequence
    run_id     TEXT,                              -- run id
    phase      TEXT,                              -- phase (list/detail/full/export)
    target     TEXT,                              -- category code or ALL
    started_at TEXT,                              -- started at
    ended_at   TEXT,                              -- ended at
    ok_cnt     INTEGER DEFAULT 0,                 -- succeeded
    skip_cnt   INTEGER DEFAULT 0,                 -- skipped
    fail_cnt   INTEGER DEFAULT 0,                 -- failed
    arg_text   TEXT,                              -- command arguments
    result_msg TEXT,                              -- result message
    status     TEXT DEFAULT 'RUN'                 -- RUN / OK / FAIL
);

-- ---------------------------------------------------------------------------
-- 9. Error log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS {{PREFIX}}error_log (
    error_id    INTEGER PRIMARY KEY AUTOINCREMENT, -- sequence
    run_id      TEXT,                              -- run id
    phase       TEXT,                              -- phase
    dem_no      TEXT,                              -- site key
    page_url    TEXT,                              -- request URL
    error_type  TEXT,                              -- error type
    error_msg   TEXT,                              -- error message
    occurred_at TEXT                               -- occurred at
);
CREATE INDEX IF NOT EXISTS ix_{{PREFIX}}error_run ON {{PREFIX}}error_log(run_id);