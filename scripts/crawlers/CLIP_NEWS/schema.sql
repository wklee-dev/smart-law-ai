-- Customs CLIP administrative notice crawler V1.0.
-- Only crawler-owned objects are created; existing application tables are untouched.
CREATE TABLE IF NOT EXISTS clip_admin_notices (
    notice_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    department_code TEXT NOT NULL DEFAULT '',
    department_name TEXT NOT NULL DEFAULT '',
    written_date TEXT NOT NULL DEFAULT '',
    publication_year TEXT NOT NULL DEFAULT '',
    publication_number TEXT NOT NULL DEFAULT '',
    notice_type_code TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL,
    content_html TEXT NOT NULL DEFAULT '',
    content_text TEXT NOT NULL DEFAULT '',
    list_hash TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL DEFAULT '',
    raw_list_json TEXT NOT NULL DEFAULT '{}',
    detail_status TEXT NOT NULL DEFAULT 'pending' CHECK(detail_status IN ('pending','ok','failed')),
    first_crawled_at TEXT NOT NULL,
    last_crawled_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clip_admin_attachments (
    attachment_pk INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_id TEXT NOT NULL REFERENCES clip_admin_notices(notice_id),
    file_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    download_url TEXT NOT NULL,
    local_path TEXT NOT NULL DEFAULT '',
    relative_path TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT '',
    download_status TEXT NOT NULL DEFAULT 'pending' CHECK(download_status IN ('pending','ok','failed')),
    is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0,1)),
    downloaded_at TEXT,
    last_seen_at TEXT NOT NULL,
    error_message TEXT NOT NULL DEFAULT '',
    UNIQUE(notice_id, file_id)
);
CREATE TABLE IF NOT EXISTS clip_admin_crawl_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    requested_mode TEXT NOT NULL,
    effective_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    total_on_site INTEGER NOT NULL DEFAULT 0,
    list_pages INTEGER NOT NULL DEFAULT 0,
    seen_count INTEGER NOT NULL DEFAULT 0,
    new_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    downloaded_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    backup_path TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS clip_admin_crawl_state (
    state_key TEXT PRIMARY KEY,
    state_value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clip_admin_crawl_errors (
    error_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES clip_admin_crawl_runs(run_id),
    notice_id TEXT,
    file_id TEXT,
    stage TEXT NOT NULL,
    error_message TEXT NOT NULL,
    occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS clip_admin_idx_written_date ON clip_admin_notices(written_date DESC);
CREATE INDEX IF NOT EXISTS clip_admin_idx_department ON clip_admin_notices(department_code);
CREATE INDEX IF NOT EXISTS clip_admin_idx_attachment_status ON clip_admin_attachments(download_status, is_current);
CREATE INDEX IF NOT EXISTS clip_admin_idx_errors_run ON clip_admin_crawl_errors(run_id);
