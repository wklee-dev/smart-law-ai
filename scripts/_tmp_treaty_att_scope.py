# -*- coding: utf-8 -*-
import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
conn = sqlite3.connect(r"D:/SQLiteDB/smart_law_ai.db")
print("=== treaties by category ===")
for r in conn.execute(
    "SELECT category_name, COUNT(*) FROM clip_treaties GROUP BY 1 ORDER BY 2 DESC"
):
    print(r)
print("=== attachments by category ===")
for r in conn.execute(
    """
    SELECT t.category_name, a.download_status, COUNT(*)
    FROM clip_treaty_attachments a
    JOIN clip_treaties t ON t.trty_srno = a.trty_srno
    GROUP BY 1,2 ORDER BY 1,2
    """
):
    print(r)
print("=== ext by category ===")
for r in conn.execute(
    """
    SELECT t.category_name,
           lower(replace(a.file_name, rtrim(a.file_name, replace(a.file_name,'.','')),'')) AS ext,
           COUNT(*)
    FROM clip_treaty_attachments a
    JOIN clip_treaties t ON t.trty_srno = a.trty_srno
    GROUP BY 1,2 ORDER BY 1,3 DESC
    """
):
    print(r)
# fta doc coverage
print("=== fta docs by status ===")
for r in conn.execute(
    "SELECT extract_status, COUNT(*) FROM clip_fta_agreement_doc GROUP BY 1"
):
    print(r)
print(
    "fta docs trty distinct",
    conn.execute("SELECT COUNT(DISTINCT trty_srno) FROM clip_fta_agreement_doc").fetchone()[0],
)
print(
    "all treaties with att",
    conn.execute(
        "SELECT COUNT(DISTINCT trty_srno) FROM clip_treaty_attachments"
    ).fetchone()[0],
)
# disk files
root = Path(r"D:/SQLiteDB/attachments/조약협정")
files = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() != ".part"]
from collections import Counter
print("disk files", len(files), Counter(p.suffix.lower() for p in files))
conn.close()
