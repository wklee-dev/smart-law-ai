-- Tax Tribunal press crawler V1.0. Existing non-tt_press tables are untouched.
CREATE TABLE IF NOT EXISTS tt_press_schema (
    component TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    installed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tt_press_posts (
    post_key TEXT PRIMARY KEY,
    source_host TEXT NOT NULL,
    board_code TEXT NOT NULL,
    category TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_id_type TEXT NOT NULL,
    list_number INTEGER,
    title TEXT NOT NULL,
    published_date TEXT,
    source_url TEXT NOT NULL,
    content_text TEXT,
    content_html TEXT,
    source_html TEXT,
    content_sha256 TEXT,
    attachment_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_attempt_at TEXT,
    last_success_at TEXT,
    last_run_id TEXT,
    last_error TEXT
);
CREATE TABLE IF NOT EXISTS tt_press_attachments (
    attachment_key TEXT PRIMARY KEY,
    post_key TEXT NOT NULL REFERENCES tt_press_posts(post_key),
    ordinal INTEGER NOT NULL,
    original_filename TEXT NOT NULL,
    download_url TEXT NOT NULL,
    local_path TEXT,
    size_bytes INTEGER,
    sha256 TEXT,
    content_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_attempt_at TEXT,
    downloaded_at TEXT,
    last_run_id TEXT,
    last_error TEXT,
    UNIQUE(post_key, download_url)
);
CREATE TABLE IF NOT EXISTS tt_press_runs (
    run_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    expected_posts INTEGER,
    scanned_pages INTEGER NOT NULL DEFAULT 0,
    discovered_posts INTEGER NOT NULL DEFAULT 0,
    succeeded_posts INTEGER NOT NULL DEFAULT 0,
    failed_posts INTEGER NOT NULL DEFAULT 0,
    attachments_downloaded INTEGER NOT NULL DEFAULT 0,
    attachments_failed INTEGER NOT NULL DEFAULT 0,
    db_path TEXT NOT NULL,
    download_root TEXT NOT NULL,
    backup_path TEXT,
    notes TEXT
);
CREATE TABLE IF NOT EXISTS tt_press_errors (
    error_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES tt_press_runs(run_id),
    post_key TEXT,
    stage TEXT NOT NULL,
    url TEXT,
    error_type TEXT NOT NULL,
    message TEXT NOT NULL,
    occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tt_press_idx_posts_date ON tt_press_posts(published_date);
CREATE INDEX IF NOT EXISTS tt_press_idx_posts_status ON tt_press_posts(status);
CREATE INDEX IF NOT EXISTS tt_press_idx_attachments_post ON tt_press_attachments(post_key, active);
CREATE INDEX IF NOT EXISTS tt_press_idx_attachments_status ON tt_press_attachments(status);
CREATE INDEX IF NOT EXISTS tt_press_idx_errors_run ON tt_press_errors(run_id);
