import sqlite3
from pathlib import Path

p = Path(r"D:\SQLiteDB\tariff.db")
con = sqlite3.connect(p)
cur = con.cursor()
for t in ["tariff_section", "tariff_chapter", "tariff_heading", "tariff_item"]:
    try:
        n = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"{t}: {n}")
    except Exception as e:
        print(f"{t}: (missing) {e}")
print("KR years (section):")
for row in cur.execute(
    """SELECT CAST(year AS INTEGER), COUNT(*) FROM tariff_section
       WHERE UPPER(TRIM(country_code))='KR' GROUP BY 1 ORDER BY 1 DESC LIMIT 15"""
):
    print(f"  {row[0]}: {row[1]}")
con.close()
