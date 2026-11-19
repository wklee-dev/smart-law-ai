import { DatabaseSync } from "node:sqlite";

const DB = "D:/SQLiteDB/smart_law_ai.db";
const name = "X-ray 검색기 영상 판독직원의 평가기준 등에 관한 훈령";
const tokens = ["x-ray", "검색기", "영상", "판독", "평가"];
const likes = tokens.map(() => `LOWER(COALESCE(annex_title,'')) LIKE ?`).join(" OR ");
const binds = tokens.map((t) => `%${t}%`);
const db = new DatabaseSync(DB, { readOnly: true });
const rows = db.prepare(
  `SELECT param, id, annex_title FROM admin_rule_annex WHERE ${likes}`,
).all(...binds);
const byParam = new Map();
for (const r of rows) {
  const p = r.param;
  if (!byParam.has(p)) byParam.set(p, []);
  byParam.get(p).push(r.annex_title);
}
console.log("rows", rows.length);
for (const [p, titles] of byParam) {
  console.log(p, titles.length, titles.slice(0, 5));
}
db.close();
