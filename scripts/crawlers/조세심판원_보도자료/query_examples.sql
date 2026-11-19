-- Read-only verification queries. Run in an SQLite query tool after collection.

-- 1. Latest press releases with body text.
SELECT post_key, list_number, title, published_date, status, attachment_count,
       content_text, source_url
FROM tt_press_posts
ORDER BY published_date DESC, list_number DESC
LIMIT 20;

-- 2. Active attachments which are not downloaded successfully.
SELECT p.title, a.original_filename, a.status, a.last_error, a.download_url
FROM tt_press_attachments a
JOIN tt_press_posts p ON p.post_key = a.post_key
WHERE a.active = 1 AND a.status <> 'downloaded'
ORDER BY p.published_date DESC, a.ordinal;

-- 3. Recent runs. Only full + success with matching counts is a full collection.
SELECT run_id, started_at, finished_at, mode, status, expected_posts,
       scanned_pages, discovered_posts, succeeded_posts, failed_posts,
       attachments_downloaded, attachments_failed, notes
FROM tt_press_runs
ORDER BY started_at DESC
LIMIT 20;

-- 4. Posts/attachments grouped by status.
SELECT 'posts' AS record_kind, status, COUNT(*) AS record_count
FROM tt_press_posts GROUP BY status
UNION ALL
SELECT 'active_attachments', status, COUNT(*)
FROM tt_press_attachments WHERE active = 1 GROUP BY status;

-- 5. Error history, newest first.
SELECT e.occurred_at, e.run_id, e.stage, e.post_key, e.error_type, e.message, e.url
FROM tt_press_errors e ORDER BY e.error_id DESC LIMIT 100;

-- 6. FK and database integrity checks (no data modification).
PRAGMA foreign_key_check;
PRAGMA quick_check;
