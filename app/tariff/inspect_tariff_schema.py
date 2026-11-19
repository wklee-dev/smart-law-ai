import sqlite3
from pathlib import Path

p = Path(r"D:\SQLiteDB\tariff.db")
con = sqlite3.connect(p)
cur = con.cursor()
for t in ["tariff_section", "tariff_chapter", "tariff_heading", "tariff_item"]:
    print("===", t)
    for row in cur.execute(f"PRAGMA table_info({t})"):
        print(row)
    print()
for y in [2026, 2025, 2024]:
    n = cur.execute(
        """SELECT COUNT(*) FROM tariff_item
           WHERE CAST(year AS INTEGER)=?
             AND UPPER(TRIM(country_code))='KR'""",
        (y,),
    ).fetchone()[0]
    print(f"KR items {y}:", n)
con.close()
