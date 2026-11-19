import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/smart_law_ai.db", { readOnly: true });
const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  )
  .all()
  .map((r) => r.name);

const annexLike = tables.filter(
  (n) =>
    n.includes("annex") ||
    n.endsWith("_addendum") ||
    (n.startsWith("crawl_") && !n.includes("chunk")),
);
console.log("annex/addendum-like tables count", annexLike.length);
console.log("sample", annexLike.slice(0, 40));
console.log("crawl underscore annex", annexLike.filter((n) => /crawl_\d+_annex/.test(n)).slice(0, 15));

const unified = ["admin_rule_annex", "admin_rule_addendum", "admin_rule"];
for (const t of unified) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  console.log(t, "rows", db.prepare(`SELECT COUNT(1) n FROM ${t}`).get().n, "cols", cols.slice(0, 8));
}

db.close();
