import sqlite3
from pathlib import Path

p = Path(r"D:\SQLiteDB\tariff.db")
con = sqlite3.connect(p)
cur = con.cursor()
y, cc = 2026, "KR"
pred = "CAST(year AS INTEGER)=? AND UPPER(TRIM(country_code))=?"
for t in ["tariff_section", "tariff_chapter", "tariff_heading", "tariff_item"]:
    total = cur.execute(f"SELECT COUNT(*) FROM {t} WHERE {pred}", (y, cc)).fetchone()[0]
    with_embed = cur.execute(
        f"SELECT COUNT(*) FROM {t} WHERE {pred} AND embed_text IS NOT NULL AND TRIM(embed_text)!=''",
        (y, cc),
    ).fetchone()[0]
    print(f"{t}: total={total} with_embed_text={with_embed}")
con.close()
