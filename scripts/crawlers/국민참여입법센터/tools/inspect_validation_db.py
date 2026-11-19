from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for relative in ("data/live_validation/smart_law_ai.db", "data/live_admin_validation/smart_law_ai.db"):
    path = ROOT / relative
    con = sqlite3.connect(path)
    print(f"DB: {path}")
    for table in ("nlc_week_crawl_history", "nlc_ministry_legislation_notice", "nlc_ministry_administrative_notice", "nlc_notice_attachment", "nlc_crawl_error"):
        count = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count}")
    history = con.execute("SELECT run_id, status, legislation_completed, administrative_completed, attachment_downloaded, attachment_reused, error_count FROM nlc_week_crawl_history ORDER BY run_id").fetchall()
    print(f"  history: {history}")
    legislation = con.execute("SELECT notice_sequence, title, length(body_text) FROM nlc_ministry_legislation_notice").fetchall()
    administrative = con.execute("SELECT notice_sequence, title, length(body_text) FROM nlc_ministry_administrative_notice").fetchall()
    attachments = con.execute("SELECT file_sequence, file_name, file_size, download_status, substr(checksum_sha256, 1, 12) FROM nlc_notice_attachment ORDER BY file_sequence").fetchall()
    if legislation:
        print(f"  legislation records (sequence, title, body chars): {legislation}")
    if administrative:
        print(f"  administrative records (sequence, title, body chars): {administrative}")
    if attachments:
        print(f"  attachments (sequence, filename, bytes, status, hash prefix): {attachments}")
    con.close()
