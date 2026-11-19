# -*- coding: utf-8 -*-
"""Inspect schemas of source DBs for migration planning."""
import sqlite3, sys, json
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")

SOURCES = {
    "tariff.db": Path(r"D:\SQLiteDB\tariff.db"),
    "hs_manual_complete.db": Path(r"D:\SQLiteDB\hs_manual_complete.db"),
    "domestic_hs_class.db": Path(r"D:\SQLiteDB\domestic_hs_class.db"),
    "hsforeigncase.db": Path(r"D:\SQLiteDB\hsforeigncase.db"),
    "admin_rules.db": Path(r"D:\SQLiteDB\admin_rules.db"),
    "clip_admin_rule.db": Path(r"D:\SQLiteDB\clip_admin_rule.db"),
    "clip_precedent.db": Path(r"D:\SQLiteDB\clip_precedent.db"),
    "clip_question.db": Path(r"D:\SQLiteDB\clip_question.db"),
    "unipass_bunsuk.db": Path(r"D:\SQLiteDB\unipass_bunsuk.db"),
}
SMART = Path(r"D:\SQLiteDB\smart_law_ai.db")

def meta(conn):
    rows = conn.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    out = {}
    for name, sql in rows:
        cols = [r[1] for r in conn.execute(f'PRAGMA table_info("{name}")')]
        pk = [r[1] for r in conn.execute(f'PRAGMA table_info("{name}")') if r[5]]
        n = conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
        idxs = conn.execute(
            "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
            (name,),
        ).fetchall()
        out[name] = {"cols": cols, "pk": pk, "count": n, "indexes": len(idxs), "sql_head": (sql or "")[:120]}
    return out

smart = sqlite3.connect(f"file:{SMART.as_posix()}?mode=ro", uri=True)
smart_tables = set(r[0] for r in smart.execute("SELECT name FROM sqlite_master WHERE type='table'"))
smart.close()

plan = {}
for label, p in SOURCES.items():
    if not p.exists():
        plan[label] = {"error": "missing"}
        continue
    c = sqlite3.connect(f"file:{p.as_posix()}?mode=ro", uri=True)
    info = meta(c)
    c.close()
    plan[label] = {
        "tables": {
            t: {
                **v,
                "in_smart": t in smart_tables,
            }
            for t, v in info.items()
        }
    }

out = Path(r"d:\CursorProject\smart-law-ai\_migrate_plan.json")
out.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
print("wrote", out)
for label, data in plan.items():
    if "error" in data:
        print(label, data)
        continue
    print(f"\n[{label}]")
    for t, v in data["tables"].items():
        print(f"  {t}: n={v['count']} pk={v['pk']} in_smart={v['in_smart']}")
