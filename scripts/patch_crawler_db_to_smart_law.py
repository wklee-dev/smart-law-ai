# -*- coding: utf-8 -*-
"""Patch crawler default DB paths to smart_law_ai.db and update Excel J column."""
from __future__ import annotations
import re
from pathlib import Path
import openpyxl

TARGET = r"D:\SQLiteDB\smart_law_ai.db"
TARGET_FWD = "D:/SQLiteDB/smart_law_ai.db"

replacements = [
    # (path, list of (old, new))
    (
        r"D:\Crawling\품목분류_국내사례\crawler_modified.py",
        [
            (r"D:\\SQLiteDB\\domestic_hs_class.db", r"D:\\SQLiteDB\\smart_law_ai.db"),
            (r"D:\SQLiteDB\domestic_hs_class.db", TARGET),
        ],
    ),
    (
        r"D:\Crawling\품목분류_외국사례\customs_foreign_cases_crawler.py",
        [
            (r"D:\\SQLiteDB\\hsforeigncase.db", r"D:\\SQLiteDB\\smart_law_ai.db"),
            (r"D:\SQLiteDB\hsforeigncase.db", TARGET),
        ],
    ),
    (
        r"D:\Crawling\CLIP_행정규칙\clip_crawler.py",
        [
            (r"D:\SQLiteDB\clip_admin_rule.db", TARGET),
            (r"/home/ubuntu/clip_admin_rule.db", "/home/ubuntu/smart_law_ai.db"),
        ],
    ),
    (
        r"D:\Crawling\CLIP_판례결정례\clip_precedent.py",
        [
            (r"D:\SQLiteDB\clip_precedent.db", TARGET),
            (r"/home/ubuntu/upload/clip_precedent.db", "/home/ubuntu/upload/smart_law_ai.db"),
        ],
    ),
    (
        r"D:\Crawling\CLIP_질의회신\clip_question_crawler_final.py",
        [
            (r"D:/SQLiteDB/clip_question.db", TARGET_FWD),
            (r"D:\\SQLiteDB\\clip_question.db", r"D:\\SQLiteDB\\smart_law_ai.db"),
        ],
    ),
    (
        r"D:\Crawling\HS해설서\crawl_hs_manual_final.py",
        [
            (r"D:\SQLiteDB\hs_manual_complete.db", TARGET),
            (r"D:\\SQLiteDB\\hs_manual_complete.db", r"D:\\SQLiteDB\\smart_law_ai.db"),
        ],
    ),
    (
        r"D:\Crawling\HS해설서\verify_hs_manual_v2.py",
        [
            (r"D:\SQLiteDB\hs_manual_complete.db", TARGET),
            (r"D:\\SQLiteDB\\hs_manual_complete.db", r"D:\\SQLiteDB\\smart_law_ai.db"),
        ],
    ),
    (
        r"D:\Crawling\Tariff\tariff_crawler_v2.py",
        [
            ('os.path.join(r"D:\\SQLiteDB", "tariff.db")', f'r"{TARGET}"'),
            (r"D:\\SQLiteDB\\tariff.db", r"D:\\SQLiteDB\\smart_law_ai.db"),
        ],
    ),
    (
        r"D:\Crawling\Tariff\tariff_crawler.py",
        [
            ('os.path.join(r"D:\\SQLiteDB", "tariff.db")', f'r"{TARGET}"'),
            (r"D:\\SQLiteDB\\tariff.db", r"D:\\SQLiteDB\\smart_law_ai.db"),
        ],
    ),
    (
        r"D:\Crawling\Tariff\tariff_verifier.py",
        [
            ('os.path.join(r"D:\\SQLiteDB", "tariff.db")', f'r"{TARGET}"'),
            (r"D:\\SQLiteDB\\tariff.db", r"D:\\SQLiteDB\\smart_law_ai.db"),
        ],
    ),
]

config_patches = [
    (r"D:\Crawling\unipass_분석진행사항\config.json", r"D:\\SQLiteDB\\unipass_bunsuk.db", r"D:\\SQLiteDB\\smart_law_ai.db"),
]

changed_files = []
for path, pairs in replacements:
    p = Path(path)
    if not p.exists():
        print("SKIP missing", path)
        continue
    text = p.read_text(encoding="utf-8")
    orig = text
    for old, new in pairs:
        text = text.replace(old, new)
    if text != orig:
        p.write_text(text, encoding="utf-8")
        changed_files.append(str(p))
        print("PATCHED", path)
    else:
        print("NOCHANGE", path)

for path, old, new in config_patches:
    p = Path(path)
    if not p.exists():
        print("SKIP missing", path)
        continue
    text = p.read_text(encoding="utf-8")
    if old in text:
        p.write_text(text.replace(old, new), encoding="utf-8")
        changed_files.append(str(p))
        print("PATCHED", path)
    else:
        print("NOCHANGE", path)

# Excel J column update
xlsx = Path(r"D:\Manus\법령정보및관세율,품목분류사례 처리현황.xlsx")
wb = openpyxl.load_workbook(xlsx)
ws = wb["리스트"]
updated = 0
keep_names = set()  # none — all non-smart -> smart
for row in range(2, ws.max_row + 1):
    name = ws.cell(row, 3).value  # C
    db = ws.cell(row, 10).value  # J
    if db is None:
        continue
    db_s = str(db).strip()
    if not db_s:
        continue
    # already smart_law_ai.db (basename or full path)
    norm = db_s.replace("\\", "/").split("/")[-1].lower()
    if norm == "smart_law_ai.db":
        # normalize to full path for consistency when path-like desired
        if db_s != "smart_law_ai.db" and "smart_law_ai.db" in db_s:
            continue
        # leave short name or upgrade to full? Use smart_law_ai.db short as excel style
        continue
    # has program location or call?
    loc = ws.cell(row, 12).value
    call = ws.cell(row, 14).value
    if not (loc or call):
        print(f"SKIP no L/N row={row} name={name} db={db_s}")
        continue
    ws.cell(row, 10).value = "smart_law_ai.db"
    updated += 1
    print(f"EXCEL J row={row} {name}: {db_s} -> smart_law_ai.db")

wb.save(xlsx)
print(f"Excel rows updated: {updated}")
print(f"Files patched: {len(changed_files)}")
